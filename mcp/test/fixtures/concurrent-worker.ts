import { TradingStore } from "../../src/trading/store";
import { coordinateSession } from "../../src/trading/managed-session";
import { TradingRuntime } from "../../src/trading/runtime";
import { createRecordInventoryStore } from "../../src/trading/inventory";
import type { AleoSession } from "../../src/trading/session";
import type { BlindedIdentityRecord } from "@provablehq/shield-swap-sdk";
import type { Profile, TradingBackend } from "../../src/trading/types";

const [root, label] = process.argv.slice(2);
const store = new TradingStore(root, "test-password-long-enough");
const profile = store.get<Profile>("profile:" + label)!;
const records = createRecordInventoryStore(store);
const scope = JSON.stringify(["aleo:testnet", profile.address]);
const key = "test-identities";
const identities = { load: async () => store.get<BlindedIdentityRecord[]>(key) ?? [], save: async (rows: BlindedIdentityRecord[]) => store.set(key, rows) };
const delay = () => new Promise(resolve => setTimeout(resolve, 40));
let proceed!: () => void;
const gate = new Promise<void>(resolve => proceed = resolve);
process.on("message", message => { if (message === "finish") proceed(); });
const client = {
  reserveBlindedIdentity: async () => {
    const rows = await identities.load(); await delay();
    const counter = rows.length;
    const row = { counter, blindedAddress: "identity:" + counter, blindingFactor: "private", status: "reserved" } as BlindedIdentityRecord;
    await identities.save([...rows, row]); return row;
  },
  recordBlindedSwap: async ({ handle }: { handle: { blindedAddress: string } }) => {
    const rows = await identities.load(); await delay();
    await identities.save(rows.map(row => row.blindedAddress === handle.blindedAddress ? { ...row, status: "swapped", swapId: label } : row)); return true;
  },
  swap: async ({ blindedIdentity }: { blindedIdentity: BlindedIdentityRecord }) => {
    let reservation;
    for (const nonce of ["first", "second"]) {
      reservation = await records.acquire({ scope, records: [nonce], program: "token.aleo", function: "swap", status: "reserved", createdAt: Date.now(), accountType: "local" });
      if (reservation) break;
    }
    if (!reservation) throw Error("No record");
    process.send?.({ phase: "proving", counter: blindedIdentity.counter, record: reservation.records[0], owner: (reservation as { operationId?: string }).operationId });
    await gate;
    return { swapId: label, transactionId: "at1" + label, blindedAddress: blindedIdentity.blindedAddress };
  },
  claimSwapOutput: async () => ({}), syncBlindedIdentities: async () => [], getUnclaimedSwaps: async () => ({}), reconcileSwapHistory: async () => ({}),
};
const session = coordinateSession(store, profile, { client, identities } as unknown as AleoSession);
const backend: TradingBackend = {
  concurrentRecords: true,
  quote: async () => ({ plan: {}, summary: { tokenIn: "A", amountIn: label === "a" ? "11" : "23", minOut: "1", slippageBps: 10 } }),
  execute: async () => { const handle = await session.client.swap({ quote: {} } as never); return { status: "pending", result: { swapId: handle.swapId } }; },
  reconcile: async () => { throw Error("Live operation must not reconcile"); }, read: async () => ({}), resume: async () => { throw Error("No resume"); },
};
const runtime = new TradingRuntime(store, backend);
const quote = await runtime.quote("swap", label, {});
const op = await runtime.execute(String(quote.quoteId), label);
await runtime.drain();
process.send?.({ phase: "done", operationId: op.operationId });
store.close(); process.disconnect();
