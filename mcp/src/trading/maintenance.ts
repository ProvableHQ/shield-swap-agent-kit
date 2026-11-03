import { createHash, randomUUID } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import { parseUnits } from "@provablehq/shield-swap-sdk";
import { TradingRuntime } from "./runtime";
import { LockBusyError } from "./store";
import { TradingError, type Operation, type SavedQuote, type Summary } from "./types";

export type MaintenanceTarget = { token: string; records: number; minRecordAmount: string; intervalSeconds?: number };
export type MaintenanceState = {
  id: string; profileId: string; network: string; address: string; asset: string; token: string;
  enabled: boolean; revision: string; target: MaintenanceTarget; nextCheckAt: number;
  coveringRecords?: number; checkedAt?: number; activeOperationId?: string; operationStatus?: string; lastError?: string;
};
const terminal = new Set(["complete", "failed"]);
export class InventoryMaintenance {
  constructor(private readonly runtime: TradingRuntime) {}
  get(id: string): MaintenanceState | undefined { return this.runtime.store.get("maintenance-token:" + id); }
  list(): MaintenanceState[] { return this.runtime.store.list("maintenance-token:"); }
  private save(id: string, patch: Partial<MaintenanceState>): MaintenanceState {
    return this.runtime.store.transaction(() => {
      const state = this.get(id);
      if (!state) throw new TradingError("maintenance_missing", "Inventory maintenance job was not found.");
      const next = { ...state, ...patch };
      this.runtime.store.set("maintenance-token:" + id, next);
      return next;
    });
  }
  async start(profileId: string, target: MaintenanceTarget): Promise<MaintenanceState> {
    const profile = this.runtime.profile(profileId);
    if (!profile.policy.inventory || !/^\d+$/.test(profile.policy.inventoryFeeLimit ?? "") || BigInt(profile.policy.inventoryFeeLimit!) <= 0n)
      throw new TradingError("permission_required", "Configure inventory permission and a positive per-operation fee limit in the terminal first.");
    const intervalSeconds = target.intervalSeconds ?? 120;
    if (!Number.isInteger(target.records) || target.records < 1 || target.records > 1000 || !Number.isInteger(intervalSeconds) || intervalSeconds < 10 || intervalSeconds > 86400)
      throw new TradingError("invalid_target", "Use 1 to 1000 records and an interval of 10 to 86400 seconds.");
    const inventory = await this.runtime.read("get_record_inventory", profileId, { token: target.token });
    const token = inventory.token as { id: string; decimals: number };
    if (!/^(0|[1-9][0-9]*)(\.[0-9]+)?$/.test(target.minRecordAmount) || parseUnits(target.minRecordAmount, token.decimals) <= 0n)
      throw new TradingError("invalid_target", "The minimum covering amount must be a positive token amount.");
    const asset = (inventory.asset as { program: string }).program;
    const id = createHash("sha256").update(JSON.stringify([profile.network, profile.address, asset])).digest("hex");
    return this.runtime.store.transaction(() => {
      const state: MaintenanceState = { ...this.get(id), id, profileId, network: profile.network, address: profile.address, token: token.id, asset,
        enabled: true, revision: randomUUID(), target: { ...target, token: token.id, intervalSeconds }, nextCheckAt: 0 };
      this.runtime.store.set("maintenance-token:" + id, state);
      return state;
    });
  }
  stop(id: string): MaintenanceState { return this.save(id, { enabled: false, revision: randomUUID(), nextCheckAt: 0 }); }
  private active(state: MaintenanceState): Operation | undefined {
    return this.runtime.store.list<Operation>("operation:").find(op => {
      if (op.kind !== "inventory" || terminal.has(op.status)) return false;
      const quote = this.runtime.store.get<SavedQuote>("quote:" + op.quoteId);
      return quote?.profile.network === state.network && quote.profile.address === state.address && quote.summary.asset === state.asset;
    });
  }
  async check(id: string): Promise<MaintenanceState> {
    let entered = false;
    try {
      return await this.runtime.store.withLock("maintenance-token:" + id, async () => {
        entered = true;
        const state = this.get(id);
        if (!state) throw new TradingError("maintenance_missing", "Inventory maintenance job was not found.");
        const nextCheckAt = Date.now() + (state.target.intervalSeconds ?? 120) * 1000;
        try {
          const activeId = (state.activeOperationId && !terminal.has(state.operationStatus ?? "")) ? state.activeOperationId : this.active(state)?.id;
          if (activeId) {
            const operation = await this.runtime.status(activeId);
            return this.save(id, { activeOperationId: activeId, operationStatus: String(operation.status), nextCheckAt,
              lastError: String(operation.reasonCode ?? (operation.error as { code?: string } | undefined)?.code ?? "") || undefined });
          }
          const inventory = await this.runtime.read("get_record_inventory", state.profileId, { token: state.token });
          const minimum = parseUnits(state.target.minRecordAmount, (inventory.token as { decimals: number }).decimals);
          const coveringRecords = (inventory.available as { amount: string }[]).filter(record => BigInt(record.amount) >= minimum).length;
          this.save(id, { coveringRecords, checkedAt: Date.now(), nextCheckAt });
          if (!state.enabled || coveringRecords >= state.target.records) return this.get(id)!;
          const plan = await this.runtime.quote("inventory", state.profileId, { ...state.target, distribution: "floor" });
          const current = this.get(id)!;
          if (!current.enabled || current.revision !== state.revision) return current;
          if (!Number(plan.stepCount)) return this.save(id, { lastError: "insufficient_available_inventory" });
          const operation = await this.runtime.execute(String(plan.quoteId), "maintenance:" + randomUUID(), () => {
            // This runs inside the same SQLite transaction as registration;
            // another process cannot stop/change the job between the check and write.
            const latest = this.get(id);
            if (!latest?.enabled || latest.revision !== state.revision)
              throw new TradingError("maintenance_changed", "The token job stopped or changed before registration.");
          });
          return this.save(id, { activeOperationId: String(operation.operationId), operationStatus: String(operation.status), lastError: undefined });
        } catch (error) {
          // If a manual plan won the registration race, adopt its original op.
          if (error instanceof TradingError && error.code === "maintenance_changed") return this.get(id)!;
          const active = this.active(state);
          return this.save(id, { nextCheckAt, ...(active ? { activeOperationId: active.id, operationStatus: active.status } : {}),
            lastError: error instanceof TradingError ? error.code : "maintenance_check_failed" });
        }
      });
    } catch (error) {
      if (entered || !(error instanceof LockBusyError)) throw error;
      const state = this.get(id);
      if (!state) throw new TradingError("maintenance_missing", "Inventory maintenance job was not found.");
      return state;
    }
  }
  async running(): Promise<boolean> {
    try { return await this.runtime.store.withLock("inventory-maintainer", async () => false); }
    catch (error) { if (error instanceof LockBusyError) return true; throw error; }
  }
  /** One worker per state directory; each token advances without waiting for other tokens. */
  async run(signal: AbortSignal, ready?: () => void): Promise<void> {
    await this.runtime.store.withLock("inventory-maintainer", async () => {
      ready?.();
      const inFlight = new Map<string, Promise<unknown>>();
      try {
        while (!signal.aborted) {
          const due = this.list().filter(state => state.enabled || state.activeOperationId && !terminal.has(state.operationStatus ?? ""))
            .filter(state => state.nextCheckAt <= Date.now() && !inFlight.has(state.id)).sort((a, b) => a.nextCheckAt - b.nextCheckAt);
          for (const state of due) {
            if (inFlight.size >= 4) break;
            const task = this.check(state.id).catch(() => {}).finally(() => inFlight.delete(state.id));
            inFlight.set(state.id, task);
          }
          await sleep(1000, undefined, { signal }).catch(() => {});
        }
      } finally { await Promise.allSettled(inFlight.values()); await this.runtime.drain(); }
    });
  }
}

/** Polling is read-only recovery. It never creates a trade or resumes a claim. */
const recoveryAttempts = new WeakMap<TradingRuntime, Map<string, number>>();
export async function recoverOperations(runtime: TradingRuntime): Promise<void> {
  const pending = runtime.store.list<Operation>("operation:").filter(op => !terminal.has(op.status));
  const attempts = recoveryAttempts.get(runtime) ?? new Map<string, number>();
  recoveryAttempts.set(runtime, attempts);
  const ids = new Set(pending.map(op => op.id));
  for (const id of attempts.keys()) if (!ids.has(id)) attempts.delete(id);
  const selected = pending.sort((a, b) => (attempts.get(a.id) ?? 0) - (attempts.get(b.id) ?? 0) || a.updatedAt - b.updatedAt).slice(0, 8);
  for (const op of selected) attempts.set(op.id, Date.now());
  await Promise.allSettled(selected.map(op => runtime.status(op.id)));
}
