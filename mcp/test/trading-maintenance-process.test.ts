import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { fork } from "node:child_process";
import { once } from "node:events";
import { existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { argumentsFor } from "../src/terminal";
import { TradingStore } from "../src/trading/store";
import { TradingRuntime } from "../src/trading/runtime";
import { InventoryMaintenance } from "../src/trading/maintenance";
import * as workerModule from "../src/trading/maintenance-process";
import type { TradingBackend } from "../src/trading/types";

const password = "process-test-passphrase";
let cli: string;
let offlineCli: string;
let buildRoot: string;
before(async () => {
  buildRoot = mkdtempSync(join(tmpdir(), "maintenance-build-"));
  symlinkSync(resolve("node_modules"), join(buildRoot, "node_modules"), "dir");
  cli = join(buildRoot, "cli.mjs");
  await build({ entryPoints: ["src/cli.ts"], outfile: cli, bundle: true, platform: "node", format: "esm", packages: "external", target: "node22" });
  offlineCli = join(buildRoot, "offline-cli.mjs");
  await build({ entryPoints: ["src/cli.ts"], outfile: offlineCli, bundle: true, platform: "node", format: "esm", packages: "external", target: "node22",
    plugins: [{ name: "offline-inventory", setup(build) {
      build.onLoad({ filter: /trading\/veil\.ts$/ }, () => ({ contents: `
        export class VeilBackend {
          async read(action) {
            if (action !== "get_record_inventory") throw new Error("Unexpected external read");
            return { token: { id: "A", symbol: "A", decimals: 6 }, asset: { program: "a.aleo" }, balance: "1000000",
              available: [{ commitment: "record", amount: "1000000" }], reserved: [], availableCount: 1, reservedCount: 0 };
          }
          async quote() { throw new Error("Unexpected plan"); }
          async execute() { throw new Error("Unexpected submission"); }
        }`, loader: "ts" }));
    } }] });
});
after(() => { if (buildRoot) rmSync(buildRoot, { recursive: true, force: true }); });

test("the server accepts an explicit worker lifetime and rejects invalid or misplaced options", () => {
  assert.equal(workerModule.maintenanceMode(undefined), "attached");
  assert.equal(workerModule.maintenanceMode("detached"), "detached");
  assert.throws(() => workerModule.maintenanceMode("forever"), /attached or detached/);
  for (const mode of ["attached", "detached"]) assert.equal(argumentsFor(["serve", "--maintenance-mode", mode]).values["maintenance-mode"], mode);
  for (const args of [["serve", "--maintenance-mode", "forever"], ["setup", "--maintenance-mode", "attached"], ["serve", "--parent-attached"]])
    assert.throws(() => argumentsFor(args), /Invalid command arguments/);
});

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "maintenance-process-"));
  const store = new TradingStore(root, password, true);
  const saved = { id: "saved", enabled: true, nextCheckAt: Date.now() + 86400_000, target: { token: "A", records: 4, minRecordAmount: "1" } };
  store.set("maintenance-token:saved", saved);
  const runtime = new TradingRuntime(store, {} as TradingBackend);
  return { root, store, runtime, saved, jobs: new InventoryMaintenance(runtime), close() { store.close(); rmSync(root, { recursive: true, force: true }); } };
}

async function until(check: () => Promise<boolean>, timeout = 4000) {
  const deadline = Date.now() + timeout;
  while (!await check()) {
    assert.ok(Date.now() < deadline, "worker did not reach the expected lifecycle state");
    await new Promise(resolve => setTimeout(resolve, 25));
  }
}

test("the default attached worker shares concurrent starts and releases ownership on server shutdown", { timeout: 15000 }, async () => {
  const f = fixture();
  const previous = process.env.SHIELD_SWAP_MCP_PASSWORD;
  process.env.SHIELD_SWAP_MCP_PASSWORD = password;
  const worker = new workerModule.MaintainerProcess(f.runtime, cli);
  const secondServer = new workerModule.MaintainerProcess(f.runtime, cli);
  try {
    await Promise.all([worker.start(), worker.start()]);
    assert.equal(await f.jobs.running(), true);
    await secondServer.start();
    await secondServer.stop();
    assert.equal(await f.jobs.running(), true, "a second MCP server cannot stop the first server's worker");
    await worker.stop();
    assert.equal(await f.jobs.running(), false);
    assert.deepEqual(f.store.get("maintenance-token:saved"), f.saved, "shutdown must preserve saved job authorization");
    await assert.rejects(worker.start(), /closing/);
  } finally {
    await worker.stop(); await secondServer.stop(); f.close();
    if (previous === undefined) delete process.env.SHIELD_SWAP_MCP_PASSWORD; else process.env.SHIELD_SWAP_MCP_PASSWORD = previous;
  }
});

test("the live MCP supervisor replaces an exited worker without overlapping ownership", { timeout: 20000 }, async () => {
  const f = fixture();
  const previous = process.env.SHIELD_SWAP_MCP_PASSWORD;
  process.env.SHIELD_SWAP_MCP_PASSWORD = password;
  const pidFile = join(f.root, "worker.pid"), entry = join(f.root, "worker.mjs");
  // A test wrapper records only its own PID; production ownership still uses
  // the SQLite lock and the actual ChildProcess handle, never this file.
  writeFileSync(entry, `import { writeFileSync } from 'node:fs';
    writeFileSync(${JSON.stringify(pidFile)}, String(process.pid));
    await import(${JSON.stringify(pathToFileURL(cli).href)});`);
  const worker = new workerModule.MaintainerProcess(f.runtime, entry);
  try {
    await worker.start();
    const first = Number(readFileSync(pidFile, "utf8"));
    process.kill(first, "SIGKILL");
    await until(async () => Number(readFileSync(pidFile, "utf8")) !== first && await f.jobs.running(), 9000);
    assert.equal(await f.jobs.running(), true);
    assert.deepEqual(f.store.get("maintenance-token:saved"), f.saved);
    await worker.stop();
    assert.equal(await f.jobs.running(), false);
    await assert.rejects(worker.start(), /closing/);
  } finally {
    await worker.stop(); f.close();
    if (previous === undefined) delete process.env.SHIELD_SWAP_MCP_PASSWORD; else process.env.SHIELD_SWAP_MCP_PASSWORD = previous;
  }
});

test("an attached worker exits when its parent is killed, while detached mode survives", { timeout: 20000 }, async () => {
  for (const mode of ["attached", "detached"] as const) {
    const f = fixture();
    const parentFile = join(f.root, "parent.cjs");
    writeFileSync(parentFile, `const { fork } = require('node:child_process');
      const worker = fork(process.argv[2], ['maintain', '--state-dir', process.argv[3], ...(process.argv[4] === 'attached' ? ['--parent-attached'] : [])], { execArgv: [], stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
      worker.on('message', message => { if (message.ready) process.send({ pid: worker.pid }); });
      setInterval(() => {}, 1000);`);
    const parent = fork(parentFile, [cli, f.root, mode], { execArgv: [], env: { ...process.env, SHIELD_SWAP_MCP_PASSWORD: password }, stdio: ["ignore", "ignore", "pipe", "ipc"] });
    let pid: number | undefined;
    try {
      const [message] = await once(parent, "message", { signal: AbortSignal.timeout(5000) });
      pid = message.pid;
      assert.equal(await f.jobs.running(), true);
      const exited = once(parent, "exit"); parent.kill("SIGKILL"); await exited;
      if (mode === "attached") await until(async () => !await f.jobs.running());
      else {
        await new Promise(resolve => setTimeout(resolve, 200));
        assert.equal(await f.jobs.running(), true);
      }
      assert.deepEqual(f.store.get("maintenance-token:saved"), f.saved);
    } finally {
      parent.kill("SIGKILL");
      if (pid) { try { process.kill(pid, "SIGTERM"); } catch {} }
      await until(async () => !await f.jobs.running());
      f.close();
    }
  }
});

test("shutdown during worker startup cannot leave a late worker behind", { timeout: 10000 }, async () => {
  const f = fixture();
  const entry = join(f.root, "starting.cjs");
  const pidFile = join(f.root, "worker.pid");
  writeFileSync(entry, `require('node:fs').writeFileSync(${JSON.stringify(pidFile)}, String(process.pid));
    setTimeout(() => process.send({ ready: true }), 5000);`);
  const worker = new workerModule.MaintainerProcess(f.runtime, entry);
  try {
    const starting = worker.start().catch(() => {});
    await until(async () => existsSync(pidFile));
    const pid = Number(readFileSync(pidFile, "utf8"));
    await worker.stop(); await starting;
    assert.throws(() => process.kill(pid, 0), { code: "ESRCH" });
    assert.equal(await f.jobs.running(), false);
  } finally { await worker.stop(); f.close(); }
});

test("explicit detached mode relinquishes the worker when the MCP server closes", { timeout: 10000 }, async () => {
  const f = fixture();
  const entry = join(f.root, "detached.cjs");
  const pidFile = join(f.root, "worker.pid");
  writeFileSync(entry, `require('node:fs').writeFileSync(${JSON.stringify(pidFile)}, String(process.pid));
    setInterval(() => {}, 1000); process.send({ ready: true });`);
  const worker = new workerModule.MaintainerProcess(f.runtime, entry, "detached");
  let pid: number | undefined;
  try {
    await worker.start();
    pid = Number(readFileSync(pidFile, "utf8"));
    await worker.stop();
    process.kill(pid, 0);
  } finally {
    await worker.stop();
    if (pid) {
      try { process.kill(pid, "SIGTERM"); } catch {}
      await until(async () => { try { process.kill(pid!, 0); return false; } catch { return true; } });
    }
    f.close();
  }
});

test("closing MCP stdin or killing the MCP server stops its attached worker", { timeout: 15000 }, async () => {
  for (const crash of [false, true]) {
    const f = fixture();
    f.store.set("profile:alice", { id: "alice", address: "aleo1test", network: "testnet", key: { type: "env", name: "UNUSED_KEY" },
      policy: { swaps: false, claims: false, bridges: false, inventory: true, inventoryFeeLimit: "100", swapLimits: {}, bridgeLimits: {}, maxSlippageBps: 100 } });
    const client = new Client({ name: "lifetime-test", version: "1" });
    const transport = new StdioClientTransport({ command: process.execPath,
      args: [offlineCli, "serve", "--state-dir", f.root, ...(crash ? ["--maintenance-mode", "attached"] : [])],
      env: { SHIELD_SWAP_MCP_PASSWORD: password, ...(crash ? { SHIELD_SWAP_MCP_MAINTENANCE_MODE: "detached" } : {}) }, stderr: "pipe" });
    transport.stderr?.on("data", () => {});
    try {
      await client.connect(transport);
      const started = await client.callTool({ name: "start_inventory_maintenance", arguments: { profileId: "alice", token: "A", records: 1, minRecordAmount: "1" } });
      assert.equal(started.isError, false);
      assert.equal(await f.jobs.running(), true);
      if (crash) process.kill(transport.pid!, "SIGKILL");
      else await client.close();
      await until(async () => !await f.jobs.running());
      assert.deepEqual(f.store.get("maintenance-token:saved"), f.saved);
    } finally { await client.close(); f.close(); }
  }
});

test("server shutdown force-stops an owned worker that ignores graceful termination", { timeout: 15000 }, async () => {
  const f = fixture();
  const entry = join(f.root, "stubborn.cjs");
  const pidFile = join(f.root, "worker.pid");
  writeFileSync(entry, `require('node:fs').writeFileSync(${JSON.stringify(pidFile)}, String(process.pid));
    process.on('SIGTERM', () => {}); setInterval(() => {}, 1000); process.send({ ready: true });`);
  const worker = new workerModule.MaintainerProcess(f.runtime, entry);
  try {
    await worker.start();
    const pid = Number(readFileSync(pidFile, "utf8"));
    process.kill(pid, 0);
    await worker.stop();
    assert.throws(() => process.kill(pid, 0), { code: "ESRCH" });
  } finally { await worker.stop(); f.close(); }
});

test("a worker with blocked cleanup enforces its own deadline after losing its parent", { timeout: 15000 }, async () => {
  const entry = join(buildRoot, "blocked-cleanup.mjs");
  await build({ stdin: { contents: `import { maintainerShutdown } from ${JSON.stringify(resolve("src/trading/maintenance-process.ts"))};
    maintainerShutdown(true); setInterval(() => {}, 1000); process.send({ ready: true });`, resolveDir: process.cwd(), loader: "ts" },
    outfile: entry, bundle: true, platform: "node", format: "esm", packages: "external", target: "node22" });
  const worker = fork(entry, [], { execArgv: [], stdio: ["ignore", "ignore", "ignore", "ipc"] });
  try {
    await once(worker, "message", { signal: AbortSignal.timeout(5000) });
    const exited = once(worker, "exit");
    worker.disconnect();
    assert.equal((await exited)[0], 1, "unclean shutdown must terminate and preserve uncertain state for later recovery");
  } finally { worker.kill("SIGKILL"); }
});
