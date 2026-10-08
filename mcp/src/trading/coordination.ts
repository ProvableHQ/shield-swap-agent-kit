import type { Profile } from "./types";
import { TradingStore } from "./store";
import { walletScope } from "./session";

// The identity store stays program-scoped, while record selection and nonces
// belong to accounts. Conservatively coordinate every wallet in the profile.
export function accountScopes(profile: Profile): string[] {
  return [profile.network + ":aleo:" + profile.address,
    ...(profile.evm ? [profile.network + ":evm:" + profile.evm.address.toLowerCase()] : []),
    ...(profile.solana ? [profile.network + ":solana:" + profile.solana.address] : [])];
}
export function sharesAccount(first: Profile, second: Profile): boolean {
  const scopes = new Set(accountScopes(first));
  return accountScopes(second).some(scope => scopes.has(scope));
}
export function withWalletLocks<T>(store: TradingStore, profiles: Profile[], fn: () => Promise<T>): Promise<T> {
  // Keep the former program lock too, so already running older workers contend.
  const scopes = [...new Set(profiles.flatMap(p => [walletScope(p), ...accountScopes(p)]))].sort();
  const lock = (index: number): Promise<T> => index === scopes.length ? fn() : store.withLock(scopes[index], () => lock(index + 1));
  return lock(0);
}
