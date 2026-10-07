import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

const installRoot = resolve(process.argv[2] ?? ".");
const run = promisify(execFile);
if (process.argv[3] !== "--installed-child") {
  const packageRoot = await realpath(join(installRoot, "node_modules/@provablehq/shield-swap-mcp"));
  const driver = await mkdtemp(join(packageRoot, ".shield-mcp-smoke-"));
  try {
    const path = join(driver, "run.mjs");
    await writeFile(path, await readFile(new URL(import.meta.url)));
    const result = await run(process.execPath, [path, installRoot, "--installed-child"], { cwd: installRoot, timeout: 60000 });
    process.stdout.write(result.stdout);
  } finally { await rm(driver, { recursive: true, force: true }); }
} else {
const importInstalled = name => import(name);
const [{ loadNetwork }, { Client }, { StdioClientTransport }] = await Promise.all([
  importInstalled("@provablehq/veil-aleo-sdk"),
  importInstalled("@modelcontextprotocol/sdk/client/index.js"),
  importInstalled("@modelcontextprotocol/sdk/client/stdio.js"),
]);
const entry = join(installRoot, "node_modules/@provablehq/shield-swap-mcp/dist/cli.js");
const root = await mkdtemp(join(tmpdir(), "shield-installed-state-"));
const key = (await loadNetwork("testnet")).generateAccount().privateKey;
const password = "temporary-offline-smoke-passphrase";
try {
  const env = { ...process.env, SHIELD_SWAP_MCP_PASSWORD: password, MCP_SMOKE_KEY: key };
  const setup = await run(process.execPath, [entry, "setup", "--network", "testnet", "--state-dir", root, "--key-env", "MCP_SMOKE_KEY", "--store-key"], { cwd: installRoot, env, timeout: 30000 });
  assert.ok(!setup.stdout.includes(key) && !setup.stderr.includes(key));
  assert.ok(!(await readFile(join(root, "state.sqlite"))).includes(key));
  const address = JSON.parse(setup.stdout).address;
  for (let restart = 0; restart < 2; restart++) {
    const client = new Client({ name: "installed-smoke", version: "1" });
    const transport = new StdioClientTransport({ command: process.execPath, args: [entry, "serve", "--state-dir", root], cwd: installRoot,
      env: { SHIELD_SWAP_MCP_PASSWORD: password }, stderr: "pipe" });
    let stderr = "";
    transport.stderr?.on("data", chunk => { stderr += chunk.toString(); });
    try {
      await client.connect(transport);
      const tools = await client.listTools();
      assert.equal(tools.tools.length, 20);
      const setupResult = await client.callTool({ name: "setup", arguments: {} });
      assert.equal(setupResult.structuredContent.ready, true);
      const wallets = await client.callTool({ name: "list_wallets", arguments: {} });
      assert.equal(wallets.structuredContent.wallets[0].address, address);
      assert.ok(!JSON.stringify(wallets).includes(key));
      const routes = await client.callTool({ name: "list_bridge_routes", arguments: {} });
      assert.equal(routes.isError, false);
      assert.ok(routes.structuredContent.routes.length > 0);
      assert.ok(routes.structuredContent.routes.every(route => route.network === "testnet"));
    } finally { await client.close(); }
    assert.ok(!stderr.includes(key));
  }
  process.stdout.write("Installed package: SDK key import, encrypted persistence, 20 stdio tools, testnet bridge discovery, and two restarts passed. No network calls or transactions requested.\n");
} finally { await rm(root, { recursive: true, force: true }); }
}
