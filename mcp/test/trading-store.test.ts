import { test } from "node:test";
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
