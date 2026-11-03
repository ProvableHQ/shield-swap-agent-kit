import { createHash } from "node:crypto";
import type { RecordInventoryStore, RecordSpend } from "@provablehq/veil-core";
import { inventoryContext, operationContext, journalContext } from "./ownership";
import { TradingStore } from "./store";
import type { Profile } from "./types";

// Journal entries hold record nonces, lifecycle status and the proved
// transaction while it is pending; never plaintext records or keys. They are
// encrypted like every other document and share the state file's SQLite
// write lock, so acquisition is atomic across MCP processes.
export type OwnedRecordSpend = RecordSpend & { operationId?: string };
const key = (scope: string) => "inventory:" + createHash("sha256").update(scope).digest("hex") + ":";
const sequence = (scope: string) => "inventory-seq:" + createHash("sha256").update(scope).digest("hex");
const activityKey = (scope: string) => "inventory-activity:" + createHash("sha256").update(scope).digest("hex");

// Matches the SDK scope for the chainId configured in createSessionFactory.
export const inventoryScope = (profile: { network: string; address: string }): string => JSON.stringify(["aleo:" + profile.network, profile.address]);
type InventoryActivity = { version: number; reservationFailures: number; shortages: number; lastFailureAt?: number };
export function inventoryActivity(store: TradingStore, scope: string): InventoryActivity {
  return store.get<InventoryActivity>(activityKey(scope)) ?? { version: 0, reservationFailures: 0, shortages: 0 };
}
// Call inside the same transaction as the journal change. A bounded, encrypted
// activity summary preserves wakeups without adding fake spends to the SDK journal.
function recordActivity(store: TradingStore, scope: string, failure?: "reservationFailures" | "shortages"): void {
  const current = inventoryActivity(store, scope);
  store.set(activityKey(scope), { ...current, version: current.version + 1,
    ...(failure ? { [failure]: current[failure] + 1, lastFailureAt: Date.now() } : {}) });
}
export function recordInventoryShortage(store: TradingStore, profile: Profile): void {
  store.transaction(() => recordActivity(store, inventoryScope(profile), "shortages"));
}
export function heldInventoryRecords(store: TradingStore, scope: string): Set<string> {
  // Unlike SDK recovery's owner-filtered list(), counts always cover all writers.
  return new Set(store.list<RecordSpend>(key(scope)).flatMap(heldRecordIds));
}

/** Mirrors the SDK's release rules: rejected executions keep only a charged fee record; cancelled entries hold nothing. */
function heldRecordIds(entry: RecordSpend): string[] {
  if (entry.status === "cancelled") return [];
  if (entry.status === "rejected") return entry.feeRecordId ? [entry.feeRecordId] : [];
  return entry.records;
}

export function createRecordInventoryStore(store: TradingStore): RecordInventoryStore {
  const read = (scope: string): RecordSpend[] =>
    store.list<RecordSpend>(key(scope)).sort((a, b) => Number(a.id) - Number(b.id));
  return {
    list: async scope => {
      const filter = journalContext.getStore();
      return read(scope).filter(entry => !filter || (entry as OwnedRecordSpend).operationId === filter.owner);
    },
    acquire: async entry => store.transaction(() => {
      if (new Set(entry.records).size !== entry.records.length) throw new Error("Duplicate record inputs");
      const held = new Set(read(entry.scope).flatMap(heldRecordIds));
      if (entry.records.some(id => held.has(id))) {
        recordActivity(store, entry.scope, "reservationFailures");
        return undefined;
      }
      const next = (store.get<number>(sequence(entry.scope)) ?? 0) + 1;
      store.set(sequence(entry.scope), next);
      const saved: OwnedRecordSpend = { ...entry, id: String(next), operationId: operationContext.getStore()?.operationId };
      store.set(key(entry.scope) + saved.id, saved);
      recordActivity(store, entry.scope);
      return saved;
    }),
    update: async (scope, id, patch) => {
      const updated = store.transaction(() => {
        const current = store.get<OwnedRecordSpend>(key(scope) + id);
        if (!current) throw new Error("Unknown record reservation");
        const updated: OwnedRecordSpend = { ...current, ...patch };
        // JSON omits undefined; drop fields the SDK clears explicitly.
        for (const field of Object.keys(patch) as (keyof typeof patch)[]) if (patch[field] === undefined) delete updated[field];
        store.set(key(scope) + id, updated);
        if (patch.status && patch.status !== current.status && ["confirmed", "cancelled", "rejected"].includes(patch.status)) recordActivity(store, scope);
        return updated;
      });
      // Inventory uses writeContract/buildTransaction, while swaps use
      // executeContract/execute. Both persist here before broadcasting. Observe
      // only this operation's writes, after its proof has committed durably.
      const active = operationContext.getStore();
      if (active && updated.operationId === active.operationId) {
        if (patch.status === "prepared" && updated.transactionId) inventoryContext.getStore()?.prepared(updated.transactionId);
        if (patch.status === "submitted") active.submitted?.();
      }
    },
  };
}
