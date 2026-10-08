import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { TradingStore } from "../src/trading/store";
import { TradingRuntime } from "../src/trading/runtime";
import { createTradingServer } from "../src/trading/server";
import { onboardingStatus, setupSchema, type SetupReport } from "../src/trading/onboarding";
import type { Profile, Summary, TradingBackend } from "../src/trading/types";

const profile: Profile = { id: "trading", network: "testnet", address: "aleo1test",
  key: { type: "env", name: "NEVER_READ_THIS_KEY" },
  policy: { swaps: false, claims: false, bridges: false, maxSlippageBps: 100, swapLimits: {}, bridgeLimits: {} } };
function fixture(read?: TradingBackend["read"]) {
  const directory = mkdtempSync(join(tmpdir(), "shield-onboarding-"));
  const store = new TradingStore(directory, "test-password-long-enough", true);
  store.set("profile:trading", profile);
  store.set("settings", { defaultProfile: "trading" });
  const calls: string[] = [];
  const unexpected = async () => { throw new Error("Onboarding must not transact"); };
  const backend: TradingBackend = { quote: unexpected, execute: unexpected, reconcile: unexpected, resume: unexpected,
    read: async (action, selected, args) => { calls.push(action); return read ? read(action, selected, args) : { address: selected.address, network: selected.network, signerReady: true }; } };
  return { store, calls, runtime: new TradingRuntime(store, backend), close: () => { store.close(); rmSync(directory, { recursive: true, force: true }); } };
}
const parse = (args: Summary = {}) => setupSchema.parse(args);

test("fresh and locked state remain distinct without provisioning or prompting", async () => {
  const fresh = await onboardingStatus(undefined, parse());
  const locked = await onboardingStatus(undefined, parse({ mode: "unattended", checkBalances: true }), true);
  assert.equal(fresh.checks.account.status, "missing");
  assert.equal(fresh.nextAction, "configure_account");
  assert.equal(locked.checks.account.status, "locked");
  assert.equal(locked.nextAction, "unlock_account");
  assert.equal(locked.checks.funding.status, "not_checked");
  assert.deepEqual(locked.completedCheckpoints, ["tools_available"]);
});

test("local inspection preserves the default profile and makes no SDK calls", async () => {
  const f = fixture();
  try {
    const report = await onboardingStatus(f.runtime, parse({ journey: "connect_trading_tools" }));
    assert.equal(report.profileId, "trading");
    assert.equal(report.checks.account.status, "configured");
    assert.equal(report.checks.funding.status, "not_checked");
    assert.equal(report.nextAction, "verify_account_access");
    assert.deepEqual(f.calls, []);
    assert.deepEqual(f.store.get("profile:trading"), profile);
    assert.equal(f.store.list("operation:").length, 0);
    const missing = await onboardingStatus(f.runtime, parse({ profileId: "missing", checkBalances: true }));
    assert.equal(missing.checks.account.status, "missing");
    assert.equal(missing.profileId, "missing");
    assert.deepEqual(f.calls, []);
  } finally { f.close(); }
});

test("a stale default profile never silently selects or replaces another wallet", async () => {
  const f = fixture();
  try {
    f.store.set("settings", { defaultProfile: "removed" });
    const report = await onboardingStatus(f.runtime, parse({ checkBalances: true }));
    assert.equal(report.checks.account.status, "missing");
    assert.deepEqual(report.checks.account.availableProfiles, [{ profileId: "trading", address: "aleo1test" }]);
    assert.deepEqual(f.calls, []);
  } finally { f.close(); }
});

for (const journey of ["trade_now", "connect_trading_tools", "build_strategy"] as const) {
  test(`${journey} continues to funding after account access is verified`, async () => {
    const f = fixture();
    try {
      const report = await onboardingStatus(f.runtime, parse({ journey, checkAccess: true }));
      assert.equal(report.checks.account.status, "usable");
      assert.equal(report.nextAction, "check_funding");
      assert.equal(report.checks.execution.status, "disabled");
      assert.deepEqual(f.calls, ["get_wallet_status"]);
    } finally { f.close(); }
  });
}

test("market exploration can continue without funding", async () => {
  const f = fixture();
  try {
    const report = await onboardingStatus(f.runtime, parse({ journey: "explore_markets", checkAccess: true }));
    assert.equal(report.nextAction, "continue_journey");
    assert.equal(report.checks.funding.status, "not_checked");
  } finally { f.close(); }
});

for (const scenario of [
  { name: "public-only holdings", private: "0", public: "999999", expected: "insufficient" },
  { name: "insufficient private holdings", private: "99", public: "999999", expected: "insufficient" },
  { name: "sufficient private holdings", private: "100", public: "0", expected: "available" },
  { name: "exact integers beyond JS precision", private: "9007199254740992", public: "0", required: "9007199254740993", expected: "insufficient" },
]) {
  test(`funding checks ${scenario.name} for the selected token without moving funds`, async () => {
    const f = fixture(async (action, p, args) => {
      if (action === "get_wallet_status") return { signerReady: true, address: p.address, network: p.network };
      assert.deepEqual(args.tokens, ["1field"]);
      return { address: p.address, network: p.network, balances: [{ tokenId: "1field", private: scenario.private, public: scenario.public }] };
    });
    try {
      const report = await onboardingStatus(f.runtime, parse({ journey: "connect_trading_tools", funding: { tokenId: "1field", amount: scenario.required ?? "100" } }));
      assert.equal(report.checks.funding.status, scenario.expected);
      assert.equal(report.nextAction, scenario.expected === "available" ? "continue_journey" : "fund_account");
      assert.equal(report.checks.funding.spendability, "not_verified");
      assert.equal(report.checks.funding.fees, "not_checked");
      assert.equal(report.checks.execution.status, "disabled");
      assert.equal(f.store.list("operation:").length, 0);
      assert.equal(f.store.list("quote:").length, 0);
      assert.deepEqual(f.store.get("profile:trading"), profile);
    } finally { f.close(); }
  });
}

test("a balance read without a target reports observed funds, not swap readiness", async () => {
  const f = fixture(async (action, p) => action === "get_wallet_status" ? { signerReady: true, address: p.address, network: p.network }
    : { address: p.address, network: p.network, balances: [{ tokenId: "1field", private: "1", public: "0" }] });
  try {
    const report = await onboardingStatus(f.runtime, parse({ checkBalances: true }));
    assert.equal(report.checks.funding.status, "available");
    assert.equal(report.checks.funding.requirement, undefined);
    assert.equal(report.checks.funding.spendability, "not_verified");
    assert.ok(report.completedCheckpoints.includes("private_balance_observed"));
    assert.equal("ready" in report, false);
  } finally { f.close(); }
});

for (const failure of ["account", "scanner", "malformed", "missing_token", "wrong_account"] as const) {
  test(`${failure} failures stay visible and never masquerade as an unfunded wallet`, async () => {
    const f = fixture(async (action, p) => {
      if (failure === "account" || (failure === "scanner" && action === "get_balances")) throw new Error("DO-NOT-RETURN-SECRET");
      if (action === "get_wallet_status") return { signerReady: true, address: p.address, network: p.network };
      return { address: failure === "wrong_account" ? "other-account" : p.address, network: p.network,
        balances: failure === "malformed" ? [{ tokenId: "1field", private: null, public: "0" }] : [] };
    });
    try {
      const report = await onboardingStatus(f.runtime, parse({ funding: { tokenId: "1field", amount: "1" } }));
      assert.equal(report.checks[ failure === "account" ? "account" : "funding" ].status, "unavailable");
      assert.equal(report.nextAction, failure === "account" ? "restore_account_access" : "restore_balance_access");
      assert.doesNotMatch(JSON.stringify(report), /DO-NOT-RETURN-SECRET/);
      assert.ok(!report.completedCheckpoints.includes("funding_checked"));
    } finally { f.close(); }
  });
}

test("MCP accepts journey checks and returns structured readiness with no permission mutation", async () => {
  const f = fixture();
  const server = createTradingServer(f.runtime);
  const client = new Client({ name: "onboarding-test", version: "1" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  try {
    await Promise.all([server.connect(a), client.connect(b)]);
    const result = await client.callTool({ name: "setup", arguments: { journey: "connect_trading_tools", mode: "unattended", checkAccess: true } });
    assert.equal(result.isError, false);
    const report = result.structuredContent as unknown as SetupReport;
    assert.equal(report.journey, "connect_trading_tools");
    assert.equal(report.mode, "unattended");
    assert.equal(report.nextAction, "check_funding");
    assert.equal(report.checks.account.status, "usable");
    assert.deepEqual(f.store.get("profile:trading"), profile);
    const invalid = await client.callTool({ name: "setup", arguments: { funding: { tokenId: "1field", amount: "0.1" } } });
    assert.equal(invalid.isError, true);
  } finally { await client.close(); await server.close(); f.close(); }
});
