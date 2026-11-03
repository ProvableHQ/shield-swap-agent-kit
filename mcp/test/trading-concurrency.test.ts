import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TradingStore } from "../src/trading/store";
import { TradingRuntime } from "../src/trading/runtime";
import { TradingError, type TradingBackend, type Profile, type SavedQuote, type Operation } from "../src/trading/types";

const profile: Profile = { id: "alice", network: "testnet", address: "aleo1test", key: { type: "env", name: "TEST_KEY" },
  policy: { swaps: true, claims: true, bridges: true, inventory: true, inventoryFeeLimit: "1000", maxSlippageBps: 100,
    swapLimits: { A: "100", B: "100" }, bridgeLimits: { A: "100" } } };
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "concurrent-trades-"));
  const store = new TradingStore(root, "test-password-long-enough", true);
  store.set("profile:alice", profile);
  const entered: SavedQuote[] = [];
  let release!: () => void;
  const gate = new Promise<void>(resolve => release = resolve);
  let reconciles = 0;
  const backend: TradingBackend = {
    concurrentRecords: true,
    quote: async (kind, _profile, input) => ({ plan: kind === "claim" ? { swapIds: input.swapIds } : input,
      summary: { tokenIn: input.from ?? "A", amountIn: input.amount ?? "10", minOut: "1", slippageBps: 50 } }),
    execute: async quote => { entered.push(quote); await gate; return { status: "uncertain", result: {} }; },
    read: async () => ({ snapshot: true }),
    reconcile: async () => { reconciles++; return { status: "uncertain", result: {} }; },
    resume: async () => { throw Error("Unexpected resume"); },
  };
  const runtime = new TradingRuntime(store, backend);
  return { root, store, backend, runtime, entered, release, reconciles: () => reconciles,
    close: async () => { release(); await runtime.drain(); store.close(); rmSync(root, { recursive: true, force: true }); } };
}

test("different quotes run together, reads stay available, and live operations cannot be reconciled", async () => {
  const f = fixture();
  try {
    const a = await f.runtime.quote("swap", "alice", { from: "A", amount: "11" });
    const b = await f.runtime.quote("swap", "alice", { from: "B", amount: "23" });
    const first = await f.runtime.execute(String(a.quoteId), "a");
    const second = await f.runtime.execute(String(b.quoteId), "b");
    assert.equal(f.entered.length, 2);
    assert.notEqual(first.operationId, second.operationId);
    assert.deepEqual(f.entered.map(q => q.summary.amountIn), ["11", "23"]);
    assert.deepEqual(await f.runtime.read("get_record_inventory", "alice", {}), { snapshot: true });
    assert.equal((await f.runtime.status(String(first.operationId))).status, "running");
    assert.equal(f.reconciles(), 0);
    assert.equal((await f.runtime.execute(String(a.quoteId), "a")).operationId, first.operationId);
    f.release(); await f.runtime.drain();
    const c = await f.runtime.quote("swap", "alice", { from: "A", amount: "33" });
    await f.runtime.execute(String(c.quoteId), "c");
    await f.runtime.drain();
    assert.equal(f.entered.length, 3, "managed uncertainty quarantines its own resources");
  } finally { await f.close(); }
});

test("shared output claims conflict, unrelated claims do not, and bridges retain exclusion", async () => {
  const f = fixture();
  try {
    const a = await f.runtime.quote("claim", "alice", { swapIds: ["one"] });
    const b = await f.runtime.quote("claim", "alice", { swapIds: ["one", "two"] });
    const c = await f.runtime.quote("claim", "alice", { swapIds: ["three"] });
    await f.runtime.execute(String(a.quoteId), "a");
    await assert.rejects(f.runtime.execute(String(b.quoteId), "b"), /claim|pending/i);
    await f.runtime.execute(String(c.quoteId), "c");
    const bridge = await f.runtime.quote("bridge", "alice", {});
    await assert.rejects(f.runtime.execute(String(bridge.quoteId), "bridge"), /pending|active/i);
    assert.equal(f.entered.length, 2);
  } finally { await f.close(); }
});

test("legacy uncertainty still blocks managed trades and input caps remain per operation", async () => {
  const f = fixture();
  try {
    f.backend.concurrentRecords = false;
    const a = await f.runtime.quote("swap", "alice", {});
    await f.runtime.execute(String(a.quoteId), "a");
    f.release(); await f.runtime.drain();
    f.backend.concurrentRecords = true;
    const b = await f.runtime.quote("swap", "alice", {});
    await assert.rejects(f.runtime.execute(String(b.quoteId), "b"), /pending|active/i);
    const big = await f.runtime.quote("swap", "alice", { amount: "101" });
    await assert.rejects(f.runtime.execute(String(big.quoteId), "big"), /limit/i);
  } finally { await f.close(); }
});

import { fork } from "node:child_process";
import { once } from "node:events";
for (const order of ["legacy-first", "managed-first"]) test(`legacy claim resume and managed registration exclude each other: ${order}`, { timeout: 15000 }, async () => {
  const f = fixture();
  let child: ReturnType<typeof fork> | undefined;
  let exited: Promise<unknown[]> | undefined;
  let legacySubmissions = 0;
  const wait = (name: string) => {
    const deadline = Date.now() + 10_000;
    while (!existsSync(join(f.root, name))) {
      if (Date.now() >= deadline) throw Error("Timed out waiting for " + name);
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5);
    }
  };
  try {
    const legacy = await f.runtime.quote("claim", "alice", { swapIds: ["one"] });
    const managed = await f.runtime.quote("claim", "alice", { swapIds: ["one"] });
    const checkpoint = { claims: [{ swapId: "one", status: "pending" }] };
    f.store.set("operation:legacy", { id: "legacy", kind: "claim", profileId: "alice", scope: f.runtime.scope(profile),
      quoteId: legacy.quoteId, requestKey: "legacy", status: "pending", createdAt: 1, updatedAt: 1,
      result: { nextAction: "resume" }, checkpoint }); // Pre-upgrade state has no managedRecords flag.
    f.backend.reconcile = async () => ({ status: "pending", result: { nextAction: "resume" } });
    f.backend.resume = async () => { legacySubmissions++; return { status: "uncertain", result: { transactionId: "legacy-claim" } }; };
    const set = f.store.set.bind(f.store);
    if (order === "legacy-first") f.store.set = (id, value) => {
      if (id === "operation:legacy" && (value as Operation).status === "running") {
        writeFileSync(join(f.root, "legacy-starting"), "");
        wait("competitor-attempted");
      }
      set(id, value);
    };
    child = fork(new URL("./fixtures/claim-race-worker.ts", import.meta.url), [f.root, String(managed.quoteId), order],
      { execArgv: ["--import", "tsx"], stdio: ["ignore", "ignore", "pipe", "ipc"] });
    let stderr = ""; child.stderr!.on("data", chunk => stderr += chunk);
    exited = once(child, "exit");
    wait(order === "legacy-first" ? "competitor-ready" : "competitor-result");
    if (order === "managed-first") {
      await assert.rejects(f.runtime.resume("legacy"), (error: unknown) => error instanceof TradingError && error.code === "operation_pending");
    } else await f.runtime.resume("legacy");
    await f.runtime.drain();
    writeFileSync(join(f.root, "legacy-finished"), "");
    assert.deepEqual(await exited, [0, null], stderr);
    const managedSubmitted = existsSync(join(f.root, "managed-submitted"));
    assert.equal(legacySubmissions + Number(managedSubmitted), 1, "only one claimant may reach submission");
    assert.equal(readFileSync(join(f.root, "competitor-result"), "utf8"), order === "legacy-first" ? "operation_pending" : "submitted");
    assert.deepEqual(f.store.get<Operation>("operation:legacy")!.checkpoint, checkpoint);
    assert.equal(f.store.get<Operation>("operation:legacy")!.managedRecords, undefined, "legacy state remains readable without migration");
  } finally {
    writeFileSync(join(f.root, "legacy-finished"), "");
    if (child?.exitCode === null) child.kill("SIGKILL");
    await exited; await f.close();
  }
});

test("two OS processes and profile aliases prove different trades concurrently without losing identities", { timeout: 15000 }, async () => {
  const f = fixture();
  const children: ReturnType<typeof fork>[] = [];
  try {
    f.store.set("profile:a", { ...profile, id: "a" });
    f.store.set("profile:b", { ...profile, id: "b" });
    const run = (label: string) => {
      const child = fork(new URL("./fixtures/concurrent-worker.ts", import.meta.url), [f.root, label], { execArgv: ["--import", "tsx"], stdio: ["ignore", "ignore", "pipe", "ipc"] });
      children.push(child);
      return new Promise<Record<string, unknown>>((resolve, reject) => {
        let stderr = ""; child.stderr!.on("data", chunk => stderr += chunk);
        child.once("message", message => resolve(message as Record<string, unknown>));
        child.once("error", reject);
        child.once("exit", code => { if (code) reject(Error(stderr)); });
      });
    };
    const messages = await Promise.all([run("a"), run("b")]);
    assert.deepEqual(messages.map(message => message.phase), ["proving", "proving"]);
    assert.equal(new Set(messages.map(message => message.counter)).size, 2);
    assert.equal(new Set(messages.map(message => message.record)).size, 2);
    assert.equal(new Set(messages.map(message => message.owner)).size, 2);
    for (const message of messages) assert.equal((await f.runtime.status(String(message.owner))).status, "running");
    const exited = children.map(child => once(child, "exit"));
    children.forEach(child => child.send("finish"));
    assert.deepEqual(await Promise.all(exited), [[0, null], [0, null]]);
    const identities = f.store.get<{ status: string; swapId: string }[]>("test-identities")!;
    assert.deepEqual(identities.map(row => row.swapId).sort(), ["a", "b"]);
    assert.ok(identities.every(row => row.status === "swapped"));
  } finally { children.forEach(child => { if (child.exitCode === null) child.kill("SIGKILL"); }); await f.close(); }
});
