import { test } from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createTradingServer } from "../src/trading/server";

test("an unconfigured server supports discovery and setup without creating a wallet", async () => {
  const server = createTradingServer();
  const client = new Client({ name: "test", version: "1" });
  const [a,b] = InMemoryTransport.createLinkedPair();
  try {
    await Promise.all([server.connect(a), client.connect(b)]);
    const names = (await client.listTools()).tools.map(tool => tool.name);
    assert.equal(names.length, 20);
    for (const name of ["quote", "execute", "swap_history", "claim_unclaimed_swaps", "bridge_status", "recover_bridge_transactions"]) assert.ok(names.includes(name));
    assert.equal(names.includes("rebalance_swap_inventory"), false);
    const setup = await client.callTool({ name: "setup", arguments: {} });
    assert.equal((setup.structuredContent as { checks: { account: { status: string } } }).checks.account.status, "missing");
    const wallets = await client.callTool({ name: "list_wallets", arguments: {} });
    assert.equal(wallets.isError, true);
    assert.equal(((wallets.structuredContent as Record<string, unknown>)?.error as { code: string }).code, "setup_required");
  } finally { await client.close(); await server.close(); }
});

test("MCP does not accept private keys or permission grants in tool arguments", async () => {
  const server = createTradingServer();
  const client = new Client({ name: "test", version: "1" });
  const [a,b] = InMemoryTransport.createLinkedPair();
  try {
    await Promise.all([server.connect(a), client.connect(b)]);
    for (const [name, args] of [
      ["setup", { privateKey: "DO-NOT-ECHO-KEY" }],
      ["update_config", { policy: { swaps: true }, secret: "DO-NOT-ECHO-KEY" }],
      ["execute", { quoteId: "q", idempotencyKey: "k", approved: true }],
    ] as const) {
      const result = await client.callTool({ name, arguments: args });
      assert.equal(result.isError, true);
      assert.equal(((result.structuredContent as Record<string, unknown>)?.error as { code: string }).code, "invalid_arguments");
      assert.doesNotMatch(JSON.stringify(result), /DO-NOT-ECHO-KEY/);
    }
  } finally { await client.close(); await server.close(); }
});

test("configured default profile is used when omitted and explicit profiles still win", async () => {
  const { mkdtempSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { TradingStore } = await import("../src/trading/store");
  const { TradingRuntime } = await import("../src/trading/runtime");
  const root = mkdtempSync(join(tmpdir(), "shield-default-"));
  const store = new TradingStore(root, "test-passphrase-long-enough", true);
  const policy = { swaps: false, claims: false, bridges: false, maxSlippageBps: 100, swapLimits: {}, bridgeLimits: {} };
  for (const id of ["alice", "bob"]) store.set("profile:" + id, { id, network: "testnet", address: "aleo1" + id,
    key: { type: "env", name: "TEST_KEY" }, policy });
  store.set("settings", { defaultProfile: "alice", slippageBps: 50 });
  const backend: import("../src/trading/types").TradingBackend = {
    read: async (_action, profile) => ({ address: profile.address }),
    quote: async () => { throw new Error("unexpected quote"); },
    execute: async () => { throw new Error("unexpected execution"); },
    reconcile: async () => { throw new Error("unexpected recovery"); },
    resume: async () => { throw new Error("unexpected resume"); },
  };
  const runtime = new TradingRuntime(store, backend);
  const server = createTradingServer(runtime);
  const client = new Client({ name: "test", version: "1" });
  const [a,b] = InMemoryTransport.createLinkedPair();
  try {
    await Promise.all([server.connect(a), client.connect(b)]);
    const first = await client.callTool({ name: "get_balances", arguments: {} });
    assert.equal(first.isError, false);
    assert.equal((first.structuredContent as { address: string }).address, "aleo1alice");
    await client.callTool({ name: "update_config", arguments: { defaultProfile: "bob" } });
    const changed = await client.callTool({ name: "get_balances", arguments: {} });
    assert.equal((changed.structuredContent as { address: string }).address, "aleo1bob");
    const explicit = await client.callTool({ name: "get_balances", arguments: { profileId: "alice" } });
    assert.equal((explicit.structuredContent as { address: string }).address, "aleo1alice");
  } finally { await client.close(); await server.close(); store.close(); rmSync(root, { recursive: true, force: true }); }
});
