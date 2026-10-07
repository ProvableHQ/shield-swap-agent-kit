import type { BlindedIdentityRecord, SwapQuote } from "@provablehq/shield-swap-sdk";
import { BridgeBackend } from "./bridge";
import { TradingStore } from "./store";
import { createSessionFactory, swapContext, walletScope, type AleoSession, type SessionFactory, type SwapSubmission } from "./session";
import { TradingError, type ExecutionContext, type Kind, type Operation, type Profile, type Progress, type SavedQuote, type Summary, type TradingBackend } from "./types";

type ClaimItem = { swapId: string; status: "pending" | "submitting" | "claimed" | "uncertain"; transactionId?: string; amountOut?: string; amountRemaining?: string };
type ClaimPlan = { swapIds: string[] };
type SwapCheckpoint = { submissionBoundary?: number; phase?: string; counter?: number; swapId?: string; transactionId?: string };
export class VeilBackend implements TradingBackend {
  private session: SessionFactory;
  private bridge: BridgeBackend;
  constructor(private store: TradingStore, session?: SessionFactory) { this.session = session ?? createSessionFactory(store); this.bridge = new BridgeBackend(store); }

  async quote(kind: Kind, profile: Profile, input: Summary) {
    if (kind === "bridge") return this.bridge.quote(profile, input);
    const { client } = await this.session(profile);
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

  async execute(quote: SavedQuote, context: ExecutionContext): Promise<Progress> {
    if (quote.kind === "bridge") return this.bridge.execute(quote, context);
    if (quote.kind === "claim") return this.claim(quote, context);
    const session = await this.session(quote.profile);
    const initial = new Set((await session.identities.load()).map(record => record.counter));
    const state: SwapSubmission = { execution: context, initial, submissionStarted: false,
      checkpoint: { phase: "preparing", ...(session.submissionTracked ? { submissionBoundary: 1 } : {}) } };
    context.checkpoint(state.checkpoint);
    let handle;
    try {
      handle = await swapContext.run(state, () => session.client.swap({ quote: quote.plan as SwapQuote }));
    } catch (error) {
      if (!session.submissionTracked || state.submissionStarted) throw error;
      return { status: "failed", result: { error: { code: "not_submitted",
        message: "Swap preparation failed before proving or submission. Check balances and request a fresh quote." } },
        checkpoint: state.checkpoint };
    }
    context.checkpoint({ phase: "submitted", swapId: handle.swapId, transactionId: handle.transactionId });
    return { status: "submitted", result: { transactionId: handle.transactionId, swapId: handle.swapId, nextAction: "claim_when_ready" } };
  }

  async read(action: string, profile: Profile, input: Summary): Promise<Summary> {
    if (action === "list_bridge_routes") return this.bridge.routes(profile, input);
    const session = await this.session(profile);
    const { client } = session;
    const offset = Number(input.offset ?? 0), limit = Number(input.limit ?? 25);
    switch (action) {
      case "get_wallet_status": return { profileId: profile.id, network: profile.network, address: profile.address, signerReady: true, policy: profile.policy };
      case "get_balances": {
        const tokens = input.tokens as string[] | undefined;
        const resolved = tokens ? await Promise.all(tokens.map(token => client.tokenData(token))) : undefined;
        const balances = await client.getBalances({ tokens: resolved?.map(token => token.id) });
        return { network: profile.network, address: profile.address, balances: Object.entries(balances).map(([tokenId, value]) => ({
          tokenId, symbol: value.symbol, decimals: value.decimals, public: value.public.toString(), private: value.private.toString(), total: value.total.toString(),
        })) };
      }
      case "list_tokens": {
        const tokens = await client.listTokens();
        return { tokens: tokens.slice(offset, offset + limit), total: tokens.length, offset, limit };
      }
      case "list_pools": {
        const response = await client.api.getPools({ limit, offset });
        return { pools: response.data, pagination: response.pagination };
      }
      case "swap_history": return this.store.withLock(walletScope(profile), async () => {
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
      });
      default: throw new TradingError("unsupported_action", "This action is not available for this wallet.");
    }
  }

  private async discover(session: AleoSession, profile: Profile): Promise<Summary> {
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

  private async reconcileHistory(session: AleoSession, profile: Profile) {
    // SDK 0.12 caches a negative result at the current history tip. Pending
    // transactions can land after that scan, so only concrete claims are final.
    const records = await session.identities.load();
    if (records.some(record => !record.claim && record.claimSearched)) {
      await session.identities.save(records.map(record => record.claim ? record : { ...record, claimSearched: false }));
    }
    const key = "history-recovery:" + walletScope(profile);
    const pageLimit = this.store.get<number>(key) ?? 10;
    const result = await session.client.reconcileSwapHistory({ maxPages: pageLimit });
    // The public SDK restarts from the newest page; increase the window after
    // an incomplete scan so older claims remain reachable across polls/restarts.
    this.store.set(key, result.complete ? 10 : Math.min(Number.MAX_SAFE_INTEGER, pageLimit * 2));
    return { complete: result.complete, pagesScanned: result.pagesScanned, pageLimit };
  }

  async reconcile(quote: SavedQuote, operation: Operation): Promise<Progress> {
    if (quote.kind === "bridge") return this.bridge.reconcile(quote, operation);
    const session = await this.session(quote.profile);
    if (quote.kind === "claim") return this.reconcileClaims(quote, operation, session);
    const checkpoint = operation.checkpoint as SwapCheckpoint | undefined;
    if (!checkpoint || checkpoint.phase === "preparing" || (checkpoint.submissionBoundary === 1 && checkpoint.phase === "reserved")) return { status: "failed", result: { error: { code: "not_submitted", message: "Execution did not reach the proving or submission boundary." } } };
    const historyRecovery = await this.reconcileHistory(session, quote.profile);
    const records = await session.identities.load();
    const record = records.find(item => checkpoint.swapId ? item.swapId === checkpoint.swapId : item.counter === checkpoint.counter);
    if (record?.claim) return { status: "complete", result: { historyRecovery, swapId: record.swapId, transactionId: record.handle?.transactionId,
      claimTransactionId: record.claim.transactionId, amountOut: record.claim.amountOut, amountRemaining: record.claim.amountRemaining } };
    const pending = await session.client.getUnclaimedSwaps();
    const found = pending.swaps.find(swap => swap.swapId === (record?.swapId ?? checkpoint.swapId));
    if (found) return { status: "submitted", result: { historyRecovery, swapId: found.swapId, transactionId: record?.handle?.transactionId ?? checkpoint.transactionId,
      claimable: found.claimable, amountOut: found.output.amount_out.toString(), nextAction: "claim_when_ready" } };
    return { status: record?.handle || checkpoint.transactionId ? "pending" : "uncertain",
      result: { historyRecovery, swapId: record?.swapId ?? checkpoint.swapId, transactionId: record?.handle?.transactionId ?? checkpoint.transactionId, nextAction: "wait" } };
  }

  private async claim(quote: SavedQuote, context: ExecutionContext, prior: ClaimItem[] = []): Promise<Progress> {
    const { client } = await this.session(quote.profile);
    const items: ClaimItem[] = (quote.plan as ClaimPlan).swapIds.map(swapId => prior.find(item => item.swapId === swapId) ?? { swapId, status: "pending" });
    for (const item of items) {
      if (item.status === "claimed") continue;
      if (item.status === "uncertain" || item.status === "submitting") return { status: "uncertain", result: { claims: items, nextAction: "reconcile" } };
      const owed = (await client.getUnclaimedSwaps()).swaps.find(swap => swap.swapId === item.swapId);
      if (!owed?.handle) return { status: "pending", result: { claims: items, nextAction: "wait" }, checkpoint: { claims: items } };
      item.status = "submitting";
      context.checkpoint({ claims: items });
      try {
        const result = await client.claimSwapOutput({ handle: owed.handle });
        Object.assign(item, { status: "claimed", transactionId: result.transactionId, amountOut: result.amountOut.toString(), amountRemaining: result.amountRemaining.toString() });
        context.checkpoint({ claims: items });
      } catch {
        item.status = "uncertain";
        context.checkpoint({ claims: items });
        return { status: "uncertain", result: { claims: items, nextAction: "reconcile" } };
      }
    }
    return { status: "complete", result: { claims: items }, checkpoint: { claims: items } };
  }

  private async reconcileClaims(quote: SavedQuote, operation: Operation, session: AleoSession): Promise<Progress> {
    const historyRecovery = await this.reconcileHistory(session, quote.profile);
    const records = await session.identities.load();
    const previous = (operation.checkpoint as { claims?: ClaimItem[] } | undefined)?.claims ?? [];
    const items = (quote.plan as ClaimPlan).swapIds.map(swapId => {
      const record = records.find(record => record.swapId === swapId);
      const prior = previous.find(item => item.swapId === swapId);
      return record?.claim ? { swapId, status: "claimed" as const, transactionId: record.claim.transactionId, amountOut: record.claim.amountOut, amountRemaining: record.claim.amountRemaining }
        : prior ?? { swapId, status: "pending" as const };
    });
    const uncertain = items.some(item => item.status === "submitting" || item.status === "uncertain");
    const complete = items.every(item => item.status === "claimed");
    return { status: complete ? "complete" : uncertain ? "uncertain" : "pending",
      result: { historyRecovery, claims: items, nextAction: complete ? "done" : uncertain ? "reconcile" : "claim" }, checkpoint: { claims: items } };
  }

  async resume(quote: SavedQuote, operation: Operation, context: ExecutionContext): Promise<Progress> {
    if (quote.kind === "bridge") return this.bridge.resume(quote, operation, context);
    if (quote.kind !== "claim") throw new TradingError("unsafe_retry", "A swap request cannot be resubmitted by recovery.");
    return this.claim(quote, context, (operation.checkpoint as { claims?: ClaimItem[] } | undefined)?.claims);
  }
}
