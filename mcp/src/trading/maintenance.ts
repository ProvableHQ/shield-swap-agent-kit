import { createHash, randomUUID } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import { watch, type FSWatcher } from "node:fs";
import { parseUnits } from "@provablehq/shield-swap-sdk";
import { TradingRuntime } from "./runtime";
import { LockBusyError } from "./store";
import { TradingError, type Operation, type SavedQuote } from "./types";
import { heldInventoryRecords, inventoryActivity, inventoryScope } from "./inventory";

export type MaintenanceTarget = { token: string; records: number; replenishThreshold?: number; minRecordAmount: string; intervalSeconds?: number };
export type MaintenanceState = {
  id: string; profileId: string; network: string; address: string; asset: string; token: string;
  enabled: boolean; revision: string; target: MaintenanceTarget; nextCheckAt: number;
  coveringRecords?: number; checkedAt?: number; activeOperationId?: string; operationStatus?: string; lastError?: string;
  replenishing?: boolean; observedActivityVersion?: number; retryAfter?: number;
  /** Account-wide activity, including aliases and all maintained tokens. */
  reservationFailures?: number; shortages?: number; lastFailureAt?: number;
};
const terminal = new Set(["complete", "failed"]);
export class InventoryMaintenance {
  constructor(private readonly runtime: TradingRuntime) {}
  get(id: string): MaintenanceState | undefined { return this.runtime.store.get("maintenance-token:" + id); }
  list(): MaintenanceState[] { return this.runtime.store.list("maintenance-token:"); }
  private save(id: string, patch: Partial<MaintenanceState>, revision?: string): MaintenanceState {
    return this.runtime.store.transaction(() => {
      const state = this.get(id);
      if (!state) throw new TradingError("maintenance_missing", "Inventory maintenance job was not found.");
      if (revision && state.revision !== revision) return state;
      const next = { ...state, ...patch };
      this.runtime.store.set("maintenance-token:" + id, next);
      return next;
    });
  }
  async start(profileId: string, target: MaintenanceTarget): Promise<MaintenanceState> {
    const profile = this.runtime.profile(profileId);
    if (!profile.policy.inventory)
      throw new TradingError("permission_required", "Inventory permission requires approval through request_permissions or terminal configure.");
    const intervalSeconds = target.intervalSeconds ?? 120;
    if (!Number.isInteger(target.records) || target.records < 1 || target.records > 1000 || !Number.isInteger(intervalSeconds) || intervalSeconds < 10 || intervalSeconds > 86400)
      throw new TradingError("invalid_target", "Use 1 to 1000 records and an interval of 10 to 86400 seconds.");
    const replenishThreshold = target.replenishThreshold ?? target.records - 1;
    if (!Number.isInteger(replenishThreshold) || replenishThreshold < 0 || replenishThreshold >= target.records)
      throw new TradingError("invalid_target", "The replenishment threshold must be an integer from zero to one less than the refill target.");
    const inventory = await this.runtime.read("get_record_inventory", profileId, { token: target.token });
    const token = inventory.token as { id: string; decimals: number };
    if (!/^(0|[1-9][0-9]*)(\.[0-9]+)?$/.test(target.minRecordAmount) || parseUnits(target.minRecordAmount, token.decimals) <= 0n)
      throw new TradingError("invalid_target", "The minimum covering amount must be a positive token amount.");
    const asset = (inventory.asset as { program: string }).program;
    const id = createHash("sha256").update(JSON.stringify([profile.network, profile.address, asset])).digest("hex");
    return this.runtime.store.transaction(() => {
      const state: MaintenanceState = { ...this.get(id), id, profileId, network: profile.network, address: profile.address, token: token.id, asset,
        enabled: true, revision: randomUUID(), target: { ...target, token: token.id, intervalSeconds, replenishThreshold },
        replenishing: false, retryAfter: undefined, nextCheckAt: 0 };
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
        const scope = inventoryScope(state);
        const activity = inventoryActivity(this.runtime.store, scope);
        const save = (patch: Partial<MaintenanceState>) => this.save(id, patch, state.revision);
        // Acknowledge only after the check finishes, and only the version it
        // started with. A crash or a concurrent reservation leaves work due.
        const finish = (patch: Partial<MaintenanceState> = {}) => save({ nextCheckAt,
          observedActivityVersion: activity.version, reservationFailures: activity.reservationFailures,
          shortages: activity.shortages, lastFailureAt: activity.lastFailureAt, ...patch });
        save({ nextCheckAt: 0 });
        try {
          const activeId = (state.activeOperationId && !terminal.has(state.operationStatus ?? "")) ? state.activeOperationId : this.active(state)?.id;
          if (activeId) {
            const operation = await this.runtime.status(activeId);
            return finish({ activeOperationId: activeId, operationStatus: String(operation.status),
              nextCheckAt: state.enabled && operation.status === "complete" ? 0 : nextCheckAt,
              retryAfter: operation.status === "failed" ? nextCheckAt : undefined,
              lastError: String(operation.reasonCode ?? (operation.error as { code?: string } | undefined)?.code ?? "") || undefined });
          }
          const inventory = await this.runtime.read("get_record_inventory", state.profileId, { token: state.token });
          const minimum = parseUnits(state.target.minRecordAmount, (inventory.token as { decimals: number }).decimals);
          // The SDK takes its reservation snapshot before scanning. Reclassify
          // both collections for acquisitions AND releases during that scan.
          const held = heldInventoryRecords(this.runtime.store, scope);
          const records = [...inventory.available as { id: string; amount: string }[],
            ...(inventory.reserved as { id: string; amount: string }[] | undefined ?? [])];
          const coveringRecords = [...new Map(records.map(record => [record.id, record])).values()]
            .filter(record => !held.has(record.id) && BigInt(record.amount) >= minimum).length;
          const replenishing = coveringRecords < state.target.records &&
            (state.replenishing || coveringRecords <= (state.target.replenishThreshold ?? state.target.records - 1));
          save({ coveringRecords, replenishing, checkedAt: Date.now(), retryAfter: undefined, lastError: undefined });
          if (!state.enabled || !replenishing) return finish();
          const plan = await this.runtime.quote("inventory", state.profileId, { ...state.target, distribution: "floor" });
          const current = this.get(id)!;
          if (!current.enabled || current.revision !== state.revision) return current;
          if (!Number(plan.stepCount)) return finish({ lastError: "insufficient_available_inventory", retryAfter: nextCheckAt });
          const operation = await this.runtime.execute(String(plan.quoteId), "maintenance:" + randomUUID(), () => {
            // This runs inside the same SQLite transaction as registration;
            // another process cannot stop/change the job between the check and write.
            const latest = this.get(id);
            if (!latest?.enabled || latest.revision !== state.revision)
              throw new TradingError("maintenance_changed", "The token job stopped or changed before registration.");
          });
          return finish({ activeOperationId: String(operation.operationId), operationStatus: String(operation.status), lastError: undefined });
        } catch (error) {
          // If a manual plan won the registration race, adopt its original op.
          if (error instanceof TradingError && error.code === "maintenance_changed") return this.get(id)!;
          const active = this.active(state);
          return finish({ retryAfter: nextCheckAt, ...(active ? { activeOperationId: active.id, operationStatus: active.status } : {}),
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
      const inFlight = new Map<string, Promise<unknown>>();
      const dispatchAfter = new Map<string, number>();
      let wake = new AbortController();
      const notify = () => wake.abort();
      let watcher: FSWatcher | undefined;
      try {
        // Notifications reduce latency across processes. Durable activity versions
        // are authoritative; the one-second sweep also covers missed notifications.
        try { watcher = watch(this.runtime.store.directory, { persistent: false }, notify); watcher.on("error", notify); }
        catch { /* Filesystems without watch support still use durable activity. */ }
        signal.addEventListener("abort", notify);
        ready?.();
        while (!signal.aborted) {
          wake = new AbortController();
          const due = this.list().filter(state => state.enabled || state.activeOperationId && !terminal.has(state.operationStatus ?? ""))
            .filter(state => !inFlight.has(state.id) && (dispatchAfter.get(state.id) ?? 0) <= Date.now() && (state.nextCheckAt <= Date.now() ||
              (state.retryAfter ?? 0) <= Date.now() && inventoryActivity(this.runtime.store, inventoryScope(state)).version !== (state.observedActivityVersion ?? 0)))
            .sort((a, b) => a.nextCheckAt - b.nextCheckAt);
          for (const state of due) {
            if (inFlight.size >= 4) break;
            const task = this.check(state.id).catch(() => {}).finally(() => {
              // Coalesce bursts and yield on a contended token lock rather than
              // immediately re-entering a still-due job on every completion.
              dispatchAfter.set(state.id, Date.now() + 1000); inFlight.delete(state.id); notify();
            });
            inFlight.set(state.id, task);
          }
          await sleep(1000, undefined, { signal: wake.signal }).catch(() => {});
        }
      } finally { watcher?.close(); signal.removeEventListener("abort", notify); await Promise.allSettled(inFlight.values()); await this.runtime.drain(); }
    });
  }
}
