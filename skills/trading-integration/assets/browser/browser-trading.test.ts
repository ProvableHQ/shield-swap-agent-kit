import test from 'node:test';
import assert from 'node:assert/strict';
import { createWalletClient, custom, TransportError, type InputRequest, type WalletClient } from '@provablehq/veil-core';
import { clearRouteCache, PROGRAM_ABI, programToTokenId, shieldSwapAlgorithmGrants } from '@provablehq/shield-swap-sdk';
import { CheckpointWriteError, createBrowserTrading, type LockProvider, type Policy } from './browser-trading.ts';

// These are explicitly fabricated offline fixtures, never deployment metadata.
const tokenA = programToTokenId('fixture_a.aleo');
const tokenB = programToTokenId('fixture_b.aleo');
const tokenC = programToTokenId('fixture_c.aleo');
const address = 'aleo1offline_connected_wallet';
const blinded = 'aleo1offline_blinded_recipient';
class StorageMock {
  data = new Map<string, string>(); fail = false;
  writes = 0; failAt = Infinity;
  getItem(key: string) { return this.data.get(key) ?? null; }
  setItem(key: string, value: string) { this.writes++; if (this.fail || this.writes === this.failAt) throw Error('Quota exceeded'); this.data.set(key, value); }
}
class LocksMock implements LockProvider {
  queue: Promise<unknown> = Promise.resolve();
  request<T>(_name: string, fn: () => Promise<T>): Promise<T> {
    const next = this.queue.then(fn); this.queue = next.catch(() => {}); return next;
  }
}
function fixture(options: { multiHop?: boolean; wrappedInput?: boolean; wrappedOutput?: boolean; noRefund?: boolean; rejectWallet?: boolean } = {}) {
  clearRouteCache();
  const storage = new StorageMock();
  const locks = new LocksMock();
  const calls: { method: string; params: any }[] = [];
  const submissions: any[] = [];
  const accepted = new Set<string>();
  let loseSubmit = false, loseClaim = false, routeUnauthorized = false;
  let exposePendingChainId = false, confirmationError: Error | undefined;
  let afterConfirmation: (() => void) | undefined;
  let signCalls = 0;
  const mappings: Record<string, string | null> = {
    pools: `{ token0: ${tokenA}, token1: ${tokenB}, fee: 300u16, enabled: true }`,
    slots: '{ tick: 0i32, tick_spacing: 10i32, sqrt_price: { hi: 1u128, lo: 0u128 }, liquidity: 10000000u128, fee_growth_global0_x_128: { hi: 0u128, lo: 0u128 }, fee_growth_global1_x_128: { hi: 0u128, lo: 0u128 } }',
    global_paused: 'false', token_allowed: 'true', token_paused: 'false', pair_paused: 'false',
    from_wrapper_token_id: null,
  };
  const request = async ({ method, params }: { method: string; params?: unknown }): Promise<unknown> => {
    const p = params as any; calls.push({ method, params });
    if (method === 'getMappingValue') {
      if (p.mapping === 'swap_outputs') return `{ recipient: ${blinded}, caller: ${blinded}, token_in: ${tokenA}, token_out: ${tokenB}, amount_out: 199u128, amount_remaining: ${options.noRefund ? 0 : 10}u128 }`;
      if (p.mapping === 'from_wrapper_token_id') {
        if (p.key === tokenA && options.wrappedInput) return programToTokenId('credits.aleo');
        if (p.key === tokenB && options.wrappedOutput) return programToTokenId('test_usdcx_stablecoin.aleo');
      }
      if (p.mapping === 'pools' && options.multiHop) return p.key === '1field'
        ? `{ token0: ${tokenA}, token1: ${tokenC}, fee: 300u16, enabled: true }`
        : `{ token0: ${tokenB}, token1: ${tokenC}, fee: 300u16, enabled: true }`;
      if (p.mapping in mappings) return mappings[p.mapping];
    }
    if (method === 'getLatestHeight') return 100;
    if (method === 'getProgram') return `program ${p.id ?? p.programId};`;
    if (method === 'executeTransaction') {
      submissions.push(p);
      if (options.rejectWallet) throw Object.assign(new Error('Wallet request rejected'), { code: 4001 });
      if (p.functionName.startsWith('claim') ? loseClaim : loseSubmit) throw Error('Wallet response lost after dispatch');
      return `wallet-request-${submissions.length}`;
    }
    if (method === 'transactionStatus') {
      const n = Number(String(p.transactionId).match(/(\d+)$/)?.[1]);
      return { status: accepted.has(`at1fixture${n}`) ? 'accepted' : 'pending', transactionId: accepted.has(`at1fixture${n}`) || exposePendingChainId ? `at1fixture${n}` : undefined };
    }
    if (method === 'getConfirmedTransaction') {
      if (confirmationError) throw confirmationError;
      if (!accepted.has(p.id)) throw new TransportError('Not confirmed', { status: 404 });
      const n = Number(String(p.id).match(/(\d+)$/)?.[1]);
      const sub = submissions[n - 1];
      const claim = sub.functionName.startsWith('claim');
      const fn = claim ? options.noRefund ? 'claim_swap_output_no_refund' : 'claim_swap_output'
        : options.multiHop ? 'swap_multi_hop' : 'swap';
      const abi = PROGRAM_ABI.functions!.find(entry => entry.name === fn)!;
      const args = claim ? sub.inputs : !options.wrappedInput ? sub.inputs : options.multiHop
        ? [sub.inputs[2], sub.inputs[3], sub.inputs[0], ...sub.inputs.slice(4)]
        : [sub.inputs[0], ...sub.inputs.slice(2)];
      const core = {
        id: 'au1fixture', program: 'shield_swap.aleo', function: fn,
        inputs: abi.inputs.map((input, index) => ({
          type: input.mode === 'public' ? 'public' : input.mode === 'private' ? 'private' : 'record', id: `input${index}`,
          value: input.mode === 'public' ? typeof args[index] === 'object' ? blinded : args[index] : undefined,
        })),
        outputs: abi.outputs.map((output, index) => ({ type: output.mode === 'public' ? 'public' : output.type.kind === 'future' ? 'future' : 'record', id: `output${index}`, value: output.mode === 'public' ? '99field' : undefined })),
        tpk: '', tcm: '',
      };
      afterConfirmation?.();
      return { status: 'accepted', type: 'execute', index: 0, finalize: [], transaction: {
        id: p.id, type: 'execute', execution: { transitions: [core,
          ...(sub.programName === 'shield_swap_router.aleo' ? [{ ...core, program: 'shield_swap_router.aleo', function: sub.functionName }] : []),
        ], global_state_root: '', proof: '' }, fee: {},
      } };
    }
    throw Error(`Unexpected offline request: ${method} ${JSON.stringify(params)}`);
  };
  const transport = custom({ request });
  transport.config.network = 'testnet';
  const client = createWalletClient({ transport, account: {
    type: 'rpc', address,
    sign: async () => { signCalls++; throw Error('Unexpected wallet sign'); },
    signMessage: async () => { signCalls++; throw Error('Unexpected wallet signMessage'); },
  } });
  let connected: WalletClient | undefined = client;
  const fetchMock: typeof fetch = async input => {
    const url = new URL(String(input));
    if (url.pathname === '/tokens') return Response.json({ data: [
      { address: tokenA, symbol: 'FIXA', decimals: 2, underlying_program: options.wrappedInput ? 'credits.aleo' : 'fixture_a.aleo' },
      { address: tokenB, symbol: 'FIXB', decimals: 2, underlying_program: 'fixture_b.aleo' },
    ] });
    if (url.pathname === '/route') return routeUnauthorized
      ? Response.json({ error: 'Expired session' }, { status: 401 })
      : Response.json({ data: { token_in: tokenA, token_out: tokenB, estimated_amount_out: '2', protocol_revision: 1,
        hops: options.multiHop ? [{ pool_key: '1field', token_in: tokenA, token_out: tokenC }, { pool_key: '2field', token_in: tokenC, token_out: tokenB }]
          : [{ pool_key: '1field', token_in: tokenA, token_out: tokenB }],
      } });
    throw Error(`Unexpected API request: ${url.pathname}`);
  };
  const create = (executionEnabled = true, policy: Partial<Policy> = {}) => createBrowserTrading({
    connectedClient: client, currentClient: () => connected, address, network: 'testnet', storage, locks,
    executionEnabled,
    policy: { maxInFlight: 2, maxInputByToken: { [tokenA]: 1000n }, allowedOutputs: [tokenB], maxSlippageBps: 100, ...policy },
    recordForQuote: (q): Extract<InputRequest, { type: 'record' }> => options.wrappedInput
      ? { type: 'record', program: 'credits.aleo', recordname: 'credits', filters: { microcredits: { gte: `${q.amountIn}u64` } } }
      : { type: 'record', program: q.from.underlyingProgram!, recordname: 'Token', filters: { amount: { gte: `${q.amountIn}u128` } } },
    sdk: { api: { baseUrl: 'https://offline.invalid', fetch: fetchMock } },
  });
  return {
    create, storage, submissions, calls, accepted, client,
    setDisconnected: () => { connected = undefined; },
    setLostSubmit: () => { loseSubmit = true; }, setLostClaim: () => { loseClaim = true; },
    setUnauthorized: () => { routeUnauthorized = true; }, signCalls: () => signCalls,
    showPendingChainId: () => { exposePendingChainId = true; },
    failConfirmation: (error: Error) => { confirmationError = error; },
    disconnectDuringConfirmation: () => { afterConfirmation = () => { connected = undefined; }; },
  };
}
const quoteArgs = { from: 'FIXA', to: 'FIXB', amountIn: '1', slippageBps: 50 };

test('invalid policy cannot silently disable amount or slippage limits', () => {
  const f = fixture();
  for (const policy of [{ maxSlippageBps: NaN }, { maxSlippageBps: 10_000 },
    { maxInputByToken: {} }, { maxInputByToken: { [tokenA]: 0n } }, { allowedOutputs: [] }]) {
    assert.throws(() => f.create(true, policy));
  }
  assert.equal(f.submissions.length, 0);
});

test('actual SDK preview uses decimal units and performs no wallet or chain actions', async () => {
  const f = fixture();
  const offer = await f.create(false).preview(quoteArgs);
  assert.equal(offer.quote.amountIn, 100n);
  assert.equal(offer.quote.expectedOut, 200n);
  assert.equal(offer.quote.minOut, 199n);
  assert.equal(f.calls.length, 0);
  assert.equal(f.signCalls(), 0);
  assert.equal(f.storage.data.size, 0);
});

test('single swap survives refresh, uses wallet-derived inputs, confirms claim separately', async () => {
  const f = fixture(); let app = f.create();
  const offer = await app.preview(quoteArgs);
  const submitted = await app.submit('order-1', offer);
  assert.equal(submitted.status, 'submitted');
  assert.equal(submitted.handle?.swapId, undefined);
  assert.equal(submitted.handle?.blindedAddress, undefined);
  const swap = f.submissions[0];
  assert.equal(swap.functionName, 'swap');
  assert.equal(swap.inputs[0].type, 'record');
  assert.equal(swap.inputs[1].algorithm, 'program-scoped-blinding-factor');
  assert.equal(swap.inputs[2].algorithm, 'program-scoped-blinded-address');
  assert(swap.inputs.includes('199u128'), 'quote minimum preserved');
  assert.equal(f.signCalls(), 0);
  app = f.create(); // New module instance, same persisted browser state.
  assert.equal(app.status('order-1')?.handle?.amountIn, 100n);
  assert.equal((await app.checkProgress('order-1')).status, 'submitted');
  f.accepted.add('at1fixture1');
  assert.equal((await app.checkProgress('order-1')).status, 'ready');
  assert.equal(app.status('order-1')?.handle?.blindedAddress, blinded);
  assert.equal((await app.claim('order-1')).status, 'claim_submitted');
  assert.equal(f.submissions[1].inputs[0].args.mode.value, 'resolve');
  assert.equal((await app.claim('order-1')).status, 'claim_submitted');
  assert.equal(f.submissions.length, 2);
  f.accepted.add('at1fixture2');
  assert.equal((await app.checkProgress('order-1')).status, 'complete');
  assert.equal(app.status('order-1')?.claim?.amountRemaining, 10n);
  assert.equal((await f.create().submit('order-1', offer)).status, 'complete');
  assert.equal(f.submissions.length, 2);
});

test('two browser instances and concurrent duplicate IDs dispatch only once', async () => {
  const f = fixture(); const a = f.create(), b = f.create(); const offer = await a.preview(quoteArgs);
  await Promise.all([a.submit('same', offer), b.submit('same', offer)]);
  assert.equal(f.submissions.length, 1);
  await b.submit('different', offer);
  assert.equal(f.submissions.length, 2);
  await assert.rejects(a.submit('third', offer), /limit/);
  await assert.rejects(a.submit('same', { ...offer, quote: { ...offer.quote, amountIn: 101n } }), /different quote/);
});

test('lost wallet submission response remains blocked after refresh', async () => {
  const f = fixture(); const a = f.create(); const offer = await a.preview(quoteArgs); f.setLostSubmit();
  assert.equal((await a.submit('unknown', offer)).status, 'submission_unknown');
  assert.equal((await f.create().submit('unknown', offer)).status, 'submission_unknown');
  assert.equal(f.submissions.length, 1);
});

test('an unclassified wallet rejection preserves the original intent without retrying', async () => {
  const f = fixture({ rejectWallet: true }); const app = f.create();
  const offer = await app.preview(quoteArgs);
  assert.equal((await app.submit('rejected-by-wallet', offer)).status, 'submission_unknown');
  assert.equal((await f.create().submit('rejected-by-wallet', offer)).status, 'submission_unknown');
  assert.equal(f.submissions.length, 1);
});

test('lost wallet claim response remains blocked after refresh', async () => {
  const f = fixture(); const a = f.create(); const offer = await a.preview(quoteArgs);
  await a.submit('unknown-claim', offer); f.accepted.add('at1fixture1'); f.setLostClaim();
  assert.equal((await a.claim('unknown-claim')).status, 'claim_unknown');
  assert.equal((await f.create().claim('unknown-claim')).status, 'claim_unknown');
  assert.equal(f.submissions.length, 2);
});

test('wallet changes, disabled execution, expired terms and storage failures fail before dispatch', async () => {
  const f = fixture(); const a = f.create(); const offer = await a.preview(quoteArgs);
  await assert.rejects(f.create(false).submit('disabled', offer), /Enable transactions/);
  await assert.rejects(a.submit('expired', { ...offer, quote: { ...offer.quote, expiresAt: 1 } }), /expired/);
  f.storage.fail = true;
  await assert.rejects(a.submit('full', offer), CheckpointWriteError);
  f.storage.fail = false; f.setDisconnected();
  await assert.rejects(a.submit('changed', offer), /wallet or network changed/);
  assert.equal(f.submissions.length, 0);
});

test('expired API session causes preview error without hidden wallet approval', async () => {
  const f = fixture(); const a = f.create(); f.setUnauthorized();
  await assert.rejects(a.preview(quoteArgs), /401/);
  assert.equal(f.signCalls(), 0); assert.equal(f.submissions.length, 0);
});

test('public grants include swap, claim, no-refund, router and proof algorithms', () => {
  const grants = shieldSwapAlgorithmGrants();
  assert(grants.some(g => g.function === 'swap' && g.algorithm === 'program-scoped-blinding-factor'));
  assert(grants.some(g => g.function === 'claim_swap_output_no_refund'));
  assert(grants.some(g => g.program === 'shield_swap_router.aleo'));
  assert(grants.some(g => g.algorithm === 'program-freezelist-exclusion-proof'));
});

test('broadcast chain ID with 404 stays pending; other confirmation failures propagate', async () => {
  const f = fixture(); const a = f.create(); const offer = await a.preview(quoteArgs);
  await a.submit('pending', offer); f.showPendingChainId();
  assert.equal((await a.checkProgress('pending')).status, 'submitted');
  f.failConfirmation(new TransportError('Server unavailable', { status: 503 }));
  await assert.rejects(a.checkProgress('pending'), /Server unavailable/);
  assert.equal(a.status('pending')?.status, 'submitted');
  assert.equal(f.submissions.length, 1);
});

test('current-client change during awaited confirmation prevents a checkpoint update', async () => {
  const f = fixture(); const a = f.create(); const offer = await a.preview(quoteArgs);
  await a.submit('account-switch', offer); f.accepted.add('at1fixture1'); f.disconnectDuringConfirmation();
  await assert.rejects(a.checkProgress('account-switch'), /wallet or network changed/);
  assert.equal(JSON.parse([...f.storage.data.values()][0])[0].status, 'submitted');
  assert.equal(f.submissions.length, 1);
});

test('storage failure after wallet dispatch preserves recoverable handle on error and blocks replacement', async () => {
  const f = fixture(); const a = f.create(); const offer = await a.preview(quoteArgs);
  f.storage.failAt = 2; // Intent save succeeds, saved wallet handle fails.
  await assert.rejects(a.submit('disk-full', offer), (error: unknown) => {
    assert(error instanceof CheckpointWriteError);
    assert.equal(error.checkpoint.status, 'submitted');
    assert.equal(error.checkpoint.handle?.transactionId, 'wallet-request-1');
    return true;
  });
  assert.equal(f.submissions.length, 1);
  assert.equal((await f.create().submit('disk-full', offer)).status, 'submitting');
  assert.equal(f.submissions.length, 1);
});

test('storage failure after claim dispatch retains claim receipt without completing or repeating', async () => {
  const f = fixture(); const a = f.create(); const offer = await a.preview(quoteArgs);
  await a.submit('claim-disk-full', offer); f.accepted.add('at1fixture1');
  await a.checkProgress('claim-disk-full');
  f.storage.failAt = f.storage.writes + 2; // Claim intent saves, receipt save fails.
  await assert.rejects(a.claim('claim-disk-full'), (error: unknown) => {
    assert(error instanceof CheckpointWriteError);
    assert.equal(error.checkpoint.status, 'claim_submitted');
    assert.equal(error.checkpoint.claim?.transactionId, 'wallet-request-2');
    return true;
  });
  assert.equal((await f.create().claim('claim-disk-full')).status, 'claiming');
  assert.equal(f.submissions.length, 2);
});

for (const options of [
  { multiHop: true }, { wrappedInput: true }, { wrappedOutput: true },
  { multiHop: true, wrappedInput: true, wrappedOutput: true },
  { noRefund: true }, { wrappedInput: true, wrappedOutput: true, noRefund: true },
]) {
  test(`native SDK route and core ABI continuation ${JSON.stringify(options)}`, async () => {
    const f = fixture(options); let a = f.create(); const offer = await a.preview(quoteArgs);
    assert.equal((await a.submit('route', offer)).status, 'submitted');
    if (options.wrappedInput) {
      assert.equal(f.submissions[0].programName, 'shield_swap_router.aleo');
      assert.equal(f.submissions[0].inputs[0].program, 'credits.aleo');
      assert.equal(f.submissions[0].inputs[0].recordname, 'credits');
      assert.equal(f.submissions[0].inputs[0].filters.microcredits.gte, '100u64');
    }
    f.accepted.add('at1fixture1');
    a = f.create();
    assert.equal((await a.checkProgress('route')).status, 'ready');
    const restored = f.create().listProgress();
    assert.equal(restored.length, 1);
    assert.equal(restored[0].id, 'route');
    assert.equal(restored[0].output?.amountOut, 199n);
    assert.equal(restored[0].output?.amountRemaining, options.noRefund ? 0n : 10n);
    assert.equal((await a.claim('route')).status, 'claim_submitted');
    if (options.wrappedInput || options.wrappedOutput) assert.equal(f.submissions[1].programName, 'shield_swap_router.aleo');
    f.accepted.add('at1fixture2');
    const result = await a.checkProgress('route');
    assert.equal(result.status, 'complete');
    assert.equal(result.claim?.amountRemaining, options.noRefund ? 0n : 10n);
    assert.equal(f.submissions.length, 2);
  });
}
