import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TradingStore } from "../src/trading/store";
import { createRecordInventoryStore, type OwnedRecordSpend } from "../src/trading/inventory";
import { operationContext } from "../src/trading/ownership";
import { reconcileOwnedRecords } from "../src/trading/managed-session";
import type { AleoSession } from "../src/trading/session";
import type { Profile } from "../src/trading/types";
const profile = { network: "testnet", address: "aleo1test" } as Profile;
const scope = JSON.stringify(["aleo:testnet", "aleo1test"]);
test("recovery skips a live writer, cancels an abandoned unproved reservation, and keeps missing proofs", async () => {
  const directory = mkdtempSync(join(tmpdir(), "owners-"));
  const store = new TradingStore(directory, "test-password-long-enough", true);
  const journal = createRecordInventoryStore(store);
  const acquire = (operationId: string, records: string[]) => operationContext.run({ operationId }, () => journal.acquire({ scope, records,
    program: "token.aleo", function: "transfer", status: "reserved", accountType: "local", createdAt: 1 }));
  try {
    const live = await acquire("live", ["live"]);
    const abandoned = await acquire("abandoned", ["abandoned"]);
    const missing = await acquire("missing", ["missing"]);
    await journal.update(scope, missing!.id, { status: "prepared", transactionId: "at1missing", transaction: { id: "at1missing" } as never });
    assert.equal((live as OwnedRecordSpend).operationId, "live");
    const visited: string[] = [];
    const session = { client: { recordManagement: { store: journal }, reconcileRecordInventory: async () => {
      const entries = await journal.list(scope); visited.push(...entries.map(entry => entry.id)); return entries;
    } } } as unknown as AleoSession;
    await store.withLock("operation:live", () => reconcileOwnedRecords(store, profile, session));
    const entries = await journal.list(scope);
    assert.equal(entries.find(entry => entry.id === live!.id)?.status, "reserved");
    assert.equal(entries.find(entry => entry.id === abandoned!.id)?.status, "cancelled");
    assert.equal(entries.find(entry => entry.id === missing!.id)?.status, "prepared");
    assert.ok(!visited.includes(live!.id));
    assert.ok((entries.find(entry => entry.id === missing!.id))?.transaction);
  } finally { store.close(); rmSync(directory, { force: true, recursive: true }); }
});

import { VeilBackend } from "../src/trading/veil";
import { TradingRuntime } from "../src/trading/runtime";
import type { Operation, SavedQuote } from "../src/trading/types";
test("a crashed swap before any proved transaction resolves without freeing an unresolved proof", async () => {
  const directory = mkdtempSync(join(tmpdir(), "crashed-swap-"));
  const store = new TradingStore(directory, "test-password-long-enough", true);
  const journal = createRecordInventoryStore(store);
  try {
    const p = { ...profile, id: "alice", key: { type: "env", name: "KEY" }, policy: { swaps: true, claims: true, bridges: false, maxSlippageBps: 100, swapLimits: { A: "100" }, bridgeLimits: {} } } as Profile;
    store.set("profile:alice", p);
    const quote = { id: "quote", kind: "swap", profile: p, scope: "test", plan: {}, summary: {}, createdAt: 1, expiresAt: 2 } as SavedQuote;
    const op = { id: "crashed", quoteId: quote.id, kind: "swap", profileId: p.id, scope: "test", managedRecords: true, status: "running", requestKey: "key", result: {}, createdAt: 1, updatedAt: 1,
      checkpoint: { phase: "submitting", submissionBoundary: 1, counter: 0 } } as Operation;
    store.set("quote:quote", quote); store.set("operation:crashed", op);
    const reservation = await operationContext.run({ operationId: op.id }, () => journal.acquire({ scope, records: ["input"], program: "dex.aleo", function: "swap", status: "reserved", createdAt: 1, accountType: "local" }));
    const session = { client: { recordManagement: { store: journal }, reconcileRecordInventory: () => journal.list(scope),
      reconcileSwapHistory: async () => ({ complete: true, pagesScanned: 1 }), getUnclaimedSwaps: async () => ({ swaps: [] }) }, identities: { load: async () => [], save: async () => {} } } as unknown as AleoSession;
    session.reconcileRecords = params => reconcileOwnedRecords(store, p, session, params);
    const runtime = new TradingRuntime(store, new VeilBackend(store, async () => session));
    const result = await runtime.status(op.id);
    assert.equal(result.status, "failed");
    assert.equal((result.error as { code: string }).code, "not_submitted");
    assert.equal((await journal.list(scope)).find(entry => entry.id === reservation!.id)?.status, "cancelled");
    store.set("operation:crashed", op);
    await journal.update(scope, reservation!.id, { status: "prepared", transactionId: "at1missing", transaction: { id: "at1missing" } as never });
    assert.equal((await runtime.status(op.id)).status, "uncertain", "a prepared proof stays quarantined without chain evidence");
    assert.equal((await journal.list(scope))[0].status, "prepared");
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("inventory recovery includes an owned proof saved before its operation checkpoint", async () => {
  const directory = mkdtempSync(join(tmpdir(), "inventory-checkpoint-gap-"));
  const store = new TradingStore(directory, "test-password-long-enough", true);
  const journal = createRecordInventoryStore(store);
  try {
    const p = { ...profile, id: "alice" } as Profile;
    const quote = { id: "quote", kind: "inventory", profile: p, scope: "test", plan: { steps: [{}] }, summary: {}, createdAt: 1, expiresAt: 2 } as SavedQuote;
    const op = { id: "interrupted", quoteId: quote.id, kind: "inventory", profileId: p.id, scope: "test", managedRecords: true, status: "running", requestKey: "key", result: {}, createdAt: 1, updatedAt: 1,
      checkpoint: { phase: "rebalancing", transactionIds: [] } } as Operation;
    store.set("quote:quote", quote); store.set("operation:interrupted", op);
    const reservation = await operationContext.run({ operationId: op.id }, () => journal.acquire({ scope, records: ["input"], program: "token.aleo", function: "split", status: "prepared", transactionId: "at1proof", transaction: { id: "at1proof" } as never, createdAt: 1, accountType: "local" }));
    const session = { client: { recordManagement: { store: journal }, reconcileRecordInventory: () => journal.list(scope) } } as unknown as AleoSession;
    session.reconcileRecords = params => reconcileOwnedRecords(store, p, session, params);
    const runtime = new TradingRuntime(store, new VeilBackend(store, async () => session));
    const result = await runtime.status(op.id);
    assert.equal(result.status, "uncertain");
    assert.deepEqual(result.transactionIds, ["at1proof"]);
    await journal.update(scope, reservation!.id, { status: "confirmed", transaction: undefined });
    const settled = await runtime.status(op.id);
    assert.equal(settled.status, "failed");
    assert.equal((settled.error as { code: string }).code, "maintenance_incomplete");
    assert.equal((settled.transactions as Record<string, string>).at1proof, "confirmed");
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("claim recovery releases an abandoned unproved attempt and learns a saved proof ID", async () => {
  const directory = mkdtempSync(join(tmpdir(), "claim-checkpoint-gap-"));
  const store = new TradingStore(directory, "test-password-long-enough", true);
  const journal = createRecordInventoryStore(store);
  try {
    const p = { ...profile, id: "alice" } as Profile;
    const quote = { id: "quote", kind: "claim", profile: p, scope: "test", plan: { swapIds: ["one", "two"] }, summary: {}, createdAt: 1, expiresAt: 2 } as SavedQuote;
    const op = { id: "claim", quoteId: quote.id, kind: "claim", profileId: p.id, scope: "test", managedRecords: true, status: "running", requestKey: "key", result: {}, createdAt: 1, updatedAt: 1,
      checkpoint: { claims: [{ swapId: "one", status: "claimed", transactionId: "at1earlier" }, { swapId: "two", status: "submitting" }] } } as Operation;
    store.set("quote:quote", quote); store.set("operation:claim", op);
    await operationContext.run({ operationId: op.id }, () => journal.acquire({ scope, records: [], program: "dex.aleo", function: "claim", status: "confirmed", transactionId: "at1earlier", createdAt: 1, accountType: "local" }));
    const latest = await operationContext.run({ operationId: op.id }, () => journal.acquire({ scope, records: [], program: "dex.aleo", function: "claim", status: "reserved", createdAt: 2, accountType: "local" }));
    const session = { client: { recordManagement: { store: journal }, reconcileRecordInventory: () => journal.list(scope), reconcileSwapHistory: async () => ({ complete: true, pagesScanned: 1 }) },
      identities: { load: async () => [], save: async () => {} }, publicClient: { request: async () => { throw Object.assign(Error("missing"), { status: 404 }); } } } as unknown as AleoSession;
    session.reconcileRecords = params => reconcileOwnedRecords(store, p, session, params);
    const runtime = new TradingRuntime(store, new VeilBackend(store, async () => session));
    const result = await runtime.status(op.id);
    assert.equal(result.status, "pending");
    assert.equal((result.claims as { lastFailure?: { code: string } }[])[1].lastFailure?.code, "not_submitted");
    store.set("operation:claim", op);
    await journal.update(scope, latest!.id, { status: "prepared", transactionId: "at1proof", transaction: { id: "at1proof" } as never });
    const unresolved = await runtime.status(op.id);
    assert.equal(unresolved.status, "uncertain");
    assert.equal((unresolved.claims as { transactionId?: string }[])[1].transactionId, "at1proof");
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});
