import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RecordSpend } from "@provablehq/veil-core";
import { TradingStore } from "../src/trading/store";
import { createRecordInventoryStore } from "../src/trading/inventory";

const scope = JSON.stringify(["aleo:testnet", "aleo1test"]);
const entry = (records: string[], extra: Partial<RecordSpend> = {}): Omit<RecordSpend, "id"> => ({
  scope, records, program: "credits.aleo", function: "join", status: "reserved", createdAt: 1, accountType: "local", ...extra,
});

test("the encrypted journal reserves inputs atomically and follows the SDK's release rules", async () => {
  const root = mkdtempSync(join(tmpdir(), "shield-inventory-"));
  const store = new TradingStore(root, "test-password-long-enough", true);
  const journal = createRecordInventoryStore(store);
  try {
    const first = await journal.acquire(entry(["1group", "2group"]));
    assert.ok(first);
    assert.equal(typeof first.id, "string");
    assert.equal(await journal.acquire(entry(["2group", "3group"])), undefined, "an overlapping input is contended");
    await assert.rejects(journal.acquire(entry(["4group", "4group"])), /Duplicate/);
    assert.deepEqual((await journal.list(scope)).map(item => item.id), [first.id]);
    assert.deepEqual(await journal.list(JSON.stringify(["aleo:mainnet", "aleo1test"])), []);

    const transaction = { id: "at1prepared", type: "execute" } as unknown as RecordSpend["transaction"];
    await journal.update(scope, first.id, { status: "prepared", transactionId: "at1prepared", transaction, feeMicrocredits: "12" });
    let [saved] = await journal.list(scope);
    assert.equal(saved.status, "prepared");
    assert.deepEqual(saved.transaction, transaction);
    await journal.update(scope, first.id, { status: "confirmed", transaction: undefined, lastRebroadcastError: undefined });
    [saved] = await journal.list(scope);
    assert.equal(saved.status, "confirmed");
    assert.equal("transaction" in saved, false, "an explicit undefined clears the saved transaction");
    // Confirmed inputs stay excluded while a stale scanner still reports them.
    assert.equal(await journal.acquire(entry(["1group"])), undefined);

    const paid = await journal.acquire(entry(["5group", "9group"], { feeRecordId: "9group" }));
    assert.ok(paid);
    await journal.update(scope, paid.id, { status: "rejected" });
    assert.ok(await journal.acquire(entry(["5group"])), "rejected executions release their inputs");
    assert.equal(await journal.acquire(entry(["9group"])), undefined, "a charged private fee record stays excluded");

    const cancelled = await journal.acquire(entry(["6group"]));
    await journal.update(scope, cancelled!.id, { status: "cancelled" });
    assert.ok(await journal.acquire(entry(["6group"])), "cancelled reservations release their inputs");
    await assert.rejects(journal.update(scope, "missing", { status: "cancelled" }), /Unknown/);
    const ids = (await journal.list(scope)).map(item => Number(item.id));
    assert.deepEqual(ids, [...ids].sort((a, b) => a - b), "entries list in allocation order");
  } finally { store.close(); rmSync(root, { recursive: true, force: true }); }
});

test("two processes sharing the state directory cannot reserve the same record", async () => {
  const root = mkdtempSync(join(tmpdir(), "shield-inventory-race-"));
  const password = "test-password-long-enough";
  const first = new TradingStore(root, password, true);
  const second = new TradingStore(root, password);
  try {
    const results = await Promise.all(Array.from({ length: 6 }, (_, index) =>
      createRecordInventoryStore(index % 2 ? first : second).acquire(entry(["7group"]))));
    assert.equal(results.filter(Boolean).length, 1);
    assert.equal((await createRecordInventoryStore(first).list(scope)).length, 1);
    assert.ok(!(await import("node:fs")).readFileSync(join(root, "state.sqlite")).includes("7group"), "nonces are encrypted at rest");
  } finally { first.close(); second.close(); rmSync(root, { recursive: true, force: true }); }
});

import { TradingRuntime } from "../src/trading/runtime";
import { VeilBackend } from "../src/trading/veil";
import { inventoryContext, type AleoSession } from "../src/trading/session";
import type { Profile } from "../src/trading/types";

const profile: Profile = { id: "alice", network: "testnet", address: "aleo1test", key: { type: "env", name: "TEST_KEY" },
  policy: { swaps: false, claims: false, bridges: false, inventory: false, maxSlippageBps: 100, swapLimits: {}, bridgeLimits: {} } };
const token = { id: "1field", symbol: "USDCx", decimals: 6, ammTokenProgram: "wrapped_usdcx.aleo", underlyingProgram: "usdcx_stablecoin.aleo" };
const plan = { scope: JSON.stringify(["aleo:testnet", "aleo1test"]), asset: { program: "usdcx_stablecoin.aleo", recordName: "Token", amountField: "amount", amountType: "u128" },
  target: { records: 2, minRecordAmount: 100000n, distribution: "balanced", toleranceBps: 0 }, inputs: [{ id: "1group", amount: 600000n }],
  steps: [{ kind: "split", inputs: ["1group"], outputs: [{ id: "step1:0", amount: 300000n }, { id: "step1:1", amount: 300000n }], amount: 300000n, deduction: 0n }],
  deduction: 0n, maxTransactions: 24 };

function inventoryFixture(rebalance: () => Promise<Record<string, unknown>>, journal: () => Record<string, unknown>[]) {
  const root = mkdtempSync(join(tmpdir(), "shield-inventory-runtime-"));
  const store = new TradingStore(root, "test-password-long-enough", true);
  store.set("profile:alice", profile);
  const calls: Record<string, unknown>[] = [];
  const session = { client: {
    tokenData: async (symbol: string) => { assert.equal(symbol, "USDCx"); return token; },
    planInventory: async (params: Record<string, unknown>) => { calls.push(params); return plan; },
    rebalanceRecordInventory: async (params: { plan: unknown; maxFeeMicrocredits: bigint }) => { calls.push(params); return rebalance(); },
    reconcileRecordInventory: async () => journal(),
    getRecordInventory: async () => ({ asset: plan.asset, balance: 600000n,
      available: [{ id: "1group", amount: 600000n, record: { recordPlaintext: "PRIVATE-RECORD-PLAINTEXT" } }],
      reserved: [{ id: "2group", amount: 1n, record: { recordPlaintext: "PRIVATE-RECORD-PLAINTEXT" } }] }),
  }, identities: { load: async () => [], save: async () => {} } } as unknown as AleoSession;
  const runtime = new TradingRuntime(store, new VeilBackend(store, async () => session));
  return { store, runtime, calls, close: async () => { await runtime.drain(); store.close(); rmSync(root, { recursive: true, force: true }); } };
}

test("inventory plans are durable and rebalancing needs terminal permission and a fee limit", async () => {
  const f = inventoryFixture(async () => ({ status: "complete", transactionIds: ["at1split"], completedSteps: 1 }), () => []);
  try {
    const saved = await f.runtime.quote("inventory", "alice", { token: "USDCx", records: 2, minRecordAmount: "0.1", distribution: "balanced", toleranceBps: 0, maxTransactions: 24 });
    assert.deepEqual(f.calls[0], { token: "1field", target: { records: 2, minRecordAmount: 100000n, distribution: "balanced", toleranceBps: 0 }, maxTransactions: 24 });
    assert.equal(saved.kind, "inventory");
    assert.equal(saved.stepCount, 1);
    assert.deepEqual(saved.steps, [{ kind: "split", inputs: 1, outputs: ["300000", "300000"], amount: "300000", deduction: "0", helper: "native" }]);
    assert.ok(Number(saved.expiresAt) > Date.now() + 120_000, "a plan may be reviewed longer than a swap quote");
    await assert.rejects(f.runtime.execute(String(saved.quoteId), "run-1"), /permission/);
    f.store.set("profile:alice", { ...profile, policy: { ...profile.policy, inventory: true } });
    await assert.rejects(f.runtime.execute(String(saved.quoteId), "run-1"), /fee limit/);
    f.store.set("profile:alice", { ...profile, policy: { ...profile.policy, inventory: true, inventoryFeeLimit: "5000000" } });
    const op = await f.runtime.execute(String(saved.quoteId), "run-1");
    const duplicate = await f.runtime.execute(String(saved.quoteId), "run-1");
    assert.equal(duplicate.operationId, op.operationId);
    await f.runtime.drain();
    const executed = f.calls[1] as { plan: unknown; maxFeeMicrocredits: bigint };
    assert.deepEqual(executed.plan, plan, "the stored plan round-trips its bigint amounts unchanged");
    assert.equal(executed.maxFeeMicrocredits, 5000000n);
    const done = f.runtime.operation(String(op.operationId));
    assert.equal(done.status, "complete");
    assert.deepEqual(done.transactionIds, ["at1split"]);
    assert.equal(done.completedSteps, 1);
    await assert.rejects(f.runtime.execute(String(saved.quoteId), "run-2"), /consumed/);
  } finally { await f.close(); }
});

test("an interrupted rebalance keeps prepared transaction evidence and reconciles instead of retrying", async () => {
  let status = "submitted";
  const f = inventoryFixture(async () => {
    inventoryContext.getStore()!.prepared("at1join");
    return { status: "interrupted", transactionIds: [], completedSteps: 0, reason: "Timed out confirming at1join; reservation retained PRIVATE-DETAIL" };
  }, () => [{ id: "1", scope: plan.scope, records: ["1group"], program: "usdcx_stablecoin.aleo", function: "join", status, createdAt: 1, accountType: "local", transactionId: "at1join" }]);
  f.store.set("profile:alice", { ...profile, policy: { ...profile.policy, inventory: true, inventoryFeeLimit: "1" } });
  try {
    const saved = await f.runtime.quote("inventory", "alice", { token: "USDCx", records: 2 });
    const op = await f.runtime.execute(String(saved.quoteId), "run");
    await f.runtime.drain();
    const interrupted = f.runtime.operation(String(op.operationId));
    assert.equal(interrupted.status, "uncertain");
    assert.deepEqual(interrupted.transactionIds, ["at1join"]);
    assert.equal(interrupted.reasonCode, "confirmation_timeout");
    assert.doesNotMatch(JSON.stringify(interrupted), /PRIVATE-DETAIL/);
    assert.equal((await f.runtime.status(String(op.operationId))).status, "uncertain", "a submitted journal entry is not a chain outcome");
    const resumed = await f.runtime.resume(String(op.operationId));
    assert.equal(resumed.status, "uncertain", "resume reconciles and never re-executes an inventory plan");
    await f.runtime.drain();
    status = "confirmed";
    const settled = await f.runtime.status(String(op.operationId));
    assert.equal(settled.status, "failed");
    assert.equal(settled.nextAction, "plan_again");
    assert.deepEqual(settled.transactions, { at1join: "confirmed" });
    assert.equal(f.calls.filter(call => "plan" in call).length, 1, "the plan was executed once");
  } finally { await f.close(); }
});

test("inventory reads report counts and amounts without plaintext, and rebroadcast needs permission", async () => {
  const f = inventoryFixture(async () => ({}), () => [{ id: "1", scope: plan.scope, records: ["1group"], program: "usdcx_stablecoin.aleo", function: "split", status: "prepared",
    createdAt: 1, accountType: "local", transactionId: "at1split", transaction: { id: "at1split", fee: "PRIVATE-PROOF" } }]);
  try {
    const inventory = await f.runtime.read("get_record_inventory", "alice", { token: "USDCx" });
    assert.equal(inventory.balance, "600000");
    assert.equal(inventory.availableCount, 1);
    assert.equal(inventory.reservedCount, 1);
    assert.deepEqual(inventory.available, [{ id: "1group", amount: "600000" }]);
    assert.doesNotMatch(JSON.stringify(inventory), /PRIVATE-RECORD-PLAINTEXT/);
    const journal = await f.runtime.read("reconcile_record_inventory", "alice", {});
    assert.equal(journal.unresolvedCount, 1);
    assert.deepEqual((journal.entries as { savedTransaction: boolean; status: string }[]).map(entry => [entry.status, entry.savedTransaction]), [["prepared", true]]);
    assert.doesNotMatch(JSON.stringify(journal), /PRIVATE-PROOF/);
    await assert.rejects(f.runtime.read("reconcile_record_inventory", "alice", { rebroadcast: true }), /permission/);
  } finally { await f.close(); }
});

test("a plan rejected by the SDK before any submission fails definitively", async () => {
  const f = inventoryFixture(async () => { throw new Error("Inventory plan belongs to another account or chain PRIVATE-DETAIL"); }, () => []);
  f.store.set("profile:alice", { ...profile, policy: { ...profile.policy, inventory: true, inventoryFeeLimit: "1" } });
  try {
    const saved = await f.runtime.quote("inventory", "alice", { token: "USDCx", records: 2 });
    const op = await f.runtime.execute(String(saved.quoteId), "run");
    await f.runtime.drain();
    const failed = f.runtime.operation(String(op.operationId));
    assert.equal(failed.status, "failed");
    assert.equal((failed.error as { code: string }).code, "not_submitted");
    assert.doesNotMatch(JSON.stringify(failed), /PRIVATE-DETAIL/);
  } finally { await f.close(); }
});
