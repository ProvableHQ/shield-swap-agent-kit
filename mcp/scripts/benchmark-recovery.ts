// Controlled scheduler comparison, not a network throughput benchmark.
// Run: node --import tsx scripts/benchmark-recovery.ts
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { setTimeout as sleep } from "node:timers/promises";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TradingStore } from "../src/trading/store";
import { TradingRuntime } from "../src/trading/runtime";
import { OperationRecovery } from "../src/trading/recovery";
import { recoveryFetch } from "../src/trading/recovery-context";
import type { Operation, Profile, TradingBackend } from "../src/trading/types";

const profile = { id: "alice", network: "testnet", address: "aleo1test" } as Profile;
async function measure(mode: "batch" | "independent", stallMs: number) {
  const root = mkdtempSync(join(tmpdir(), "recovery-benchmark-"));
  const store = new TradingStore(root, "temporary-benchmark-password", true);
  let active = 0, peak = 0, requests = 0;
  const server = createServer((req, res) => {
    active++; requests++; peak = Math.max(peak, active);
    res.once("close", () => active--);
    setTimeout(() => res.end(JSON.stringify({ ok: true, payload: "x".repeat(16_384) })), req.url === "/0" ? stallMs : 20);
  }).listen(0, "127.0.0.1");
  await once(server, "listening");
  const url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  for (let id = 0; id < 10; id++) {
    const owner = id < 8 ? profile : { ...profile, id: "bob", address: "aleo1bob" };
    store.set("quote:" + id, { id: String(id), kind: "swap", profile: owner });
    store.set("operation:" + id, { id: String(id), quoteId: String(id), profileId: owner.id,
      kind: "swap", status: "uncertain", createdAt: id, updatedAt: id, result: {}, managedRecords: true });
  }
  const completed = new Map<string, number>();
  let start = 0;
  const runtime = new TradingRuntime(store, { reconcile: async (_quote, op) => {
    const response = await (mode === "batch" ? fetch : recoveryFetch)(url + "/" + op.id);
    assert.equal((await response.json()).ok, true);
    completed.set(op.id, performance.now() - start);
    return { status: "complete", result: {} };
  } } as TradingBackend);
  const recovery = new OperationRecovery(runtime);
  let batch: Promise<void> | undefined;
  const attempts = new Map<string, number>();
  // Prior head fcf9363: eight-operation allSettled barrier plus the CLI guard.
  const tick = () => {
    if (mode === "independent") return recovery.tick();
    if (batch) return;
    const pending = store.list<Operation>("operation:").filter(op => !["complete", "failed"].includes(op.status));
    const selected = pending.sort((a, b) => (attempts.get(a.id) ?? 0) - (attempts.get(b.id) ?? 0) || a.updatedAt - b.updatedAt).slice(0, 8);
    for (const op of selected) attempts.set(op.id, Date.now());
    batch = Promise.allSettled(selected.map(op => runtime.status(op.id))).then(() => {}).finally(() => { batch = undefined; });
  };
  // Both modes get the same 5ms ticks to isolate the barrier from the production
  // 15s interval. The new scheduler also refills on completion as in production.
  start = performance.now(); tick();
  const timer = setInterval(tick, 5);
  try {
    while (completed.size < 10 && performance.now() - start < 5000) await sleep(5);
    assert.equal(completed.size, 10); assert.equal(requests, 10); assert.ok(peak <= 8);
    return { bobMs: Math.max(completed.get("8")!, completed.get("9")!), allMs: Math.max(...completed.values()), peak, requests };
  } finally {
    clearInterval(timer); await batch; await recovery.stop();
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
    store.close(); rmSync(root, { recursive: true, force: true });
  }
}
const median = (values: number[]) => Math.round(values.sort((a, b) => a - b)[Math.floor(values.length / 2)] * 10) / 10;
// Warm native fetch and SQLite paths before taking five alternating samples.
await measure("batch", 20); await measure("independent", 20);
for (const [scenario, stallMs] of [["healthy", 20], ["one_500ms_stall", 500]] as const) {
  const samples: Record<string, Awaited<ReturnType<typeof measure>>[]> = { batch: [], independent: [] };
  for (let i = 0; i < 5; i++) for (const mode of (i % 2 ? ["independent", "batch"] : ["batch", "independent"]) as ("batch" | "independent")[])
    samples[mode].push(await measure(mode, stallMs));
  const summary = Object.fromEntries(Object.entries(samples).map(([mode, rows]) => [mode, {
    bobMedianMs: median(rows.map(row => row.bobMs)), allMedianMs: median(rows.map(row => row.allMs)), maxConcurrentRequests: Math.max(...rows.map(row => row.peak)), requestsPerRun: rows[0].requests,
  }]));
  console.log(JSON.stringify({ scenario, samplesPerMode: 5, summary, samples }));
}
