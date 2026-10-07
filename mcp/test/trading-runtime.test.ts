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
  return { store, runtime, close: async () => { await runtime.drain(); store.close(); rmSync(root, { recursive: true, force: true }); } };
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
