import {
  createBridgeCheckpoint, DEFAULT_BRIDGE_REGISTRY, parseDecimalAmount,
  type BridgeCheckpoint, type BridgeClient, type BridgeProgress, type BridgeQuote, type BridgeReceipt,
} from "@provablehq/aleo-bridge-sdk";
import { TradingStore } from "./store";
import { createBridgeSessionFactory } from "./bridge-session";
import { bridgeContext, type BridgeState } from "./bridge-state";
import { TradingError, type ExecutionContext, type Operation, type Profile, type Progress, type SavedQuote, type Summary } from "./types";

export type BridgeOffer = { quote: BridgeQuote; sourceBalance: "public"; privateMintSecretNonce?: string };
export type BridgeSessionFactory = (profile: Profile) => Promise<BridgeClient>;
const chainId = (name: string, profile: Profile): string => {
  if (!["aleo", "ethereum", "solana"].includes(name)) throw new TradingError("unsupported_chain", "This chain is not configured.");
  if (profile.network === "mainnet") return name;
  if (name === "solana") throw new TradingError("unsupported_network", "The SDK registry has no Solana testnet route.");
  return name === "aleo" ? "aleo-testnet" : "sepolia";
};
function address(name: string, profile: Profile): string {
  const value = name === "aleo" ? profile.address : name === "ethereum" ? profile.evm?.address : profile.solana?.address;
  if (!value) throw new TradingError("setup_required", "Configure both bridge endpoint wallets in the trusted terminal.");
  return value;
}
function publicReceipt(receipt: BridgeReceipt, next: string): Summary {
  return { bridgeId: receipt.id, protocol: receipt.protocol, bridgeStatus: receipt.status,
    sourceTransactionId: receipt.sourceTxId, destinationTransactionId: receipt.destinationTxId,
    messageId: receipt.messageId, nextAction: next };
}
export function mergeCheckpoint(old: BridgeCheckpoint | undefined, next: BridgeCheckpoint): BridgeCheckpoint {
  const destination = old?.destination || next.destination ? { ...old?.destination, ...next.destination } : undefined;
  if (destination?.transactionId) delete destination.preparedTransaction;
  return { ...next,
    source: old?.source || next.source ? { ...old?.source, ...next.source } : undefined,
    destination,
    deliveryVerification: next.deliveryVerification ?? old?.deliveryVerification };
}
export class BridgeBackend {
  private session: BridgeSessionFactory;
  constructor(private store: TradingStore, session?: BridgeSessionFactory) {
    this.session = session ?? createBridgeSessionFactory(store);
  }

  routes(profile: Profile, input: Summary): Summary {
    const supported = new Set(profile.network === "mainnet" ? ["aleo", "ethereum", "solana"] : ["aleo-testnet", "sepolia"]);
    const registry = DEFAULT_BRIDGE_REGISTRY;
    const assets = registry.getAssets({ environment: profile.network });
    const routes = registry.getRoutes({ environment: profile.network, includeUnavailable: true }).filter(route => {
      const from = assets.find(asset => asset.id === route.sourceAssetId);
      const to = assets.find(asset => asset.id === route.destinationAssetId);
      return from && to && supported.has(from.chainId) && supported.has(to.chainId);
    }).map(route => ({ routeId: route.id, protocol: route.protocol, network: route.environment, availability: route.availability,
      source: assets.find(asset => asset.id === route.sourceAssetId), destination: assets.find(asset => asset.id === route.destinationAssetId),
      minimumAmountAtomic: route.metadata?.minimumAmountAtomic, withdrawalFeeAtomic: route.metadata?.withdrawalFeeAtomic }));
    const offset = Number(input.offset ?? 0), limit = Number(input.limit ?? 25);
    return { routes: routes.slice(offset, offset + limit), total: routes.length, offset, limit, registryVersion: registry.version };
  }

  async quote(profile: Profile, input: Summary) {
    const client = await this.session(profile);
    if (client.environment !== profile.network) throw new TradingError("network_mismatch", "Bridge client environment does not match the wallet profile.");
    const source = String(input.sourceChain), destination = String(input.destinationChain);
    const sourceChain = chainId(source, profile), destinationChain = chainId(destination, profile);
    const mintMode = input.mintMode as "public" | "record" | "private" | undefined;
    let privateMintSecretNonce: string | undefined;
    if (mintMode === "private") {
      const { loadNetwork } = await import("@provablehq/sdk/dynamic.js");
      privateMintSecretNonce = (await loadNetwork(profile.network)).Scalar.random().toString();
    }
    const quote = await client.quote({ source: { chain: sourceChain, asset: String(input.sourceAsset).toLowerCase() },
      destination: { chain: destinationChain, asset: String(input.destinationAsset).toLowerCase() },
      bridgeProtocol: input.protocol as "xreserve" | "hyperlane" | "cctp" | undefined,
      amount: String(input.amount), sender: address(source, profile), recipient: address(destination, profile),
      ...(mintMode ? { mintMode } : {}), ...(privateMintSecretNonce ? { privateMintSecretNonce } : {}) });
    if (quote.plan.route.environment !== profile.network) throw new TradingError("network_mismatch", "Quoted bridge route does not match the wallet network.");
    const plan: BridgeOffer = { quote, sourceBalance: "public", ...(privateMintSecretNonce ? { privateMintSecretNonce } : {}) };
    const amounts: Summary = {};
    for (const field of ["nativeFeeAtomic", "nativeValueAtomic", "maxFeeAtomic", "gasPaymentMicrocredits", "balanceAtomic"] as const) {
      if (field in quote) amounts[field] = String((quote as unknown as Summary)[field]);
    }
    if ("approvalRequired" in quote) amounts.approvalRequired = quote.approvalRequired;
    return { plan, summary: {
      quoteKind: quote.kind, routeId: quote.plan.route.id, protocol: quote.plan.protocol,
      sourceChain, destinationChain, tokenIn: quote.plan.sourceAsset.id, tokenOut: quote.plan.destinationAsset.id,
      inputSymbol: quote.plan.sourceAsset.symbol, outputSymbol: quote.plan.destinationAsset.symbol,
      inputDecimals: quote.plan.sourceAsset.decimals, outputDecimals: quote.plan.destinationAsset.decimals,
      amountIn: parseDecimalAmount(quote.plan.amountIn, quote.plan.sourceAsset.decimals).toString(),
      expectedAmountOut: "amountOut" in quote ? quote.amountOut : quote.plan.amountOut,
      sender: quote.plan.sender, recipient: quote.plan.recipient, sourceBalance: "public",
      destinationBalance: quote.plan.mintMode, fees: "fees" in quote ? quote.fees : quote.plan.fees, feesMayChange: true, ...amounts,
    } };
  }

  private progress(value: BridgeProgress, state: BridgeState): Progress {
    state.receipt = value.receipt;
    state.checkpoint = mergeCheckpoint(state.checkpoint, createBridgeCheckpoint(value.plan, value.receipt));
    return { status: value.next === "done" ? "complete" : value.next === "failed" ? "failed" : "pending",
      result: publicReceipt(value.receipt, value.next), checkpoint: state };
  }

  async execute(offer: SavedQuote, context: ExecutionContext): Promise<Progress> {
    const client = await this.session(offer.profile);
    const saved = offer.plan as BridgeOffer;
    const state: BridgeState = { version: 1, plan: saved.quote.plan, started: true,
      ...(saved.quote.kind === "evm-xreserve" ? { hookData: saved.quote.hookData } : {}) };
    const persist = () => context.checkpoint(state);
    persist();
    return bridgeContext.run({ state, persist }, async () => {
      let result;
      try {
        result = await client.execute({ plan: saved.quote.plan, mode: saved.quote.kind === "aleo-xreserve" ? "public-as-signer" : undefined,
        privateMintSecretNonce: saved.privateMintSecretNonce, confirmationTimeoutMs: 30_000,
        onCheckpoint: checkpoint => { state.checkpoint = mergeCheckpoint(state.checkpoint, checkpoint); persist(); } });
      } catch (error) {
        // Owned EVM/Solana transports persist before sending; the native Aleo
        // adapter awaits its prepared checkpoint before broadcasting. Only an
        // observed failure before either boundary proves nothing was submitted.
        // A process interruption never writes this marker and stays uncertain.
        if (state.checkpoint || state.unknownSubmission) throw error;
        state.notSubmitted = true;
        persist();
        return { status: "failed", result: { error: { code: "not_submitted",
          message: "Bridge preparation failed before submission. Check balances and request a fresh quote." } }, checkpoint: state };
      }
      state.checkpoint = mergeCheckpoint(state.checkpoint, createBridgeCheckpoint(saved.quote.plan, result.receipt));
      persist();
      return this.progress({ next: result.receipt.status === "COMPLETED" ? "done" : "wait", plan: saved.quote.plan, receipt: result.receipt }, state);
    });
  }

  private async recover(client: BridgeClient, state: BridgeState): Promise<BridgeProgress> {
    const progress = await client.recover({ checkpoint: state.checkpoint! });
    // Native recovery reconstructs some routes only through source confirmation.
    // Refresh the recovered delivery receipt so destination acceptance can finish
    // the operation instead of restarting at DELIVERY_PENDING on every poll.
    if (progress.next !== "wait" || progress.receipt.status !== "DELIVERY_PENDING") return progress;
    const receipt = await client.getStatus({ plan: progress.plan, receipt: progress.receipt });
    if (receipt.status === "COMPLETED") return { next: "done", plan: progress.plan, receipt };
    if (receipt.status === "FAILED" || receipt.status === "EXPIRED") return {
      next: "failed", plan: progress.plan, receipt, error: "Bridge delivery failed.",
    };
    return { ...progress, receipt };
  }

  async reconcile(offer: SavedQuote, operation: Operation): Promise<Progress> {
    const state = operation.checkpoint as BridgeState | undefined;
    if (!state?.started || (state.notSubmitted && !state.checkpoint && !state.unknownSubmission)) return { status: "failed", result: { error: { code: "not_submitted", message: "Bridge execution did not start." } } };
    if (!state.checkpoint || state.unknownSubmission) return { status: "uncertain",
      result: { nextAction: "reconcile", error: { code: "submission_uncertain", message: "No conclusive bridge submission checkpoint is available. Do not submit this transfer again." } } };
    const client = await this.session(offer.profile);
    return this.progress(await this.recover(client, state), state);
  }

  async resume(offer: SavedQuote, operation: Operation, context: ExecutionContext): Promise<Progress> {
    const state = operation.checkpoint as BridgeState | undefined;
    if (!state?.checkpoint || state.unknownSubmission) return this.reconcile(offer, operation);
    const client = await this.session(offer.profile);
    const progress = await this.recover(client, state);
    if (progress.next !== "resume" && progress.next !== "complete") return this.progress(progress, state);
    const persist = () => context.checkpoint(state);
    const onCheckpoint = (checkpoint: BridgeCheckpoint) => { state.checkpoint = mergeCheckpoint(state.checkpoint, checkpoint); persist(); };
    return bridgeContext.run({ state, persist }, async () => {
      const options = { progress, privateMintSecretNonce: (offer.plan as BridgeOffer).privateMintSecretNonce, onCheckpoint };
      const result = progress.next === "resume"
        ? await client.resume({ ...options, progress, confirmationTimeoutMs: 30_000 })
        : await client.complete({ ...options, progress });
      state.checkpoint = mergeCheckpoint(state.checkpoint, createBridgeCheckpoint(progress.plan, result.receipt));
      persist();
      return this.progress({ next: result.receipt.status === "COMPLETED" ? "done" : "wait", plan: progress.plan, receipt: result.receipt }, state);
    });
  }
}
