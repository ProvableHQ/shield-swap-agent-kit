import { before, test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { chmod, mkdtemp, readFile, rm, writeFile, access, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { loadNetwork } from "@provablehq/veil-aleo-sdk";
import { TradingStore } from "../src/trading/store";
import { banner } from "../../tools/welcome.mjs";

const run = promisify(execFile);
const launcher = resolve("dist/claude-launch.js");
const cli = resolve("dist/cli.js");
const passphrase = "disposable-test-passphrase";
before(async () => { await run(process.execPath, ["scripts/build.mjs"], { timeout: 30000 }); });

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "ss-test-"));
  const state = join(root, "state"), project = join(root, "project"), result = join(root, "result.json");
  const fake = join(root, "fake-claude.mjs");
  // Local stand-in only: no Claude model or external service is contacted.
  await writeFile(fake, `#!${process.execPath}
import assert from 'node:assert/strict';
import { readFile, writeFile, stat } from 'node:fs/promises';
import { Client } from ${JSON.stringify(import.meta.resolve("@modelcontextprotocol/sdk/client/index.js"))};
import { StdioClientTransport } from ${JSON.stringify(import.meta.resolve("@modelcontextprotocol/sdk/client/stdio.js"))};
const args = process.argv.slice(2);
const configPath = args[args.indexOf('--mcp-config') + 1];
const config = JSON.parse(await readFile(configPath, 'utf8'));
for (const name of ['SHIELD_SWAP_MCP_PASSWORD', 'TEST_ALEO_KEY', 'TEST_PROVIDER_SECRET', 'UNRELATED_WALLET_KEY', 'AWS_SECRET_ACCESS_KEY']) assert.equal(process.env[name], undefined);
assert.equal(config.mcpServers['shield-swap'].env, undefined);
assert.equal((await stat(configPath)).mode & 0o777, 0o600);
const connection = config.mcpServers['shield-swap'];
assert.equal((await stat(connection.args[1])).mode & 0o777, 0o600);
const reports = [];
for (let reconnect = 0; reconnect < 2; reconnect++) {
  const client = new Client({name:'local-launcher-test', version:'1'});
  const transport = new StdioClientTransport({...connection, stderr:'pipe'});
  transport.stderr?.on('data', () => {});
  try {
    await client.connect(transport);
    const result = await client.callTool({name:'setup', arguments:{}});
    assert.notEqual(result.isError, true);
    assert.equal(result.structuredContent.checks.account.status, 'configured');
    assert.equal(result.structuredContent.checks.funding.status, 'not_checked');
    reports.push(result.structuredContent);
  } finally { await client.close(); }
}
await writeFile(${JSON.stringify(result)}, JSON.stringify({args, configPath, config, reports, cwd:process.cwd()}));
`, { mode: 0o700 });
  await chmod(fake, 0o700);
  const env = { ...process.env, SHIELD_SWAP_MCP_PASSWORD: passphrase, SHIELD_SWAP_CLAUDE_COMMAND: fake,
    TEST_PROVIDER_SECRET: "synthetic-provider-secret", UNRELATED_WALLET_KEY: "synthetic-other-key", AWS_SECRET_ACCESS_KEY: "synthetic-cloud-secret" };
  return { root, state, project, result, fake, env, args: [launcher, "--state-dir", state, "--project", project] };
}

test('launcher loads intro, reuses selected account, isolates secrets and reconnects MCP', { timeout: 60000 }, async () => {
  const f = await fixture();
  const account = (await loadNetwork("testnet")).generateAccount();
  const env = { ...f.env, TEST_ALEO_KEY: account.privateKey };
  try {
    await run(process.execPath, [cli, "setup", "--network", "testnet", "--state-dir", f.state, "--profile", "desk", "--key-env", "TEST_ALEO_KEY"], { env });
    const output = await run(process.execPath, f.args, { env, timeout: 30000 });
    assert.ok(output.stderr.includes(banner));
    assert.match(output.stderr, /Private asset trading/);
    assert.doesNotMatch(output.stdout + output.stderr, new RegExp(account.privateKey));
    const captured = JSON.parse(await readFile(f.result, "utf8"));
    assert.equal(captured.cwd, await realpath(f.project));
    assert.equal(captured.reports.length, 2);
    for (const report of captured.reports) {
      assert.equal(report.profileId, "desk");
      assert.equal(report.checks.account.address, account.address);
      assert.ok(report.welcome.startsWith(banner));
      assert.match(report.welcome, /Connect trading tools/);
      assert.equal(report.checks.execution.status, "disabled");
    }
    const prompt = captured.args.at(-1);
    assert.match(prompt, /SKILL\.md/);
    assert.match(prompt, /Begin by calling setup/);
    assert.match(prompt, /welcome text/);
    const serialized = JSON.stringify(captured);
    for (const secret of [passphrase, account.privateKey, env.TEST_PROVIDER_SECRET, env.UNRELATED_WALLET_KEY]) assert.ok(!serialized.includes(secret));
    await assert.rejects(access(dirname(captured.configPath))); // Session config/socket cleaned up.
    const store = new TradingStore(f.state, passphrase);
    try { assert.equal(store.list("profile:").length, 1); assert.equal(store.get<{address:string}>("profile:desk")?.address, account.address); }
    finally { store.close(); }
  } finally { await rm(f.root, { recursive: true, force: true }); }
});

test('explicit new account creation defaults to mainnet with execution disabled', { timeout: 60000 }, async () => {
  const f = await fixture();
  try {
    await run(process.execPath, [...f.args, "--generate"], { env: f.env, timeout: 30000 });
    const captured = JSON.parse(await readFile(f.result, "utf8"));
    assert.equal(captured.reports[0].checks.account.network, "mainnet");
    assert.equal(captured.reports[0].checks.execution.status, "disabled");
    assert.equal(captured.reports[0].checks.funding.status, "not_checked");
  } finally { await rm(f.root, { recursive: true, force: true }); }
});

test('wrong passphrase and mismatched external key fail before Claude without replacing the profile', { timeout: 60000 }, async () => {
  const f = await fixture();
  const sdk = await loadNetwork("testnet"), account = sdk.generateAccount();
  const env = { ...f.env, TEST_ALEO_KEY: account.privateKey };
  try {
    await run(process.execPath, [cli, "setup", "--network", "testnet", "--state-dir", f.state, "--key-env", "TEST_ALEO_KEY"], { env });
    for (const changed of [{ SHIELD_SWAP_MCP_PASSWORD: "incorrect-passphrase" }, { TEST_ALEO_KEY: sdk.generateAccount().privateKey }]) {
      await assert.rejects(run(process.execPath, f.args, { env: { ...env, ...changed }, timeout: 20000 }), (error: unknown) => {
        const result = error as { stderr: string; stdout: string };
        for (const secret of [account.privateKey, ...Object.values(changed)]) assert.ok(!(result.stderr + result.stdout).includes(secret));
        return true;
      });
      await assert.rejects(access(f.result));
    }
    const store = new TradingStore(f.state, passphrase);
    try { assert.equal(store.get<{address:string}>("profile:default")?.address, account.address); assert.equal(store.list("profile:").length, 1); }
    finally { store.close(); }
  } finally { await rm(f.root, { recursive: true, force: true }); }
});

test('headless launch without a supplied account choice shows intro then stops without creating a key', { timeout: 30000 }, async () => {
  const f = await fixture();
  try {
    await assert.rejects(run(process.execPath, f.args, { env: f.env, timeout: 20000 }), (error: unknown) => {
      const result = error as { stderr: string };
      assert.ok(result.stderr.includes(banner));
      assert.match(result.stderr, /trusted terminal/);
      return true;
    });
    await assert.rejects(access(f.result));
    const store = new TradingStore(f.state, passphrase);
    try { assert.equal(store.list("profile:").length, 0); assert.equal(store.list("secret:").length, 0); }
    finally { store.close(); }
  } finally { await rm(f.root, { recursive: true, force: true }); }
});
