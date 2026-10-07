import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolve } from "node:path";
const run = promisify(execFile);
test("terminal setup help documents external keys without needing a configured wallet", async () => {
  const result = await run(process.execPath, ["--import", "tsx", resolve("src/cli.ts"), "--help"], { timeout: 10000 });
  assert.match(result.stdout, /setup/);
  assert.match(result.stdout, /key-env/);
  assert.match(result.stdout, /serve/);
});
test("raw private keys are rejected as command arguments and never echoed", async () => {
  try {
    await run(process.execPath, ["--import", "tsx", resolve("src/cli.ts"), "setup", "--private-key", "NEVER-ECHO-THIS-KEY"], { timeout: 10000 });
    assert.fail("expected rejection");
  } catch (error) {
    const result = error as { code: number; stdout: string; stderr: string };
    assert.equal(result.code, 1);
    assert.doesNotMatch(result.stdout + result.stderr, /NEVER-ECHO-THIS-KEY/);
    assert.match(result.stderr, /arguments/i);
  }
});

test("terminal setup encrypts an imported key and stdio survives process restart", { timeout: 30000 }, async () => {
  const { mkdtempSync, readFileSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { loadNetwork } = await import("@provablehq/veil-aleo-sdk");
  const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
  const { StdioClientTransport } = await import("@modelcontextprotocol/sdk/client/stdio.js");
  const { TradingStore } = await import("../src/trading/store");
  const sdk = await loadNetwork("testnet");
  const account = sdk.generateAccount();
  const root = mkdtempSync(join(tmpdir(), "shield-cli-"));
  const cli = resolve("src/cli.ts");
  const password = "test-password-long-enough";
  const env = { ...process.env, SHIELD_SWAP_MCP_PASSWORD: password, MCP_TEST_ALEO_KEY: account.privateKey };
  try {
    const result = await run(process.execPath, ["--import", "tsx", cli, "setup", "--network", "testnet", "--state-dir", root, "--key-env", "MCP_TEST_ALEO_KEY", "--store-key"], { env, timeout: 20000 });
    assert.equal(JSON.parse(result.stdout).address, account.address);
    assert.ok(!result.stdout.includes(account.privateKey) && !result.stderr.includes(account.privateKey));
    assert.equal(readFileSync(join(root, "state.sqlite")).includes(account.privateKey), false);
    const configured = await run(process.execPath, ["--import", "tsx", cli, "configure", "--state-dir", root, "--allow-claims", "--swap-limit", "1field=1000", "--max-slippage-bps", "75"], { env });
    assert.deepEqual(JSON.parse(configured.stdout).policy, { swaps: false, claims: true, bridges: false, maxSlippageBps: 75, swapLimits: { "1field": "1000" }, bridgeLimits: {} });
    const evmKey = "0x" + "01".repeat(32);
    const bridgeConfig = await run(process.execPath, ["--import", "tsx", cli, "configure", "--state-dir", root,
      "--evm-key-env", "MCP_EVM_TEST_KEY", "--evm-rpc-url", "https://rpc.invalid"], { env: { ...env, MCP_EVM_TEST_KEY: evmKey } });
    assert.equal(JSON.parse(bridgeConfig.stdout).policy.bridges, false);
    assert.ok(!bridgeConfig.stdout.includes(evmKey) && !bridgeConfig.stderr.includes(evmKey));

    const descriptor = { provider: "privy", address: JSON.parse(bridgeConfig.stdout).ethereumAddress,
      rpcUrl: "https://rpc.invalid", walletId: "existing-wallet", appIdEnv: "PRIVY_TEST_APP", appSecretEnv: "PRIVY_TEST_SECRET" };
    const hosted = await run(process.execPath, ["--import", "tsx", cli, "configure", "--state-dir", root,
      "--evm-wallet-env", "MCP_TEST_WALLET"], { env: { ...env, MCP_TEST_WALLET: JSON.stringify(descriptor) } });
    assert.equal(JSON.parse(hosted.stdout).policy.bridges, false);
    const invalidHosted = await run(process.execPath, ["--import", "tsx", cli, "configure", "--state-dir", root,
      "--evm-wallet-env", "MCP_TEST_WALLET"], { env: { ...env, MCP_TEST_WALLET: JSON.stringify({ ...descriptor, appSecret: "NEVER-ECHO-SECRET" }) } }).then(
      () => { throw new Error("raw provider credential accepted"); },
      error => error,
    );
    assert.ok(!String(invalidHosted.stdout).includes("NEVER-ECHO-SECRET") && !String(invalidHosted.stderr).includes("NEVER-ECHO-SECRET"));

    const store = new TradingStore(root, password);
    assert.deepEqual(store.get<{ evm: { appSecret: unknown } }>("profile:default")?.evm.appSecret, { type: "env", name: "PRIVY_TEST_SECRET" });
    assert.equal(store.get("secret:aleo:default"), account.privateKey);
    store.close();
    for (let restart = 0; restart < 2; restart++) {
      // The imported key is deliberately absent from the server environment.
      const transport = new StdioClientTransport({ command: process.execPath, args: ["--import", "tsx", cli, "serve", "--state-dir", root], env: { SHIELD_SWAP_MCP_PASSWORD: password }, stderr: "pipe" });
      const client = new Client({ name: "test", version: "1" });
      let diagnostics = "";
      transport.stderr?.on("data", chunk => { diagnostics += chunk.toString(); });
      try {
        await client.connect(transport);
        assert.equal((await client.listTools()).tools.length, 20);
        const setup = await client.callTool({ name: "setup", arguments: {} });
        assert.equal((setup.structuredContent as { ready: boolean }).ready, true);
        const wallets = await client.callTool({ name: "list_wallets", arguments: {} });
        assert.match(JSON.stringify(wallets), new RegExp(account.address));
        assert.ok(!JSON.stringify(wallets).includes(account.privateKey));
      } finally { await client.close(); }
      assert.ok(!diagnostics.includes(account.privateKey));
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("concurrent setup cannot replace a profile or discard its newly generated key", async () => {
  const { mkdtempSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { setup } = await import("../src/terminal");
  const { TradingStore } = await import("../src/trading/store");
  const root = mkdtempSync(join(tmpdir(), "shield-setup-race-"));
  const previous = process.env.SHIELD_SWAP_MCP_PASSWORD;
  process.env.SHIELD_SWAP_MCP_PASSWORD = "test-password-long-enough";
  try {
    const options = { network: "testnet", generate: true, "state-dir": root };
    const results = await Promise.allSettled([setup(options), setup(options)]);
    const succeeded = results.filter(result => result.status === "fulfilled");
    assert.equal(succeeded.length, 1);
    const store = new TradingStore(root, "test-password-long-enough");
    try { assert.equal(store.get<{ address: string }>("profile:default")?.address, succeeded[0].value.address); }
    finally { store.close(); }
  } finally {
    if (previous === undefined) delete process.env.SHIELD_SWAP_MCP_PASSWORD;
    else process.env.SHIELD_SWAP_MCP_PASSWORD = previous;
    rmSync(root, { recursive: true, force: true });
  }
});
