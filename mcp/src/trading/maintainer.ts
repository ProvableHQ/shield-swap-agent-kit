import { TradingRuntime } from "./runtime";
import { TradingError, type MaintenanceState, type MaintenanceTarget, type Summary } from "./types";

const TARGET = /^([^=\s:]{1,128})=([1-9][0-9]{0,3}):((?:0|[1-9][0-9]*)(?:\.[0-9]+)?)$/;
const finalStatuses = new Set(["complete", "failed", "uncertain"]);

function processAlive(pid: number): boolean {
  try { process.kill(pid, 0); return true; }
  catch (error) { return (error as { code?: string }).code === "EPERM"; }
}

/**
 * Keeps each target token at a floor of unreserved records that cover its
 * minimum. A pass reads the inventory, plans a floor target only on a
 * shortfall, runs that plan as an ordinary inventory operation (wallet lock,
 * inventory permission, fee ceiling, checkpoints), and records what it found.
 * An empty plan submits nothing, so an idle pass costs one inventory read.
 */
export class Maintainer {
  private readonly intervalSeconds: number;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  constructor(private readonly runtime: TradingRuntime, private readonly profileId: string, private readonly targets: MaintenanceTarget[],
    options: { intervalSeconds?: number; now?: () => number; sleep?: (ms: number) => Promise<void> } = {}) {
    if (!targets.length) throw new TradingError("invalid_target", "At least one target is required.");
    this.intervalSeconds = options.intervalSeconds ?? 120;
    this.now = options.now ?? Date.now;
    this.sleep = options.sleep ?? (ms => new Promise(resolve => setTimeout(resolve, ms)));
  }
  static stateKey(profileId: string): string { return "maintenance:" + profileId; }
  static parseTarget(text: string): MaintenanceTarget {
    const match = TARGET.exec(text);
    if (!match || Number(match[2]) > 1000) throw new TradingError("invalid_target", "Targets are TOKEN=RECORDS:MIN_AMOUNT with 1 to 1000 records and a human decimal minimum, for example USDCx=8:0.1.");
    return { token: match[1]!, records: Number(match[2]), minRecordAmount: match[3]! };
  }
  state(): MaintenanceState | undefined { return this.runtime.store.get<MaintenanceState>(Maintainer.stateKey(this.profileId)); }
  private save(patch: Partial<MaintenanceState>): MaintenanceState {
    const next: MaintenanceState = { profileId: this.profileId, pid: process.pid, startedAt: this.now(), intervalSeconds: this.intervalSeconds,
      targets: this.targets, running: false, ...this.state(), ...patch };
    this.runtime.store.set(Maintainer.stateKey(this.profileId), next);
    return next;
  }
  /** Records this process as the profile's maintainer; refuses while another recorded maintainer is alive. */
  async start(): Promise<void> {
    this.runtime.profile(this.profileId);
    const existing = this.state();
    if (existing?.running && processAlive(existing.pid)) {
      throw new TradingError("maintainer_running", `A maintainer for this profile is already running as pid ${existing.pid}; stop it first.`);
    }
    this.save({ pid: process.pid, startedAt: this.now(), intervalSeconds: this.intervalSeconds, targets: this.targets, running: true });
  }
  async stop(): Promise<void> { this.save({ running: false }); }
  /** One pass over every target. Never throws: outcomes land in lastPass. */
  async runPass(): Promise<MaintenanceState["lastPass"]> {
    const { parseUnits } = await import("@provablehq/shield-swap-sdk");
    const at = this.now();
    const ready: Record<string, number> = {};
    let action: "none" | "rebalanced" | "skipped" = "none";
    let operationId: string | undefined;
    let error: string | undefined;
    for (const target of this.targets) {
      try {
        const inventory = await this.runtime.read("get_record_inventory", this.profileId, { token: target.token });
        const decimals = (inventory.token as { decimals: number }).decimals;
        const minimum = parseUnits(target.minRecordAmount, decimals);
        const covering = (inventory.available as { amount: string }[]).filter(record => BigInt(record.amount) >= minimum).length;
        ready[target.token] = covering;
        if (covering >= target.records) continue;
        // The floor target splits only on a shortfall and never joins, so a
        // plan is empty whenever nothing is missing.
        const plan = await this.runtime.quote("inventory", this.profileId,
          { token: target.token, records: target.records, minRecordAmount: target.minRecordAmount, distribution: "floor" });
        if (Number(plan.stepCount ?? 0) === 0) continue;
        const operation = await this.runtime.execute(String(plan.quoteId), `maintain:${this.profileId}:${target.token}:${at}`);
        operationId = String(operation.operationId);
        action = "rebalanced";
        await this.awaitOperation(operationId);
      } catch (failure) {
        // A trade in flight owns the wallet; try again next pass rather than queue behind it.
        error = failure instanceof TradingError ? failure.code : "pass_failed";
        if (action !== "rebalanced") action = "skipped";
        break;
      }
    }
    const lastPass = { at, ready, action, ...(operationId ? { operationId } : {}), ...(error ? { error } : {}) };
    this.save({ lastPass });
    return lastPass;
  }
  private async awaitOperation(operationId: string): Promise<Summary> {
    for (;;) {
      const status = await this.runtime.status(operationId);
      if (finalStatuses.has(String(status.status))) return status;
      await this.sleep(5_000);
    }
  }
  /** Passes until the signal aborts, then marks the maintainer stopped. */
  async run(signal: AbortSignal): Promise<void> {
    await this.start();
    try {
      while (!signal.aborted) {
        await this.runPass();
        if (signal.aborted) break;
        await Promise.race([this.sleep(this.intervalSeconds * 1000), new Promise<void>(resolve => signal.addEventListener("abort", () => resolve(), { once: true }))]);
      }
    } finally { await this.stop(); }
  }
}
