import { test } from "node:test";
import { once } from "node:events";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TradingStore } from "../src/trading/store";

test("wallet secrets survive restart encrypted and a wrong password cannot open state", () => {
  const root = mkdtempSync(join(tmpdir(), "shield-trading-"));
  try {
    const first = new TradingStore(root, "test-password-long-enough", true);
    first.set("wallet:alice", { privateKey: "SECRET-TEST-KEY", amount: 9007199254740993n });
    first.close();
    assert.equal(readFileSync(join(root, "state.sqlite")).includes("SECRET-TEST-KEY"), false);
    assert.throws(() => new TradingStore(root, "wrong-password"), /unlock/i);
    const reopened = new TradingStore(root, "test-password-long-enough");
    assert.deepEqual(reopened.get("wallet:alice"), { privateKey: "SECRET-TEST-KEY", amount: 9007199254740993n });
    reopened.close();
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("a failed transaction rolls back quote consumption and operation creation together", () => {
  const root = mkdtempSync(join(tmpdir(), "shield-trading-"));
  const store = new TradingStore(root, "test-password-long-enough", true);
  try {
    store.set("quote:q1", { consumed: false });
    assert.throws(() => store.transaction(() => {
      store.set("quote:q1", { consumed: true });
      store.set("operation:o1", { status: "running" });
      throw new Error("simulated interruption");
    }));
    assert.deepEqual(store.get("quote:q1"), { consumed: false });
    assert.equal(store.get("operation:o1"), undefined);
  } finally { store.close(); rmSync(root, { recursive: true, force: true }); }
});

test("separate sessions cannot operate on the same wallet concurrently", async () => {
  const root = mkdtempSync(join(tmpdir(), "shield-trading-"));
  const first = new TradingStore(root, "test-password-long-enough", true);
  const second = new TradingStore(root, "test-password-long-enough");
  try {
    await first.withLock("testnet:aleo1wallet:shield_swap.aleo", async () => {
      await assert.rejects(second.withLock("testnet:aleo1wallet:shield_swap.aleo", async () => {}), /busy/i);
    });
    await second.withLock("testnet:aleo1wallet:shield_swap.aleo", async () => {});
  } finally { first.close(); second.close(); rmSync(root, { recursive: true, force: true }); }
});


test("closing cannot release a wallet lock while its operation is running", async () => {
  const root = mkdtempSync(join(tmpdir(), "shield-trading-"));
  const first = new TradingStore(root, "test-password-long-enough", true);
  const second = new TradingStore(root, "test-password-long-enough");
  try {
    await first.withLock("wallet", async () => {
      assert.throws(() => first.close(), /active/i);
      await assert.rejects(second.withLock("wallet", async () => {}), /busy/i);
    });
  } finally { first.close(); second.close(); rmSync(root, { recursive: true, force: true }); }
});

test("async transaction callbacks are rejected before they can schedule escaped writes", () => {
  const root = mkdtempSync(join(tmpdir(), "shield-trading-"));
  const store = new TradingStore(root, "test-password-long-enough", true);
  try {
    let called = false;
    assert.throws(() => store.transaction(async () => { called = true; await Promise.resolve(); store.set("escaped", true); }), /synchronous/i);
    assert.equal(called, false);
  } finally { store.close(); rmSync(root, { recursive: true, force: true }); }
});

test("wallet locks exclude another process and are released after a crash", { timeout: 10000 }, async () => {
  const { spawn } = await import("node:child_process");
  const root = mkdtempSync(join(tmpdir(), "shield-process-lock-"));
  const store = new TradingStore(root, "test-password-long-enough", true);
  const script = `
    import { TradingStore } from "./src/trading/store.ts";
    const store = new TradingStore(process.env.TEST_STATE, "test-password-long-enough");
    await store.withLock("wallet", async () => {
      process.stdout.write("locked\\n");
      await new Promise(() => { setInterval(() => {}, 1000); });
    });
  `;
  const child = spawn(process.execPath, ["--import", "tsx", "--input-type=module", "-e", script], { env: { ...process.env, TEST_STATE: root }, stdio: ["ignore", "pipe", "pipe"] });
  const exited = once(child, "exit");
  try {
    const [chunk] = await Promise.race([once(child.stdout, "data"), exited.then(() => { throw new Error("lock child exited before readiness"); })]);
    assert.match(chunk.toString(), /locked/);
    await assert.rejects(store.withLock("wallet", async () => {}), /busy/i);
    child.kill("SIGKILL");
    await exited;
    await store.withLock("wallet", async () => { store.set("after-crash", true); });
    assert.equal(store.get("after-crash"), true);
  } finally { child.kill("SIGKILL"); await exited; store.close(); rmSync(root, { recursive: true, force: true }); }
});
