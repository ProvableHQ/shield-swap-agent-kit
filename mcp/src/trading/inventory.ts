import { createHash } from "node:crypto";
import type { RecordInventoryStore, RecordSpend } from "@provablehq/veil-core";
import { TradingStore } from "./store";

// Journal entries hold record nonces, lifecycle status and the proved
// transaction while it is pending; never plaintext records or keys. They are
// encrypted like every other document and share the state file's SQLite
// write lock, so acquisition is atomic across MCP processes.
const key = (scope: string) => "inventory:" + createHash("sha256").update(scope).digest("hex") + ":";
const sequence = (scope: string) => "inventory-seq:" + createHash("sha256").update(scope).digest("hex");

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
    list: async scope => read(scope),
    acquire: async entry => store.transaction(() => {
      if (new Set(entry.records).size !== entry.records.length) throw new Error("Duplicate record inputs");
      const held = new Set(read(entry.scope).flatMap(heldRecordIds));
      if (entry.records.some(id => held.has(id))) return undefined;
      const next = (store.get<number>(sequence(entry.scope)) ?? 0) + 1;
      store.set(sequence(entry.scope), next);
      const saved: RecordSpend = { ...entry, id: String(next) };
      store.set(key(entry.scope) + saved.id, saved);
      return saved;
    }),
    update: async (scope, id, patch) => store.transaction(() => {
      const current = store.get<RecordSpend>(key(scope) + id);
      if (!current) throw new Error("Unknown record reservation");
      const updated: RecordSpend = { ...current, ...patch };
      // JSON omits undefined; drop fields the SDK clears explicitly.
      for (const field of Object.keys(patch) as (keyof typeof patch)[]) if (patch[field] === undefined) delete updated[field];
      store.set(key(scope) + id, updated);
    }),
  };
}
