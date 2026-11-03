import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getUnclaimedSwaps, type BlindedIdentityRecord } from "@provablehq/shield-swap-sdk";
import { coordinateSession } from "../src/trading/managed-session";
import type { AleoSession } from "../src/trading/session";
import { TradingStore } from "../src/trading/store";
import type { Profile } from "../src/trading/types";

test("a stalled SDK unclaimed scan permits identity allocation and claim bookkeeping without losing updates", { timeout: 10000 }, async () => {
  const root = mkdtempSync(join(tmpdir(), "unclaimed-scan-"));
  const reader = new TradingStore(root, "test-password-long-enough", true);
  const writer = new TradingStore(root, "test-password-long-enough");
  const profile = { id: "alice", network: "testnet", address: "aleo1test" } as Profile;
  reader.set("test-identities", [{ counter: 0, blindedAddress: "old", blindingFactor: "private", status: "swapped", swapId: "one" }]);
  let release!: () => void, entered!: () => void;
  const gate = new Promise<void>(resolve => release = resolve);
  const scanning = new Promise<void>(resolve => entered = resolve);
  const makeSession = (store: TradingStore, scan = false) => {
    const identities = {
      load: async () => store.get<BlindedIdentityRecord[]>("test-identities")!,
      save: async (rows: BlindedIdentityRecord[]) => store.set("test-identities", rows),
    };
    const client = {
      request: async () => { if (scan) { entered(); await gate; } return null; },
      getUnclaimedSwaps: () => getUnclaimedSwaps(client as never, { store: identities }),
      reserveBlindedIdentity: async () => {
        const rows = await identities.load();
        await new Promise(resolve => setImmediate(resolve));
        const row = { counter: rows.length, blindedAddress: "new", blindingFactor: "private", status: "reserved" } as BlindedIdentityRecord;
        await identities.save([...rows, row]); return row;
      },
      claimSwapOutput: async () => ({}),
      recordBlindedSwap: async () => true,
      swap: async () => ({}),
      syncBlindedIdentities: async () => [],
      reconcileSwapHistory: async () => ({}),
    };
    return coordinateSession(store, profile, { client, identities } as unknown as AleoSession);
  };
  const readSession = makeSession(reader, true), writeSession = makeSession(writer);
  const scan = readSession.client.getUnclaimedSwaps();
  let writes: Promise<unknown> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await scanning;
    writes = Promise.all([
      writeSession.client.reserveBlindedIdentity(),
      writeSession.client.claimSwapOutput({ handle: { blindedAddress: "old" } } as never),
    ]);
    const progressed = await Promise.race([
      writes.then(() => true),
      new Promise<boolean>(resolve => { timer = setTimeout(() => resolve(false), 1000); }),
    ]);
    assert.equal(progressed, true, "writers must complete before the unrelated network scan is released");
    release(); await scan;
    const rows = await readSession.identities.load();
    assert.deepEqual(rows.map(row => [row.counter, row.status]), [[0, "claimed"], [1, "reserved"]],
      "writer locks preserve concurrent updates and the SDK scan must not overwrite them");
  } finally {
    clearTimeout(timer); release(); await scan; await writes;
    writer.close(); reader.close(); rmSync(root, { recursive: true, force: true });
  }
});
