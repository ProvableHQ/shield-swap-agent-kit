import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createWalletClient, reconcileRecordInventory, type Transaction } from "@provablehq/veil-core";
import { TradingStore } from "../src/trading/store";
import { createRecordInventoryStore, inventoryActivity, inventoryScope } from "../src/trading/inventory";
import { reconcileOwnedRecords } from "../src/trading/managed-session";
import { freshChainFetch, withRecovery } from "../src/trading/recovery-context";
import { operationContext } from "../src/trading/ownership";
import { TradingRuntime } from "../src/trading/runtime";
import { VeilBackend } from "../src/trading/veil";
import type { AleoSession } from "../src/trading/session";
import type { Operation, Profile, SavedQuote } from "../src/trading/types";
const profile: Profile = { id: "alice", address: "aleo1test", network: "testnet", key: { type: "env", name: "TEST_KEY" },
  policy: { swaps: true, claims: true, bridges: false, inventory: true, maxSlippageBps: 100, swapLimits: {}, bridgeLimits: {} } };
const scope = inventoryScope(profile);
const missing = () => Object.assign(new Error("not found"), { status: 404, body: '"Transition not found"' });
const source = `program shield_swap.aleo;
finalize swap:
    input r0 as dynamic.future;
    input r1 as SwapRequest.public;
    await r0;
    lte block.height r1.deadline into r2;
    assert.eq r2 true;
`;
function transaction(fn = "swap"): Transaction {
  return { id: "at1original", type: "execute", execution: { global_state_root: "sr1root", proof: "proof", transitions: [
    { id: "au1input", program: "token.aleo", function: "transfer_private_to_public", tpk: "1group", tcm: "1field",
      inputs: [{ type: "record", id: "101field", tag: "202field" }], outputs: [] },
    { id: "au1swap", program: "shield_swap.aleo", function: fn, tpk: "2group", tcm: "2field", inputs: [],
      outputs: [{ type: "future", id: "3field", value: `{ program_id: shield_swap.aleo, function_name: ${fn}, arguments: [0field, { deadline: 100u32 }] }` }] },
  ] }, fee: { global_state_root: "sr1root", proof: "fee-proof", transition: {
    id: "au1fee", program: "credits.aleo", function: "fee_private", tpk: "3group", tcm: "3field", inputs: [{ type: "record", id: "303field", tag: "404field" }],
  } } };
}
async function fixture(options: { fee?: boolean; kind?: Operation["kind"]; fn?: string; local?: boolean; transaction?: boolean; dynamic?: boolean } = {}) {
  const root = mkdtempSync(join(tmpdir(), "swap-expiry-"));
  let store = new TradingStore(root, "test-password-long-enough", true);
  const chain = { height: 101, afterHeight: 101, heights: 0, code: source.replaceAll("swap:", (options.fn ?? "swap") + ":").replace("SwapRequest", options.fn === "swap_multi_hop" ? "SwapMultiHopRequest" : "SwapRequest"),
    spent: false, status: "missing", lookupError: undefined as unknown, broadcasts: 0, serials: [] as string[], onLookup: undefined as (() => void) | undefined };
  const request = async ({ method, params }: { method: string; params?: any }): Promise<unknown> => {
    if (method === "getConfirmedTransaction") {
      if (chain.status === "missing") throw missing();
      return { status: chain.status, transaction: { id: "at1fee" } };
    }
    if (method === "getLatestHeight") return chain.heights++ === 0 ? chain.height : chain.afterHeight;
    if (method === "getProgram") return chain.code;
    if (method === "findTransitionId") {
      chain.serials.push(params.inputOrOutputId); chain.onLookup?.();
      if (chain.lookupError) throw chain.lookupError;
      if (chain.spent) return "au1spent";
      throw missing();
    }
    if (method === "sendTransaction") { chain.broadcasts++; return "at1original"; }
    throw new Error("Unexpected RPC: " + method);
  };
  const proof = transaction(options.fn);
  if (options.dynamic) proof.execution!.transitions[0].inputs![0].type = "record_with_dynamic_id";
  if (!options.fee) proof.fee.transition = { ...proof.fee.transition, function: "fee_public", inputs: [] };
  const quote: SavedQuote = { id: "q", kind: options.kind ?? "swap", profile, scope: "testnet:aleo1test:shield_swap.aleo", createdAt: 0, expiresAt: 1, plan: {}, summary: {} };
  const op: Operation = { id: "op", quoteId: "q", kind: quote.kind, profileId: "alice", scope: quote.scope, requestKey: "original", status: "uncertain",
    createdAt: 0, updatedAt: 0, result: {}, managedRecords: true, checkpoint: { phase: "submitting", transactionId: "at1original" } };
  store.set("profile:alice", profile); store.set("quote:q", quote); store.set("operation:op", op);
  let journal = createRecordInventoryStore(store);
  await operationContext.run({ operationId: "op" }, () => journal.acquire({ scope, records: options.fee ? ["1group", "2group"] : ["1group"],
    ...(options.fee ? { feeRecordId: "2group" } : {}), status: "prepared", accountType: options.local === false ? "rpc" : "local", createdAt: 0,
    program: "shield_swap.aleo", function: options.fn ?? "swap", transactionId: "at1original", ...(options.transaction === false ? {} : { transaction: proof }) }));
  const session = () => {
    const client = Object.assign(createWalletClient({ account: { address: profile.address, type: "local" } as never,
      transport: { request, config: { network: "testnet" } } as never, recordManagement: { enabled: true, store: journal, chainId: "aleo:testnet" } }), {
      reconcileRecordInventory: (params?: { rebroadcast?: boolean }) => reconcileRecordInventory(client as never, params),
      getSwapOutput: async () => undefined, getUnclaimedSwaps: async () => ({ swaps: [] }), reconcileSwapHistory: async () => ({ complete: true, pagesScanned: 0 }),
    });
    const s = { client, publicClient: { request }, identities: { load: async () => [], save: async () => {} } } as unknown as AleoSession;
    s.reconcileRecords = params => reconcileOwnedRecords(store, profile, s, params);
    return s;
  };
  return { chain, root, get store() { return store; }, get journal() { return journal; },
    recover: (rebroadcast = false) => reconcileOwnedRecords(store, profile, session(), { rebroadcast }),
    status: () => new TradingRuntime(store, new VeilBackend(store, async () => session())).status("op"),
    restart() { store.close(); store = new TradingStore(root, "test-password-long-enough"); journal = createRecordInventoryStore(store); },
    async reserve(record = "1group") { return journal.acquire({ scope, records: [record], status: "reserved", accountType: "local", createdAt: 1, program: "token.aleo", function: "split" }); },
    close() { store.close(); rmSync(root, { recursive: true, force: true }); } };
}
for (const fn of ["swap", "swap_multi_hop"]) test(`${fn}: expired inputs are reusable across restart and never rebroadcast`, async () => {
  const f = await fixture({ fn });
  try {
    const activity = inventoryActivity(f.store, scope).version;
    await f.recover(true);
    assert.equal(f.chain.broadcasts, 0);
    assert.deepEqual(f.chain.serials, ["101field"]);
    assert.ok(inventoryActivity(f.store, scope).version > activity);
    f.restart();
    const result = await f.status();
    assert.equal(result.status, "failed");
    assert.equal((result.error as any).code, "swap_expired");
    assert.equal(result.inputRecordsReleased, true);
    assert.ok(await f.reserve());
    await f.recover(true); assert.equal(f.chain.broadcasts, 0);
  } finally { f.close(); }
});
test("expiry releases execution inputs while private fee recovery continues", async () => {
  const f = await fixture({ fee: true });
  try {
    await f.recover(true);
    assert.ok(await f.reserve());
    assert.equal(await f.reserve("2group"), undefined);
    assert.deepEqual((await f.journal.list(scope))[0].records, ["2group"], "SDK inventory excludes only the fee after release");
    const pending = await f.status();
    assert.equal(pending.status, "uncertain"); assert.equal(pending.feePending, true);
    f.restart(); f.chain.status = "rejected";
    assert.equal((await f.status()).status, "failed");
    assert.equal(await f.reserve("2group"), undefined, "rejected transaction may have consumed its private fee");
    assert.equal(f.chain.broadcasts, 0);
  } finally { f.close(); }
});
for (const scenario of ["boundary", "stale", "regression", "spent", "rpc-error", "generic-404", "route-404", "conflicting-404", "no-proof", "claim", "rpc-wallet", "missing-guard", "bypass-guard"]) {
  test(`retains inputs when expiry evidence is unsafe: ${scenario}`, async () => {
    const f = await fixture({ kind: scenario === "claim" ? "claim" : "swap", transaction: scenario !== "no-proof", local: scenario !== "rpc-wallet" });
    try {
      if (scenario === "boundary") f.chain.height = f.chain.afterHeight = 100;
      if (scenario === "stale") f.chain.height = f.chain.afterHeight = 99;
      if (scenario === "regression") f.chain.afterHeight = 99;
      if (scenario === "spent") f.chain.spent = true;
      if (scenario === "rpc-error") f.chain.lookupError = Object.assign(new Error("timeout"), { status: 504 });
      if (scenario === "generic-404") f.chain.lookupError = Object.assign(new Error("unknown RPC response"), { status: 404 });
      if (scenario === "route-404") f.chain.lookupError = Object.assign(new Error("unknown RPC response"), { status: 404, body: '"Route not found"' });
      if (scenario === "conflicting-404") f.chain.lookupError = Object.assign(new Error("unknown RPC response"), { status: 404,
        body: JSON.stringify({ statusCode: 503, message: "Transition not found" }) });
      if (scenario === "missing-guard") f.chain.code = source.replace("assert.eq r2 true;", "assert.eq r2 false;");
      if (scenario === "bypass-guard") f.chain.code = source.replace("await r0;", "branch.eq true true to bypass;\n    await r0;") + "position bypass;";
      if (scenario === "rpc-error") await assert.rejects(f.recover(), /timeout/);
      else if (scenario.endsWith("404")) await assert.rejects(f.recover(), /unknown RPC response/);
      else await f.recover();
      assert.equal(await f.reserve(), undefined);
      assert.equal(f.store.get<Operation>("operation:op")!.status, "uncertain");
    } finally { f.close(); }
  });
}
test("a live operation owns its reservations until its writer releases the lock", async () => {
  const f = await fixture(); const peer = new TradingStore(f.root, "test-password-long-enough");
  try {
    await peer.withLock("operation:op", async () => {
      await f.recover(); assert.equal(await f.reserve(), undefined); assert.deepEqual(f.chain.serials, []);
    });
    await f.recover(); assert.ok(await f.reserve());
  } finally { peer.close(); f.close(); }
});
test("competing recovery cannot release a reservation acquired after the first expiry check", async () => {
  const f = await fixture();
  try {
    await Promise.all([f.recover(), f.recover()]);
    assert.ok(await operationContext.run({ operationId: "next" }, () => f.reserve()));
    await f.store.withLock("operation:next", async () => {
      await f.recover();
      assert.equal(await f.reserve(), undefined, "the replacement owner still holds the record");
    });
  } finally { f.close(); }
});

test("dynamic record serial numbers are checked before releasing a wrapped swap input", async () => {
  const f = await fixture({ dynamic: true });
  try {
    await f.recover();
    assert.deepEqual(f.chain.serials, ["101field"]);
    assert.ok(await f.reserve());
  } finally { f.close(); }
});

test("the default chain endpoint's structured missing-transition response releases expired inputs", async () => {
  const f = await fixture();
  try {
    f.chain.lookupError = Object.assign(new Error("HTTP 404"), { status: 404, body: JSON.stringify({
      statusCode: 404, timestamp: "2026-11-03T17:57:27.935Z", path: "/v2/testnet/find/transitionID/101field",
      method: "GET", message: "Transition not found",
    }) });
    await f.recover(true);
    assert.ok(await f.reserve());
    assert.equal(f.chain.broadcasts, 0);
  } finally { f.close(); }
});

test("direct expiry reads disable caches and reject cached negative responses", async () => {
  const original = globalThis.fetch;
  let observed: RequestInit | undefined;
  globalThis.fetch = async (_input, init) => {
    observed = init;
    return new Response("missing", { status: 404, headers: { Age: "10" } });
  };
  try {
    await assert.rejects(freshChainFetch("https://example.invalid/serial"), /Cached chain evidence/);
    assert.equal(observed?.cache, "no-store");
    assert.match(new Headers(observed?.headers).get("Cache-Control")!, /no-cache/);
  } finally { globalThis.fetch = original; }
});

test("cancelled recovery never releases inputs", async () => {
  const f = await fixture(); const controller = new AbortController(); controller.abort();
  try {
    await assert.rejects(withRecovery(controller.signal, 1000, () => f.recover()));
    assert.equal(await f.reserve(), undefined);
  } finally { f.close(); }
});

test("a failed operation update rolls back release evidence and maintenance wakeup", async () => {
  const f = await fixture(); const original = f.store.set.bind(f.store);
  try {
    const version = inventoryActivity(f.store, scope).version;
    f.store.set = (key, value) => { if (key === "operation:op") throw new Error("disk write failed"); return original(key, value); };
    await assert.rejects(f.recover(), /disk write failed/);
    f.store.set = original;
    assert.equal(inventoryActivity(f.store, scope).version, version);
    assert.equal(await f.reserve(), undefined);
    assert.ok((await f.journal.list(scope))[0].transaction, "the proved transaction survives rollback");
  } finally { f.store.set = original; f.close(); }
});

test("cancellation during serial checks prevents a late release", async () => {
  const f = await fixture(); const controller = new AbortController();
  try {
    f.chain.onLookup = () => controller.abort();
    await assert.rejects(withRecovery(controller.signal, 1000, () => f.recover()));
    assert.equal(await f.reserve(), undefined);
  } finally { f.close(); }
});

test("a confirmed original swap retains consumed inputs and is never classified as expired", async () => {
  const f = await fixture();
  try {
    f.chain.status = "accepted";
    await f.recover(true);
    assert.equal(await f.reserve(), undefined);
    assert.deepEqual(f.chain.serials, []);
    assert.equal(f.chain.broadcasts, 0);
    assert.equal((f.store.get<Operation>("operation:op")!.result.error as any)?.code, undefined);
  } finally { f.close(); }
});
