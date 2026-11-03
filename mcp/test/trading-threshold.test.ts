import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import type { RecordSpend } from "@provablehq/veil-core";
import { TradingStore } from "../src/trading/store";
import { TradingRuntime } from "../src/trading/runtime";
import { InventoryMaintenance } from "../src/trading/maintenance";
import { createRecordInventoryStore } from "../src/trading/inventory";
import type { Profile, TradingBackend } from "../src/trading/types";

const scope = JSON.stringify(["aleo:testnet", "aleo1test"]);
const entry = (records: string[], account = scope): Omit<RecordSpend, "id"> => ({
  scope: account, records, program: "shield_swap.aleo", function: "swap", status: "reserved", createdAt: Date.now(), accountType: "local",
});
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "inventory-threshold-"));
  const store = new TradingStore(root, "test-password-long-enough", true);
  const writer = new TradingStore(root, "test-password-long-enough");
  store.set("profile:alice", { id: "alice", network: "testnet", address: "aleo1test", key: { type: "env", name: "KEY" },
    policy: { inventory: true } } as Profile);
  const state = { count: 10, reads: 0, plans: [] as number[], reserved: [] as { id: string; amount: string }[],
    execute: undefined as undefined | (() => Promise<void>), fail: false, read: undefined as undefined | (() => Promise<void>) };
  const backend: TradingBackend = {
    concurrentRecords: true,
    read: async () => {
      state.reads++;
      const available = Array.from({ length: state.count }, (_, i) => ({ id: `${i + 1}group`, amount: "1000000" }));
      await state.read?.();
      // Deliberately stale reservation exclusions, as a scanner read can race acquire().
      return { token: { id: "A", decimals: 6 }, asset: { program: "a.aleo" }, available, reserved: state.reserved };
    },
    quote: async (_kind, _profile, input) => {
      state.plans.push(Number(input.records));
      return { plan: {}, summary: { asset: "a.aleo", stepCount: 1 } };
    },
    execute: async () => { await state.execute?.(); return { status: state.fail ? "failed" : "complete", result: {} }; },
    reconcile: async () => ({ status: "complete", result: {} }),
    resume: async () => { throw Error("Unexpected resume"); },
  };
  const runtime = new TradingRuntime(store, backend), jobs = new InventoryMaintenance(runtime);
  return { store, writer, runtime, jobs, state, close: async () => {
    await runtime.drain(); writer.close(); store.close(); rmSync(root, { recursive: true, force: true });
  } };
}
async function until(predicate: () => boolean) {
  const deadline = Date.now() + 3000;
  while (!predicate() && Date.now() < deadline) await sleep(10);
  assert.ok(predicate(), "worker should react before the 24-hour fallback check");
}

test("replenishment starts at the low threshold and continues toward the higher target", async () => {
  const f = fixture();
  try {
    const job = await f.jobs.start("alice", { token: "A", records: 10, replenishThreshold: 3, minRecordAmount: "1" });
    f.state.count = 6;
    await f.jobs.check(job.id);
    assert.deepEqual(f.state.plans, [], "being below the target alone must not trigger replenishment");
    f.state.count = 3;
    await f.jobs.check(job.id); await f.runtime.drain();
    assert.deepEqual(f.state.plans, [10]);
    await f.jobs.check(job.id); // Observe the original operation's completion.
    f.state.count = 6;
    await f.jobs.check(job.id); await f.runtime.drain();
    assert.deepEqual(f.state.plans, [10, 10], "a partially restored inventory still needs the full target");
    await f.jobs.check(job.id);
    f.state.count = 10;
    await f.jobs.check(job.id);
    f.state.count = 6;
    await f.jobs.check(job.id);
    assert.equal(f.state.plans.length, 2, "reaching the target rearms the low threshold");
  } finally { await f.close(); }
});

test("records released during the scan count toward available inventory", async () => {
  const f = fixture();
  try {
    const job = await f.jobs.start("alice", { token: "A", records: 10, replenishThreshold: 3, minRecordAmount: "1" });
    const journal = createRecordInventoryStore(f.writer);
    const held = await journal.acquire(entry(["3group", "4group", "5group", "6group"]));
    f.state.count = 2;
    f.state.reserved = ["3group", "4group", "5group", "6group"].map(id => ({ id, amount: "1000000" }));
    f.state.read = () => journal.update(scope, held!.id, { status: "cancelled" });
    await f.jobs.check(job.id);
    assert.equal(f.jobs.get(job.id)?.coveringRecords, 6);
    assert.deepEqual(f.state.plans, [], "six available records are above the trigger of three");
  } finally { await f.close(); }
});

test("a failed refill backs off even when cancelling its inputs wakes maintenance", async () => {
  const f = fixture(), controller = new AbortController();
  let running: Promise<void> | undefined;
  try {
    f.state.count = 2; f.state.fail = true;
    const journal = createRecordInventoryStore(f.writer);
    f.state.execute = async () => {
      const held = await journal.acquire(entry(["1group"]));
      await journal.update(scope, held!.id, { status: "cancelled" });
    };
    const job = await f.jobs.start("alice", { token: "A", records: 10, replenishThreshold: 3, minRecordAmount: "1", intervalSeconds: 120 });
    await f.jobs.check(job.id); await f.runtime.drain();
    await f.jobs.check(job.id);
    const failed = f.jobs.get(job.id)!;
    assert.ok(failed.nextCheckAt > Date.now() + 100_000, "failure should preserve the retry interval");
    assert.ok((failed.retryAfter ?? 0) > Date.now() + 100_000);
    await journal.acquire(entry(["2group"]));
    running = f.jobs.run(controller.signal);
    await sleep(100);
    assert.equal(f.state.plans.length, 1);
  } finally { controller.abort(); await running; await f.close(); }
});

test("a contended token lock does not spin the dispatcher", async () => {
  const f = fixture(), controller = new AbortController();
  let running: Promise<void> | undefined, release!: () => void;
  const blocked = new Promise<void>(resolve => release = resolve);
  try {
    const job = await f.jobs.start("alice", { token: "A", records: 10, replenishThreshold: 3, minRecordAmount: "1" });
    const holder = f.writer.withLock("maintenance-token:" + job.id, () => blocked);
    let checks = 0;
    const check = f.jobs.check.bind(f.jobs);
    f.jobs.check = async id => { checks++; if (checks === 20) controller.abort(); return check(id); };
    running = f.jobs.run(controller.signal);
    await sleep(100);
    assert.ok(checks <= 2, `contended work should yield, saw ${checks} checks`);
    release(); await holder;
  } finally { release(); controller.abort(); await running; await f.close(); }
});

test("thresholds must leave room between the trigger and refill target", async () => {
  const f = fixture();
  try {
    for (const replenishThreshold of [-1, 2, 3, 0.5]) {
      await assert.rejects(f.jobs.start("alice", { token: "A", records: 2, replenishThreshold, minRecordAmount: "1" }), /threshold/i);
    }
  } finally { await f.close(); }
});

test("reservations from another connection wake maintenance and exclude records immediately", async () => {
  const f = fixture(), controller = new AbortController();
  let running: Promise<void> | undefined;
  try {
    f.state.count = 5;
    const job = await f.jobs.start("alice", { token: "A", records: 5, replenishThreshold: 2, minRecordAmount: "1", intervalSeconds: 86400 });
    await f.jobs.check(job.id);
    running = f.jobs.run(controller.signal);
    const journal = createRecordInventoryStore(f.writer);
    await journal.acquire(entry(["1group", "2group", "3group"]));
    await until(() => f.state.plans.length === 1);
    assert.equal(f.jobs.get(job.id)?.coveringRecords, 2);
    assert.deepEqual(f.state.plans, [5]);
  } finally { controller.abort(); await running; await f.close(); }
});

test("failed reservations wake a restarted worker without inventing journal spends", async () => {
  const f = fixture(), controller = new AbortController();
  let running: Promise<void> | undefined;
  try {
    const journal = createRecordInventoryStore(f.writer);
    await journal.acquire(entry(["1group"]));
    const job = await f.jobs.start("alice", { token: "A", records: 10, replenishThreshold: 2, minRecordAmount: "1", intervalSeconds: 86400 });
    await f.jobs.check(job.id);
    const reads = f.state.reads;
    assert.equal(await journal.acquire(entry(["1group"])), undefined);
    assert.equal((await journal.list(scope)).length, 1, "failure must not pretend to hold another reservation");
    running = f.jobs.run(controller.signal);
    await until(() => f.jobs.get(job.id)?.reservationFailures === 1);
    assert.ok(f.state.reads > reads);
    assert.equal(f.state.plans.length, 0, "contention alone is not a reason to spend on a rebalance");
  } finally { controller.abort(); await running; await f.close(); }
});

test("activity arriving during a check remains pending and other accounts cannot trigger it", async () => {
  const f = fixture(), controller = new AbortController();
  let running: Promise<void> | undefined;
  let release!: () => void;
  const block = new Promise<void>(resolve => release = resolve);
  try {
    const job = await f.jobs.start("alice", { token: "A", records: 10, replenishThreshold: 2, minRecordAmount: "1", intervalSeconds: 86400 });
    await f.jobs.check(job.id);
    const journal = createRecordInventoryStore(f.writer);
    await journal.acquire(entry(["1group"], JSON.stringify(["aleo:testnet", "aleo1other"])));
    const reads = f.state.reads;
    running = f.jobs.run(controller.signal);
    await sleep(1100);
    assert.equal(f.state.reads, reads);
    f.state.read = () => block;
    await journal.acquire(entry(["1group"]));
    await until(() => f.state.reads > reads);
    assert.equal(f.jobs.get(job.id)?.observedActivityVersion ?? 0, 0, "a crash during the read must leave its wakeup unacknowledged");
    await journal.acquire(entry(["2group"]));
    f.state.read = undefined; release();
    await until(() => f.state.reads > reads + 1);
    assert.equal(f.state.plans.length, 0);
  } finally { release(); controller.abort(); await running; await f.close(); }
});
