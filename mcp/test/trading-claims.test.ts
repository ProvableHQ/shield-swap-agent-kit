import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { executeContract, FinalizeRevertError, TransactionTimeoutError, type Client, type ProvingConfig } from "@provablehq/veil-core";
import { TradingStore } from "../src/trading/store";
import { TradingRuntime } from "../src/trading/runtime";
import { VeilBackend } from "../src/trading/veil";
import { trackSwapSubmission, type AleoSession } from "../src/trading/session";
import type { Operation, Profile } from "../src/trading/types";

const profile: Profile = { id: "alice", network: "testnet", address: "aleo1test", key: { type: "env", name: "UNUSED" },
  policy: { swaps: true, claims: true, bridges: false, maxSlippageBps: 100, swapLimits: {}, bridgeLimits: {} } };
const password = "disposable-claim-test-password";
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "shield-claims-"));
  let store = new TradingStore(root, password, true);
  store.set("profile:alice", profile);
  let preparationFails = false, tracked = true, lookupFails = false, claimable = true;
  let rejectAfterSubmit = false, timeoutAfterSubmit = false, failSecond = false;
  let submissions = 0, rejected = false, accepted = false;
  const completed = new Set<string>();
  const proving: ProvingConfig = { mode: "delegated", execute: async () => {
    submissions++;
    if (rejectAfterSubmit) throw new FinalizeRevertError("at1claim", { feeTransactionId: "at1fee" });
    if (timeoutAfterSubmit) throw new TransactionTimeoutError({ transactionId: "at1claim", timeoutMs: 1, cause: new Error("PRIVATE-DETAIL") });
    return { transactionId: "at1claim", transitions: [], outputs: [] };
  } };
  trackSwapSubmission(proving);
  function runtime() {
    const session = { submissionTracked: tracked, client: {
      getUnclaimedSwaps: async () => ({ swaps: ["one", "two"].filter(id => !completed.has(id)).map(swapId => ({ swapId, claimable, handle: { swapId } })), unresolvable: [] }),
      claimSwapOutput: async ({ handle }: { handle: { swapId: string } }) => {
        if (preparationFails || (failSecond && handle.swapId === "two")) throw new Error("PRIVATE-DETAIL: local preparation failure");
        const result = await executeContract({ account: { type: "local", sign() {} }, proving } as unknown as Client,
          { program: "shield_swap.aleo", function: "claim_swap_output", inputs: [] });
        completed.add(handle.swapId);
        return { transactionId: result.transactionId, amountOut: 99n, amountRemaining: 1n };
      },
      reconcileSwapHistory: async () => ({ complete: true, pagesScanned: 1 }),
    }, identities: {
      load: async () => [...completed].map(swapId => ({ swapId, claim: { transactionId: "at1claim", amountOut: "99", amountRemaining: "1" } })),
      save: async () => {},
    }, publicClient: { request: async ({ method, params }: { method: string; params: { id: string } }) => {
      assert.equal(method, "getConfirmedTransaction");
      assert.equal(params.id, "at1claim");
      if (lookupFails) throw new Error("RPC unavailable PRIVATE-DETAIL");
      if (!rejected && !accepted) throw new Error("not found");
      return { status: rejected ? "rejected" : "accepted", transaction: { id: rejected ? "at1fee" : "at1claim" } };
    } } } as unknown as AleoSession;
    return new TradingRuntime(store, new VeilBackend(store, async () => session));
  }
  let current = runtime();
  return {
    get store() { return store; }, get runtime() { return current; }, completed,
    prepareFailure: (value: boolean) => { preparationFails = value; },
    secondFailure: (value: boolean) => { failSecond = value; },
    timeout: (value: boolean) => { timeoutAfterSubmit = value; },
    reject: (value: boolean) => { rejectAfterSubmit = value; },
    chainRejected: () => { rejected = true; }, chainAccepted: () => { accepted = true; },
    rpcFailure: (value: boolean) => { lookupFails = value; },
    setClaimable: (value: boolean) => { claimable = value; },
    untracked: () => { tracked = false; current = runtime(); },
    submissions: () => submissions,
    async start(ids = ["one"]) {
      const q = await current.quote("claim", "alice", { swapIds: ids });
      const op = await current.execute(String(q.quoteId), "claim:" + ids.join(","));
      await current.drain();
      return String(op.operationId);
    },
    async restart() { await current.drain(); store.close(); store = new TradingStore(root, password); current = runtime(); },
    async close() { await current.drain(); store.close(); rmSync(root, { recursive: true, force: true }); },
  };
}

test("pre-submission claim failure can resume the same operation after reopening its store", async () => {
  const f = fixture();
  try {
    f.prepareFailure(true);
    const id = await f.start();
    assert.equal(f.runtime.operation(id).status, "pending");
    assert.match(JSON.stringify(f.runtime.operation(id)), /not_submitted/);
    assert.doesNotMatch(JSON.stringify(f.runtime.operation(id)), /PRIVATE-DETAIL/);
    assert.equal(f.submissions(), 0);
    await f.restart(); f.prepareFailure(false);
    await f.runtime.resume(id); await f.runtime.drain();
    assert.equal(f.runtime.operation(id).status, "complete");
    assert.equal(f.submissions(), 1);
    await f.runtime.resume(id); await f.runtime.drain();
    assert.equal(f.submissions(), 1);
  } finally { await f.close(); }
});

test("lost claim response retains its transaction ID and blocks writes across restart", async () => {
  const f = fixture();
  try {
    f.timeout(true);
    const id = await f.start();
    await f.restart();
    for (const rpcFails of [false, true]) {
      f.rpcFailure(rpcFails);
      const result = await f.runtime.resume(id);
      assert.equal(result.status, "uncertain");
      assert.match(JSON.stringify(result), /at1claim/);
      assert.doesNotMatch(JSON.stringify(result), /PRIVATE-DETAIL/);
    }
    const q = await f.runtime.quote("claim", "alice", { swapIds: ["two"] });
    await assert.rejects(f.runtime.execute(String(q.quoteId), "another"), /active or uncertain/);
    assert.equal(f.submissions(), 1);
    f.rpcFailure(false); f.completed.add("one");
    assert.equal((await f.runtime.resume(id)).status, "complete");
    assert.equal(f.submissions(), 1);
  } finally { await f.close(); }
});

test("an accepted transaction alone never triggers a second claim while history is incomplete", async () => {
  const f = fixture();
  try {
    f.timeout(true); const id = await f.start(); f.chainAccepted();
    assert.equal((await f.runtime.resume(id)).status, "uncertain");
    assert.equal(f.submissions(), 1);
  } finally { await f.close(); }
});

for (const immediate of [true, false]) {
  test(`confirmed claim rejection ${immediate ? "from the SDK" : "found after restart"} permits only an explicit resume`, async () => {
    const f = fixture();
    try {
      if (immediate) f.reject(true); else f.timeout(true);
      const id = await f.start();
      await f.restart();
      if (!immediate) f.chainRejected();
      const status = await f.runtime.status(id);
      assert.equal(status.status, "pending");
      assert.match(JSON.stringify(status), /transaction_rejected/);
      assert.match(JSON.stringify(status), /at1fee/);
      assert.equal(f.submissions(), 1);
      f.reject(false); f.timeout(false);
      await f.runtime.resume(id); await f.runtime.drain();
      assert.equal(f.runtime.operation(id).status, "complete");
      assert.equal(f.submissions(), 2);
    } finally { await f.close(); }
  });
}

test("partial batch recovery keeps completed claims and resumes only the remaining claim", async () => {
  const f = fixture();
  try {
    f.secondFailure(true); const id = await f.start(["one", "two"]);
    assert.equal(f.runtime.operation(id).status, "pending");
    assert.equal(f.submissions(), 1);
    await f.restart(); f.secondFailure(false);
    await f.runtime.resume(id); await f.runtime.drain();
    assert.equal(f.runtime.operation(id).status, "complete");
    assert.equal(f.submissions(), 2);
    assert.deepEqual([...f.completed], ["one", "two"]);
  } finally { await f.close(); }
});

for (const stage of ["preparing", "submitting", "uncertain"] as const) {
  test(`restart with a ${stage} claim checkpoint ${stage === "preparing" ? "can resume" : "cannot resubmit"}`, async () => {
    const f = fixture();
    try {
      f.prepareFailure(true); const id = await f.start();
      const op = f.store.get<Operation>("operation:" + id)!;
      f.store.set("operation:" + id, { ...op, status: "running", checkpoint: { claims: [{ swapId: "one", status: stage }] } });
      await f.restart(); f.prepareFailure(false);
      await f.runtime.resume(id); await f.runtime.drain();
      assert.equal(f.runtime.operation(id).status, stage === "preparing" ? "complete" : "uncertain");
      assert.equal(f.submissions(), stage === "preparing" ? 1 : 0);
    } finally { await f.close(); }
  });
}

test("an untracked legacy claim exception remains uncertain", async () => {
  const f = fixture();
  try {
    f.untracked(); f.prepareFailure(true); const id = await f.start();
    assert.equal((await f.runtime.resume(id)).status, "uncertain");
    assert.equal(f.submissions(), 0);
  } finally { await f.close(); }
});

test("resume rechecks claimability and current claim permission", async () => {
  const f = fixture();
  try {
    f.prepareFailure(true); const id = await f.start(); f.prepareFailure(false);
    f.setClaimable(false);
    await f.runtime.resume(id); await f.runtime.drain();
    assert.equal(f.runtime.operation(id).status, "pending");
    assert.equal(f.submissions(), 0);
    f.setClaimable(true);
    f.store.set("profile:alice", { ...profile, policy: { ...profile.policy, claims: false } });
    await assert.rejects(f.runtime.resume(id), /permission/i);
    assert.equal(f.submissions(), 0);
  } finally { await f.close(); }
});
