import test from 'node:test'
import assert from 'node:assert/strict'
import type { WalletClient, InventoryPlan } from '@provablehq/veil-core'
import type { ShieldSwapActions } from '@provablehq/shield-swap-sdk'
import { discover, inventorySummary, planInventory, executeInventoryPlan, progress } from './workflow.mjs'

test('discovery and record preparation preserve metadata, units, and the reviewed plan', async () => {
  let submitted: InventoryPlan | undefined
  let writeCount = 0
  const reviewed = { steps: [], deduction: 0n } as unknown as InventoryPlan
  const client = {
    api: {
      getTokens: async () => ({ data: [{ id: 'database-id', address: '1field', symbol: 'ASSET', decimals: 18, amm_token_program: 'wrapper.aleo', underlying_program: 'funding.aleo' }] }),
      getPools: async () => ({ data: [{ key: '2field', token0: '1field', token1: '3field', enabled: true }] }),
    },
    tokenData: async () => ({ id: '1field', symbol: 'ASSET', decimals: 18, underlyingProgram: 'funding.aleo' }),
    getRecordInventory: async ({ asset }: { asset: { program: string } }) => {
      assert.equal(asset.program, 'funding.aleo')
      return { balance: 10000000000000000001n, available: [{ amount: 10000000000000000001n, record: { recordPlaintext: 'secret' } }], reserved: [{}] }
    },
    planRecordInventory: async ({ asset, target }: { asset: { program: string }; target: { minRecordAmount: bigint; distribution: string } }) => {
      assert.equal(asset.program, 'funding.aleo')
      assert.equal(target.minRecordAmount, 5000000000000000000n)
      assert.equal(target.distribution, 'preserve')
      return reviewed
    },
    rebalanceRecordInventory: async ({ plan }: { plan: InventoryPlan }) => { writeCount++; submitted = plan; return { status: 'complete' as const, transactionIds: [], completedSteps: 0 } },
  } as unknown as WalletClient & ShieldSwapActions
  assert.equal((await discover(client)).tokens[0].recordProgram, 'funding.aleo')
  assert.equal((await discover(client)).tokens[0].id, '1field')
  const summary = await inventorySummary(client, '1field')
  assert.equal(summary.availableBaseUnits, '10000000000000000001')
  assert.equal(JSON.stringify(summary).includes('secret'), false)
  const plan = await planInventory(client, '1field', 2, 5000000000000000000n, 3)
  assert.equal(writeCount, 0)
  await executeInventoryPlan(client, plan, 100000n)
  assert.equal(submitted, reviewed)
  assert.equal(writeCount, 1)
})

test('progress serializes actual output and refund without exposing handle secrets', () => {
  const summary = progress({ id: 'order', scope: 'fixture', status: 'complete',
    handle: { blindingFactor: 'secret', transactionId: 'request' } as any,
    result: { transactionId: 'claim', amountOut: 10000000000000000001n, amountRemaining: 2n } })
  assert.equal(summary.outputBaseUnits, '10000000000000000001')
  assert.equal(summary.refundBaseUnits, '2')
  assert.equal(JSON.stringify(summary).includes('secret'), false)
})
