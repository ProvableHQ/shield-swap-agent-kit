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
  const driver = await mkdtemp(join(packageRoot, ".shield-permissions-smoke-"));
  try {
    const path = join(driver, "run.mjs");
    await writeFile(path, await readFile(new URL(import.meta.url)));
    const result = await run(process.execPath, [path, installRoot, "--installed-child"], { cwd: installRoot, timeout: 60000 });
    process.stdout.write(result.stdout);
  } finally { await rm(driver, { recursive: true, force: true }); }
} else {
  const [{ Client }, { StdioClientTransport }, { ElicitRequestSchema }] = await Promise.all([
    import("@modelcontextprotocol/sdk/client/index.js"), import("@modelcontextprotocol/sdk/client/stdio.js"),
    import("@modelcontextprotocol/sdk/types.js"),
  ]);
  const entry = join(installRoot, "node_modules/@provablehq/shield-swap-mcp/dist/cli.js");
  const root = await mkdtemp(join(tmpdir(), "shield-installed-permissions-"));
  const password = "temporary-offline-permissions-passphrase";
  const env = { ...process.env, SHIELD_SWAP_MCP_PASSWORD: password };
  try {
    const setup = await run(process.execPath, [entry, "setup", "--network", "testnet", "--state-dir", root, "--generate"], { cwd: installRoot, env, timeout: 30000 });
    const address = JSON.parse(setup.stdout).address;
    const proposal = { profileId: "default", permissions: { swaps: true, claims: true, inventory: true },
      swapLimits: [{ token: "TEST_TOKEN", amount: "1000000" }], maxSlippageBps: 50 };
    for (const phase of ["unsupported", "approve", "restart"]) {
      const client = new Client({ name: "permissions-smoke", version: "1" }, { capabilities: phase === "unsupported" ? {} : { elicitation: { form: {} } } });
      let prompts = 0, accept = false;
      if (phase !== "unsupported") client.setRequestHandler(ElicitRequestSchema, async request => {
        prompts++;
        assert.equal(request.params.mode, "form");
        assert.ok(request.params.message.includes(address));
        assert.match(request.params.message, /testnet/);
        assert.match(request.params.message, /persist/i);
        assert.equal(request.params.requestedSchema.properties.approve.default, false);
        return accept ? { action: "accept", content: { approve: true } } : { action: "decline" };
      });
      const transport = new StdioClientTransport({ command: process.execPath, args: [entry, "serve", "--state-dir", root],
        cwd: installRoot, env: { SHIELD_SWAP_MCP_PASSWORD: password }, stderr: "pipe" });
      try {
        await client.connect(transport);
        const call = async (name, args = {}) => {
          const result = await client.callTool({ name, arguments: args });
          assert.equal(result.isError, false, JSON.stringify(result.structuredContent));
          return result.structuredContent;
        };
        const config = await call("get_config");
        assert.equal(config.profiles[0].policy.inventory, phase === "restart");
        if (phase === "unsupported") {
          const result = await call("request_permissions", proposal);
          assert.equal(result.status, "requires_terminal");
          assert.ok(result.command.includes(root));
          assert.equal((await call("get_config")).profiles[0].policy.swaps, false);
        } else if (phase === "approve") {
          assert.equal((await call("request_permissions", proposal)).status, "declined");
          assert.equal((await call("get_config")).profiles[0].policy.swaps, false);
          accept = true;
          assert.equal((await call("request_permissions", proposal)).status, "approved");
          const saved = (await call("get_config")).profiles[0].policy;
          assert.equal(saved.swaps, true); assert.equal(saved.claims, true); assert.equal(saved.inventory, true);
          assert.equal(saved.bridges, false); assert.equal(saved.swapLimits.TEST_TOKEN, "1000000");
          assert.equal(saved.maxSlippageBps, 50);
          assert.equal(prompts, 2);
        } else {
          accept = true;
          assert.equal((await call("request_permissions", { permissions: { inventory: false } })).status, "approved");
          assert.equal((await call("get_config")).profiles[0].policy.inventory, false);
          assert.equal((await call("get_config")).profiles[0].policy.swaps, true);
        }
        assert.deepEqual((await call("list_operations")).operations, []);
        assert.deepEqual((await call("get_inventory_maintenance_status")).jobs, []);
      } finally { await client.close(); }
    }
    // Existing terminal revocation remains compatible with client-approved grants.
    const revoked = await run(process.execPath, [entry, "configure", "--state-dir", root, "--profile", "default", "--deny-swaps", "--deny-claims"], { cwd: installRoot, env, timeout: 30000 });
    assert.equal(JSON.parse(revoked.stdout).policy.swaps, false);
    assert.equal(JSON.parse(revoked.stdout).policy.claims, false);
    process.stdout.write("Installed permissions: unsupported-client fallback, decline, explicit approval, three MCP sessions, persistent grants, form and terminal revocation passed. No network calls or transactions requested.\n");
  } finally { await rm(root, { recursive: true, force: true }); }
}
