import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TradingStore } from "../src/trading/store";
import { TradingRuntime } from "../src/trading/runtime";
import { InventoryMaintenance } from "../src/trading/maintenance";
import type { Profile, TradingBackend } from "../src/trading/types";

test("token jobs share manual/timer coordination, preserve uncertainty, and stop new work independently", async () => {
  const root = mkdtempSync(join(tmpdir(), "maintain-"));
  const store = new TradingStore(root, "test-password-long-enough", true);
  const profile = { id: "alice", network: "testnet", address: "aleo1test", key: { type: "env", name: "KEY" },
    policy: { inventory: true, swaps: false, bridges: false, claims: false, swapLimits: {}, bridgeLimits: {}, maxSlippageBps: 100 } } as Profile;
  store.set("profile:alice", profile);
  let submissions = 0;
  let recovered = false;
  const backend: TradingBackend = { concurrentRecords: true,
    read: async (_action, _profile, input) => ({ token: { id: String(input.token).toLowerCase(), decimals: 6 }, asset: { program: String(input.token).toLowerCase() + ".aleo" }, available: [] }),
    quote: async (_kind, _profile, input) => ({ plan: input, summary: { asset: String(input.token) + ".aleo", stepCount: 1 } }),
    execute: async () => { submissions++; return { status: "uncertain", result: { reasonCode: "confirmation_timeout" } }; },
    reconcile: async () => ({ status: recovered ? "failed" : "uncertain", result: { reasonCode: recovered ? "maintenance_incomplete" : "confirmation_timeout" } }),
    resume: async () => { throw Error("No resume"); },
  };
  const runtime = new TradingRuntime(store, backend);
  const maintenance = new InventoryMaintenance(runtime);
  try {
    const a = await maintenance.start("alice", { token: "A", records: 3, minRecordAmount: "1", intervalSeconds: 30 });
    const alias = await maintenance.start("alice", { token: "a", records: 3, minRecordAmount: "1", intervalSeconds: 30 });
    const b = await maintenance.start("alice", { token: "B", records: 4, minRecordAmount: "2", intervalSeconds: 30 });
    assert.equal(a.id, alias.id);
    await Promise.all([maintenance.check(a.id), maintenance.check(a.id), maintenance.check(b.id)]);
    await runtime.drain();
    assert.equal(submissions, 2);
    await maintenance.check(a.id);
    const uncertain = maintenance.get(a.id)!;
    assert.equal(uncertain.operationStatus, "uncertain");
    assert.equal(uncertain.lastError, "confirmation_timeout");
    const original = uncertain.activeOperationId;
    await maintenance.check(a.id);
    assert.equal(maintenance.get(a.id)!.activeOperationId, original);
    assert.equal(submissions, 2);
    maintenance.stop(a.id);
    assert.equal(maintenance.get(b.id)!.enabled, true);
    recovered = true;
    await maintenance.check(a.id);
    assert.equal(maintenance.get(a.id)!.operationStatus, "failed");
    assert.equal(submissions, 2, "stopping still reconciles but never replenishes");
    await maintenance.check(b.id);
    assert.equal(maintenance.get(b.id)!.operationStatus, "failed", "show failure before later replanning");
  } finally { await runtime.drain(); store.close(); rmSync(root, { recursive: true, force: true }); }
});

test("the worker advances another token while a check is blocked and stop wins before registration", { timeout: 10000 }, async () => {
  const root = mkdtempSync(join(tmpdir(), "maintain-independent-"));
  const store = new TradingStore(root, "test-password-long-enough", true);
  const profile = { id: "alice", network: "testnet", address: "aleo1test", key: { type: "env", name: "KEY" },
    policy: { inventory: true, swaps: false, bridges: false, claims: false, swapLimits: {}, bridgeLimits: {}, maxSlippageBps: 100 } } as Profile;
  store.set("profile:alice", profile);
  let blockA = false, releaseA!: () => void, startedA!: () => void, submittedB!: () => void;
  const blocked = new Promise<void>(resolve => releaseA = resolve);
  const entered = new Promise<void>(resolve => startedA = resolve);
  const submitted = new Promise<void>(resolve => submittedB = resolve);
  const writes: string[] = [];
  const backend: TradingBackend = { concurrentRecords: true,
    read: async (_action, _profile, input) => {
      if (blockA && input.token === "A") { startedA(); await blocked; }
      return { token: { id: input.token, decimals: 6 }, asset: { program: input.token + ".aleo" }, available: [] };
    },
    quote: async (_kind, _profile, input) => ({ plan: input, summary: { asset: input.token + ".aleo", stepCount: 1 } }),
    execute: async quote => { writes.push(String(quote.summary.asset)); submittedB(); return { status: "complete", result: {} }; },
    reconcile: async () => ({ status: "complete", result: {} }), resume: async () => { throw Error("No resume"); },
  };
  const runtime = new TradingRuntime(store, backend);
  const jobs = new InventoryMaintenance(runtime);
  const controller = new AbortController();
  let running: Promise<void> | undefined;
  try {
    const a = await jobs.start("alice", { token: "A", records: 2, minRecordAmount: "1" });
    await jobs.start("alice", { token: "B", records: 2, minRecordAmount: "1" });
    blockA = true;
    running = jobs.run(controller.signal);
    await Promise.all([entered, submitted]);
    assert.deepEqual(writes, ["B.aleo"]);
    jobs.stop(a.id); releaseA();
    controller.abort(); await running;
    assert.deepEqual(writes, ["B.aleo"], "a stop during an inventory read prevents the later plan registration");
    assert.equal(await jobs.running(), false);
  } finally { releaseA(); controller.abort(); await running; await runtime.drain(); store.close(); rmSync(root, { recursive: true, force: true }); }
});

import { OperationRecovery } from "../src/trading/recovery";
test("failed recovery lookups cannot starve later operations", async () => {
  const root = mkdtempSync(join(tmpdir(), "recovery-fairness-"));
  const store = new TradingStore(root, "test-password-long-enough", true);
  try {
    for (let id = 0; id < 10; id++) store.set("operation:" + id, { id: String(id), status: "uncertain", updatedAt: id });
    const runtime = new TradingRuntime(store, {} as TradingBackend);
    const visited = new Set<string>();
    runtime.status = async id => { visited.add(id); if (Number(id) < 8) throw Error("RPC unavailable"); return { status: "complete" }; };
    const recovery = new OperationRecovery(runtime);
    recovery.tick();
    await new Promise(resolve => setImmediate(resolve));
    await recovery.stop();
    assert.equal(visited.size, 10);
  } finally { store.close(); rmSync(root, { recursive: true, force: true }); }
});

test("stop is rechecked atomically when a maintenance operation is registered", async () => {
  const root = mkdtempSync(join(tmpdir(), "maintain-register-stop-"));
  const store = new TradingStore(root, "test-password-long-enough", true);
  store.set("profile:alice", { id: "alice", network: "testnet", address: "aleo1test", key: { type: "env", name: "KEY" },
    policy: { inventory: true } });
  let writes = 0;
  const backend = { concurrentRecords: true,
    read: async () => ({ token: { id: "A", decimals: 6 }, asset: { program: "A.aleo" }, available: [] }),
    quote: async () => ({ plan: {}, summary: { asset: "A.aleo", stepCount: 1 } }),
    execute: async () => { writes++; return { status: "complete", result: {} }; },
  } as unknown as TradingBackend;
  const runtime = new TradingRuntime(store, backend), jobs = new InventoryMaintenance(runtime);
  try {
    const job = await jobs.start("alice", { token: "A", records: 2, minRecordAmount: "1" });
    const execute = runtime.execute.bind(runtime);
    runtime.execute = async (...args) => { jobs.stop(job.id); return execute(...args); };
    await jobs.check(job.id); await runtime.drain();
    assert.equal(writes, 0, "a stop committed before registration wins");
    assert.equal(jobs.get(job.id)!.enabled, false);
    assert.equal(jobs.get(job.id)!.activeOperationId, undefined);
  } finally { await runtime.drain(); store.close(); rmSync(root, { recursive: true, force: true }); }
});

test("a stalled lookup cannot block recovery for another account", async () => {
  const root = mkdtempSync(join(tmpdir(), "recovery-stall-"));
  const store = new TradingStore(root, "test-password-long-enough", true);
  let release!: () => void;
  const stalled = new Promise<void>(resolve => release = resolve);
  let recovery: OperationRecovery | undefined;
  try {
    for (let id = 0; id < 10; id++) store.set("operation:" + id, { id: String(id), profileId: id < 8 ? "alice" : "bob", status: "uncertain", updatedAt: id });
    const runtime = new TradingRuntime(store, {} as TradingBackend);
    const visited = new Set<string>();
    runtime.status = async id => { visited.add(id); if (id === "0") await stalled; return { status: "pending" }; };
    recovery = new OperationRecovery(runtime);
    for (let tick = 0; tick < 6; tick++) {
      recovery.tick();
      await new Promise(resolve => setImmediate(resolve));
    }
    assert.ok(visited.has("8") && visited.has("9"), "Bob must progress while Alice's lookup is still stalled");
  } finally { release(); await recovery?.stop(); store.close(); rmSync(root, { recursive: true, force: true }); }
});

test("refilling recovery slots does not repeatedly decrypt the full operation history", async () => {
  const root = mkdtempSync(join(tmpdir(), "recovery-history-cost-"));
  const store = new TradingStore(root, "test-password-long-enough", true);
  const runtime = new TradingRuntime(store, {} as TradingBackend);
  const recovery = new OperationRecovery(runtime);
  try {
    store.transaction(() => {
      for (let id = 0; id < 1000; id++) store.set("operation:old" + id, { id: "old" + id, status: "complete", updatedAt: id });
      for (let id = 0; id < 10; id++) store.set("operation:" + id, { id: String(id), status: "uncertain", updatedAt: id });
    });
    let visited = 0, scans = 0;
    const list = store.list.bind(store);
    store.list = <T>(prefix: string): T[] => { if (prefix === "operation:") scans++; return list<T>(prefix); };
    runtime.status = async () => { visited++; return { status: "pending" }; };
    recovery.tick();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(visited, 10);
    assert.equal(scans, 1, "discover the queue once per tick, not once per completed lookup");
  } finally { await recovery.stop(); store.close(); rmSync(root, { recursive: true, force: true }); }
});
