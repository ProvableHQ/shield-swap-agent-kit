import type { TradingRuntime } from "./runtime";
import type { Operation } from "./types";
import { withRecovery } from "./recovery-context";

/** Read-only recovery: each operation owns a slot until its real cleanup ends. */
export class OperationRecovery {
  private readonly inFlight = new Map<string, Promise<void>>();
  private readonly nextAttempt = new Map<string, number>();
  private readonly controller = new AbortController();
  private queue: string[] = [];
  constructor(private readonly runtime: TradingRuntime,
    private readonly options: { concurrency?: number; intervalMs?: number; timeoutMs?: number } = {}) {}

  tick(): void {
    if (this.controller.signal.aborted) return;
    const pending = this.runtime.store.list<Operation>("operation:").filter(op => op.status !== "complete" && op.status !== "failed");
    const ids = new Set(pending.map(op => op.id));
    for (const id of this.nextAttempt.keys()) if (!ids.has(id)) this.nextAttempt.delete(id);
    const now = Date.now();
    this.queue = pending.filter(op => !this.inFlight.has(op.id) && (this.nextAttempt.get(op.id) ?? 0) <= now)
      .sort((a, b) => (this.nextAttempt.get(a.id) ?? 0) - (this.nextAttempt.get(b.id) ?? 0) || a.updatedAt - b.updatedAt).map(op => op.id);
    this.refill();
  }

  private refill(): void {
    if (this.controller.signal.aborted) return;
    while (this.queue.length && this.inFlight.size < (this.options.concurrency ?? 8)) {
      const id = this.queue.shift()!;
      const task = withRecovery(this.controller.signal, this.options.timeoutMs ?? 60_000,
        () => this.runtime.status(id)).then(() => {}, () => {}).finally(() => {
        this.nextAttempt.set(id, Date.now() + (this.options.intervalMs ?? 15_000));
        this.inFlight.delete(id);
        // Refill free slots immediately; a slow peer never becomes a batch barrier.
        this.refill();
      });
      this.inFlight.set(id, task);
    }
  }

  async stop(): Promise<void> {
    this.controller.abort();
    await Promise.allSettled(this.inFlight.values());
  }
}
