import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TradingStore } from "../src/trading/store";
import { TradingRuntime } from "../src/trading/runtime";
import { Maintainer } from "../src/trading/maintainer";
import { createTradingServer } from "../src/trading/server";
import { createMaintenanceLauncher } from "../src/trading/maintenance-launcher";
import { withWalletLocks } from "../src/trading/coordination";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { MaintenanceState, Operation, Profile, TradingBackend } from "../src/trading/types";

const profile: Profile = { id: "alice", network: "testnet", address: "aleo1test", key: { type: "env", name: "TEST_KEY" },
  policy: { swaps: false, claims: false, bridges: false, inventory: true, inventoryFeeLimit: "5000000", maxSlippageBps: 100, swapLimits: {}, bridgeLimits: {} } };

function fixture(amounts: string[]) {
  const root = mkdtempSync(join(tmpdir(), "shield-maintainer-"));
  const store = new TradingStore(root, "test-password-long-enough", true);
  store.set("profile:alice", profile);
  const quotes: Record<string, unknown>[] = [];
  let executions = 0;
  const backend: TradingBackend = {
    quote: async (kind, _profile, input) => { quotes.push({ kind, ...input }); return { plan: { steps: [] }, summary: { token: "1field", stepCount: 2, steps: [{ kind: "split" }, { kind: "split" }] } }; },
    execute: async () => { executions++; return { status: "complete", result: { transactionIds: ["at1split1", "at1split2"], completedSteps: 2 } }; },
    read: async (action, _profile, input) => {
      assert.equal(action, "get_record_inventory");
      return { token: { id: "1field", symbol: String(input.token), decimals: 6 }, available: amounts.map((amount, index) => ({ id: `${index}group`, amount })), reserved: [] };
    },
    reconcile: async () => ({ status: "complete", result: {} }),
    resume: async () => { throw new Error("unexpected resume"); },
  };
  const runtime = new TradingRuntime(store, backend);
  const maintainer = new Maintainer(runtime, "alice", [{ token: "USDCx", records: 3, minRecordAmount: "0.1" }], { sleep: async () => {} });
  return { store, runtime, quotes, maintainer, executions: () => executions,
    close: async () => { await runtime.drain(); store.close(); rmSync(root, { recursive: true, force: true }); } };
}

test("parseTarget reads TOKEN=RECORDS:MIN and rejects malformed input", () => {
  assert.deepEqual(Maintainer.parseTarget("USDCx=8:0.1"), { token: "USDCx", records: 8, minRecordAmount: "0.1" });
  assert.deepEqual(Maintainer.parseTarget("1field=2:5"), { token: "1field", records: 2, minRecordAmount: "5" });
  for (const bad of ["USDCx", "USDCx=0:0.1", "USDCx=8", "USDCx=8:abc", "=8:0.1", "USDCx=1001:1"]) {
    assert.throws(() => Maintainer.parseTarget(bad), (error: { code: string }) => error.code === "invalid_target", bad);
  }
});

test("a pass with enough covering records plans nothing and records ready counts", async () => {
  const f = fixture(["100000", "250000", "99999", "300000"]);
  try {
    const pass = await f.maintainer.runPass();
    assert.deepEqual(pass?.ready, { USDCx: 3 });
    assert.equal(pass?.action, "none");
    assert.equal(f.quotes.length, 0, "no plan is requested when the floor is met");
    assert.equal(f.executions(), 0);
    const state = f.store.get<MaintenanceState>(Maintainer.stateKey("alice"));
    assert.equal(state?.lastPass?.action, "none");
  } finally { await f.close(); }
});

test("a pass with a shortfall plans a floor target and executes it to completion", async () => {
  const f = fixture(["100000", "99999"]);
  try {
    const pass = await f.maintainer.runPass();
    assert.deepEqual(pass?.ready, { USDCx: 1 });
    assert.equal(pass?.action, "rebalanced");
    assert.ok(pass?.operationId);
    assert.equal(f.quotes.length, 1);
    assert.deepEqual(f.quotes[0], { kind: "inventory", token: "USDCx", records: 3, minRecordAmount: "0.1", distribution: "floor" });
    assert.equal(f.executions(), 1);
    assert.equal(f.runtime.operation(pass!.operationId!).status, "complete");
  } finally { await f.close(); }
});

test("a pass skips while the wallet has an active operation", async () => {
  const f = fixture(["100000"]);
  try {
    const active: Operation = { id: "busy", kind: "swap", profileId: "alice", scope: "", quoteId: "q", requestKey: "r", status: "running", createdAt: 0, updatedAt: 0, result: {} };
    f.store.set("quote:q", { id: "q", kind: "swap", profile, scope: "", createdAt: 0, expiresAt: 0, plan: {}, summary: {} });
    f.store.set("operation:busy", active);
    const pass = await f.maintainer.runPass();
    assert.equal(pass?.action, "skipped");
    assert.equal(pass?.error, "operation_pending");
    assert.equal(f.executions(), 0);
  } finally { await f.close(); }
});

test("a second maintainer refuses to start while the recorded pid is alive", async () => {
  const f = fixture(["100000"]);
  try {
    f.store.set(Maintainer.stateKey("alice"), { profileId: "alice", pid: process.ppid, startedAt: 1, intervalSeconds: 120, targets: [], running: true });
    await assert.rejects(f.maintainer.start(), (error: { code: string }) => error.code === "maintainer_running");
    // A state naming this process is the launcher's own record of us; it does not block.
    f.store.set(Maintainer.stateKey("alice"), { profileId: "alice", pid: process.pid, startedAt: 1, intervalSeconds: 120, targets: [], running: true });
    await f.maintainer.start();
    f.store.set(Maintainer.stateKey("alice"), { profileId: "alice", pid: 2 ** 22 + 7, startedAt: 1, intervalSeconds: 120, targets: [], running: true });
    await f.maintainer.start();
    const state = f.store.get<MaintenanceState>(Maintainer.stateKey("alice"));
    assert.equal(state?.pid, process.pid);
    assert.equal(state?.running, true);
    await f.maintainer.stop();
    assert.equal(f.store.get<MaintenanceState>(Maintainer.stateKey("alice"))?.running, false);
  } finally { await f.close(); }
});

test("maintain_inventory needs inventory permission, launches once, and status and stop follow the launcher", async () => {
  const f = fixture(["100000"]);
  const launches: Record<string, unknown>[] = [];
  const stopped: number[] = [];
  const launcher = { launch: (options: Record<string, unknown>) => { launches.push(options); return { pid: 2 ** 22 + 11 }; }, stop: (pid: number) => { stopped.push(pid); } };
  const server = createTradingServer(f.runtime, { stateExists: true, launcher });
  const client = new Client({ name: "test", version: "1" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  const call = async (name: string, args: Record<string, unknown>) => (await client.callTool({ name, arguments: args })).structuredContent as Record<string, unknown>;
  try {
    await Promise.all([server.connect(a), client.connect(b)]);
    f.store.set("profile:alice", { ...profile, policy: { ...profile.policy, inventory: false } });
    const denied = await call("maintain_inventory", { profileId: "alice", targets: [{ token: "USDCx", records: 3, minRecordAmount: "0.1" }] });
    assert.equal((denied.error as { code: string }).code, "permission_required");
    assert.equal(launches.length, 0);
    f.store.set("profile:alice", profile);
    const started = await call("maintain_inventory", { profileId: "alice", targets: [{ token: "USDCx", records: 3, minRecordAmount: "0.1" }], intervalSeconds: 45 });
    assert.equal(started.running, true);
    assert.equal(started.pid, 2 ** 22 + 11);
    assert.deepEqual(launches, [{ profileId: "alice", targets: [{ token: "USDCx", records: 3, minRecordAmount: "0.1" }], intervalSeconds: 45 }]);
    const status = await call("get_maintenance_status", { profileId: "alice" });
    assert.equal(status.running, true);
    assert.equal(status.alive, false, "the stub pid is not a live process");
    assert.deepEqual(status.targets, [{ token: "USDCx", records: 3, minRecordAmount: "0.1" }]);
    const halted = await call("stop_maintenance", { profileId: "alice" });
    assert.equal(halted.running, false);
    assert.deepEqual(stopped, [2 ** 22 + 11]);
    const idle = await call("get_maintenance_status", { profileId: "alice" });
    assert.equal(idle.running, false);
  } finally { await client.close(); await server.close(); await f.close(); }
});

test("a pass while a worker holds the wallet lock records operation_pending and submits nothing", async () => {
  const f = fixture(["100000"]);
  try {
    const pass = await withWalletLocks(f.store, [profile], () => f.maintainer.runPass());
    assert.equal(pass?.action, "skipped");
    assert.equal(pass?.error, "operation_pending");
    assert.equal(f.executions(), 0);
  } finally { await f.close(); }
});

test("maintain_inventory refuses while a stopped maintainer is still alive, and a stale maintainer never overwrites a newer record", async () => {
  const f = fixture(["100000"]);
  const launcher = { launch: () => ({ pid: 2 ** 22 + 13 }), stop: () => {} };
  const server = createTradingServer(f.runtime, { stateExists: true, launcher });
  const client = new Client({ name: "test", version: "1" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  try {
    await Promise.all([server.connect(a), client.connect(b)]);
    const other = { profileId: "alice", pid: process.ppid, startedAt: 1, intervalSeconds: 120, targets: [], running: false };
    f.store.set(Maintainer.stateKey("alice"), other);
    const refused = (await client.callTool({ name: "maintain_inventory", arguments: { profileId: "alice", targets: [{ token: "USDCx", records: 3, minRecordAmount: "0.1" }] } })).structuredContent as Record<string, unknown>;
    assert.equal((refused.error as { code: string }).code, "maintainer_running", "a live process still winding down blocks a relaunch");
    f.store.set(Maintainer.stateKey("alice"), { ...other, running: true });
    await f.maintainer.stop();
    assert.deepEqual(f.store.get(Maintainer.stateKey("alice")), { ...other, running: true }, "a maintainer that does not own the record leaves it alone");
  } finally { await client.close(); await server.close(); await f.close(); }
});

test("a maintainer that cannot spawn is reported as unavailable without crashing the server", async () => {
  const launcher = createMaintenanceLauncher("/nonexistent/cli.js", process.env, undefined, { execPath: "/nonexistent/node-for-this-test" });
  assert.throws(() => launcher.launch({ profileId: "alice", targets: [{ token: "USDCx", records: 1, minRecordAmount: "1" }], intervalSeconds: 60 }),
    (error: { code: string }) => error.code === "unavailable");
  await new Promise(resolve => setTimeout(resolve, 50));
  assert.ok(true, "the spawn error did not surface as an uncaught exception");
});
