import { AsyncLocalStorage } from "node:async_hooks";
import type { LocalAccount, PublicClient, WalletClient, ProvingConfig } from "@provablehq/veil-core";
import type { BlindedIdentityRecord, BlindedIdentityStore, ShieldSwapActions } from "@provablehq/shield-swap-sdk";
import { inventoryContext, operationContext } from "./ownership";
export { inventoryContext } from "./ownership";
import { coordinateSession } from "./managed-session";
import { TradingStore } from "./store";
import { createRecordInventoryStore } from "./inventory";
import { TradingError, type ExecutionContext, type Profile, type SecretRef } from "./types";

export type AleoSession = {
  client: WalletClient & ShieldSwapActions;
  publicClient: PublicClient;
  account: LocalAccount;
  identities: BlindedIdentityStore;
  submissionTracked?: boolean;
  withIdentities?: <T>(fn: () => Promise<T>) => Promise<T>;
  reconcileRecords?: (params?: { rebroadcast?: boolean }) => Promise<import("@provablehq/veil-core").RecordSpend[]>;
};
export type SessionFactory = (profile: Profile) => Promise<AleoSession>;
export type SwapSubmission = {
  execution: ExecutionContext;
  initial: Set<number>;
  submissionStarted: boolean;
  checkpoint: Record<string, unknown>;
};
export const swapContext = new AsyncLocalStorage<SwapSubmission>();
export const claimContext = new AsyncLocalStorage<{
  beforeSubmit(): void;
  submitted(transactionId: string): void;
}>();
// Inventory maintenance submits several transactions. Record each proved
// transaction ID after the SDK journals it and before its broadcast, so a
// crash mid-plan leaves evidence without recording a proof the SDK rejected.
export function trackSwapSubmission(proving: ProvingConfig): void {
  const execute = proving.execute;
  if (!execute) throw new TradingError("proving_unavailable", "The configured SDK cannot submit Aleo transactions.");
  proving.execute = async options => {
    const active = swapContext.getStore();
    if (active) {
      // The public proving adapter may broadcast; persist before invoking it.
      active.checkpoint = { ...active.checkpoint, phase: "submitting", submissionBoundary: 1 };
      active.execution.checkpoint(active.checkpoint);
      active.submissionStarted = true;
    }
    const claim = claimContext.getStore();
    claim?.beforeSubmit();
    const inventory = inventoryContext.getStore();
    const onProgress = options.onProgress;
    // Managed writes always supply a progress handler; only observe an existing
    // one so the SDK's broadcast behavior for unmanaged calls stays unchanged.
    const result = await execute(onProgress ? { ...options, onProgress: async event => {
      // The SDK's handler enforces the fee ceiling and journals the proof. A
      // proof it rejects is never broadcast, so it is not submission evidence.
      await onProgress(event);
      if (event.type === "transaction-prepared") {
        inventory?.prepared(event.transactionId);
        claim?.submitted(event.transactionId);
        if (active) {
          active.checkpoint = { ...active.checkpoint, transactionId: event.transactionId };
          active.execution.checkpoint(active.checkpoint);
        }
      }
      if (event.type === "transaction-submitted") operationContext.getStore()?.submitted?.();
    } } : options);
    // Keep the confirmed ID even if later SDK bookkeeping or our result write fails.
    claim?.submitted(result.transactionId);
    return result;
  };
}
export function walletScope(profile: Profile): string {
  return [profile.network, profile.address, profile.program ?? "shield_swap.aleo"].join(":");
}
export function resolveSecret(ref: SecretRef | undefined, store: TradingStore, env: NodeJS.ProcessEnv = process.env): string {
  const value = ref?.type === "env" ? env[ref.name] : ref?.type === "stored" ? store.get<string>("secret:" + ref.id) : undefined;
  if (!value) throw new TradingError("wallet_locked", "A configured wallet credential is unavailable. Configure it outside the conversation.");
  return value;
}
export function createSessionFactory(store: TradingStore, env: NodeJS.ProcessEnv = process.env, authenticate = true): SessionFactory {
  const sessions = new Map<string, Promise<AleoSession>>();
  return async profile => {
    const cacheKey = JSON.stringify({ ...profile, policy: undefined });
    let pending = sessions.get(cacheKey);
    if (!pending) {
      pending = (async () => {
        const [{ loadNetwork }, { shieldSwapActions }] = await Promise.all([
          import("@provablehq/veil-aleo-sdk"), import("@provablehq/shield-swap-sdk"),
        ]);
        const network = await loadNetwork(profile.network);
        const key = resolveSecret(profile.key, store, env);
        // Shared record reservations use the same encrypted state as every
        // other document, so swaps, claims and inventory maintenance from any
        // process on this state directory see each other's held inputs.
        // Every managed write waits for its confirmation inside the proving
        // adapter; the SDK's 60s default turns ordinary block latency into an
        // interrupted plan or an uncertain swap. Operations run in background
        // workers, so match the inventory step timeout.
        const pair = network.createAleoClient({ privateKey: key, networkUrl: profile.networkUrl,
          provingMode: "delegated", useFeeMaster: profile.useFeeMaster ?? false, confirmationTimeout: 600_000,
          recordManagement: { enabled: true, store: createRecordInventoryStore(store), chainId: "aleo:" + profile.network } });
        if (pair.account.address !== profile.address) throw new TradingError("wallet_mismatch", "Configured key does not match this profile's address.");
        if (!pair.walletClient.proving) throw new TradingError("proving_unavailable", "The configured SDK has no proving adapter.");
        trackSwapSubmission(pair.walletClient.proving);
        const recordId = "identities:" + walletScope(profile);
        const identities: BlindedIdentityStore = {
          load: async () => store.get<BlindedIdentityRecord[]>(recordId) ?? [],
          save: async records => {
            store.transaction(() => {
              const previous = store.get<BlindedIdentityRecord[]>(recordId) ?? [];
              store.set(recordId, records);
              const active = swapContext.getStore();
              const reserved = active && records.find(record => active.checkpoint.counter !== undefined
                ? record.counter === active.checkpoint.counter : !previous.some(old => old.counter === record.counter));
              if (active && reserved) {
                active.checkpoint = {
                  phase: reserved.handle ? "submitted" : active.submissionStarted ? "submitting" : "reserved",
                  submissionBoundary: 1, counter: reserved.counter,
                  swapId: reserved.swapId, transactionId: reserved.handle?.transactionId,
                };
                active.execution.checkpoint(active.checkpoint);
              }
            });
          },
        };
        const client = pair.walletClient.extend(shieldSwapActions({ program: profile.program, api: { baseUrl: profile.apiUrl }, blindedIdentities: identities }));
        if (authenticate) await client.authenticateShieldSwap();
        return coordinateSession(store, profile, { client, publicClient: pair.publicClient, account: pair.account, identities, submissionTracked: true });
      })();
      sessions.set(cacheKey, pending);
      void pending.catch(() => sessions.delete(cacheKey));
    }
    return pending;
  };
}
