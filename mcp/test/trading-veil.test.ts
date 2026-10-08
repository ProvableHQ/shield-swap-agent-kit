import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TradingStore } from "../src/trading/store";
import { TradingRuntime } from "../src/trading/runtime";
import { VeilBackend } from "../src/trading/veil";
import { swapContext, type AleoSession } from "../src/trading/session";
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
    store.set("profile:" + profile.id, profile);
    const runtime = new TradingRuntime(store, backend);
    const result = await runtime.read("swap_history", profile.id, { limit: 25, offset: 0 });
    assert.doesNotMatch(JSON.stringify(result), /PRIVATE-CLAIM-SECRET|blindingFactor|handle/);
    assert.equal((result.swaps as { swapId: string }[])[0].swapId, "4field");
  } finally { store.close(); rmSync(root, { recursive: true, force: true }); }
});

test("a reserved identity followed by quote expiry before proving is a definitive failure", async () => {
  const root = mkdtempSync(join(tmpdir(), "shield-veil-"));
  const store = new TradingStore(root, "test-password-long-enough", true);
  const session = { submissionTracked: true, client: {
    swap: async () => {
      const state = swapContext.getStore()!;
      state.checkpoint = { phase: "reserved", submissionBoundary: 1, counter: 2 };
      state.execution.checkpoint(state.checkpoint);
      throw new Error("Quote expired; request a new quote PRIVATE-DETAIL");
    },
  }, identities: { load: async () => [{ counter: 1, status: "reserved" }], save: async () => {} } } as unknown as AleoSession;
  try {
    const backend = new VeilBackend(store, async () => session);
    const quote: SavedQuote = { id: "q", kind: "swap", profile, scope: "", createdAt: 0, expiresAt: 1, plan: offer, summary: {} };
    const result = await backend.execute(quote, { operationId: "o", checkpoint: () => {} });
    assert.equal(result.status, "failed");
    assert.equal((result.result.error as { code: string }).code, "not_submitted");
    assert.doesNotMatch(JSON.stringify(result), /PRIVATE-DETAIL/);
  } finally { store.close(); rmSync(root, { recursive: true, force: true }); }
});

test("balances include underlying public bridge tokens and native credits without double counting", async () => {
  const root = mkdtempSync(join(tmpdir(), "shield-balances-"));
  const store = new TradingStore(root, "test-password-long-enough", true);
  const metadata = [
    { id: "1field", symbol: "USDCx", decimals: 6, ammTokenProgram: "wrapped_usdcx.aleo", underlyingProgram: "usdcx_stablecoin.aleo" },
    { id: "2field", symbol: "ETH", decimals: 18, ammTokenProgram: "arc20_eth.aleo", underlyingProgram: "arc20_eth.aleo" },
    { id: "3field", symbol: "ALEO", decimals: 6, ammTokenProgram: "wrapped_credits.aleo", underlyingProgram: "credits.aleo" },
    { id: "4field", symbol: "USAD", decimals: 6, ammTokenProgram: "wrapped_usad.aleo", underlyingProgram: "usad_stablecoin.aleo" },
  ];
  const requests: string[] = [];
  let nativeBalance: string | null = "100u64";
  let nativeUnavailable = false;
  const session = { client: {
    listTokens: async () => metadata,
    tokenData: async (id: string) => metadata.find(token => token.id === id || token.symbol === id),
    getBalances: async () => ({
      "1field": { symbol: "USDCx", decimals: 6, public: 5n, private: 10n, total: 15n },
      "2field": { symbol: "ETH", decimals: 18, public: 7n, private: 0n, total: 7n },
      "3field": { symbol: "ALEO", decimals: 6, public: 0n, private: 12n, total: 12n },
    }),
  }, publicClient: { request: async ({ method, params }: { method: string; params: { programId?: string } }) => {
    requests.push(method === "getBalance" ? "credits.aleo" : params.programId!);
    if (method === "getBalance" || params.programId === "credits.aleo") {
      if (nativeUnavailable) throw new Error("native balance RPC unavailable");
      return nativeBalance;
    }
    if (params.programId === "usdcx_stablecoin.aleo") return "20u128";
    if (params.programId === "usad_stablecoin.aleo") return "4u128";
    throw new Error("Unexpected or duplicate program read");
  } } } as unknown as AleoSession;
  try {
    const backend = new VeilBackend(store, async () => session);
    const result = await backend.read("get_balances", profile, {});
    const balances = result.balances as { tokenId: string; public: string; private: string; total: string; publicByProgram: Record<string, string> }[];
    assert.deepEqual(balances.map(row => [row.tokenId, row.public, row.private, row.total]), [
      ["1field", "25", "10", "35"], ["2field", "7", "0", "7"],
      ["3field", "100", "12", "112"], ["4field", "4", "0", "4"],
    ]);
    assert.deepEqual(balances[0].publicByProgram, { "wrapped_usdcx.aleo": "5", "usdcx_stablecoin.aleo": "20" });
    assert.deepEqual(requests.sort(), ["credits.aleo", "usad_stablecoin.aleo", "usdcx_stablecoin.aleo"]);
    requests.length = 0;
    const filtered = await backend.read("get_balances", profile, { tokens: ["1field"] });
    assert.equal((filtered.balances as unknown[]).length, 1);
    assert.deepEqual(requests, ["usdcx_stablecoin.aleo"]);
    const aliases = await backend.read("get_balances", profile, { tokens: ["USDCx", "1field"] });
    assert.equal((aliases.balances as unknown[]).length, 1);
    nativeBalance = null;
    const emptyNative = await backend.read("get_balances", profile, { tokens: ["3field"] });
    assert.equal((emptyNative.balances as { public: string; private: string }[])[0].public, "0");
    assert.equal((emptyNative.balances as { public: string; private: string }[])[0].private, "12");
    nativeUnavailable = true;
    await assert.rejects(backend.read("get_balances", profile, { tokens: ["3field"] }), /RPC unavailable/);
  } finally { store.close(); rmSync(root, { recursive: true, force: true }); }
});
