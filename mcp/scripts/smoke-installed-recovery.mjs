// Usage: node scripts/smoke-installed-recovery.mjs /path/to/installed/consumer
// Requires Node >=22.15 for module hooks. No account funding or network is used.
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
  const driver = await mkdtemp(join(packageRoot, ".recovery-smoke-"));
  try {
    const path = join(driver, "run.mjs");
    await writeFile(path, await readFile(new URL(import.meta.url)));
    await writeFile(join(driver, "recovery-sdk.mjs"), await readFile(new URL("fixtures/recovery-sdk.mjs", import.meta.url)));
    const result = await run(process.execPath, [path, installRoot, "--installed-child"], { cwd: installRoot, timeout: 60000 });
    process.stdout.write(result.stdout);
  } finally { await rm(driver, { recursive: true, force: true }); }
} else {
  const [{ loadNetwork }, { Client }, { StdioClientTransport }] = await Promise.all([
    import("@provablehq/veil-aleo-sdk"), import("@modelcontextprotocol/sdk/client/index.js"), import("@modelcontextprotocol/sdk/client/stdio.js"),
  ]);
  const entry = join(installRoot, "node_modules/@provablehq/shield-swap-mcp/dist/cli.js");
  const hook = new URL("recovery-sdk.mjs", import.meta.url).pathname;
  const key = (await loadNetwork("testnet")).generateAccount().privateKey;
  for (const scenario of ["preparation", "partial", "timeout"]) {
    const root = await mkdtemp(join(tmpdir(), "shield-recovery-state-"));
    const control = join(root, "control.json"), attempts = join(root, "attempts.log");
    const env = { ...process.env, SHIELD_SWAP_MCP_PASSWORD: "disposable-offline-recovery-password", RECOVERY_TEST_KEY: key };
    let client;
    try {
      const setup = await run(process.execPath, [entry, "setup", "--state-dir", root, "--network", "testnet", "--key-env", "RECOVERY_TEST_KEY", "--store-key"], { env });
      const address = JSON.parse(setup.stdout).address;
      await run(process.execPath, [entry, "configure", "--state-dir", root, "--allow-claims"], { env });
      await writeFile(attempts, "");
      const mode = value => writeFile(control, JSON.stringify({ mode: value }));
      const count = async () => (await readFile(attempts, "utf8")).split("\n").filter(Boolean).length;
      async function start() {
        client = new Client({ name: "installed-recovery-smoke", version: "1" });
        await client.connect(new StdioClientTransport({ command: process.execPath,
          args: ["--import", hook, entry, "serve", "--state-dir", root], cwd: installRoot,
          env: { SHIELD_SWAP_MCP_PASSWORD: env.SHIELD_SWAP_MCP_PASSWORD, RECOVERY_ADDRESS: address, RECOVERY_CONTROL: control, RECOVERY_ATTEMPTS: attempts }, stderr: "pipe" }));
      }
      async function call(name, args) {
        const result = await client.callTool({ name, arguments: args });
        assert.ok(!result.isError, JSON.stringify(result));
        return result.structuredContent;
      }
      async function settled(operationId) {
        for (let i = 0; i < 100; i++) {
          const op = await call("get_operation_status", { operationId });
          if (!["queued", "running"].includes(op.status)) return op;
          await new Promise(resolve => setTimeout(resolve, 10));
        }
        throw new Error("Operation did not settle");
      }
      await mode(scenario); await start();
      const op = await call("claim_unclaimed_swaps", { swapIds: scenario === "partial" ? ["one", "two"] : ["one"], idempotencyKey: scenario });
      const initial = await settled(op.operationId);
      assert.equal(initial.status, scenario === "timeout" ? "uncertain" : "pending");
      assert.equal(await count(), scenario === "preparation" ? 0 : 1);
      await client.close(); client = undefined;
      await start(); // New OS process, same encrypted journal and operation ID.
      if (scenario === "timeout") {
        const uncertain = await call("resume_operation", { operationId: op.operationId });
        assert.equal(uncertain.status, "uncertain");
        assert.equal(uncertain.claims[0].transactionId, "at1claim");
        const blocked = await client.callTool({ name: "claim_unclaimed_swaps", arguments: { swapIds: ["two"], idempotencyKey: "must-block" } });
        assert.equal(blocked.isError, true);
        assert.equal(await count(), 1);
        await mode("rejected");
        const rejected = await settled(op.operationId);
        assert.equal(rejected.status, "pending");
        assert.equal(rejected.claims[0].lastFailure.feeTransactionId, "at1fee");
        assert.equal(await count(), 1); // Status inspection does not submit.
      }
      await mode("success");
      await call("resume_operation", { operationId: op.operationId });
      const final = await settled(op.operationId);
      assert.equal(final.status, "complete");
      assert.equal(await count(), scenario === "preparation" ? 1 : 2);
      await call("resume_operation", { operationId: op.operationId });
      assert.equal(await count(), scenario === "preparation" ? 1 : 2);
      assert.ok(!(await readFile(join(root, "state.sqlite"))).includes(key));
    } finally { await client?.close(); await rm(root, { recursive: true, force: true }); }
  }
  process.stdout.write("Installed recovery: preparation failure, partial batch, uncertain submission, rejected transaction evidence, blocked duplicate writes, and explicit resume passed across three process restarts. SDK outcomes were simulated; no network or transactions used.\n");
}
