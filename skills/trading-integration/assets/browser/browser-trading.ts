import { getConfirmedTransaction, transactionStatus, TransportError, type InputRequest, type Transaction, type Transition, type WalletClient } from '@provablehq/veil-core';
import { shieldSwapActions, type ClaimSwapOutputReturnType, type MultiHopSwapHandle, type QuoteParameters, type ShieldSwapActionsConfig, type SwapHandle, type SwapQuote } from '@provablehq/shield-swap-sdk';

type Handle = SwapHandle | MultiHopSwapHandle;
type RecordRequest = Extract<InputRequest, { type: 'record' }>;
export type Offer = { scope: string; quote: SwapQuote };
export type Progress = {
  id: string; scope: string; quote: SwapQuote;
  status: 'submitting' | 'submission_unknown' | 'submitted' | 'ready' | 'claiming' | 'claim_unknown' | 'claim_submitted' | 'complete' | 'rejected';
  handle?: Handle; claim?: ClaimSwapOutputReturnType;
  output?: { amountOut: bigint; amountRemaining: bigint };
};
export interface LockProvider { request<T>(name: string, callback: () => Promise<T>): Promise<T> }
export class CheckpointWriteError extends Error {
  constructor(readonly checkpoint: Progress, cause: unknown) {
    super('Saving trading progress failed; preserve this checkpoint and do not resubmit', { cause });
  }
}
export type Policy = {
  maxInFlight: number;
  maxInputByToken: Readonly<Record<string, bigint>>;
  allowedOutputs: readonly string[];
  maxSlippageBps: number;
};

function encode(value: unknown): string {
  return JSON.stringify(value, (_, item) => typeof item === 'bigint' ? { $bigint: item.toString() } : item);
}
function decode<T>(value: string): T {
  return JSON.parse(value, (_, item) => item && typeof item === 'object' && Object.keys(item).length === 1 && typeof item.$bigint === 'string' ? BigInt(item.$bigint) : item);
}
function stable(value: unknown): string {
  if (typeof value === 'bigint') return `bigint:${value}`;
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(',')}}`;
  return JSON.stringify(value);
}

/** Stores public wallet handles, never a view key, private key or blinding factor.
 * All app tabs must use the same origin, storage and lock name. Clearing site
 * data removes recovery state; localStorage is not an encrypted backup.
 */
export function createBrowserTrading(options: {
  connectedClient: WalletClient;
  currentClient: () => WalletClient | undefined;
  address: string;
  network: 'mainnet' | 'testnet';
  policy: Policy;
  recordForQuote: (quote: SwapQuote) => RecordRequest;
  executionEnabled?: boolean;
  storage?: Pick<Storage, 'getItem' | 'setItem'>;
  locks?: LockProvider;
  sdk?: ShieldSwapActionsConfig;
}) {
  const base = options.connectedClient;
  const scope = `aleo:${options.network}:${options.address}`;
  const key = `shield-trading:v1:${scope}`;
  const storage = options.storage ?? globalThis.localStorage;
  const locks = options.locks ?? globalThis.navigator?.locks;
  if (!storage || !locks) throw Error('Durable browser storage and Web Locks are required');
  if (!Number.isInteger(options.policy.maxInFlight) || options.policy.maxInFlight < 1) throw Error('Set a positive operation limit');
  if (!Number.isInteger(options.policy.maxSlippageBps) || options.policy.maxSlippageBps < 0 || options.policy.maxSlippageBps >= 10_000 ||
      !options.policy.allowedOutputs.length || !Object.keys(options.policy.maxInputByToken).length ||
      Object.values(options.policy.maxInputByToken).some(amount => typeof amount !== 'bigint' || amount <= 0n)) {
    throw Error('Supply positive base-unit input limits, output assets, and integer slippage below 10000 bps');
  }
  // An explicit login action may ask the wallet to sign a message. Preview must not.
  if (options.sdk?.api && 'authenticate' in options.sdk.api) throw Error('Supply API options, not an API instance with unknown reauthentication settings');
  // Guard again at dispatch, including when the user changes wallets while the
  // SDK is awaiting chain reads during claim construction.
  const scopedRequest = (args: Parameters<typeof base.request>[0]) => {
    assertSession();
    return base.request(args);
  };
  const guarded = new Proxy(base, { get(target, property, receiver) {
    return property === 'request' ? scopedRequest : Reflect.get(target, property, receiver);
  } });
  const client = shieldSwapActions({ ...options.sdk,
    api: { credentials: 'include', ...options.sdk?.api, autoReauthenticate: false },
  })(guarded);
  function assertSession() {
    if (options.currentClient() !== base || base.account?.type !== 'rpc' || base.account.address !== options.address || base.transport.config.network !== options.network) {
      throw Error('Connected wallet or network changed; create a new integration for that session');
    }
  }
  assertSession();
  function read(): Progress[] {
    const raw = storage.getItem(key);
    const rows = raw ? decode<Progress[]>(raw) : [];
    if (!Array.isArray(rows) || rows.some(row => row.scope !== scope || !row.id || !row.status)) throw Error('Recovery journal is invalid; do not replace it');
    return rows;
  }
  function save(row: Progress) {
    if (row.handle?.blindingFactor) throw Error('Wallet integration refuses secret handle material');
    const rows = read();
    const index = rows.findIndex(entry => entry.id === row.id);
    if (index === -1) rows.push(row); else rows[index] = row;
    try { storage.setItem(key, encode(rows)); }
    catch (cause) { throw new CheckpointWriteError(row, cause); }
    return row;
  }
  function status(id: string) { assertSession(); return read().find(row => row.id === id); }
  function listProgress() { assertSession(); return read(); }
  function requireWrite() {
    assertSession();
    if (!options.executionEnabled) throw Error('Enable transactions only after configuring the app spending policy');
  }
  function checkTerms(offer: Offer) {
    assertSession();
    const q = offer.quote;
    if (offer.scope !== scope || q.network !== options.network) throw Error('Quote belongs to another wallet or network');
    if (Date.now() < q.quotedAt || Date.now() >= q.expiresAt) throw Error('Quote expired');
    const max = options.policy.maxInputByToken[q.from.id];
    if (!max || q.amountIn <= 0n || q.amountIn > max || !options.policy.allowedOutputs.includes(q.to.id) || q.slippageBps > options.policy.maxSlippageBps) throw Error('Quote exceeds the app spending policy');
  }
  async function preview(params: Pick<QuoteParameters, 'from' | 'to' | 'amountIn' | 'slippageBps'>): Promise<Offer> {
    assertSession();
    const quote = await client.quote(params);
    assertSession();
    return { scope, quote };
  }
  async function submit(id: string, offer: Offer): Promise<Progress> {
    offer = decode<Offer>(encode(offer)); // Freeze accepted terms across asynchronous wallet work.
    return locks.request(key, async () => {
      requireWrite();
      if (!id.trim()) throw Error('Use a stable app request ID');
      const existing = status(id);
      if (existing) {
        if (existing.scope !== offer.scope || stable(existing.quote) !== stable(offer.quote)) throw Error('Request ID already has different quote terms');
        return existing;
      }
      checkTerms(offer);
      const unresolved = read().filter(row => row.status !== 'complete' && row.status !== 'rejected');
      if (unresolved.length >= options.policy.maxInFlight) throw Error('Unresolved operation limit reached');
      const record = options.recordForQuote(offer.quote);
      if (record.type !== 'record' || !record.program || !record.recordname || (record.uid && record.filters)) throw Error('Supply a wallet record request with verified asset metadata');
      let row = save({ id, scope, quote: offer.quote, status: 'submitting' });
      try {
        assertSession();
        const handle = await client.swap({ quote: offer.quote, tokenRecord: record });
        row = { ...row, handle, status: 'submitted' };
      } catch {
        row = { ...row, status: 'submission_unknown' };
      }
      return save(row);
    });
  }
  async function confirmed(transactionId: string) {
    // Wallet providers may return request IDs; map those to the actual chain ID.
    const state = await transactionStatus(base, { transactionId });
    assertSession();
    const chainId = state.transactionId ?? transactionId;
    if (!chainId.startsWith('at1')) return undefined;
    let result;
    try { result = await getConfirmedTransaction(base, { id: chainId }); }
    catch (error) {
      assertSession();
      if (error instanceof TransportError && error.status === 404) return undefined;
      throw error;
    }
    assertSession();
    if (result.transaction.id !== chainId) throw Error('Confirmed transaction ID mismatch');
    return result;
  }
  function publicAt(call: Transition, index: number, expected: string) {
    const input = call.inputs?.[index];
    return input?.type === 'public' && input.value === expected;
  }
  async function updateProgress(id: string): Promise<Progress> {
    let row = status(id);
    if (!row) throw Error('Unknown request ID');
    if (row.status === 'claim_submitted' && row.claim) {
      const chain = await confirmed(row.claim.transactionId);
      if (!chain) return row;
      if (chain.status === 'rejected') return save({ ...row, status: 'claim_unknown' });
      if (chain.status !== 'accepted') return row;
      const tx = chain.transaction as Transaction;
      // Core ABI: blinded address 1, swap ID 2, tokens 3/4, amounts 5[/6].
      // Router claims include the core transition as a nested call.
      const expectedFn = row.claim.amountRemaining === 0n ? 'claim_swap_output_no_refund' : 'claim_swap_output';
      const calls = tx.execution?.transitions.filter(t => t.program === row!.handle!.program && t.function === expectedFn &&
        publicAt(t, 1, row!.handle!.blindedAddress!) && publicAt(t, 2, row!.handle!.swapId!) &&
        publicAt(t, 3, row!.handle!.tokenInId) && publicAt(t, 4, row!.handle!.tokenOutId) &&
        publicAt(t, 5, `${row!.claim!.amountOut}u128`) &&
        (row!.claim!.amountRemaining === 0n || publicAt(t, 6, `${row!.claim!.amountRemaining}u128`))) ?? [];
      if (calls.length !== 1) throw Error('Confirmed claim does not match this swap');
      return save({ ...row, claim: { ...row.claim, transactionId: tx.id }, status: 'complete' });
    }
    if (row.status !== 'submitted' || !row.handle) return row;
    const chain = await confirmed(row.handle.transactionId);
    if (!chain) return row;
    if (chain.status === 'rejected') return save({ ...row, status: 'rejected' });
    if (chain.status !== 'accepted') return row;
    const tx = chain.transaction as Transaction;
    const fn = row.quote.hops.length > 1 ? 'swap_multi_hop' : 'swap';
    const calls = tx.execution?.transitions.filter(t => t.program === row!.handle!.program && t.function === fn) ?? [];
    if (calls.length !== 1) throw Error('Expected one core swap transition');
    const ids = calls[0].outputs?.filter(out => out.type === 'public' && /^\d+field$/.test(out.value ?? '')) ?? [];
    if (ids.length !== 1) throw Error('Expected one public swap ID output');
    const swapId = ids[0].value!;
    const output = await client.getSwapOutput({ swapId, program: row.handle.program });
    assertSession();
    if (!output) return row; // Absence is not proof of claim completion.
    if (output.token_in !== row.handle.tokenInId || output.token_out !== row.handle.tokenOutId) throw Error('Swap output assets do not match the saved handle');
    const call = calls[0];
    const multi = 'poolKeys' in row.handle;
    if (!publicAt(call, multi ? 1 : 2, output.recipient) ||
        !publicAt(call, 5, `${row.handle.amountIn}u128`) || !publicAt(call, 6, `${row.quote.minOut}u128`) ||
        (multi ? !publicAt(call, 3, row.handle.tokenInId) || !publicAt(call, 4, row.handle.tokenOutId)
          : !publicAt(call, 3, (row.handle as SwapHandle).poolKey))) throw Error('Confirmed swap inputs do not match the saved terms');
    return save({ ...row, output: { amountOut: output.amount_out, amountRemaining: output.amount_remaining },
      handle: { ...row.handle, transactionId: tx.id, swapId, blindedAddress: output.recipient }, status: 'ready' });
  }
  async function checkProgress(id: string) { return locks.request(key, () => updateProgress(id)); }
  async function claim(id: string): Promise<Progress> {
    return locks.request(key, async () => {
      requireWrite();
      let row = await updateProgress(id);
      if (row.status !== 'ready' || !row.handle) return row;
      row = save({ ...row, status: 'claiming' });
      try {
        assertSession();
        const result = await client.claimSwapOutput({ handle: row.handle! });
        // RPC claims return before acceptance. checkProgress confirms separately.
        row = { ...row, claim: result, status: 'claim_submitted' };
      } catch {
        row = { ...row, status: 'claim_unknown' };
      }
      return save(row);
    });
  }
  async function authenticate() { assertSession(); await client.authenticateShieldSwap(); assertSession(); }
  return { preview, submit, status, listProgress, checkProgress, claim, authenticate };
}
