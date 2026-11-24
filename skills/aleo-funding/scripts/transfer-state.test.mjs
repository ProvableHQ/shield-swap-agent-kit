import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { advanceTransfer, executeOnce, inspectTransfer } from './transfer-state.mjs'

const plan = { route: { id: 'fixture-route' }, registryVersion: 'fixture', amountIn: '5',
  sourceAsset: { chainId: 'base', key: 'usdc' }, destinationAsset: { chainId: 'arc', key: 'usdc' }, sender: 'sender', recipient: 'recipient' }
const checkpoint = { version: 1, source: { transactionId: 'original' } }
async function directory(t) {
  const parent = await mkdtemp(join(tmpdir(), 'funding-transfer-test-'))
  t.after(() => rm(parent, { recursive: true, force: true }))
  return join(parent, 'leg-1')
}

test('a successful submission can be inspected after restart but cannot execute twice', async t => {
  const path = await directory(t)
  let submitted = 0
  const bridge = { execute: async ({ onCheckpoint }) => { submitted++; await onCheckpoint(checkpoint); return { receipt: { sourceTxId: 'original' } } },
    recover: async ({ checkpoint: saved }) => { assert.deepEqual(saved, checkpoint); return { next: 'wait' } } }
  await executeOnce(bridge, path, plan)
  assert.equal((await inspectTransfer(bridge, path)).progress.next, 'wait')
  await assert.rejects(executeOnce(bridge, path, plan), { code: 'EEXIST' })
  assert.equal(submitted, 1)
})

test('timeout before a hash keeps a durable unresolved attempt and blocks all further writes', async t => {
  const path = await directory(t)
  let submitted = 0
  const bridge = { execute: async () => { submitted++; throw new Error('lost response') } }
  await assert.rejects(executeOnce(bridge, path, plan), /BRIDGE_STEP_UNRESOLVED/)
  assert.equal(JSON.parse(await readFile(join(path, 'state.json'), 'utf8')).uncertain, true)
  await assert.rejects(inspectTransfer(bridge, path), /SUBMISSION_UNKNOWN/)
  await assert.rejects(advanceTransfer(bridge, path, 'resume'), /SUBMISSION_UNKNOWN/)
  await assert.rejects(executeOnce(bridge, path, plan), { code: 'EEXIST' })
  assert.equal(submitted, 1)
})

test('an approval checkpoint followed by a lost deposit response cannot authorize a second deposit', async t => {
  const path = await directory(t)
  const bridge = { execute: async ({ onCheckpoint }) => { await onCheckpoint({ source: { approvalTransactionIds: ['approval'] } }); throw new Error('deposit response lost') },
    recover: async () => ({ next: 'resume' }), resume: async () => assert.fail('must not repeat unknown deposit') }
  await assert.rejects(executeOnce(bridge, path, plan), /BRIDGE_STEP_UNRESOLVED/)
  assert.equal((await inspectTransfer(bridge, path)).uncertain, true)
  await assert.rejects(advanceTransfer(bridge, path, 'resume'), /SUBMISSION_UNKNOWN/)
})

test('parallel calls cannot both submit, and recovery validates the requested next action', async t => {
  const path = await directory(t)
  let submitted = 0
  const bridge = { execute: async ({ onCheckpoint }) => { submitted++; await onCheckpoint(checkpoint); return {} },
    recover: async () => ({ next: 'complete' }), complete: async ({ onCheckpoint }) => { submitted++; await onCheckpoint({ ...checkpoint, destination: { transactionId: 'mint' } }); return {} } }
  const outcomes = await Promise.allSettled([executeOnce(bridge, path, plan), executeOnce(bridge, path, plan)])
  assert.equal(outcomes.filter(item => item.status === 'fulfilled').length, 1)
  await assert.rejects(advanceTransfer(bridge, path, 'resume'), /NEXT_ACTION_CHANGED/)
  await advanceTransfer(bridge, path, 'complete')
  assert.equal(submitted, 2)
  assert.equal(JSON.parse(await readFile(join(path, 'state.json'), 'utf8')).checkpoint.destination.transactionId, 'mint')
})

test('verified source submission can continue to a destination step, but an uncertain destination cannot repeat', async t => {
  const path = await directory(t)
  let completions = 0
  const bridge = {
    execute: async ({ onCheckpoint }) => { await onCheckpoint(checkpoint); throw new Error('source wait interrupted') },
    recover: async () => ({ next: 'complete' }),
    complete: async () => { completions++; throw new Error('destination response lost') },
  }
  await assert.rejects(executeOnce(bridge, path, plan), /BRIDGE_STEP_UNRESOLVED/)
  await assert.rejects(advanceTransfer(bridge, path, 'complete'), /BRIDGE_STEP_UNRESOLVED/)
  await assert.rejects(advanceTransfer(bridge, path, 'complete'), /SUBMISSION_UNKNOWN/)
  assert.equal(completions, 1)
})
