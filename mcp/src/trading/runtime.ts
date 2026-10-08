import { createHash, randomUUID } from "node:crypto";
import { TradingStore } from "./store";
import { sharesAccount, withWalletLocks } from "./coordination";
import { TradingError, type Kind, type Operation, type Profile, type SavedQuote, type Summary, type TradingBackend, type Progress } from "./types";

const activeStatuses = new Set(["queued", "running", "uncertain"]);
export class TradingRuntime {
  private workers = new Set<Promise<void>>();
  constructor(readonly store: TradingStore, private backend: TradingBackend) {}

  profile(id: string): Profile {
    const value = this.store.get<Profile>("profile:" + id);
    if (!value) throw new TradingError("setup_required", "Wallet profile is not configured. Run setup in a terminal.");
    return value;
  }
  profiles(): Summary[] {
    return this.store.list<Profile>("profile:").map(p => ({
      id: p.id, network: p.network, address: p.address,
      wallets: [{ chain: "aleo", provider: "local", address: p.address },
        ...(p.evm ? [{ chain: "ethereum", provider: p.evm.provider, address: p.evm.address }] : []),
        ...(p.solana ? [{ chain: "solana", provider: p.solana.provider, address: p.solana.address }] : [])],
      policy: p.policy, useFeeMaster: p.useFeeMaster ?? false,
    }));
  }
  scope(profile: Profile): string { return [profile.network, profile.address, profile.program ?? "shield_swap.aleo"].join(":"); }

  async quote(kind: Kind, profileId: string, input: Summary): Promise<Summary> {
    const profile = this.profile(profileId);
    const priced = await withWalletLocks(this.store, [profile], () => this.backend.quote(kind, profile, input));
    const now = Date.now();
    const quote: SavedQuote = { id: randomUUID(), kind, profile, scope: this.scope(profile),
      createdAt: now, ...priced, expiresAt: Math.min(now + 60_000, priced.expiresAt ?? Infinity) };
    if (kind === "swap") {
      if (BigInt(String(priced.summary.minOut ?? "0")) <= 0n) throw new TradingError("unquoted_swap", "No executable minimum output is available for this route.");
    }
    this.store.set("quote:" + quote.id, quote);
    return { quoteId: quote.id, kind, profileId, network: profile.network, address: profile.address, expiresAt: quote.expiresAt, ...quote.summary };
  }

  private assertWalletAvailable(profile: Profile, exceptId?: string): void {
    if (this.store.list<Operation>("operation:").some(op => op.id !== exceptId && activeStatuses.has(op.status) &&
      sharesAccount(this.store.get<SavedQuote>("quote:" + op.quoteId)!.profile, profile))) {
      throw new TradingError("operation_pending", "Resolve the wallet\'s existing active or uncertain operation before submitting another.");
    }
  }

  private authorize(quote: SavedQuote): void {
    const profile = this.profile(quote.profile.id);
    if (this.scope(profile) !== quote.scope || JSON.stringify({ ...profile, policy: undefined }) !== JSON.stringify({ ...quote.profile, policy: undefined })) {
      throw new TradingError("profile_changed", "Wallet configuration changed; request a new quote.");
    }
    const p = profile.policy;
    if (quote.kind === "claim") {
      if (!p.claims) throw new TradingError("permission_required", "Claim permission must be enabled in terminal setup.");
      return;
    }
    const bridge = quote.kind === "bridge";
    if (bridge ? !p.bridges : !p.swaps) throw new TradingError("permission_required", "Execution permission must be enabled in terminal setup.");
    const token = String(quote.summary.tokenIn ?? "");
    const limit = (bridge ? p.bridgeLimits : p.swapLimits)[token];
    const amount = String(quote.summary.amountIn ?? "0");
    if (!limit || !/^\d+$/.test(limit) || !/^\d+$/.test(amount) || BigInt(amount) <= 0n || BigInt(amount) > BigInt(limit)) {
      throw new TradingError("spend_limit", "The quoted input exceeds this wallet's configured token spending limit.");
    }
    if (!bridge && Number(quote.summary.slippageBps) > p.maxSlippageBps) throw new TradingError("slippage_limit", "The quote exceeds the configured slippage limit.");
  }

  async execute(quoteId: string, requestKey: string): Promise<Summary> {
    const quote = this.store.get<SavedQuote>("quote:" + quoteId);
    if (!quote) throw new TradingError("quote_missing", "Quote was not found.");
    const requestId = createHash("sha256").update(quote.scope + ":" + requestKey).digest("hex");
    let created = false;
    const operation = this.store.transaction(() => {
      const existingId = this.store.get<string>("request:" + requestId);
      if (existingId) {
        const existing = this.store.get<Operation>("operation:" + existingId)!;
        if (existing.quoteId !== quoteId) throw new TradingError("idempotency_conflict", "This idempotency key belongs to another quote.");
        return existing;
      }
      const current = this.store.get<SavedQuote>("quote:" + quoteId)!;
      if (current.operationId) throw new TradingError("quote_consumed", "Quote has already been consumed; inspect its original operation.");
      if (current.expiresAt <= Date.now()) throw new TradingError("quote_expired", "Quote expired; request a fresh quote.");
      this.authorize(current);
      this.assertWalletAvailable(quote.profile);
      const now = Date.now();
      const op: Operation = { id: randomUUID(), kind: quote.kind, profileId: quote.profile.id, scope: quote.scope,
        quoteId, requestKey: requestId, status: "queued", createdAt: now, updatedAt: now, result: {} };
      this.store.set("operation:" + op.id, op);
      this.store.set("request:" + requestId, op.id);
      this.store.set("quote:" + quoteId, { ...current, operationId: op.id });
      created = true;
      return op;
    });
    if (created) this.launch(operation.id, quote, false);
    return this.publicOperation(operation);
  }

  private save(op: Operation, progress: Progress): Operation {
    const value = { ...op, ...progress, updatedAt: Date.now() };
    this.store.set("operation:" + op.id, value);
    return value;
  }

  private launch(id: string, quote: SavedQuote, resuming: boolean, ready?: { resolve(value: Summary): void; reject(error: unknown): void }): void {
    const worker = (async () => {
      let entered = false;
      try {
        await withWalletLocks(this.store, [quote.profile], async () => {
          let op = this.store.get<Operation>("operation:" + id)!;
          // A different process may reconcile a queued operation before this
          // worker acquires the lock. Never resurrect an operation it resolved.
          if (!resuming && op.status !== "queued") return;
          if (resuming) {
            if (op.status !== "complete" && op.status !== "failed") {
              op = this.save(op, await this.backend.reconcile(quote, op));
            }
            // Reconcile and start the next step under the same wallet lock.
            // Another caller must never queue work based on a stale status.
            if (op.status === "complete" || op.status === "failed" || op.kind === "swap" ||
                !["resume", "complete", "claim"].includes(String(op.result.nextAction))) {
              ready?.resolve(this.publicOperation(op));
              return;
            }
          }
          this.assertWalletAvailable(quote.profile, op.id);
          this.authorize(quote);
          if (!resuming && quote.expiresAt <= Date.now()) throw new TradingError("quote_expired", "Quote expired before execution began.");
          entered = true;
          op = this.save(op, { status: "running", result: op.result });
          ready?.resolve(this.publicOperation(op));
          const context = { operationId: id, checkpoint: (checkpoint: unknown) => {
            op = { ...op, checkpoint, updatedAt: Date.now() };
            this.store.set("operation:" + id, op);
          } };
          const result = resuming ? await this.backend.resume(quote, op, context) : await this.backend.execute(quote, context);
          this.save(op, result);
        });
      } catch (error) {
        const op = this.store.get<Operation>("operation:" + id)!;
        if (resuming && !entered) {
          if (error instanceof Error && /busy/.test(error.message)) ready?.resolve(this.publicOperation(op));
          else ready?.reject(error);
          return;
        }
        this.save(op, { status: entered ? "uncertain" : "failed",
          result: { error: { code: entered ? "submission_uncertain" : error instanceof TradingError ? error.code : "wallet_busy",
            message: entered ? "The submission result is uncertain. Reconcile this operation before any retry." : "Execution did not start. Check the wallet permissions, quote expiry, and active operations." } } });
      }
    })();
    this.workers.add(worker);
    void worker.finally(() => this.workers.delete(worker)).catch(() => {});
  }

  operation(id: string): Summary {
    const op = this.store.get<Operation>("operation:" + id);
    if (!op) throw new TradingError("operation_missing", "Operation was not found.");
    return this.publicOperation(op);
  }
  operations(profileId?: string, limit = 50): Summary[] {
    return this.store.list<Operation>("operation:").filter(op => !profileId || op.profileId === profileId)
      .sort((a,b) => b.createdAt-a.createdAt).slice(0, limit).map(op => this.publicOperation(op));
  }
  private publicOperation(op: Operation): Summary {
    return { operationId: op.id, kind: op.kind, profileId: op.profileId, status: op.status,
      createdAt: op.createdAt, updatedAt: op.updatedAt, ...op.result };
  }
  async status(id: string): Promise<Summary> {
    const op = this.store.get<Operation>("operation:" + id);
    if (!op) throw new TradingError("operation_missing", "Operation was not found.");
    if (op.status === "complete" || op.status === "failed") return this.publicOperation(op);
    try {
      const saved = this.store.get<SavedQuote>("quote:" + op.quoteId)!;
      return await withWalletLocks(this.store, [saved.profile], async () => {
        const current = this.store.get<Operation>("operation:" + id)!;
        const quote = this.store.get<SavedQuote>("quote:" + current.quoteId)!;
        return this.publicOperation(this.save(current, await this.backend.reconcile(quote, current)));
      });
    } catch (error) {
      if (error instanceof Error && /busy/.test(error.message)) return this.publicOperation(op);
      throw error;
    }
  }
  async resume(id: string): Promise<Summary> {
    const op = this.store.get<Operation>("operation:" + id);
    if (!op) throw new TradingError("operation_missing", "Operation was not found.");
    const quote = this.store.get<SavedQuote>("quote:" + op.quoteId)!;
    return new Promise<Summary>((resolve, reject) => this.launch(id, quote, true, { resolve, reject }));
  }
  async read(action: string, profileId: string, input: Summary): Promise<Summary> {
    const profile = this.profile(profileId);
    return withWalletLocks(this.store, [profile], () => this.backend.read(action, profile, input));
  }
  async drain(): Promise<void> { while (this.workers.size) await Promise.allSettled([...this.workers]); }
}
