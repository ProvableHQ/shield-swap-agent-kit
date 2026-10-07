import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TradingStore } from "../src/trading/store";
import { TradingRuntime } from "../src/trading/runtime";
import type { TradingBackend, Profile } from "../src/trading/types";

const profile: Profile = {
  id: "alice", network: "testnet", address: "aleo1test", key: { type: "env", name: "TEST_KEY" },
  policy: { swaps: true, claims: true, bridges: false, maxSlippageBps: 100, swapLimits: { tokenA: "1000000" }, bridgeLimits: {} },
};
function fixture(submit: () => Promise<Record<string, unknown>>) {
  const root = mkdtempSync(join(tmpdir(), "shield-runtime-"));
  const store = new TradingStore(root, "test-password-long-enough", true);
  store.set("profile:alice", profile);
  const backend: TradingBackend = {
    quote: async () => ({ plan: { secret: "PRIVATE-PLAN" }, summary: { tokenIn: "tokenA", tokenOut: "tokenB", amountIn: "1000", expectedOut: "990", minOut: "980", slippageBps: 100 } }),
    execute: async () => ({ result: await submit(), status: "submitted" }),
    read: async () => ({}),
    reconcile: async () => ({ status: "uncertain", result: { nextAction: "reconcile" } }),
    resume: async () => { throw new Error("unexpected resume"); },
  };
  const runtime = new TradingRuntime(store, backend);
  return { store, runtime, backend, close: async () => { await runtime.drain(); store.close(); rmSync(root, { recursive: true, force: true }); } };
}

test("quote execution is durable and duplicate requests do not submit twice", async () => {
  let submissions = 0;
  const f = fixture(async () => { submissions++; return { transactionId: "at1test", swapId: "1field" }; });
  try {
    const quote = await f.runtime.quote("swap", "alice", { from: "tokenA", to: "tokenB", amount: "0.001" });
    assert.doesNotMatch(JSON.stringify(quote), /PRIVATE-PLAN/);
    const first = await f.runtime.execute(quote.quoteId as string, "request-1");
    const duplicate = await f.runtime.execute(quote.quoteId as string, "request-1");
    assert.equal(duplicate.operationId, first.operationId);
    await f.runtime.drain();
    assert.equal(submissions, 1);
    assert.equal(f.runtime.operation(first.operationId as string).status, "submitted");
    await assert.rejects(f.runtime.execute(quote.quoteId as string, "request-2"), /consumed/i);
  } finally { await f.close(); }
});

test("expired quotes and policy violations never submit", async () => {
  let submissions = 0;
  const f = fixture(async () => { submissions++; return {}; });
  try {
    const quote = await f.runtime.quote("swap", "alice", { from: "tokenA", to: "tokenB", amount: "0.001" });
    const saved = f.store.get<Record<string, unknown>>(`quote:${quote.quoteId}`)!;
    f.store.set(`quote:${quote.quoteId}`, { ...saved, expiresAt: 1 });
    await assert.rejects(f.runtime.execute(quote.quoteId as string, "expired"), /expired/i);
    const second = await f.runtime.quote("swap", "alice", {});
    f.store.set("profile:alice", { ...profile, policy: { ...profile.policy, swaps: false } });
    await assert.rejects(f.runtime.execute(second.quoteId as string, "disabled"), /permission/i);
    assert.equal(submissions, 0);
  } finally { await f.close(); }
});

test("an ambiguous broadcast stays uncertain and resume never repeats the swap", async () => {
  let submissions = 0;
  const f = fixture(async () => { submissions++; throw new Error("broadcast timeout PRIVATE-KEY-LEAK"); });
  try {
    const quote = await f.runtime.quote("swap", "alice", {});
    const op = await f.runtime.execute(quote.quoteId as string, "ambiguous");
    await f.runtime.drain();
    assert.equal(f.runtime.operation(op.operationId as string).status, "uncertain");
    const recovered = await f.runtime.resume(op.operationId as string);
    assert.equal(recovered.status, "uncertain");
    assert.equal(submissions, 1);
    assert.doesNotMatch(JSON.stringify(recovered), /PRIVATE-KEY-LEAK/);
  } finally { await f.close(); }
});

test("concurrent recovery cannot mark another resume failed or submit twice", async () => {
  const root = mkdtempSync(join(tmpdir(), "shield-resume-"));
  const store = new TradingStore(root, "test-password-long-enough", true);
  store.set("profile:alice", profile);
  let release!: () => void, entered!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const started = new Promise<void>(resolve => { entered = resolve; });
  let resumes = 0;
  const backend: TradingBackend = {
    quote: async () => ({ plan: {}, summary: {} }),
    execute: async () => { throw new Error("unexpected deposit"); },
    read: async () => ({}),
    reconcile: async () => { entered(); await gate; return { status: "pending", result: { nextAction: "claim" } }; },
    resume: async () => { resumes++; return { status: "complete", result: {} }; },
  };
  const runtime = new TradingRuntime(store, backend);
  const scope = runtime.scope(profile);
  store.set("quote:q", { id: "q", profile, scope, kind: "claim", createdAt: 0, expiresAt: 1, plan: {}, summary: {} });
  store.set("operation:o", { id: "o", quoteId: "q", profileId: "alice", scope, kind: "claim", requestKey: "r",
    status: "pending", result: { nextAction: "claim" }, createdAt: 0, updatedAt: 0 });
  let first: Promise<unknown> | undefined;
  try {
    first = runtime.resume("o");
    await started;
    await runtime.resume("o");
    assert.equal(runtime.operation("o").status, "pending");
    release();
    await first;
    await runtime.drain();
    assert.equal(resumes, 1);
    assert.equal(runtime.operation("o").status, "complete");
  } finally { release(); await first?.catch(() => {}); await runtime.drain(); store.close(); rmSync(root, { recursive: true, force: true }); }
});

test("a delayed worker cannot submit an operation already reconciled as failed", async () => {
  let submissions = 0, release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const f = fixture(async () => { submissions++; return { transactionId: "at1test" }; });
  f.backend.reconcile = async () => ({ status: "failed", result: { error: { code: "not_submitted" } } });
  const otherStore = new TradingStore(f.store.directory, "test-password-long-enough");
  const otherRuntime = new TradingRuntime(otherStore, f.backend);
  const originalLock = f.store.withLock.bind(f.store);
  let delayFirst = true;
  f.store.withLock = async (scope, fn) => {
    if (delayFirst) { delayFirst = false; await gate; }
    return originalLock(scope, fn);
  };
  try {
    const quote = await f.runtime.quote("swap", "alice", {});
    const first = await f.runtime.execute(String(quote.quoteId), "delayed-original");
    assert.equal((await otherRuntime.status(String(first.operationId))).status, "failed");
    const replacement = await otherRuntime.quote("swap", "alice", {});
    await otherRuntime.execute(String(replacement.quoteId), "replacement");
    await otherRuntime.drain();
    release();
    await f.runtime.drain();
    assert.equal(submissions, 1);
    assert.equal(f.runtime.operation(String(first.operationId)).status, "failed");
  } finally { release(); await otherRuntime.drain(); await f.runtime.drain(); otherStore.close(); await f.close(); }
});
