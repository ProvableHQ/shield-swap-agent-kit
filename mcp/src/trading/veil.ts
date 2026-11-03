import { reconcileSwapHistory as reconcileSdkHistory, type BlindedIdentityRecord, type SwapQuote } from "@provablehq/shield-swap-sdk";
import { FinalizeRevertError, RecordReservationConflictError, TransactionTimeoutError, getConfirmedTransaction, type InventoryPlan, type InventoryRecord, type InventoryTarget, type RecordSpend } from "@provablehq/veil-core";
import { expiredSwapProgress, recordInventoryShortage, type OwnedRecordSpend } from "./inventory";
import { BridgeBackend } from "./bridge";
import { TradingStore } from "./store";
import { claimContext, createSessionFactory, inventoryContext, swapContext, walletScope, type AleoSession, type SessionFactory, type SwapSubmission } from "./session";
import { TradingError, type ExecutionContext, type Kind, type Operation, type Profile, type Progress, type SavedQuote, type Summary, type TradingBackend } from "./types";

type Failure = { code: "not_submitted" | "transaction_rejected"; transactionId?: string; feeTransactionId?: string };
type ClaimItem = { swapId: string; status: "pending" | "preparing" | "submitting" | "claimed" | "uncertain"; transactionId?: string; amountOut?: string; amountRemaining?: string; lastFailure?: Failure };
type ClaimPlan = { swapIds: string[] };
type SwapCheckpoint = { submissionBoundary?: number; phase?: string; counter?: number; swapId?: string; transactionId?: string; feeTransactionId?: string };
type InventoryCheckpoint = { phase?: string; transactionIds?: string[]; completedSteps?: number; reasonCode?: string };
const resolvedJournalStatuses = new Set(["confirmed", "rejected", "cancelled"]);

function feeLimit(store: TradingStore, profileId: string): bigint {
  const limit = store.get<Profile>("profile:" + profileId)?.policy.inventoryFeeLimit;
  if (!limit || !/^\d+$/.test(limit) || BigInt(limit) <= 0n) throw new TradingError("spend_limit", "A positive inventory fee limit must be configured in terminal setup.");
  return BigInt(limit);
}
// The SDK's interruption reason is a message. Classify it into stable codes
// instead of forwarding arbitrary text across the operation boundary.
function interruptionCode(reason: string | undefined): string {
  if (!reason) return "interrupted";
  if (/Timed out confirming|has not indexed/.test(reason)) return "confirmation_timeout";
  if (/Inventory changed|missing its reservation/.test(reason)) return "inventory_changed";
  if (/was not accepted/.test(reason)) return "transaction_rejected";
  if (/maxFeeMicrocredits|Fee budget|fee/.test(reason)) return "fee_limit";
  if (/abort/i.test(reason)) return "cancelled";
  return "interrupted";
}
const recordRow = (record: InventoryRecord) => ({ id: record.id, amount: record.amount.toString() });

function transactionId(value: unknown): string | undefined {
  return typeof value === "string" && /^at1[a-z0-9]{1,128}$/.test(value) ? value : undefined;
}
// Only documented SDK error fields cross the operation boundary, never messages,
// causes, handles or arbitrary error properties.
function transactionEvidence(error: unknown): { transactionId?: string; feeTransactionId?: string } {
  if (!(error instanceof TransactionTimeoutError) && !(error instanceof FinalizeRevertError)) return {};
  return { transactionId: transactionId(error.transactionId),
    ...(error instanceof FinalizeRevertError ? { feeTransactionId: transactionId(error.feeTransactionId) } : {}) };
}
// Settle the record journal: the SDK resolves broadcast transactions from the
// chain, then this releases reservations whose writer never reached a proof.
// Every writer of this journal runs under the wallet lock, as does this
// reconcile, so a local reservation still without a transaction ID belongs to
// a process that died before proving; nothing was broadcast for it. An opaque
// wallet may have submitted without reporting, so rpc entries are kept.
async function reconcileJournal(session: AleoSession, params?: { rebroadcast?: boolean }): Promise<RecordSpend[]> {
  if (session.reconcileRecords) return session.reconcileRecords(params);
  const journal = await session.client.reconcileRecordInventory?.(params) ?? [];
  const store = session.client.recordManagement?.store;
  const orphaned = journal.filter(entry => entry.status === "reserved" && !entry.transactionId && entry.accountType === "local");
  if (!store || !orphaned.length) return journal;
  for (const entry of orphaned) await store.update(entry.scope, entry.id, { status: "cancelled" });
  return journal.map(entry => orphaned.includes(entry) ? { ...entry, status: "cancelled" } : entry);
}
// The SDK journals every proved transaction before broadcasting it, so an ID
// the journal never recorded was never sent by this wallet unless the chain
// shows otherwise. A transport failure resolves nothing.
async function unjournaledStatus(session: AleoSession, id: string): Promise<string> {
  try {
    const confirmed = await getConfirmedTransaction(session.publicClient, { id });
    return confirmed.status === "accepted" ? "confirmed" : confirmed.status === "rejected" ? "rejected" : "unknown";
  } catch (error) {
    return (error as { status?: number }).status === 404 ? "not_submitted" : "unknown";
  }
}
async function confirmedRejection(session: AleoSession, id?: string): Promise<Failure | undefined> {
  if (!id) return;
  try {
    const confirmed = await getConfirmedTransaction(session.publicClient, { id });
    if (confirmed.status === "rejected") return { code: "transaction_rejected", transactionId: id,
      feeTransactionId: transactionId(confirmed.transaction.id) };
  } catch {
    // Transport errors and not-found responses never establish rejection.
  }
}
export class VeilBackend implements TradingBackend {
  readonly concurrentRecords: boolean;
  private session: SessionFactory;
  private bridge: BridgeBackend;
  constructor(private store: TradingStore, session?: SessionFactory) { this.concurrentRecords = !session; this.session = session ?? createSessionFactory(store); this.bridge = new BridgeBackend(store); }

  async quote(kind: Kind, profile: Profile, input: Summary) {
    if (kind === "bridge") return this.bridge.quote(profile, input);
    const { client } = await this.session(profile);
    if (kind === "inventory") return this.planInventory(client, input);
    if (kind === "claim") {
      const pending = await client.getUnclaimedSwaps();
      const selected = input.swapIds as string[] | undefined;
      const swaps = pending.swaps.filter(swap => swap.claimable && (!selected || selected.includes(swap.swapId))).slice(0, 20);
      if (!swaps.length || selected?.some(id => !swaps.some(swap => swap.swapId === id))) throw new TradingError("claim_not_ready", "Selected swaps are not yet claimable. Inspect swap_history and the original operation.");
      const swapIds = swaps.map(swap => swap.swapId);
      return { plan: { swapIds }, summary: { swapIds, count: swapIds.length } };
    }
    const defaults = this.store.get<{ slippageBps?: number }>("settings");
    const quote = await client.quote({ from: String(input.from), to: String(input.to), amountIn: String(input.amount),
      slippageBps: Number(input.slippageBps ?? defaults?.slippageBps ?? 50) });
    return { plan: quote, expiresAt: quote.expiresAt, summary: {
      tokenIn: quote.from.id, tokenOut: quote.to.id, inputSymbol: quote.from.symbol, outputSymbol: quote.to.symbol,
      inputDecimals: quote.from.decimals, outputDecimals: quote.to.decimals,
      amountIn: quote.amountIn.toString(), expectedOut: quote.expectedOut.toString(), minOut: quote.minOut.toString(),
      slippageBps: quote.slippageBps, route: quote.hops.map(hop => hop.poolKey), expiresAt: quote.expiresAt,
    } };
  }

  private async planInventory(client: AleoSession["client"], input: Summary) {
    const { parseUnits } = await import("@provablehq/shield-swap-sdk");
    const token = await client.tokenData(String(input.token));
    if (!token.underlyingProgram) throw new TradingError("unsupported_token", "This token has no private record program to manage.");
    const target: InventoryTarget = { records: Number(input.records),
      ...(input.minRecordAmount !== undefined ? { minRecordAmount: parseUnits(String(input.minRecordAmount), token.decimals) } : {}),
      ...(input.distribution !== undefined ? { distribution: input.distribution as InventoryTarget["distribution"] } : {}),
      ...(input.toleranceBps !== undefined ? { toleranceBps: Number(input.toleranceBps) } : {}) };
    // Planning reads the scanner and reserves nothing; the plan names the
    // underlying record program rather than the AMM wrapper.
    const plan = await client.planInventory({ token: token.id, target,
      ...(input.maxTransactions !== undefined ? { maxTransactions: Number(input.maxTransactions) } : {}) });
    return { plan, summary: {
      token: token.id, symbol: token.symbol, decimals: token.decimals, asset: plan.asset.program,
      target: { records: target.records, minRecordAmount: (target.minRecordAmount ?? 1n).toString(),
        distribution: target.distribution ?? "floor", toleranceBps: target.toleranceBps ?? 1000 },
      inputCount: plan.inputs.length, inputBalance: plan.inputs.reduce((sum, record) => sum + record.amount, 0n).toString(),
      steps: plan.steps.map(step => ({ kind: step.kind, inputs: step.inputs.length, outputs: step.outputs.map(output => output.amount.toString()),
        ...(step.amount !== undefined ? { amount: step.amount.toString() } : {}), deduction: step.deduction.toString(), helper: step.joinProgram?.program ?? "native" })),
      stepCount: plan.steps.length, deduction: plan.deduction.toString(), maxTransactions: plan.maxTransactions,
    } };
  }

  private async rebalance(quote: SavedQuote, context: ExecutionContext): Promise<Progress> {
    const session = await this.session(quote.profile);
    const plan = quote.plan as InventoryPlan;
    const maxFeeMicrocredits = feeLimit(this.store, quote.profile.id);
    const transactionIds: string[] = [];
    const checkpoint = (phase: string, extra: Summary = {}) => context.checkpoint({ phase, transactionIds: [...transactionIds], ...extra } satisfies InventoryCheckpoint & Summary);
    checkpoint("rebalancing");
    // Each proved transaction ID is persisted before its broadcast. The SDK
    // never rolls back accepted steps, so an interruption is reconciled, not retried.
    let result;
    try {
      result = await inventoryContext.run({ prepared: id => { if (!transactionIds.includes(id)) { transactionIds.push(id); checkpoint("rebalancing"); } } },
        () => session.client.rebalanceRecordInventory({ plan, timeoutMs: 600_000, pollIntervalMs: 3_000, maxFeeMicrocredits }));
    } catch (error) {
      // The SDK validates the plan, scope and fee ceiling before its first
      // submission and reports later failures as an interrupted result.
      if (transactionIds.length) throw error;
      checkpoint("interrupted", { reasonCode: "invalid_plan" });
      return { status: "failed", result: { transactionIds, plannedSteps: plan.steps.length, reasonCode: "invalid_plan", nextAction: "plan_again",
        error: { code: "not_submitted", message: "The inventory plan could not be executed before any submission. Read the inventory and plan again." } } };
    }
    for (const id of result.transactionIds) if (!transactionIds.includes(id)) transactionIds.push(id);
    const summary = { transactionIds, completedSteps: result.completedSteps, plannedSteps: plan.steps.length, maxFeeMicrocredits: maxFeeMicrocredits.toString() };
    if (result.status === "complete") {
      checkpoint("complete", { completedSteps: result.completedSteps });
      return { status: "complete", result: summary, checkpoint: { phase: "complete", transactionIds, completedSteps: result.completedSteps } };
    }
    // Only the classified code is reported: the SDK's message can carry
    // reservation and request details that stay out of tool results.
    const reasonCode = interruptionCode(result.reason);
    checkpoint("interrupted", { completedSteps: result.completedSteps, reasonCode });
    if (!transactionIds.length) return { status: "failed", result: { ...summary, reasonCode, nextAction: "plan_again",
      error: { code: "not_submitted", message: "Inventory maintenance stopped before submitting a transaction. Read the inventory and plan again." } } };
    return { status: "uncertain", result: { ...summary, reasonCode, nextAction: "reconcile",
      error: { code: "maintenance_interrupted", message: "Inventory maintenance stopped after submitting transactions. Reconcile this operation; accepted joins and splits remain on chain and are never repeated." } } };
  }

  private async reconcileInventory(quote: SavedQuote, operation: Operation, session: AleoSession): Promise<Progress> {
    const checkpoint = operation.checkpoint as InventoryCheckpoint | undefined;
    const journal = await reconcileJournal(session);
    // A crash can occur after the SDK commits its proof but before our
    // checkpoint callback. Managed reconciliation sees only this owner's entries.
    const ids = [...new Set([...(checkpoint?.transactionIds ?? []),
      ...(operation.managedRecords ? journal.flatMap(entry => entry.transactionId ? [entry.transactionId] : []) : [])])];
    const transactions: Record<string, string> = {};
    for (const id of ids) transactions[id] = journal.find(entry => entry.transactionId === id)?.status ?? await unjournaledStatus(session, id);
    const base = { transactionIds: ids, transactions, completedSteps: checkpoint?.completedSteps, plannedSteps: (quote.plan as InventoryPlan).steps.length,
      // The interruption class recorded at execution time survives reconciliation.
      ...(checkpoint?.reasonCode ? { reasonCode: checkpoint.reasonCode } : {}),
      unresolvedJournalEntries: journal.filter(entry => !resolvedJournalStatuses.has(entry.status)).length };
    if (checkpoint?.phase === "complete") return { status: "complete", result: base };
    if (ids.some(id => !["confirmed", "rejected", "not_submitted"].includes(transactions[id])) ||
        operation.managedRecords && journal.some(entry => !resolvedJournalStatuses.has(entry.status))) {
      // A prepared or submitted transaction without a chain result keeps its
      // inputs reserved. A missing lookup never proves rejection.
      return { status: "uncertain", result: { ...base, nextAction: "reconcile", error: { code: "maintenance_uncertain",
        message: "Submitted inventory transactions have no confirmed outcome yet. Reconcile again; after inspection, recover_record_inventory with rebroadcast can resend a saved transaction." } } };
    }
    if (ids.every(id => transactions[id] === "not_submitted")) return { status: "failed", result: { ...base, nextAction: "plan_again",
      error: { code: "not_submitted", message: "Inventory maintenance did not submit a transaction. Read the inventory and plan again." } } };
    return { status: "failed", result: { ...base, nextAction: "plan_again", error: { code: "maintenance_incomplete",
      message: "The inventory plan did not finish. Accepted joins and splits remain on chain; read the inventory and plan again rather than repeating this plan." } } };
  }

  async execute(quote: SavedQuote, context: ExecutionContext): Promise<Progress> {
    if (quote.kind === "bridge") return this.bridge.execute(quote, context);
    if (quote.kind === "claim") return this.claim(quote, context);
    if (quote.kind === "inventory") return this.rebalance(quote, context);
    const session = await this.session(quote.profile);
    const initial = new Set((await session.identities.load()).map(record => record.counter));
    const state: SwapSubmission = { execution: context, initial, submissionStarted: false,
      checkpoint: { phase: "preparing", ...(session.submissionTracked ? { submissionBoundary: 1 } : {}) } };
    context.checkpoint(state.checkpoint);
    let handle;
    try {
      handle = await swapContext.run(state, () => session.client.swap({ quote: quote.plan as SwapQuote }));
    } catch (error) {
      if (!session.submissionTracked || state.submissionStarted) {
        const evidence = transactionEvidence(error);
        const rejected = error instanceof FinalizeRevertError;
        const checkpoint = { ...state.checkpoint, ...evidence, ...(rejected ? { phase: "rejected" } : {}) };
        context.checkpoint(checkpoint);
        return { status: rejected ? "failed" : "uncertain", checkpoint,
          result: { ...evidence, error: { code: rejected ? "transaction_rejected" : "submission_uncertain",
            message: rejected ? "The swap transaction was rejected. Inspect its fee effects before a newly authorized attempt."
              : "The submission result is uncertain. Reconcile this operation before any retry." } } };
      }
      // SDK 0.16.1 exposes a typed reservation conflict, but covering-record
      // selection still throws plain errors. Match only its specific shortage
      // diagnostics, and only before the tracked submission boundary.
      const shortage = error instanceof RecordReservationConflictError || error instanceof Error &&
        (/^No unspent [a-zA-Z0-9_]+\.aleo record covers \d+(?: for token \S+)? — balance too low, or funds are public rather than in records\.$/.test(error.message) ||
         error.message === "No available credits record covers the private fee separately from the transaction inputs; refresh records or fund private credits");
      if (shortage) {
        recordInventoryShortage(this.store, quote.profile);
        return { status: "failed", checkpoint: state.checkpoint, result: { error: { code: "insufficient_records",
          message: "No suitable unreserved record is available. No transaction was submitted. Replenish or fund inventory before a new attempt." } } };
      }
      return { status: "failed", result: { error: { code: "not_submitted",
        message: "Swap preparation failed before proving or submission. Check balances and request a fresh quote." } },
        checkpoint: state.checkpoint };
    }
    context.checkpoint({ phase: "submitted", swapId: handle.swapId, transactionId: handle.transactionId });
    return { status: "pending", result: { transactionId: handle.transactionId, swapId: handle.swapId, nextAction: "claim_when_ready" } };
  }

  async read(action: string, profile: Profile, input: Summary): Promise<Summary> {
    if (action === "list_bridge_routes") return this.bridge.routes(profile, input);
    const session = await this.session(profile);
    const { client } = session;
    const offset = Number(input.offset ?? 0), limit = Number(input.limit ?? 25);
    switch (action) {
      case "get_wallet_status": return { profileId: profile.id, network: profile.network, address: profile.address, signerReady: true, policy: profile.policy };
      case "get_record_inventory": {
        const token = await client.tokenData(String(input.token));
        if (!token.underlyingProgram) throw new TradingError("unsupported_token", "This token has no private record program to inspect.");
        // Reading reserves nothing. Reserved records are held by this state
        // directory's journal; other wallets and stores are not coordinated.
        const inventory = await client.getRecordInventory({ asset: { program: token.underlyingProgram } });
        return { network: profile.network, address: profile.address, token: { id: token.id, symbol: token.symbol, decimals: token.decimals },
          asset: inventory.asset, balance: inventory.balance.toString(), availableCount: inventory.available.length, reservedCount: inventory.reserved.length,
          available: inventory.available.map(recordRow), reserved: inventory.reserved.map(recordRow) };
      }
      case "recover_record_inventory": {
        const rebroadcast = input.rebroadcast === true;
        if (rebroadcast && !profile.policy.inventory) throw new TradingError("permission_required", "Rebroadcasting saved inventory transactions requires inventory permission in terminal setup.");
        const journal = await reconcileJournal(session, { rebroadcast });
        // The saved proved transaction stays in encrypted state; report only that it exists.
        const entries = journal.map(entry => ({ id: entry.id, scope: entry.scope, records: entry.records, status: entry.status,
          program: entry.program, function: entry.function, transactionId: entry.transactionId, feeRecordId: entry.feeRecordId,
          feeMicrocredits: entry.feeMicrocredits, savedTransaction: Boolean(entry.transaction),
          rebroadcastAttempts: entry.rebroadcastAttempts, rebroadcastFailed: Boolean(entry.lastRebroadcastError),
          ...((entry as OwnedRecordSpend).expiryRelease ? { expiryRelease: (entry as OwnedRecordSpend).expiryRelease } : {}) }));
        return { network: profile.network, address: profile.address, rebroadcast, entries,
          unresolvedCount: entries.filter(entry => !resolvedJournalStatuses.has(entry.status)).length };
      }
      case "get_balances": {
        const tokens = input.tokens as string[] | undefined;
        const selected = tokens ? await Promise.all(tokens.map(token => client.tokenData(token))) : await client.listTokens();
        const resolved = [...new Map(selected.map(token => [token.id, token])).values()];
        const balances = await client.getBalances({ tokens: resolved.map(token => token.id) });
        // The swap aggregate reads public AMM programs and private underlying
        // records. Bridged public tokens and native fee credits live separately.
        const programs = [...new Set(resolved.filter(token => token.underlyingProgram && token.underlyingProgram !== token.ammTokenProgram)
          .map(token => token.underlyingProgram!))];
        const [{ getPublicBalances }, { readMapping }] = await Promise.all([
          import("@provablehq/shield-swap-sdk"), import("@provablehq/veil-core"),
        ]);
        const underlying = await getPublicBalances(session.publicClient, { user: profile.address,
          programs: programs.filter(program => program !== "credits.aleo") });
        if (programs.includes("credits.aleo")) {
          // An absent native account mapping is a zero balance. SDK 0.12's
          // getBalance does not handle null; keep transport failures visible.
          const value = await readMapping(session.publicClient, { programId: "credits.aleo", mapping: "account", key: profile.address });
          if (value !== null && !/^\d+u64$/.test(value.trim())) throw new TradingError("invalid_balance", "The native balance response was invalid.");
          underlying["credits.aleo"] = value === null ? 0n : BigInt(value.trim().slice(0, -3));
        }
        const rows = resolved.map(token => {
          const value = balances[token.id];
          const swapPublic = value?.public ?? 0n, privateBalance = value?.private ?? 0n;
          const extra = token.underlyingProgram && token.underlyingProgram !== token.ammTokenProgram ? underlying[token.underlyingProgram] ?? 0n : 0n;
          const publicBalance = swapPublic + extra;
          return { tokenId: token.id, symbol: token.symbol, decimals: token.decimals,
            public: publicBalance.toString(), private: privateBalance.toString(), total: (publicBalance + privateBalance).toString(),
            publicByProgram: { ...(token.ammTokenProgram ? { [token.ammTokenProgram]: swapPublic.toString() } : {}),
              ...(token.underlyingProgram && token.underlyingProgram !== token.ammTokenProgram ? { [token.underlyingProgram]: extra.toString() } : {}) } };
        });
        return { network: profile.network, address: profile.address, balances: tokens ? rows : rows.filter(row => row.total !== "0") };
      }
      case "list_tokens": {
        const tokens = await client.listTokens();
        return { tokens: tokens.slice(offset, offset + limit), total: tokens.length, offset, limit };
      }
      case "list_pools": {
        const response = await client.api.getPools({ limit, offset });
        return { pools: response.data, pagination: response.pagination };
      }
      case "swap_history": {
        let recovery: Summary = { requested: false, complete: false };
        if (input.reconcile) recovery = await this.discover(session, profile);
        const records = await session.identities.load();
        const pending = await client.getUnclaimedSwaps();
        const swaps = records.slice().sort((a,b) => b.counter-a.counter).slice(offset, offset+limit).map(record => {
          const owed = pending.swaps.find(swap => swap.swapId === record.swapId);
          return { counter: record.counter, swapId: record.swapId, status: record.claim ? "claimed" : owed ? "claimable" : record.status,
            transactionId: record.handle?.transactionId, amountIn: record.handle?.amountIn ?? record.soldAmountIn,
            tokenIn: record.claim?.tokenIn ?? owed?.output.token_in, tokenOut: record.claim?.tokenOut ?? owed?.output.token_out,
            amountOut: record.claim?.amountOut ?? owed?.output.amount_out.toString(),
            amountRemaining: record.claim?.amountRemaining ?? owed?.output.amount_remaining.toString(),
            claimTransactionId: record.claim?.transactionId, claimable: Boolean(owed?.claimable) };
        });
        return { swaps, total: records.length, offset, limit, recovery, unresolvableCount: pending.unresolvable.length };
      }
      default: throw new TradingError("unsupported_action", "This action is not available for this wallet.");
    }
  }

  private async discover(session: AleoSession, profile: Profile): Promise<Summary> {
    return session.withIdentities ? session.withIdentities(() => this.discoverLocked(session, profile)) : this.discoverLocked(session, profile);
  }
  private async discoverLocked(session: AleoSession, profile: Profile): Promise<Summary> {
    const { deriveBlindedAddress, deriveBlindingFactor, viewKeyToScalar } = await import("@provablehq/shield-swap-sdk");
    if (!session.account.viewKey) throw new TradingError("wallet_locked", "History recovery needs the configured local account.");
    const records = await session.identities.load();
    const known = new Set(records.map(record => record.counter));
    const scalar = await viewKeyToScalar(session.account.viewKey);
    // Bounded discovery reports its scope; it never claims this enumerates every
    // possible lost identity after arbitrary counter gaps.
    let scanned = 0, gaps = 0;
    for (let counter = 0; counter < 256 && gaps < 16; counter++) {
      if (known.has(counter)) { gaps = 0; continue; }
      scanned++;
      const blindingFactor = await deriveBlindingFactor(scalar, counter, profile.program);
      const blindedAddress = await deriveBlindedAddress(blindingFactor, profile.address, profile.program);
      if (await session.client.isBlindedAddressUsed({ address: blindedAddress })) {
        records.push({ counter, blindingFactor, blindedAddress, status: "swapped" }); gaps = 0;
      } else gaps++;
    }
    await session.identities.save(records);
    const result = await this.reconcileHistory(session, profile);
    return { requested: true, complete: false, historyScanComplete: result.complete, identitiesProbed: scanned,
      identityWindow: 16, identityCeiling: 256, pagesScanned: result.pagesScanned };
  }

  private async reconcileHistory(session: AleoSession, profile: Profile, selected?: (record: BlindedIdentityRecord) => boolean) {
    await reconcileJournal(session);
    return session.withIdentities ? session.withIdentities(() => this.reconcileHistoryLocked(session, profile, selected)) : this.reconcileHistoryLocked(session, profile);
  }
  private async reconcileHistoryLocked(session: AleoSession, profile: Profile, selected?: (record: BlindedIdentityRecord) => boolean) {
    // Managed swaps and claims journal their input records. Resolve those
    // entries first so settled inputs are released and consumed ones stay excluded.
    // SDK 0.12 caches a negative result at the current history tip. Pending
    // transactions can land after that scan, so only concrete claims are final.
    const refresh = (records: BlindedIdentityRecord[]) => records.map(record => record.claim ? record : { ...record, claimSearched: false });
    const key = "history-recovery:" + walletScope(profile);
    const pageLimit = this.store.get<number>(key) ?? 10;
    // The SDK accepts a caller store. While holding the identity lock, present
    // only this operation's identities and merge its updates into the full list.
    // Unrelated old identities must not force every claim to scan their history.
    let result;
    if (selected) {
      result = await reconcileSdkHistory(session.client, { program: profile.program, maxPages: pageLimit, store: {
        load: async () => refresh((await session.identities.load()).filter(selected)),
        save: async updates => {
          const byCounter = new Map(updates.map(record => [record.counter, record]));
          await session.identities.save((await session.identities.load()).map(record => byCounter.get(record.counter) ?? record));
        },
      } });
    } else {
      await session.identities.save(refresh(await session.identities.load()));
      result = await session.client.reconcileSwapHistory({ maxPages: pageLimit });
    }
    // The public SDK restarts from the newest page; increase the window after
    // an incomplete scan so older claims remain reachable across polls/restarts.
    this.store.set(key, result.complete ? 10 : Math.min(160, pageLimit * 2));
    return { complete: result.complete, pagesScanned: result.pagesScanned, pageLimit };
  }

  async reconcile(quote: SavedQuote, operation: Operation): Promise<Progress> {
    if (quote.kind === "bridge") return this.bridge.reconcile(quote, operation);
    const session = await this.session(quote.profile);
    if (quote.kind === "inventory") return this.reconcileInventory(quote, operation, session);
    if (quote.kind === "claim") return this.reconcileClaims(quote, operation, session);
    const checkpoint = operation.checkpoint as SwapCheckpoint | undefined;
    const owned = operation.managedRecords ? await reconcileJournal(session) : [];
    const expired = expiredSwapProgress(owned as OwnedRecordSpend[]);
    if (expired) return expired;
    // With the operation lock held, cancelled local reservations prove this
    // writer stopped before producing a transaction. Missing chain lookups do not.
    if (owned.length && owned.every(entry => entry.status === "cancelled") && !checkpoint?.transactionId && checkpoint?.phase !== "submitted")
      return { status: "failed", result: { error: { code: "not_submitted", message: "The original writer stopped before preparing a transaction. Its reservations were released." } } };
    const rejectedEntry = owned.find(entry => entry.status === "rejected");
    if (rejectedEntry) return { status: "failed", result: { transactionId: rejectedEntry.transactionId,
      error: { code: "transaction_rejected", message: "The original transaction was rejected. Inspect its fee effects before a newly authorized attempt." } } };
    if (!checkpoint || checkpoint.phase === "preparing" || (checkpoint.submissionBoundary === 1 && checkpoint.phase === "reserved")) return { status: "failed", result: { error: { code: "not_submitted", message: "Execution did not reach the proving or submission boundary." } } };
    const rejection = checkpoint.phase === "rejected" ? { code: "transaction_rejected", transactionId: checkpoint.transactionId, feeTransactionId: checkpoint.feeTransactionId }
      : await confirmedRejection(session, checkpoint.transactionId);
    if (rejection) return { status: "failed", result: { ...rejection, error: rejection } };
    // Normal status checks do not need an account-wide history walk. A live
    // output or a confirmed claim saved by this runtime is direct evidence.
    const known = (await session.identities.load()).find(item => checkpoint.swapId ? item.swapId === checkpoint.swapId : item.counter === checkpoint.counter);
    const swapId = known?.swapId ?? checkpoint.swapId;
    const claimOperations = operation.managedRecords && swapId ? this.store.list<Operation>("operation:")
      .filter(item => item.kind === "claim" && item.scope === quote.scope)
      .flatMap(owner => ((owner.checkpoint as { claims?: ClaimItem[] } | undefined)?.claims ?? [])
        .filter(item => item.swapId === swapId).map(item => ({ owner, item }))) : [];
    const localClaim = claimOperations.find(({ item }) => item.status === "claimed" && item.transactionId)?.item;
    const claimed = known?.claim ?? localClaim;
    if (claimed) return { status: "complete", result: { swapId, transactionId: known?.handle?.transactionId ?? checkpoint.transactionId,
      claimTransactionId: claimed.transactionId, amountOut: claimed.amountOut, amountRemaining: claimed.amountRemaining } };
    const activeClaim = claimOperations.find(({ owner }) => owner.status !== "failed" && owner.status !== "complete");
    if (activeClaim) return { status: "pending", result: { swapId, transactionId: known?.handle?.transactionId ?? checkpoint.transactionId,
      claimOperationId: activeClaim.owner.id, nextAction: "inspect_claim" } };
    if (operation.managedRecords && swapId && session.client.getSwapOutput) {
      const output = await session.client.getSwapOutput({ swapId });
      if (output) return { status: "pending", result: { swapId, transactionId: known?.handle?.transactionId ?? checkpoint.transactionId,
        claimable: Boolean(known?.handle), amountOut: output.amount_out.toString(), nextAction: "claim_when_ready" } };
    }
    const historyRecovery = await this.reconcileHistory(session, quote.profile, operation.managedRecords && (swapId || checkpoint.counter !== undefined)
      ? item => Boolean(swapId && item.swapId === swapId) || checkpoint.counter !== undefined && item.counter === checkpoint.counter : undefined);
    const records = await session.identities.load();
    const record = records.find(item => checkpoint.swapId ? item.swapId === checkpoint.swapId : item.counter === checkpoint.counter);
    if (record?.claim) return { status: "complete", result: { historyRecovery, swapId: record.swapId, transactionId: record.handle?.transactionId,
      claimTransactionId: record.claim.transactionId, amountOut: record.claim.amountOut, amountRemaining: record.claim.amountRemaining } };
    const pending = await session.client.getUnclaimedSwaps();
    const found = pending.swaps.find(swap => swap.swapId === (record?.swapId ?? checkpoint.swapId));
    if (found) return { status: "pending", result: { historyRecovery, swapId: found.swapId, transactionId: record?.handle?.transactionId ?? checkpoint.transactionId,
      claimable: found.claimable, amountOut: found.output.amount_out.toString(), nextAction: "claim_when_ready" } };
    // A timeout can carry a transaction ID without proving acceptance. Keep
    // that wallet blocked until chain/history evidence resolves the outcome.
    return { status: record?.handle || checkpoint.phase === "submitted" || owned.some(entry => entry.status === "confirmed") ? "pending" : "uncertain",
      result: { historyRecovery, swapId: record?.swapId ?? checkpoint.swapId, transactionId: record?.handle?.transactionId ?? checkpoint.transactionId, nextAction: "wait" } };
  }

  private async claim(quote: SavedQuote, context: ExecutionContext, prior: ClaimItem[] = []): Promise<Progress> {
    const session = await this.session(quote.profile);
    const { client } = session;
    const items: ClaimItem[] = (quote.plan as ClaimPlan).swapIds.map(swapId => prior.find(item => item.swapId === swapId) ?? { swapId, status: "pending" });
    for (const item of items) {
      if (item.status === "claimed") continue;
      if (item.status === "uncertain" || item.status === "submitting") return { status: "uncertain", result: { claims: items, nextAction: "reconcile" } };
      const owed = (await client.getUnclaimedSwaps()).swaps.find(swap => swap.swapId === item.swapId);
      if (!owed?.handle || !owed.claimable) return { status: "pending", result: { claims: items, nextAction: "wait" }, checkpoint: { claims: items } };
      const handle = owed.handle;
      // New tracked claims distinguish preparation from a call that can broadcast.
      // Legacy/untracked submitting checkpoints remain ambiguous on recovery.
      item.status = session.submissionTracked ? "preparing" : "submitting";
      delete item.transactionId;
      context.checkpoint({ claims: items });
      let submissionStarted = !session.submissionTracked;
      try {
        const result = await claimContext.run({
          beforeSubmit: () => {
            item.status = "submitting";
            context.checkpoint({ claims: items });
            submissionStarted = true;
          },
          submitted: id => {
            item.transactionId = transactionId(id);
            context.checkpoint({ claims: items });
          },
        }, () => client.claimSwapOutput({ handle }));
        Object.assign(item, { status: "claimed", transactionId: result.transactionId, amountOut: result.amountOut.toString(), amountRemaining: result.amountRemaining.toString() });
        context.checkpoint({ claims: items });
      } catch (error) {
        const evidence = transactionEvidence(error);
        if (evidence.transactionId) item.transactionId = evidence.transactionId;
        if (!submissionStarted || error instanceof FinalizeRevertError) {
          item.status = "pending";
          item.lastFailure = { code: submissionStarted ? "transaction_rejected" : "not_submitted", ...evidence };
        } else item.status = "uncertain";
        context.checkpoint({ claims: items });
        return { status: item.status === "pending" ? "pending" : "uncertain",
          result: { claims: items, nextAction: item.status === "pending" ? "claim" : "reconcile" }, checkpoint: { claims: items } };
      }
    }
    return { status: "complete", result: { claims: items }, checkpoint: { claims: items } };
  }

  private async reconcileClaims(quote: SavedQuote, operation: Operation, session: AleoSession): Promise<Progress> {
    const owned = operation.managedRecords ? await reconcileJournal(session) : [];
    const selected = new Set((quote.plan as ClaimPlan).swapIds);
    const historyRecovery = await this.reconcileHistory(session, quote.profile, operation.managedRecords ? item => Boolean(item.swapId && selected.has(item.swapId)) : undefined);
    const records = await session.identities.load();
    const previous = (operation.checkpoint as { claims?: ClaimItem[] } | undefined)?.claims ?? [];
    const items: ClaimItem[] = [];
    const completedIds = new Set(previous.filter(item => item.status === "claimed").map(item => item.transactionId));
    // Claims execute sequentially within one operation. The newest reservation
    // not belonging to a completed item describes its interrupted attempt.
    const latestAttempt = owned.filter(entry => !entry.transactionId || !completedIds.has(entry.transactionId))
      .sort((a, b) => Number(b.id) - Number(a.id))[0];
    for (const swapId of (quote.plan as ClaimPlan).swapIds) {
      const record = records.find(record => record.swapId === swapId);
      const prior = previous.find(item => item.swapId === swapId);
      let item: ClaimItem = record?.claim ? { swapId, status: "claimed", transactionId: record.claim.transactionId, amountOut: record.claim.amountOut, amountRemaining: record.claim.amountRemaining }
        : prior ?? { swapId, status: "pending" };
      if (item.status === "preparing") item = { ...item, status: "pending", lastFailure: { code: "not_submitted" } };
      if ((item.status === "submitting" || item.status === "uncertain") && !item.transactionId && latestAttempt?.accountType === "local") {
        if (latestAttempt.status === "cancelled" && !latestAttempt.transactionId)
          item = { ...item, status: "pending", lastFailure: { code: "not_submitted" } };
        else if (latestAttempt.transactionId) item = { ...item, transactionId: latestAttempt.transactionId };
      }
      if (item.status === "submitting" || item.status === "uncertain") {
        const rejection = await confirmedRejection(session, item.transactionId);
        if (rejection) item = { ...item, status: "pending", lastFailure: rejection };
      }
      items.push(item);
    }
    const uncertain = items.some(item => item.status === "submitting" || item.status === "uncertain");
    const complete = items.every(item => item.status === "claimed");
    return { status: complete ? "complete" : uncertain ? "uncertain" : "pending",
      result: { historyRecovery, claims: items, nextAction: complete ? "done" : uncertain ? "reconcile" : "claim" }, checkpoint: { claims: items } };
  }

  async resume(quote: SavedQuote, operation: Operation, context: ExecutionContext): Promise<Progress> {
    if (quote.kind === "bridge") return this.bridge.resume(quote, operation, context);
    if (quote.kind === "inventory") throw new TradingError("unsafe_retry", "An inventory plan is not resumed; reconcile it, then read the inventory and plan again.");
    if (quote.kind !== "claim") throw new TradingError("unsafe_retry", "A swap request cannot be resubmitted by recovery.");
    return this.claim(quote, context, (operation.checkpoint as { claims?: ClaimItem[] } | undefined)?.claims);
  }
}
