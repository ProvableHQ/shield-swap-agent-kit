import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TradingStore } from "../src/trading/store";
import { VeilBackend } from "../src/trading/veil";
import type { AleoSession } from "../src/trading/session";
import type { Profile, SavedQuote } from "../src/trading/types";

const profile: Profile = { id: "alice", network: "testnet", address: "aleo1test", key: { type: "env", name: "TEST_KEY" },
  policy: { swaps: true, claims: true, bridges: false, maxSlippageBps: 100, swapLimits: {}, bridgeLimits: {} } };
const offer = { version: 1 as const, network: "testnet", program: "shield_swap.aleo",
  from: { id: "1field", symbol: "USDCx", decimals: 6 }, to: { id: "2field", symbol: "ETH", decimals: 18 },
  amountIn: 1000000n, expectedOut: 900000000000000n, minOut: 895500000000000n,
  slippageBps: 50, hops: [{ poolKey: "3field", tokenInId: "1field", tokenOutId: "2field" }],
  quotedAt: Date.now(), expiresAt: Date.now() + 60_000, protocolRevision: 1 };

test("Veil adapter retains the exact SDK quote through execution and hides claim secrets", async () => {
  const root = mkdtempSync(join(tmpdir(), "shield-veil-"));
  const store = new TradingStore(root, "test-password-long-enough", true);
  let submitted: unknown;
  const session = { client: {
    quote: async (input: unknown) => { assert.deepEqual(input, { from: "USDCx", to: "ETH", amountIn: "1", slippageBps: 50 }); return offer; },
    swap: async (input: unknown) => { submitted = input; return { swapId: "4field", transactionId: "at1test", blindingFactor: "PRIVATE-CLAIM-SECRET" }; },
  }, identities: { load: async () => [], save: async () => {} } } as unknown as AleoSession;
  const backend = new VeilBackend(store, async () => session);
  try {
    const priced = await backend.quote("swap", profile, { from: "USDCx", to: "ETH", amount: "1", slippageBps: 50 });
    const quote: SavedQuote = { id: "q1", kind: "swap", profile, scope: "testnet:aleo1test:shield_swap.aleo", createdAt: Date.now(), expiresAt: offer.expiresAt, ...priced };
    const result = await backend.execute(quote, { operationId: "o1", checkpoint: () => {} });
    assert.deepEqual(submitted, { quote: offer });
    assert.equal(result.status, "submitted");
    assert.equal(result.result.transactionId, "at1test");
    assert.doesNotMatch(JSON.stringify(result.result), /PRIVATE-CLAIM-SECRET/);
  } finally { store.close(); rmSync(root, { recursive: true, force: true }); }
});

test("history projects public economics without returning SDK handles or blinding factors", async () => {
  const root = mkdtempSync(join(tmpdir(), "shield-veil-"));
  const store = new TradingStore(root, "test-password-long-enough", true);
  const session = { client: { getUnclaimedSwaps: async () => ({
    swaps: [{ swapId: "4field", counter: 0, claimable: true, handle: { blindingFactor: "PRIVATE-CLAIM-SECRET" }, output: { token_in: "1field", token_out: "2field", amount_out: 99n, amount_remaining: 1n } }], unresolvable: [],
  }) }, identities: { load: async () => [{ counter: 0, blindingFactor: "PRIVATE-CLAIM-SECRET", status: "swapped", swapId: "4field", handle: { transactionId: "at1test", amountIn: "100" } }], save: async () => {} } } as unknown as AleoSession;
  const backend = new VeilBackend(store, async () => session);
  try {
    const result = await backend.read("swap_history", profile, { limit: 25, offset: 0 });
    assert.doesNotMatch(JSON.stringify(result), /PRIVATE-CLAIM-SECRET|blindingFactor|handle/);
    assert.equal((result.swaps as { swapId: string }[])[0].swapId, "4field");
  } finally { store.close(); rmSync(root, { recursive: true, force: true }); }
});
