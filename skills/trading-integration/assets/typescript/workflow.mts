/** Callable examples for a consumer's scheduler. No work runs on import. */
import type { WalletClient, InventoryPlan } from '@provablehq/veil-core'
import type { ShieldSwapActions, SwapQuote, SwapHandle, MultiHopSwapHandle, ClaimSwapOutputReturnType } from '@provablehq/shield-swap-sdk'
import type { Trading, Operation } from './trading.mjs'

type Client = WalletClient & ShieldSwapActions
type Handle = SwapHandle | MultiHopSwapHandle
type LocalTrading = Trading<SwapQuote, Handle, ClaimSwapOutputReturnType>

export async function discover(client: Client) {
  const [tokens, pools] = await Promise.all([client.api.getTokens(), client.api.getPools()])
  return { tokens: tokens.data.map(t => ({ id: t.address, symbol: t.symbol, decimals: t.decimals,
    ammProgram: t.amm_token_program, recordProgram: t.underlying_program || t.amm_token_program })),
    pools: pools.data.map(p => ({ key: p.key, token0: p.token0, token1: p.token1, enabled: p.enabled })) }
}

async function recordAsset(client: Client, token: string) {
  const metadata = await client.tokenData(token)
  const program = metadata.underlyingProgram || metadata.ammTokenProgram
  if (!program) throw Error('Token registry does not identify a record program')
  return { program }
}

export async function inventorySummary(client: Client, token: string) {
  const snapshot = await client.getRecordInventory({ asset: await recordAsset(client, token) })
  return { availableBaseUnits: snapshot.balance.toString(),
    availableRecordAmounts: snapshot.available.map(r => r.amount.toString()),
    reservedRecords: snapshot.reserved.length }
}

export async function planInventory(client: Client, token: string,
  count: number, minimumBaseUnits: bigint, maxTransactions: number) {
  return client.planRecordInventory({ asset: await recordAsset(client, token),
    target: { records: count, minRecordAmount: minimumBaseUnits, distribution: 'preserve' }, maxTransactions })
}

/** A separate authorized write. The SDK checks the plan's account and network. */
export async function executeInventoryPlan(client: Client, plan: InventoryPlan, maxFeeMicrocredits: bigint) {
  return client.rebalanceRecordInventory({ plan, maxFeeMicrocredits, timeoutMs: 120_000, pollIntervalMs: 2_000 })
}

export async function continueTrade(trading: LocalTrading, id: string) {
  let row = trading.status(id)
  if (!row) throw Error('Unknown application request id')
  if (row.status === 'submitted') row = await trading.claim(id)
  return progress(row)
}

/** Safe to display to the account owner; excludes the handle and its secrets. */
export function progress(row: Operation<Handle, ClaimSwapOutputReturnType>) {
  return { id: row.id, status: row.status, requestTransactionId: row.handle?.transactionId,
    claimTransactionId: row.result?.transactionId, outputBaseUnits: row.result?.amountOut.toString(),
    refundBaseUnits: row.result?.amountRemaining.toString(), errorType: row.errorType }
}
