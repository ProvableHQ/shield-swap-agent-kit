import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { once } from "node:events";
import { setTimeout as sleep } from "node:timers/promises";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPublicClient, getConfirmedTransaction, http } from "@provablehq/veil-core";
import { TradingStore } from "../src/trading/store";
import { TradingRuntime } from "../src/trading/runtime";
import { OperationRecovery } from "../src/trading/recovery";
import { recoveryFetch, withRecovery } from "../src/trading/recovery-context";
import { withIdentityLock } from "../src/trading/managed-session";
import { createSessionFactory, walletScope } from "../src/trading/session";
import { createRecordInventoryStore } from "../src/trading/inventory";
import { operationContext } from "../src/trading/ownership";
import type { Operation, Profile, SavedQuote, TradingBackend } from "../src/trading/types";

const profile: Profile = { id: "alice", address: "aleo1test", network: "testnet", key: { type: "env", name: "TEST_KEY" },
  policy: { swaps: true, claims: true, bridges: true, maxSlippageBps: 100, swapLimits: {}, bridgeLimits: {} } };
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "recovery-"));
  const store = new TradingStore(root, "test-password-long-enough", true);
  return { store, close() { store.close(); rmSync(root, { recursive: true, force: true }); } };
}
function seed(store: TradingStore, id: string, owner = profile): Operation {
  const quote: SavedQuote = { id, kind: "swap", profile: owner, scope: walletScope(owner), createdAt: 0, expiresAt: 1, plan: {}, summary: {} };
  const op: Operation = { id, quoteId: id, kind: "swap", profileId: owner.id, scope: quote.scope, requestKey: id,
    createdAt: 0, updatedAt: Number(id), status: "uncertain", result: {}, managedRecords: true,
    checkpoint: { phase: "submitting", transactionId: "at1" + id } };
  store.set("quote:" + id, quote); store.set("operation:" + id, op); return op;
}
async function server(handler: (req: IncomingMessage, res: ServerResponse) => void) {
  const value = createServer(handler).listen(0, "127.0.0.1");
  await once(value, "listening");
  return { url: `http://127.0.0.1:${(value.address() as { port: number }).port}`,
    async close() { value.closeAllConnections(); await new Promise<void>(resolve => value.close(() => resolve())); } };
}
async function until(predicate: () => boolean, timeout = 2000) {
  const end = Date.now() + timeout;
  while (!predicate()) { if (Date.now() >= end) assert.fail("Condition did not become true before deadline"); await sleep(5); }
}

for (const bodyStalls of [false, true]) test(`recovery aborts stalled HTTP ${bodyStalls ? "bodies" : "headers"}, releases locks, and retains proofs`, { timeout: 10000 }, async () => {
  const f = fixture();
  let opened = false, disconnected = false, finish!: () => void;
  const wire = await server((_req, res) => {
    opened = true; res.on("close", () => { disconnected = true; });
    if (bodyStalls) { res.writeHead(200, { "Content-Type": "application/json" }); res.write('{"status":'); }
    finish = () => res.end(bodyStalls ? '"accepted"}' : '{"status":"accepted"}');
  });
  const client = createPublicClient({ transport: http(wire.url, { network: "testnet", fetchFn: recoveryFetch }) });
  const original = seed(f.store, "0");
  const journal = createRecordInventoryStore(f.store);
  const scope = JSON.stringify(["aleo:testnet", profile.address]);
  await operationContext.run({ operationId: "0" }, () => journal.acquire({ scope, status: "prepared", records: ["input"],
    program: "shield_swap.aleo", function: "swap", createdAt: 0, accountType: "local", transactionId: "at10", transaction: { proof: "saved-proof" } as never }));
  const proof = await journal.list(scope);
  const runtime = new TradingRuntime(f.store, { reconcile: async () => withIdentityLock(f.store, profile, async () => {
    await getConfirmedTransaction(client, { id: "at10" });
    return { status: "complete", result: {} };
  }) } as unknown as TradingBackend);
  const recovery = new OperationRecovery(runtime, { timeoutMs: 1000, intervalMs: 60_000 });
  try {
    recovery.tick(); await until(() => opened);
    await until(() => disconnected);
    await recovery.stop();
    assert.deepEqual(f.store.get("operation:0"), original);
    assert.deepEqual(await journal.list(scope), proof, "a timeout cannot release inputs or remove the prepared transaction");
    await f.store.withLock("operation:0", () => withIdentityLock(f.store, profile, async () => {}));
    finish(); await sleep(10);
    assert.deepEqual(f.store.get("operation:0"), original, "a late response cannot update a cancelled operation");
  } finally { await recovery.stop(); await wire.close(); f.close(); }
});

test("recovery refills slots, never duplicates an ID, and stops without cancelling an unrelated request", { timeout: 10000 }, async () => {
  const f = fixture();
  const blocked = new Map<string, ServerResponse>();
  let active = 0, peak = 0;
  const attempts = new Map<string, number>();
  const wire = await server((req, res) => {
    const id = req.url!.split("/").at(-1)!;
    attempts.set(id, (attempts.get(id) ?? 0) + 1);
    active++; peak = Math.max(peak, active);
    res.once("close", () => active--);
    if (id === "at10" || id === "unrelated") blocked.set(id, res);
    else setTimeout(() => res.end('{"status":"accepted"}'), 20);
  });
  const client = createPublicClient({ transport: http(wire.url, { network: "testnet", fetchFn: recoveryFetch }) });
  for (let id = 0; id < 10; id++) seed(f.store, String(id), id < 8 ? profile : { ...profile, id: "bob", address: "aleo1bob" });
  const runtime = new TradingRuntime(f.store, { reconcile: async (_q, op) => {
    await getConfirmedTransaction(client, { id: "at1" + op.id }); return { status: "complete", result: {} };
  } } as TradingBackend);
  const recovery = new OperationRecovery(runtime);
  let unrelated: Promise<unknown> | undefined;
  try {
    recovery.tick();
    await until(() => f.store.get<Operation>("operation:9")?.status === "complete");
    assert.equal(f.store.get<Operation>("operation:8")?.status, "complete");
    assert.equal(f.store.get<Operation>("operation:0")?.status, "uncertain");
    assert.ok(peak <= 8, `concurrency cap exceeded: ${peak}`);
    for (let tick = 0; tick < 5; tick++) recovery.tick();
    assert.equal(attempts.get("at10"), 1);
    unrelated = recoveryFetch(wire.url + "/unrelated").then(res => res.json());
    await until(() => blocked.has("unrelated"));
    const start = performance.now();
    await recovery.stop();
    assert.ok(performance.now() - start < 500, "shutdown should abort the lookup rather than await its deadline");
    blocked.get("unrelated")!.end('{"ok":true}');
    assert.deepEqual(await unrelated, { ok: true });
    await f.store.withLock("operation:0", async () => {});
    recovery.tick();
    assert.equal(attempts.get("at10"), 1, "shutdown prevents new attempts");
  } finally { await recovery.stop(); blocked.get("unrelated")?.end('{}'); await unrelated; await wire.close(); f.close(); }
});

test("cancellation interrupts identity-lock acquisition and forbids late store access", { timeout: 10000 }, async () => {
  const f = fixture(), controller = new AbortController();
  let release!: () => void, entered = false;
  const holding = f.store.withLock("identity:" + walletScope(profile), () => new Promise<void>(resolve => { release = resolve; }));
  let late!: () => Promise<void>;
  try {
    const waiting = withRecovery(controller.signal, 60_000, async () => {
      late = () => withIdentityLock(f.store, profile, async () => { entered = true; });
      await late();
    });
    controller.abort();
    await assert.rejects(waiting, { name: "AbortError" });
    assert.equal(entered, false);
    release(); await holding;
    await f.store.withLock("identity:" + walletScope(profile), async () => {});
    let delayed!: Promise<unknown>;
    await withRecovery(new AbortController().signal, 1000, async () => {
      delayed = sleep(20).then(() => f.store.set("late", true));
      void delayed.catch(() => {});
    });
    await assert.rejects(delayed, { name: "AbortError" });
    assert.equal(f.store.get("late"), undefined);
  } finally { release(); await holding; f.close(); }
});

test("real SDK recovery sessions cancel chain reads without sharing or poisoning the writer session", { timeout: 20000 }, async () => {
  const f = fixture();
  const { loadNetwork } = await import("@provablehq/veil-aleo-sdk");
  const sdk = await loadNetwork("testnet"), account = sdk.generateAccount();
  let stall = true, opened = false;
  const wire = await server((_req, res) => { opened = true; if (!stall) res.end("123"); });
  const owner = { ...profile, address: account.address, networkUrl: wire.url };
  const sessions = createSessionFactory(f.store, { TEST_KEY: account.privateKey }, false);
  const controller = new AbortController();
  try {
    const writer = await sessions(owner);
    const read = withRecovery(controller.signal, 60_000, async () => {
      const session = await sessions(owner);
      assert.notEqual(session, writer);
      assert.equal(session.client.proving?.execute, undefined);
      await session.publicClient.getBlockNumber();
    });
    await until(() => opened); controller.abort();
    await assert.rejects(read, { name: "AbortError" });
    stall = false;
    await withRecovery(new AbortController().signal, 1000, async () => {
      const session = await sessions(owner);
      assert.equal(await session.publicClient.getBlockNumber(), 123n);
      assert.equal(await session.client.request({ method: "getLatestHeight" }), 123);
    });
    assert.equal(await sessions(owner), writer);
    assert.equal(await writer.publicClient.getBlockNumber(), 123n);
  } finally { controller.abort(); await wire.close(); f.close(); }
});

test("deadlines free a fully stalled recovery pool for later operations", { timeout: 10000 }, async () => {
  const f = fixture();
  let stalledRequests = 0;
  const wire = await server((req, res) => {
    const id = Number(req.url!.slice(1));
    if (id < 8) stalledRequests++;
    else res.end('{"ok":true}');
  });
  for (let id = 0; id < 10; id++) seed(f.store, String(id));
  const runtime = new TradingRuntime(f.store, { reconcile: async (_quote, op) => {
    await (await recoveryFetch(wire.url + "/" + op.id)).json();
    return { status: "complete", result: {} };
  } } as TradingBackend);
  const recovery = new OperationRecovery(runtime, { timeoutMs: 1000, intervalMs: 60_000 });
  try {
    recovery.tick();
    await until(() => stalledRequests === 8);
    await until(() => f.store.get<Operation>("operation:9")?.status === "complete", 3000);
    assert.equal(stalledRequests, 8, "timed-out IDs must cool down instead of immediately taking every slot again");
    for (let id = 0; id < 8; id++) assert.equal(f.store.get<Operation>("operation:" + id)?.status, "uncertain");
  } finally { await recovery.stop(); await wire.close(); f.close(); }
});

test("an SDK fan-out failure cancels and drains sibling HTTP reads", { timeout: 10000 }, async () => {
  let opened = 0, open = 0;
  let fail!: () => void;
  const wire = await server((req, res) => {
    opened++; open++; res.once("close", () => open--);
    if (req.url === "/failure") fail = () => { res.writeHead(503); res.end("unavailable"); };
    else { res.writeHead(200); res.write('{"partial":'); }
  });
  try {
    const pending = withRecovery(new AbortController().signal, 60_000, () => Promise.all([
      recoveryFetch(wire.url + "/failure").then(response => { if (!response.ok) throw Error("unavailable"); }),
      recoveryFetch(wire.url + "/stalled").then(response => response.json()),
    ]));
    await until(() => opened === 2); fail();
    await assert.rejects(pending, /unavailable/);
    await until(() => open === 0);
  } finally { await wire.close(); }
});

test("bridge recovery uses cancellable public clients without hosted-wallet authentication", { timeout: 20000 }, async () => {
  const { createBridgeSessionFactory } = await import("../src/trading/bridge-session");
  const { loadNetwork } = await import("@provablehq/veil-aleo-sdk");
  const account = (await loadNetwork("mainnet")).generateAccount();
  const f = fixture(), controller = new AbortController();
  let evmRequests = 0, open = 0;
  const wire = await server((req, res) => {
    if (req.method === "GET") { res.end("null"); return; }
    evmRequests++; open++; res.once("close", () => open--);
  });
  const owner: Profile = { ...profile, network: "mainnet", address: account.address, networkUrl: wire.url,
    evm: { provider: "privy", address: "0x" + "11".repeat(20), rpcUrl: wire.url },
    solana: { provider: "dynamic", address: "11111111111111111111111111111111", rpcUrl: wire.url } };
  const sessions = createBridgeSessionFactory(f.store, { TEST_KEY: account.privateKey });
  try {
    const pending = withRecovery(controller.signal, 60_000, async () => {
      const bridge = await sessions(owner);
      // Missing provider credentials would make a writer session fail. Status
      // recovery needs only the configured public chain endpoints.
      return bridge.getRouteStatus({ routeId: "hyperlane:ethereum/eth->aleo/eth" });
    });
    await until(() => evmRequests > 0); controller.abort();
    await assert.rejects(pending, { name: "AbortError" });
    await until(() => open === 0);
    const count = evmRequests; await sleep(50);
    assert.equal(evmRequests, count, "SDK retries cannot send more requests after cancellation");
  } finally { controller.abort(); await wire.close(); f.close(); }
});
