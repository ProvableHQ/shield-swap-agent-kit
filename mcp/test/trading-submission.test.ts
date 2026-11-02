import { test } from "node:test";
import assert from "node:assert/strict";
import { executeContract, type Client, type ProvingConfig } from "@provablehq/veil-core";
import type { BlindedIdentityRecord } from "@provablehq/shield-swap-sdk";
import { attributeIdentitySave, claimContext, inventoryContext, swapContext, trackSwapSubmission, type SwapSubmission } from "../src/trading/session";

test("the public SDK execution path checkpoints before entering its proving adapter", async () => {
  const events: string[] = [];
  const proving: ProvingConfig = { mode: "delegated", execute: async () => {
    events.push("proving");
    throw new Error("ambiguous broadcast");
  } };
  trackSwapSubmission(proving);
  const state: SwapSubmission = {
    execution: { operationId: "o", checkpoint: value => { assert.equal((value as { phase: string }).phase, "submitting"); events.push("checkpoint"); } },
    initial: new Set(), submissionStarted: false, checkpoint: { phase: "reserved", counter: 7 },
  };
  const client = { account: { type: "local", sign: () => {} }, proving } as unknown as Client;
  await assert.rejects(swapContext.run(state, () => executeContract(client, { program: "shield_swap.aleo", function: "swap", inputs: [] })), /ambiguous/);
  assert.deepEqual(events, ["checkpoint", "proving"]);
  assert.equal(state.submissionStarted, true);
  assert.equal(state.checkpoint.counter, 7);
});
test("failed checkpoint persistence prevents proving and submission", async () => {
  let calls = 0;
  const proving: ProvingConfig = { mode: "delegated", execute: async () => { calls++; throw new Error("must not execute"); } };
  trackSwapSubmission(proving);
  const state: SwapSubmission = {
    execution: { operationId: "o", checkpoint: () => { throw new Error("disk full"); } },
    initial: new Set(), submissionStarted: false, checkpoint: { phase: "reserved", counter: 7 },
  };
  await assert.rejects(swapContext.run(state, () => proving.execute!({ programName: "shield_swap.aleo", functionName: "swap", inputs: [], fee: 0n })), /disk full/);
  assert.equal(calls, 0);
  assert.equal(state.submissionStarted, false);
});

test("claims persist the boundary before proving and the returned ID before SDK bookkeeping", async () => {
  const events: string[] = [];
  const proving: ProvingConfig = { mode: "delegated", execute: async () => {
    events.push("proving");
    return { transactionId: "at1claim", transitions: [], outputs: [] };
  } };
  trackSwapSubmission(proving);
  const client = { account: { type: "local", sign() {} }, proving } as unknown as Client;
  await claimContext.run({ beforeSubmit: () => { events.push("checkpoint"); }, submitted: id => { events.push(id); } }, async () => {
    await executeContract(client, { program: "shield_swap.aleo", function: "claim_swap_output", inputs: [] });
    events.push("sdk-bookkeeping");
  });
  assert.deepEqual(events, ["checkpoint", "proving", "at1claim", "sdk-bookkeeping"]);
});

test("inventory evidence records a proved transaction only after the SDK journals it", async () => {
  const events: string[] = [];
  const prepared = { type: "transaction-prepared", transactionId: "at1split", transaction: {} } as const;
  const proving: ProvingConfig = { mode: "delegated", execute: async options => {
    await options.onProgress?.(prepared as never);
    events.push("broadcast");
    return { transactionId: "at1split", transitions: [], outputs: [] };
  } };
  trackSwapSubmission(proving);
  const call = (handler: () => Promise<void>) => inventoryContext.run({ prepared: id => { events.push("evidence:" + id); } },
    () => proving.execute!({ programName: "credits.aleo", functionName: "split", inputs: [], fee: 0n, onProgress: handler }));
  // The SDK's handler rejects the proof before journaling it; nothing is broadcast.
  await assert.rejects(call(async () => { throw new Error("Proved transaction exceeds maxFeeMicrocredits"); }), /maxFeeMicrocredits/);
  assert.equal(events.length, 0, "a proof the SDK rejected is never recorded as submission evidence");
  await call(async () => { events.push("journal"); });
  assert.deepEqual(events, ["journal", "evidence:at1split", "broadcast"]);
});

test("failed claim boundary persistence prevents proving and submission", async () => {
  let calls = 0;
  const proving: ProvingConfig = { mode: "delegated", execute: async () => { calls++; throw new Error("must not execute"); } };
  trackSwapSubmission(proving);
  await assert.rejects(claimContext.run({ beforeSubmit: () => { throw new Error("disk full"); }, submitted: () => {} },
    () => proving.execute!({ programName: "shield_swap.aleo", functionName: "claim_swap_output", inputs: [], fee: 0n })), /disk full/);
  assert.equal(calls, 0);
});

test("concurrent swaps attribute interleaved identity saves to their own checkpoints", () => {
  const initial = new Set<number>([0]);
  const a = { execution: { operationId: "o", checkpoint() {} }, initial, submissionStarted: false, checkpoint: {} } as SwapSubmission;
  const b = { ...a, checkpoint: {} } as SwapSubmission;
  const base = [{ counter: 0, status: "swapped" }] as BlindedIdentityRecord[];
  const afterA = [...base, { counter: 1, status: "reserved" }] as BlindedIdentityRecord[];
  const afterB = [...afterA, { counter: 2, status: "reserved" }] as BlindedIdentityRecord[];
  assert.equal(attributeIdentitySave(base, afterA, a)?.counter, 1);
  a.checkpoint = { counter: 1 };
  assert.equal(attributeIdentitySave(afterA, afterB, b)?.counter, 2);
  b.checkpoint = { counter: 2 };
  const aSubmitted = afterB.map(record => record.counter === 1 ? { ...record, status: "swapped", swapId: "s1", handle: { transactionId: "at1a" } } : record) as BlindedIdentityRecord[];
  assert.equal(attributeIdentitySave(afterB, aSubmitted, a)?.counter, 1, "a later save of A's record belongs to A");
  assert.equal(attributeIdentitySave(afterB, aSubmitted, b), undefined, "B does not claim A's change even though counter 1 is outside B's initial set");
});
