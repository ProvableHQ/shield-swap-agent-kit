import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

async function fixture(t, overrides = {}) {
  assert.ok(existsSync(new URL('./trading.mjs', import.meta.url)), 'trading module must be implemented')
  const { Trading } = await import('./trading.mjs')
  const directory = mkdtempSync(join(tmpdir(), 'trading-test-'))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  const calls = []
  const venue = {
    scope: 'aleo:testnet:account-a',
    submit: async native => { calls.push('submit'); return { swapId: native.amount, transactionId: 'tx' } },
    ready: async () => true,
    claim: async () => { calls.push('claim'); return { amountOut: 120n, amountRemaining: 0n, transactionId: 'claim' } },
    ...overrides,
  }
  const path = join(directory, 'operations.sqlite')
  const trading = new Trading(venue, path, { maxInFlight: 2, executionEnabled: true })
  t.after(() => trading.close())
  const offer = (amount = 1n) => ({ scope: venue.scope, native: { amount }, quotedAt: Date.now(), maxAgeMs: 30_000 })
  return { Trading, trading, venue, path, calls, offer }
}

test('different swaps overlap and each retains its claim', async t => {
  let arrivals = 0
  let release
  const both = new Promise(resolve => { release = resolve })
  const f = await fixture(t, { submit: async native => {
    if (++arrivals === 2) release()
    await both
    return { swapId: native.amount, transactionId: 'tx' }
  } })
  const result = await f.trading.executeMany([['a', f.offer()], ['b', f.offer(2n)]])
  assert.deepEqual(result.map(row => row.status), ['complete', 'complete'])
  assert.deepEqual(result.map(row => row.handle.swapId), [1n, 2n])
})

test('duplicate requests survive restart and reject changed intent', async t => {
  const f = await fixture(t)
  await f.trading.execute('same', f.offer())
  const restarted = new f.Trading(f.venue, f.path, { executionEnabled: true })
  t.after(() => restarted.close())
  assert.equal((await restarted.execute('same', f.offer())).result.amountOut, 120n)
  await assert.rejects(restarted.execute('same', f.offer(2n)), /intent/)
  assert.deepEqual(f.calls, ['submit', 'claim'])
})

test('uncertain submission and claim never retry writes', async t => {
  let calls = 0
  const f = await fixture(t, { submit: async () => { calls++; throw Error('lost') } })
  assert.equal((await f.trading.execute('a', f.offer())).status, 'submission_unknown')
  assert.equal((await f.trading.execute('a', f.offer())).status, 'submission_unknown')
  assert.equal(calls, 1)
  f.venue.submit = async () => ({ swapId: 'b' })
  f.venue.claim = async () => { calls++; throw Error('claim lost') }
  assert.equal((await f.trading.execute('b', f.offer(2n))).status, 'claim_unknown')
  assert.equal((await f.trading.claim('b')).status, 'claim_unknown')
  assert.equal(calls, 2)
})

test('quote expiry, account scope, and execution choice are enforced before writes', async t => {
  const f = await fixture(t)
  await assert.rejects(f.trading.execute('old', { ...f.offer(), quotedAt: Date.now() - 31_000 }), /expired/)
  await assert.rejects(f.trading.execute('other', { ...f.offer(), scope: 'another-account' }), /scope/)
  f.trading.executionEnabled = false
  await assert.rejects(f.trading.execute('read', f.offer()), /execution/)
  assert.deepEqual(f.calls, [])
})

test('concurrent duplicate calls have one submitting and claiming writer', async t => {
  const f = await fixture(t)
  await Promise.all([f.trading.execute('same', f.offer()), f.trading.execute('same', f.offer())])
  assert.deepEqual(f.calls, ['submit', 'claim'])
})

test('read failure after submission preserves the submitted batch result', async t => {
  const f = await fixture(t, { ready: async () => { throw Error('mapping unavailable') } })
  const [result] = await f.trading.executeMany([['a', f.offer()]])
  assert.equal(result.status, 'submitted')
  assert.equal(result.handle.transactionId, 'tx')
})

test('non-Error rejections retain unknown writes across restart', async t => {
  let claims = 0
  const f = await fixture(t, { submit: async () => { throw null } })
  const lost = await f.trading.execute('submit-lost', f.offer())
  assert.equal(lost.status, 'submission_unknown')
  assert.equal(lost.errorType, 'UnknownError')
  f.venue.submit = async () => ({ swapId: 'b' })
  f.venue.claim = async () => { claims++; throw undefined }
  assert.equal((await f.trading.execute('claim-lost', f.offer(2n))).status, 'claim_unknown')
  const restarted = new f.Trading(f.venue, f.path, { executionEnabled: true })
  t.after(() => restarted.close())
  assert.equal((await restarted.claim('claim-lost')).status, 'claim_unknown')
  assert.equal(claims, 1)
})
