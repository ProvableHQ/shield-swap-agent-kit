# Swap

Discover a route, quote the requested amount, submit the swap, and claim its output. A private swap has two transactions: submitting the request is not the same as receiving spendable output.

Use the account and persistent store from [configure account](configure-account.md) and the authenticated client from [configure Shield Swap](configure-shield-swap.md). A quote-only request stops before submission and does not require funding. Execution needs the selected token in spendable private records; see [funding](bridge-funds.md).

The examples quote **1.5 USDCx → ETH on testnet, with 50 basis points (0.5%) slippage**. Replace these with the user's actual pair, amount, network, and bounds. The example values are not a recommended strategy or permission to trade.

## Shared execution rules

- Use token symbols or IDs resolved by the SDK; never invent decimals or pool keys. A quote finds a route without requiring a full pool scan first.
- Human amounts are decimal strings. Veil quote results contain base-unit `bigint` values; Python quote amounts are token-unit strings. Returned transaction handles use base units.
- Preserve the native quote and its minimum output through execution. A quote is an estimate, not a reservation of liquidity. Refresh stale quotes within the user's bounds; do not increase slippage to force execution.
- Keep the client and recovery store for the whole operation. Identity persistence prevents lost claim material; it does not make the same input record safe for concurrent spending.

## CLI — inspect, plan, execute

Inspect available pools when discovery is part of the request:

```sh
shield-swap pools --network testnet --token USDCx --json
```

The response includes each pool's `tradeable`, `liquidity`, and any unavailability reason. Being listed by the API is not sufficient; the command checks on-chain trading controls too.

Plan without submitting:

```sh
shield-swap swap --network testnet --from USDCx --to ETH --amount 1.5 --slippage 50 --json
```

Check `submitted: false`, the route, and the minimum output. The current command checks private holdings even in planning mode. If the account is unfunded and only a quote was requested, use the Veil quote recipe with the [same CLI session](../toolchains/cli.md#reuse-a-cli-account-from-a-script). Do not request funds just to obtain a quote.

Execute only when the requested terms are authorized:

```sh
shield-swap swap --network testnet --from USDCx --to ETH --amount 1.5 --slippage 50 --execute --json
```

This invocation obtains a **fresh quote**; it does not consume the previous command's quote. The CLI has no documented flag to bind execution to that earlier quote or an absolute output floor. If authorization applies to exact quoted terms, use the SDK with the retained quote and validate its freshness instead.

The command attempts the claim unless `--no-claim` is supplied. A result with `submitted: true` but `claimTransactionId: null` is an unclaimed swap, not a completed trade. Retain `swapId` and inspect:

```sh
shield-swap history --network testnet --json
```

To complete one identified, authorized pending claim, replace the ID:

```sh
shield-swap history --network testnet --claim --swap-id YOUR_SWAP_ID --execute --json
```

Without `--swap-id`, that command can claim unrelated pending swaps too. Do not rerun `swap --execute` to recover a missing response or an unfinished claim.

## Veil — quote, then use that quote

Save as `quote.mts` and run `npx tsx quote.mts`:

```ts
import { formatUnits } from '@provablehq/shield-swap-sdk'
import { client } from './authenticate.mts'

const quote = await client.quote({
  from: 'USDCx', to: 'ETH', amountIn: '1.5', slippageBps: 50,
})
console.log({
  network: quote.network,
  expectedOut: formatUnits(quote.expectedOut, quote.to.decimals),
  minimumOut: formatUnits(quote.minOut, quote.to.decimals),
  outputToken: quote.to.symbol,
  route: quote.hops.map(hop => hop.poolKey),
  expiresAt: new Date(quote.expiresAt).toISOString(),
})
```

This reads token metadata and a route without proving or submitting. The inspected Veil quote expires for preparation after 60 seconds; `quotedAt` is the local request time, not an indexer freshness guarantee.

For an authorized trade, continue in the **same script/process**, retaining `quote`:

```ts
const handle = await client.swap({ quote })
console.log({ swapId: handle.swapId, transactionId: handle.transactionId })
await client.waitForSwapOutput({ handle })
const claim = await client.claimSwapOutput({ handle })
console.log({
  transactionId: claim.transactionId,
  amountOut: claim.amountOut.toString(),
  refundedInput: claim.amountRemaining.toString(),
})
```

Do not append this block to a quote-only script. Running a combined script submits a trade every time. Check the quote against the authorization immediately before execution; if approval named an exact earlier quote, retain that object rather than rerunning the quote call.

The configured file store records the identity and handle. Do not print the whole handle: it contains claim material. A wait failure leaves the original operation to inspect, not a reason to submit another swap.

## Python — quote, prepare, submit, claim

Save as `quote.py` and run `python quote.py`:

```python
from authenticate import dex

quote = dex.quote(
    token_in="USDCx", token_out="ETH", amount_in="1.5", slippage_bps=50,
)
print({
    "network": quote.network,
    "expected_out": quote.estimated_amount_out,
    "minimum_out": quote.minimum_amount_out,
    "output_token": quote.token_out_id,
    "route": [hop.pool_key for hop in quote.hops],
})
```

For an authorized trade, continue with this in the **same script/process**, retaining `quote`:

```python
handle = dex.swap(quote).delegate(wait=True)
print({"swap_id": handle.swap_id, "transaction_id": handle.transaction_id})
claim = dex.claim_swap_output(handle, timeout=300).delegate(wait=True)
print({"transaction_id": claim.transaction_id, "amount_out": claim.amount_out,
       "refunded_input": claim.amount_remaining})
```

`.delegate(wait=True)` submits and waits for confirmation. The claim method first waits up to 300 seconds for the original swap output; this is a bounded example wait, not an execution-speed promise. `SwapOutputNotFinalizedError` at that stage means no claim was submitted by that call. Resume the claim after inspecting progress; do not repeat the swap.

The profile-bound client has a durable journal. Keep `track=True` (the default) and retain the journal through completion. The inspected Python quote has no Veil-style `expiresAt` field; do not assume identical freshness enforcement across SDKs. Requote if delayed, then check the new terms against authorization.

## Resume an existing operation

Reopen the same account/network/store and inspect first. These examples inspect one known swap; they do not resubmit it or claim all pending outputs. `SHIELD_SWAP_ID` is a recipe input supplied from the original operation's result.

For Veil, save as `inspect-swap.mts` and run with `npx tsx inspect-swap.mts`:

```ts
import { client } from './authenticate.mts'

const swapId = process.env.SHIELD_SWAP_ID
if (!swapId) throw new Error('Supply the original swap ID')
const pending = await client.getUnclaimedSwaps()
const original = pending.swaps.find(swap => swap.swapId === swapId)
console.log({
  swapId,
  found: Boolean(original),
  claimable: original?.claimable ?? false,
  amountOut: original?.output.amount_out.toString(),
  refundedInput: original?.output.amount_remaining.toString(),
  unresolvableCount: pending.unresolvable.length,
})
```

When `original.handle` is present, its output is claimable, and there is no uncertain claim submission, resume only that authorized claim with `await client.claimSwapOutput({ handle: original.handle })`. Missing entries can mean pending, already claimed, or incomplete local state; the inspection is not proof of rejection.

For Python, save as `inspect_swap.py` and run `python inspect_swap.py`:

```python
import os
from authenticate import dex

swap_id = os.environ["SHIELD_SWAP_ID"]
original = next((handle for handle in dex.journal.pending_claims()
                 if handle.swap_id == swap_id), None)
if original is None:
    raise RuntimeError("No matching pending handle; inspect the original transaction and journal")
output = dex.get_swap_output(swap_id)
print({"swap_id": swap_id, "transaction_id": original.transaction_id,
       "amount_out": int(output.amount_out), "refunded_input": int(output.amount_remaining)})
```

`pending_claims()` is a local journal view, not proof that the chain has not already accepted a claim. A missing on-chain output can mean not finalized or already claimed. Once the original operation is resolved and no claim submission is uncertain, resume the authorized claim with `dex.claim_swap_output(original, timeout=300).delegate(wait=True)`.

An empty pending list does not resolve an unknown broadcast. In particular, Python journal entries without a recovered swap ID are omitted from `pending_claims()`. Preserve those entries and recover the original transaction's result; never interpret their absence as permission to trade again.

These recipes cover known-ID inspection and pending-claim continuation, not full recovery of a lost response with no swap ID. Stop with the original transaction identifier and protected state location when that information is insufficient; do not invent a replacement handle.

CLI `history --reconcile` and Veil history reconciliation can repair parts of local history, but cannot recreate every missing unclaimed handle. Retain the original store. Full handles, journal contents, and private records must not appear in logs or shared output.

## Verify completion

The SDK examples print both `amountOut`/`amount_out` and the input refund (`amountRemaining`/`amount_remaining`) in their respective tokens' base units. A zero output or refund-only result is not a successful fill, even if transactions were accepted. Report it as such without placing a replacement trade automatically.

Keep the swap and claim transaction IDs. After a confirmed claim, rerun the [balance recipe](bridge-funds.md) for the selected interface and verify the destination token's private holdings. With CLI, also inspect `history --network testnet --json` for the claim and refund summary; `bought` alone does not show refunds. A missing balance update can be scanner lag. Do not claim exact trade attribution from a balance delta when other operations are changing the account concurrently.
