import { createBridgeCheckpoint, type EvmClient, type SolanaClient } from "@provablehq/aleo-bridge-sdk";
import { keccak256, type Hex } from "viem";
import { bridgeContext } from "./bridge-state";
import { TradingError } from "./types";

// Each configured signer broadcasts through this owned RPC transport. Save the
// signed transaction's identity before sending any bytes to the network.
export function checkpointFetch(chain: string, fetcher: typeof fetch = globalThis.fetch): typeof fetch {
  return async (url, init) => {
    let payload: { method?: string; params?: unknown[] } | undefined;
    if (typeof init?.body === "string") {
      const parsed = JSON.parse(init.body);
      if (Array.isArray(parsed)) {
        if (parsed.some(item => ["eth_sendRawTransaction", "eth_sendTransaction", "sendTransaction"].includes(item.method))) {
          throw new TradingError("unsupported_broadcast", "Batched transaction submission is not supported.");
        }
      } else payload = parsed;
    }
    const method = payload?.method;
    if (method === "eth_sendTransaction") throw new TradingError("unsupported_broadcast", "Bridge wallets must sign before broadcasting through the configured RPC.");
    if (method !== "eth_sendRawTransaction" && method !== "sendTransaction") return fetcher(url, init);
    const active = bridgeContext.getStore();
    if (!active?.submission || active.submission.chain !== chain) throw new TradingError("execution_context", "Bridge submission requires its durable operation context.");
    const wire = payload?.params?.[0];
    if (typeof wire !== "string") throw new TradingError("invalid_transaction", "The wallet returned an invalid signed transaction.");
    let transactionId: string;
    if (method === "eth_sendRawTransaction") transactionId = keccak256(wire as Hex);
    else {
      const kit = await import("@solana/kit");
      const decoded = kit.getTransactionDecoder().decode(Buffer.from(wire, "base64"));
      if (!kit.isFullySignedTransaction(decoded)) throw new TradingError("invalid_transaction", "The Solana transaction is not fully signed.");
      transactionId = kit.getSignatureFromTransaction(decoded);
    }
    const state = active.state;
    const checkpoint = state.checkpoint ?? createBridgeCheckpoint(state.plan, {
      id: state.plan.route.id, protocol: state.plan.protocol, status: "PREPARED",
      protocolState: { routeId: state.plan.route.id },
    });
    // Keep the exact SDK hook: private mint recovery cannot rebuild it without
    // the original nonce. Capture it even if the first approval response is lost.
    if (state.hookData) checkpoint.source = { ...checkpoint.source, hookData: state.hookData };
    if (active.submission.role === "approval") {
      checkpoint.source = { ...checkpoint.source, approvalTransactionIds: [...new Set([...(checkpoint.source?.approvalTransactionIds ?? []), transactionId])] };
    } else if (active.submission.role === "source") {
      checkpoint.source = { ...checkpoint.source, transactionId };
    } else {
      checkpoint.destination = { transactionId };
    }
    state.checkpoint = checkpoint;
    state.unknownSubmission = false;
    active.persist();
    active.submission.captured = true;
    const response = await fetcher(url, init);
    const result = await response.clone().json() as { result?: unknown };
    if (typeof result.result === "string" && result.result !== transactionId) {
      throw new TradingError("transaction_mismatch", "RPC returned a transaction identifier different from the signed transaction.");
    }
    return response;
  };
}
export function trackBridgeWallet(chain: string, client: EvmClient | SolanaClient): void {
  if (!client.walletClient) return;
  if (client.family === "evm") {
    const send = client.walletClient.sendTransaction;
    client.walletClient.sendTransaction = async params => {
      const active = bridgeContext.getStore();
      if (!active) throw new TradingError("execution_context", "Bridge submission requires a durable operation context.");
      const plan = active.state.plan;
      const approval = chain === plan.sourceAsset.chainId && params.to.toLowerCase() === plan.sourceAsset.locator?.value.toLowerCase() && params.data.startsWith("0x095ea7b3");
      active.submission = { chain, role: approval ? "approval" : chain === plan.sourceAsset.chainId ? "source" : "destination", captured: false };
      active.state.unknownSubmission = true;
      active.persist();
      try { return await send(params); }
      catch (error) {
        if (!active.submission.captured) { active.state.unknownSubmission = false; active.persist(); }
        throw error;
      } finally { active.submission = undefined; }
    };
  } else {
    const send = client.walletClient.sendTransaction;
    client.walletClient.sendTransaction = async wire => {
      const active = bridgeContext.getStore();
      if (!active) throw new TradingError("execution_context", "Bridge submission requires a durable operation context.");
      active.submission = { chain, role: chain === active.state.plan.sourceAsset.chainId ? "source" : "destination", captured: false };
      active.state.unknownSubmission = true;
      active.persist();
      try { return await send(wire); }
      catch (error) {
        if (!active.submission.captured) { active.state.unknownSubmission = false; active.persist(); }
        throw error;
      } finally { active.submission = undefined; }
    };
  }
}
