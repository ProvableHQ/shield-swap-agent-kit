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
    assert.equal((setup.structuredContent as Record<string, unknown>)?.ready, false);
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
