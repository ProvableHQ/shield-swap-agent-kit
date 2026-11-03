// Run with tsx from this package, against an independently installed CLI.
// Only fixture seeding uses source TradingStore; recovery runs in the installed process.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { loadNetwork } from "@provablehq/veil-aleo-sdk";
import { TradingStore } from "../src/trading/store";
import { createRecordInventoryStore } from "../src/trading/inventory";
import { operationContext } from "../src/trading/ownership";
import { walletScope } from "../src/trading/session";
import type { Operation, Profile } from "../src/trading/types";

const installed = realpathSync(resolve(process.argv[2], "node_modules/@provablehq/shield-swap-mcp"));
assert.ok(!installed.startsWith(realpathSync(process.cwd()) + "/"), "Use an independent installed package");
const entry = join(installed, "dist/cli.js");
const root = mkdtempSync(join(tmpdir(), "installed-background-recovery-"));
const password = "temporary-installed-recovery-password";
const store = new TradingStore(root, password, true);
const sdk = await loadNetwork("testnet");
let hold = true, open = 0, writes = 0;
const requests = new Map<string, number>();
const server = createServer((req, res) => {
  const id = req.url!.split("/").at(-1)!;
  requests.set(id, (requests.get(id) ?? 0) + 1);
  if (req.method !== "GET") writes++;
  if (id === "at1slow" && hold) {
    open++; res.once("close", () => open--);
    res.writeHead(200, { "Content-Type": "application/json" }); res.write('{"status":');
  } else res.end(JSON.stringify({ status: "rejected", transaction: { id: "at1fee" } }));
}).listen(0, "127.0.0.1");
await once(server, "listening");
const url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
const profiles = ["alice", "bob"].map(id => {
  const account = sdk.generateAccount();
  store.set("secret:" + id, account.privateKey);
  const profile: Profile = { id, address: account.address, network: "testnet", networkUrl: url, apiUrl: url,
    key: { type: "stored", id }, policy: { swaps: false, claims: false, bridges: false, maxSlippageBps: 100, swapLimits: {}, bridgeLimits: {} } };
  store.set("profile:" + id, profile); return profile;
});
const journal = createRecordInventoryStore(store), scope = JSON.stringify(["aleo:testnet", profiles[0].address]);
for (let id = 0; id < 10; id++) {
  const owner = profiles[id < 8 ? 0 : 1], transactionId = id === 0 ? "at1slow" : "at1known" + id;
  store.set("quote:" + id, { id: String(id), kind: "swap", profile: owner, scope: walletScope(owner), createdAt: 0, expiresAt: 1, plan: {}, summary: {} });
  store.set("operation:" + id, { id: String(id), kind: "swap", profileId: owner.id, scope: walletScope(owner), quoteId: String(id), requestKey: String(id),
    status: "uncertain", createdAt: id, updatedAt: id, managedRecords: true, result: {}, checkpoint: { phase: "submitting", transactionId } });
}
await operationContext.run({ operationId: "0" }, () => journal.acquire({ scope, records: ["reserved-input"], program: "shield_swap.aleo", function: "swap",
  createdAt: 0, accountType: "local", status: "prepared", transactionId: "at1slow", transaction: { proof: "fixture-proof" } as never }));
const original = store.get("operation:0"), proof = await journal.list(scope);
const children: ReturnType<typeof spawn>[] = [];
function start() {
  const child = spawn(process.execPath, [entry, "serve", "--state-dir", root], {
    cwd: installed, env: { PATH: process.env.PATH, HOME: process.env.HOME, SHIELD_SWAP_MCP_PASSWORD: password }, stdio: ["pipe", "pipe", "pipe"],
  });
  children.push(child); return child;
}
async function until(condition: () => boolean, timeoutMs = 25000) {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    assert.ok(children.at(-1)?.exitCode === null, "Installed CLI exited unexpectedly");
    assert.ok(Date.now() < deadline, "Installed background recovery did not progress");
    await sleep(20);
  }
}
async function stop(child: ReturnType<typeof spawn>) {
  const start = performance.now(), exit = once(child, "exit");
  child.kill("SIGTERM");
  const fail = setTimeout(() => child.kill("SIGKILL"), 5000);
  try { assert.deepEqual(await exit, [0, null], "CLI must shut down gracefully"); }
  finally { clearTimeout(fail); }
  return Math.round(performance.now() - start);
}
try {
  const first = start();
  await until(() => store.get<Operation>("operation:8")?.status === "failed" && store.get<Operation>("operation:9")?.status === "failed");
  assert.equal(open, 1, "Alice's body is still stalled when Bob finishes");
  assert.equal(requests.get("at1slow"), 1, "Do not duplicate an in-flight ID");
  assert.deepEqual(store.get("operation:0"), original);
  const shutdownMs = await stop(first);
  assert.deepEqual(await journal.list(scope), proof, "Shutdown preserves the unresolved proof and reservation");
  await store.withLock("operation:0", async () => {});
  assert.equal(open, 0, "Shutdown cancels the actual HTTP body");
  hold = false;
  const second = start();
  await until(() => store.get<Operation>("operation:0")?.status === "failed");
  const settled = (await journal.list(scope))[0];
  assert.equal(settled.status, "rejected"); assert.equal(settled.transaction, undefined);
  await stop(second);
  assert.equal(writes, 0, "Recovery must never submit a transaction");
  console.log(JSON.stringify({ result: "passed", installed, healthyOperations: 9, shutdownMs, stalledRequestCancelled: true,
    unresolvedProofPreserved: true, restartReconciledOriginal: true, writeRequests: writes }));
} finally {
  for (const child of children) if (child.exitCode === null && child.signalCode === null) { const exit = once(child, "exit"); child.kill("SIGKILL"); await exit; }
  server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
  store.close(); rmSync(root, { recursive: true, force: true });
}
