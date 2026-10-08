import { test } from "node:test";
import assert from "node:assert/strict";
import { executeContract, type Client, type ProvingConfig } from "@provablehq/veil-core";
import { swapContext, trackSwapSubmission, type SwapSubmission } from "../src/trading/session";

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
