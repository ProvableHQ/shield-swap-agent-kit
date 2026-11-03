import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { setTimeout as sleep } from "node:timers/promises";
import { TradingRuntime } from "../../src/trading/runtime";
import { TradingStore } from "../../src/trading/store";
import { TradingError, type TradingBackend } from "../../src/trading/types";

const [root, quoteId, order] = process.argv.slice(2);
const store = new TradingStore(root, "test-password-long-enough");
const wait = async (name: string) => {
  const deadline = Date.now() + 10_000;
  while (!existsSync(join(root, name))) {
    if (Date.now() >= deadline) throw Error("Timed out waiting for " + name);
    await sleep(5);
  }
};
const runtime = new TradingRuntime(store, {
  concurrentRecords: true,
  execute: async () => {
    writeFileSync(join(root, "managed-submitted"), "");
    return { status: "uncertain", result: { transactionId: "managed-claim" } };
  },
  quote: async () => { throw Error("Unexpected quote"); },
  read: async () => { throw Error("Unexpected read"); },
  reconcile: async () => { throw Error("Unexpected reconciliation"); },
  resume: async () => { throw Error("Unexpected resume"); },
} satisfies TradingBackend);
try {
  writeFileSync(join(root, "competitor-ready"), "");
  if (order === "legacy-first") {
    await wait("legacy-starting");
    // Probe the writer lock without waiting: the parent is deliberately paused
    // at the running write. A busy lock means registration must wait for commit.
    const probe = new DatabaseSync(join(root, "state.sqlite"));
    let blocked = false;
    try { probe.exec("BEGIN IMMEDIATE; ROLLBACK;"); }
    catch (error) {
      if (!/locked|busy/i.test(String(error))) throw error;
      blocked = true;
    } finally { probe.close(); }
    if (blocked) {
      writeFileSync(join(root, "competitor-attempted"), "");
      await wait("legacy-finished");
    }
  }
  try {
    await runtime.execute(quoteId, "managed-claim");
    await runtime.drain();
    writeFileSync(join(root, "competitor-result"), "submitted");
  } catch (error) {
    if (!(error instanceof TradingError)) throw error;
    writeFileSync(join(root, "competitor-result"), error.code);
  }
  writeFileSync(join(root, "competitor-attempted"), "");
} finally { await runtime.drain(); store.close(); }
