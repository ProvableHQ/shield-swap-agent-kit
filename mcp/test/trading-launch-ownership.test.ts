import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TradingStore } from "../src/trading/store";
import { TradingRuntime } from "../src/trading/runtime";
import type { Operation, Profile, TradingBackend } from "../src/trading/types";

const profile: Profile = { id: "alice", network: "testnet", address: "aleo1test", key: { type: "env", name: "TEST_KEY" },
  policy: { claims: true, swaps: false, bridges: false, swapLimits: {}, bridgeLimits: {}, maxSlippageBps: 100 } };
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "shield-launch-"));
  const store = new TradingStore(root, "test-password-long-enough", true);
  const otherStore = new TradingStore(root, "test-password-long-enough");
  store.set("profile:alice", profile);
  const backend: TradingBackend = {
    concurrentRecords: true,
    quote: async (_kind, _profile, input) => ({ plan: { swapIds: input.swapIds ?? ["same-output"] }, summary: {} }),
    execute: async () => ({ status: "complete", result: {} }),
    resume: async () => ({ status: "complete", result: {} }),
    reconcile: async () => ({ status: "pending", result: { nextAction: "claim" } }),
    read: async () => ({}),
  };
  const runtime = new TradingRuntime(store, backend);
  const other = new TradingRuntime(otherStore, backend);
  return { store, otherStore, backend, runtime, other, close: async () => {
    await Promise.all([runtime.drain(), other.drain()]);
    store.close(); otherStore.close(); rmSync(root, { recursive: true, force: true });
  } };
}

test("a delayed initial claim cannot fail an active resume or admit another claim for its output", async () => {
  const f = fixture();
  let launch!: () => void, finish!: () => void;
  const launchGate = new Promise<void>(resolve => { launch = resolve; });
  const claimGate = new Promise<void>(resolve => { finish = resolve; });
  let delay = true, submissions = 0;
  const lock = f.store.withLock.bind(f.store);
  f.store.withLock = async (scope, fn) => {
    if (delay && scope.startsWith("operation:")) { delay = false; await launchGate; }
    return lock(scope, fn);
  };
  f.backend.resume = async (_quote, _op, context) => {
    submissions++;
    context.checkpoint({ transactionId: "at1original" });
    await claimGate;
    return { status: "complete", result: { transactionId: "at1original" } };
  };
  f.backend.execute = async () => { submissions++; return { status: "complete", result: {} }; };
  try {
    const quote = await f.runtime.quote("claim", "alice", {});
    const original = await f.runtime.execute(String(quote.quoteId), "original");
    const id = String(original.operationId);
    await f.other.resume(id);
    launch(); await f.runtime.drain();
    assert.equal(f.runtime.operation(id).status, "running");
    assert.deepEqual(f.store.get<Operation>("operation:" + id)!.checkpoint, { transactionId: "at1original" });
    const duplicate = await f.other.quote("claim", "alice", {});
    await assert.rejects(f.other.execute(String(duplicate.quoteId), "duplicate"), /owns this swap output/);
    assert.equal(submissions, 1);
    const unrelated = await f.other.quote("claim", "alice", { swapIds: ["another-output"] });
    await f.other.execute(String(unrelated.quoteId), "unrelated");
    assert.equal(submissions, 2, "unrelated outputs remain concurrent");
    finish(); await f.other.drain();
    assert.equal(f.runtime.operation(id).status, "complete");
  } finally { launch(); finish(); await f.close(); }
});

test("execution failure is recorded before unlocking and cannot overwrite a successor's recovery", async () => {
  const f = fixture();
  let statusAtUnlock: string | undefined;
  const lock = f.store.withLock.bind(f.store);
  f.store.withLock = async (scope, fn) => {
    try { return await lock(scope, fn); }
    finally {
      if (scope.startsWith("operation:")) {
        const id = scope.slice("operation:".length);
        statusAtUnlock = String(f.other.operation(id).status);
        await f.other.status(id);
      }
    }
  };
  f.backend.execute = async (_quote, context) => {
    context.checkpoint({ transactionId: "at1accepted" });
    throw new Error("Response lost PRIVATE-DETAIL");
  };
  f.backend.reconcile = async () => ({ status: "complete", result: { transactionId: "at1accepted" } });
  try {
    const quote = await f.runtime.quote("claim", "alice", {});
    const original = await f.runtime.execute(String(quote.quoteId), "original");
    await f.runtime.drain();
    assert.equal(statusAtUnlock, "uncertain");
    assert.equal(f.runtime.operation(String(original.operationId)).status, "complete");
    assert.deepEqual(f.store.get<Operation>("operation:" + original.operationId)!.checkpoint, { transactionId: "at1accepted" });
    assert.doesNotMatch(JSON.stringify(f.runtime.operation(String(original.operationId))), /PRIVATE-DETAIL/);
  } finally { await f.close(); }
});

test("permission revoked after registration still fails before execution under the operation lock", async () => {
  const f = fixture();
  let statusAtUnlock: string | undefined, executions = 0;
  const lock = f.store.withLock.bind(f.store);
  f.store.withLock = async (scope, fn) => {
    if (!scope.startsWith("operation:")) return lock(scope, fn);
    f.store.set("profile:alice", { ...profile, policy: { ...profile.policy, claims: false } });
    return lock(scope, async () => {
      try { return await fn(); }
      finally { statusAtUnlock = f.store.get<Operation>(scope)!.status; }
    });
  };
  f.backend.execute = async () => { executions++; return { status: "complete", result: {} }; };
  try {
    const quote = await f.runtime.quote("claim", "alice", {});
    const op = await f.runtime.execute(String(quote.quoteId), "revoked");
    await f.runtime.drain();
    assert.equal(statusAtUnlock, "failed");
    assert.equal((f.runtime.operation(String(op.operationId)).error as { code: string }).code, "permission_required");
    assert.equal(executions, 0);
  } finally { await f.close(); }
});
