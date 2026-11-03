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
    policy: { inventory: true, inventoryFeeLimit: "100", swaps: false, bridges: false, claims: false, swapLimits: {}, bridgeLimits: {}, maxSlippageBps: 100 } } as Profile;
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
    policy: { inventory: true, inventoryFeeLimit: "100", swaps: false, bridges: false, claims: false, swapLimits: {}, bridgeLimits: {}, maxSlippageBps: 100 } } as Profile;
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
