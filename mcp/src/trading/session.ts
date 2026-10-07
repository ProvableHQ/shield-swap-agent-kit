import { AsyncLocalStorage } from "node:async_hooks";
import type { LocalAccount, PublicClient, WalletClient } from "@provablehq/veil-core";
import type { BlindedIdentityRecord, BlindedIdentityStore, ShieldSwapActions } from "@provablehq/shield-swap-sdk";
import { TradingStore } from "./store";
import { TradingError, type ExecutionContext, type Profile, type SecretRef } from "./types";

export type AleoSession = {
  client: WalletClient & ShieldSwapActions;
  publicClient: PublicClient;
  account: LocalAccount;
  identities: BlindedIdentityStore;
};
export type SessionFactory = (profile: Profile) => Promise<AleoSession>;
export const swapContext = new AsyncLocalStorage<{ execution: ExecutionContext; initial: Set<number> }>();
export function walletScope(profile: Profile): string {
  return [profile.network, profile.address, profile.program ?? "shield_swap.aleo"].join(":");
}
export function resolveSecret(ref: SecretRef | undefined, store: TradingStore, env: NodeJS.ProcessEnv = process.env): string {
  const value = ref?.type === "env" ? env[ref.name] : ref?.type === "stored" ? store.get<string>("secret:" + ref.id) : undefined;
  if (!value) throw new TradingError("wallet_locked", "A configured wallet credential is unavailable. Configure it outside the conversation.");
  return value;
}
export function createSessionFactory(store: TradingStore, env: NodeJS.ProcessEnv = process.env): SessionFactory {
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
        const pair = network.createAleoClient({ privateKey: key, networkUrl: profile.networkUrl,
          provingMode: "delegated", useFeeMaster: profile.useFeeMaster ?? false });
        if (pair.account.address !== profile.address) throw new TradingError("wallet_mismatch", "Configured key does not match this profile's address.");
        const recordId = "identities:" + walletScope(profile);
        const identities: BlindedIdentityStore = {
          load: async () => store.get<BlindedIdentityRecord[]>(recordId) ?? [],
          save: async records => {
            store.transaction(() => {
              store.set(recordId, records);
              const active = swapContext.getStore();
              const reserved = active && records.find(record => !active.initial.has(record.counter));
              if (active && reserved) active.execution.checkpoint({
                phase: reserved.handle ? "submitted" : "reserved", counter: reserved.counter,
                swapId: reserved.swapId, transactionId: reserved.handle?.transactionId,
              });
            });
          },
        };
        const client = pair.walletClient.extend(shieldSwapActions({ program: profile.program, api: { baseUrl: profile.apiUrl }, blindedIdentities: identities }));
        await client.authenticateShieldSwap();
        return { client, publicClient: pair.publicClient, account: pair.account, identities };
      })();
      sessions.set(cacheKey, pending);
      void pending.catch(() => sessions.delete(cacheKey));
    }
    return pending;
  };
}
