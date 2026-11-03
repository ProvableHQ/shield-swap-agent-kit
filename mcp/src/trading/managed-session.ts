import { AsyncLocalStorage } from "node:async_hooks";
import type { RecordSpend } from "@provablehq/veil-core";
import type { AleoSession } from "./session";
import { walletScope } from "./session";
import { withWalletLocks } from "./coordination";
import type { OwnedRecordSpend } from "./inventory";
import { operationContext, journalContext } from "./ownership";
import { TradingStore, LockBusyError } from "./store";
import type { Profile } from "./types";

const held = new AsyncLocalStorage<Set<string>>();
/** Wait only for acquisition, never retry a callback which has already started. */
export async function withIdentityLock<T>(store: TradingStore, profile: Profile, fn: () => Promise<T>): Promise<T> {
  const scope = "identity:" + walletScope(profile);
  const key = store.directory + ":" + scope;
  if (held.getStore()?.has(key)) return fn();
  const deadline = Date.now() + 120_000;
  for (;;) {
    let entered = false;
    try {
      return await store.withLock(scope, () => {
        entered = true;
        return held.run(new Set([...(held.getStore() ?? []), key]), fn);
      });
    } catch (error) {
      if (entered || !(error instanceof LockBusyError) || Date.now() >= deadline) throw error;
      await new Promise(resolve => setTimeout(resolve, 25));
    }
  }
}

/** Every SDK reconciliation sees only entries whose operation lock we own. */
export async function reconcileOwnedRecords(store: TradingStore, profile: Profile, session: AleoSession,
  params?: { rebroadcast?: boolean }): Promise<RecordSpend[]> {
  const scope = JSON.stringify(["aleo:" + profile.network, profile.address]);
  const read = () => store.list<OwnedRecordSpend>("inventory:").filter(entry => entry.scope === scope);
  const current = operationContext.getStore()?.operationId;
  const owners = current ? [current] : [...new Set(read().map(entry => entry.operationId))];
  const reconcile = async (owner?: string) => journalContext.run({ owner }, async () => {
    const entries = await session.client.reconcileRecordInventory(params);
    for (const entry of entries) {
      if (entry.status === "reserved" && !entry.transactionId && entry.accountType === "local")
        await session.client.recordManagement!.store!.update(entry.scope, entry.id, { status: "cancelled" });
    }
  });
  for (const owner of owners) {
    if (owner === current && current) { await reconcile(owner); continue; }
    let entered = false;
    try {
      const work = async () => { entered = true; await reconcile(owner); };
      if (owner) await store.withLock("operation:" + owner, work);
      else await withWalletLocks(store, [profile], work);
    } catch (error) {
      if (entered || !(error instanceof LockBusyError)) throw error;
      // A live writer owns this entry. It is still visible in the snapshot.
    }
  }
  return read().filter(entry => !current || entry.operationId === current);
}

/** Coordinate only identity bookkeeping; proof generation remains concurrent. */
export function coordinateSession(store: TradingStore, profile: Profile, session: AleoSession): AleoSession {
  const client = session.client;
  const reserve = client.reserveBlindedIdentity.bind(client);
  const record = client.recordBlindedSwap.bind(client);
  const swap = client.swap.bind(client);
  const claim = client.claimSwapOutput.bind(client);
  client.reserveBlindedIdentity = params => withIdentityLock(store, profile, () => reserve(params));
  client.recordBlindedSwap = params => withIdentityLock(store, profile, () => record(params));
  for (const method of ["syncBlindedIdentities", "getUnclaimedSwaps", "reconcileSwapHistory"] as const) {
    const original = client[method].bind(client);
    // These SDK methods all perform read-modify-save on the shared identity list.
    (client as unknown as Record<string, unknown>)[method] = (params: never) => withIdentityLock<unknown>(store, profile, () => original(params));
  }
  const managedSwap = async (params: Parameters<typeof client.swap>[0]) => {
    const identity = await client.reserveBlindedIdentity();
    const handle = await swap({ ...params, blindedIdentity: identity });
    if (!await client.recordBlindedSwap({ handle })) throw new Error("Swap identity recording failed");
    return handle;
  };
  client.swap = managedSwap as typeof client.swap;
  client.claimSwapOutput = async params => {
    // Do not let the SDK's post-transaction whole-list save race another process.
    const result = await claim({ ...params, blindedIdentities: undefined });
    await withIdentityLock(store, profile, async () => {
      const records = await session.identities.load();
      await session.identities.save(records.map(entry => entry.blindedAddress === params.handle.blindedAddress
        ? { ...entry, status: "claimed" } : entry));
    });
    return result;
  };
  session.withIdentities = fn => withIdentityLock(store, profile, fn);
  session.reconcileRecords = params => reconcileOwnedRecords(store, profile, session, params);
  return session;
}
