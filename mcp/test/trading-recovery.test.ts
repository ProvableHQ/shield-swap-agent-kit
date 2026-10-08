import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { reconcileSwapHistory, type BlindedIdentityRecord } from "@provablehq/shield-swap-sdk";
import type { Client } from "@provablehq/veil-core";
import { TradingStore } from "../src/trading/store";
import { VeilBackend } from "../src/trading/veil";
import type { AleoSession } from "../src/trading/session";
import type { Operation, Profile, SavedQuote } from "../src/trading/types";

const profile: Profile = { id: "alice", network: "testnet", address: "aleo1test", key: { type: "env", name: "TEST_KEY" },
  policy: { swaps: true, claims: true, bridges: false, maxSlippageBps: 100, swapLimits: {}, bridgeLimits: {} } };
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "shield-recovery-"));
  const store = new TradingStore(root, "test-password-long-enough", true);
  store.set("test:identities", [{ counter: 0, blindingFactor: "1scalar", blindedAddress: "aleo1blind", status: "reserved" }]);
  const identities = {
    load: async () => store.get<BlindedIdentityRecord[]>("test:identities")!,
    save: async (records: BlindedIdentityRecord[]) => { store.set("test:identities", records); },
  };
  let accepted = false, historyRequests = 0, depth = 0;
  const rpc = { request: async ({ method, params }: { method: string; params: Record<string, unknown> }) => {
    if (method === "getProgramCallsPaginated") {
      historyRequests++;
      const page = Number(params.cursorBlockNumber ?? 0);
      if (page < depth) return { calls: [{ status: "accepted", function_id: "unrelated" }], next_cursor: { block_number: page + 1, transition_id: String(page + 1) } };
      return { calls: accepted ? [{ status: "accepted", function_id: "claim_swap_output", transaction_id: "at1claim", block_number: 5 }] : [], next_cursor: null };
    }
    if (method === "getTransaction") return { execution: { transitions: [{
      program: "shield_swap.aleo", function: "claim_swap_output",
      inputs: ["0scalar", "aleo1blind", "4field", "1field", "2field", "99u128", "1u128"].map(value => ({ value })),
    }] } };
    throw new Error("unexpected RPC");
  } } as unknown as Client;
  const session = { identities, client: {
    reconcileSwapHistory: (params: { maxPages?: number }) => reconcileSwapHistory(rpc, { ...params, store: identities }),
    getUnclaimedSwaps: async () => ({ swaps: [], unresolvable: [] }),
  } } as unknown as AleoSession;
  const backend = new VeilBackend(store, async () => session);
  const quote: SavedQuote = { id: "q", kind: "swap", profile, scope: "testnet:aleo1test:shield_swap.aleo", createdAt: 0, expiresAt: 0, plan: {}, summary: {} };
  const operation: Operation = { id: "o", kind: "swap", profileId: "alice", scope: quote.scope, quoteId: "q", requestKey: "r",
    status: "uncertain", result: {}, checkpoint: { phase: "reserved", counter: 0 }, createdAt: 0, updatedAt: 0 };
  return { backend, quote, operation, identities, accept: () => { accepted = true; }, depth: (value: number) => { depth = value; },
    requests: () => historyRequests, close: () => { store.close(); rmSync(root, { recursive: true, force: true }); } };
}
test("recovery discovers a later accepted claim after an earlier empty history scan", async () => {
  const f = fixture();
  try {
    assert.equal((await f.backend.reconcile(f.quote, f.operation)).status, "uncertain");
    f.accept();
    const recovered = await f.backend.reconcile(f.quote, f.operation);
    assert.equal(recovered.status, "complete");
    assert.equal(recovered.result.claimTransactionId, "at1claim");
    assert.equal(f.requests(), 2);
  } finally { f.close(); }
});
test("repeated recovery expands incomplete history coverage beyond ten pages", async () => {
  const f = fixture();
  try {
    f.depth(11); f.accept();
    const first = await f.backend.reconcile(f.quote, f.operation);
    assert.equal(first.status, "uncertain");
    assert.equal((first.result.historyRecovery as { complete: boolean }).complete, false);
    assert.equal((await f.backend.reconcile(f.quote, f.operation)).status, "complete");
  } finally { f.close(); }
});
