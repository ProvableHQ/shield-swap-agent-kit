# Swap history

Inspect the selected account's submitted swaps, pending claims, receipts, and refunds. Keep this separate from the [pool trade feed](discover-pools-and-get-quotes.md#read-market-trades).

## AgentKit MCP

Call `swap_history` with the selected `profileId`, `reconcile: true`, and an appropriate `offset`/`limit`. Inspect the original `swapId`, input/output token IDs, `amountOut`, `amountRemaining`, and claim transaction. Results are paginated, and the recovery fields and `unresolvableCount` describe incomplete coverage; an empty page is not proof that an uncertain submission failed.

Use `list_operations` and `get_operation_status` for the server's saved execution state. Claims are separate operations. A completed claim can include returned input, so report its actual amounts and outcome using the interpretation below. See [MCP recovery](../toolchains/mcp.md#recover-a-one-account-bot) before another write.

## CLI

Run from the same account/network working directory:

```sh
shield-swap history --network testnet --json
```

The command combines local identities with chain state and can update local recovery data. It does not submit claims without the write flags. Treat its pending list as the identities it could resolve, not proof that no unknown submissions exist.

Use [recovery](recover-swaps.md) when IDs or handles are missing. Claim only a selected, authorized operation using [execute and claim](recover-swaps.md#resume-one-claim).

## Veil: inspect pending outputs

Save as `swap-history.mts` and run `npx tsx swap-history.mts`:

```ts
import { client } from './authenticate.mts'

const pending = await client.getUnclaimedSwaps()
console.log({
  swaps: pending.swaps.map(swap => ({
    swapId: swap.swapId, claimable: swap.claimable,
    amountOut: swap.output.amount_out.toString(),
    refundedInput: swap.output.amount_remaining.toString(),
  })),
  unresolvableCount: pending.unresolvable.length,
})
```

This is an unclaimed-output view, not a complete completed-trade ledger. Reconciliation can recover request and claim evidence into the persistent store; see [recovery](recover-swaps.md).

## Read an execution receipt

Set `SHIELD_SWAP_ID` to the original swap ID, including its `field` suffix. Receipts remain after claims on deployments supporting the execution-receipt mappings.

Veil — save as `receipt.mts`, run `npx tsx receipt.mts`:

```ts
import { client } from './authenticate.mts'

const swapId = process.env.SHIELD_SWAP_ID
if (!swapId) throw new Error('Supply the original swap ID')
const receipt = await client.getSwapExecution({ swapId })
console.log(JSON.stringify(
  { swapId, receipt },
  (_key, value) => typeof value === 'bigint' ? value.toString() : value,
))
```

Python — save as `receipt.py`, run `python receipt.py`:

```python
import os
from authenticate import dex

swap_id = os.environ["SHIELD_SWAP_ID"]
receipt = dex.get_swap_execution(swap_id)
print({"swap_id": swap_id, "receipt": receipt})
```

Each receipt describes the executed hops, including input/output amounts and fees. A missing receipt can mean the request has not finalized or predates receipt support. It does not prove rejection. Receipts prove execution, not that a subsequent claim was accepted.

For Python's local journal inventory, including provisional ID-less entries, use the [sanitized recovery recipe](recover-swaps.md). Do not call `collect_all()` merely to inspect history: it submits collection operations.

## Interpret amounts and completeness

Use the actual output and returned input, not the quoted output, for the result. A partial fill and an all-input refund need distinct reporting. Keep per-hop fees in each hop's input token; do not sum unlike denominations.

Retain both request and claim transaction IDs. A missing `swap_outputs` entry may mean already claimed, not missing funds. After claim confirmation, verify [private balances](bridge-funds.md); delayed records belong to [scanner troubleshooting](../troubleshooting/scanner-lag.md).

## Build an account ledger

Join your stored request and claim transaction IDs to [execution receipts](#read-an-execution-receipt). Record input, received output, returned input, transaction fees, timestamps, and confirmation state separately. Preserve token IDs and decimals; do not add amounts across different tokens without an explicit valuation.

A quote is an estimate. A receipt is execution evidence. A claim confirms collection; private record visibility confirms readiness to spend again. Count a multi-hop route as one user trade with multiple execution legs.

PnL also needs inventory cost basis, valuation time/source, transfers, bridges, and fees not included in the swap receipt. Report missing information rather than presenting pool volume or a balance delta as trading profit.
