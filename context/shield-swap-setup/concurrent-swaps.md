# Concurrent swaps

Submit several private swaps of the same token at once, claim every output, and recover the batch after an interruption. Each simultaneous swap needs its own covering input record and its own blinded identity; the total balance is not enough. Use this page after [swap](swap.md) works for one trade and after [UTXO management](swap-utxo-management.md) has prepared one record per trade.

The examples run **six 0.1 USDCx → ETH swaps on testnet with 50 basis points slippage**. Replace the pair, amount, count, network, and bounds with the user's authorized trade. Six concurrent swaps are six transactions plus six claims, each with its own fee and its own outcome.

## Shared behavior

- Record management must be **enabled** on the client with a store shared by every participating call, and the same chain identity. Attaching the DEX actions alone leaves reservations off.
- With a local signer and no explicit input record, each swap scans once for unreserved covering records, smallest first, and reserves the first candidate before proving. If another swap took it, it tries the next; each record is tried once. An explicit record input stays fixed, and wallet signers must pin their own records.
- Reselection keeps the trade unchanged: amount, minimum output, blinded identity, and swap nonce. Proving, submission, and confirmation errors never restart selection or submit another swap.
- One quote can be shared by every swap in the batch; it fixes the same output floor for each. A quote reserves no pool liquidity, so later trades can execute at worse prices or fail on their floor while earlier ones succeed. Inspect every swap and every claim.
- Blinded identities are allocated by the identity store. Veil's bundled stores coordinate counters within one process; Python's journal locks under the profile. Run one trader process per account unless each process supplies distinct explicit identities.
- A timeout is an unknown result. Reopen the same stores, reconcile the record journal and unclaimed swaps, and resolve them before starting another batch. Never repeat a batch to recover one trade.

## AgentKit MCP

The standalone server serializes operations per wallet, so it does not submit same-token swaps simultaneously. Use its [inventory tools](swap-utxo-management.md#agentkit-mcp--inspect-plan-rebalance) to keep enough covering records, then run the [single-swap recipe](../toolchains/mcp.md#execute-and-claim-one-swap) once per trade; each swap reserves its input in the server's journal and the next swap selects another record. For truly simultaneous submissions, use the SDK recipes below in a bot process that owns the account.

## CLI

`shield-swap swap-concurrent` submits one leg per `--swap`, planned before any is submitted, and still requires a **different input token in each leg**; two legs selling the same token are rejected. Set `VEIL_INVENTORY_DB` to the maintenance journal so the legs and any `inventory` process reserve different records:

```sh
VEIL_INVENTORY_DB=.veil/inventory.sqlite shield-swap swap-concurrent --network testnet \
  --swap USDCx:ETH:0.1 --swap ETH:USDCx:0.0001 --json
```

Check the installed command's `--help` for the exact leg syntax before running it with `--execute`. For several simultaneous sales of one token, use the SDK recipes below.

## Veil — batch, claim, recover

Use the `managed-session.mts` from [UTXO management](swap-utxo-management.md#veil--managed-session-and-inventory-methods); it enables record management, the SQLite journal, and the blinded-identity file. Install `@provablehq/shield-swap-cli` for the store and use Node.js 22.13 or newer.

Save as `concurrent-swaps.mts`. Without `--execute` it reconciles, plans, and quotes, then stops:

```ts
import { formatUnits, parseUnits } from '@provablehq/shield-swap-sdk'
import { client, inventory } from './managed-session.mts'

const count = 6
const [from, to, amountIn] = ['USDCx', 'ETH', '0.1']
const execute = process.argv.includes('--execute')
try {
  // Unfinished work blocks a new batch: a missing confirmation is not a failure.
  const journal = await client.reconcileRecordInventory()
  const unresolved = journal.filter(entry => !['confirmed', 'rejected', 'cancelled'].includes(entry.status))
  if (unresolved.length) throw new Error(`Resolve ${unresolved.length} journal entries before another batch`)
  const unclaimed = await client.getUnclaimedSwaps()
  if (unclaimed.swaps.length || unclaimed.unresolvable.length) throw new Error('Recover previous swaps before another batch')

  const token = await client.tokenData(from)
  const plan = await client.planInventory({
    token: token.id,
    target: { records: count, minRecordAmount: parseUnits(amountIn, token.decimals), distribution: 'balanced', toleranceBps: 0 },
    maxTransactions: 24,
  })
  console.table(plan.steps.map(step => ({ operation: step.kind, inputs: step.inputs.length, helper: step.joinProgram?.program ?? 'native' })))
  const preview = await client.quote({ from, to, amountIn, slippageBps: 50 })
  console.log({ perSwapMinimum: formatUnits(preview.minOut, preview.to.decimals), outputSymbol: preview.to.symbol })
  if (!execute) {
    console.log('Preview only. Pass --execute to prepare records, submit swaps and claim outputs.')
  } else {
    const maintenance = await client.rebalanceRecordInventory({ plan, timeoutMs: 600_000, pollIntervalMs: 3_000 })
    if (maintenance.status !== 'complete') throw new Error(`Inventory preparation interrupted: ${maintenance.reason}`)

    // Quote after maintenance so joins and splits do not consume its lifetime.
    const quote = await client.quote({ from, to, amountIn, slippageBps: 50 })
    const swaps = await Promise.allSettled(Array.from({ length: count }, () => client.swap({ quote })))
    const handles = swaps.flatMap(result => result.status === 'fulfilled' ? [result.value] : [])
    const claims = await Promise.allSettled(handles.map(async handle => {
      await client.waitForSwapOutput({ handle, timeout: 600_000, pollingInterval: 3_000 })
      return client.claimSwapOutput({ handle })
    }))
    swaps.forEach((result, index) => { if (result.status === 'rejected') console.error(`Swap ${index + 1} needs inspection`) })
    console.table(claims.map((result, index) => ({
      swap: handles[index]!.transactionId,
      status: result.status,
      amountOut: result.status === 'fulfilled' ? formatUnits(result.value.amountOut, quote.to.decimals) : undefined,
      refund: result.status === 'fulfilled' ? formatUnits(result.value.amountRemaining, quote.from.decimals) : undefined,
    })))
    if ([...swaps, ...claims].some(result => result.status === 'rejected')) throw new Error('Some trades need recovery; do not repeat the batch')
  }
} finally {
  inventory.close()
}
```

Run `npx tsx concurrent-swaps.mts` to preview and `npx tsx concurrent-swaps.mts --execute` only for an authorized batch. `claims[i]` belongs to `handles[i]`, not `swaps[i]`, because failed swaps return no handle. A successful claim can return both the output and a refund of unspent input in their respective base units. Do not print handles: they contain claim material. The console summaries print only transaction IDs and amounts.

After a timeout, crash, or failed claim, keep `inventory.sqlite` and `blinded.json`, stop other writers for the account, and run `npx tsx recover-batch.mts`:

```ts
import { client, inventory } from './managed-session.mts'

try {
  const journal = await client.reconcileRecordInventory()
  const unresolved = journal.filter(entry => !['confirmed', 'rejected', 'cancelled'].includes(entry.status))
  console.table(unresolved.map(entry => ({ transactionId: entry.transactionId, status: entry.status, error: entry.lastRebroadcastError })))
  if (unresolved.length) throw new Error('Resolve these transactions before retrying claims or swaps')

  const unclaimed = await client.getUnclaimedSwaps()
  if (unclaimed.unresolvable.length || unclaimed.swaps.some(swap => !swap.handle)) {
    throw new Error('Restore missing swap information before automatic recovery')
  }
  const recovered = await Promise.allSettled(unclaimed.swaps.map(async swap => {
    await client.waitForSwapOutput({ handle: swap.handle!, timeout: 600_000 })
    return client.claimSwapOutput({ handle: swap.handle! })
  }))
  recovered.forEach((result, index) => {
    if (result.status === 'rejected') console.error('Claim still needs recovery:', unclaimed.swaps[index]!.swapId)
  })
} finally {
  inventory.close()
}
```

Reconciliation submits nothing by default; an entry whose saved transaction never reached the network can be resent with `client.reconcileRecordInventory({ rebroadcast: true })` after inspection. Claiming collects existing outputs and submits no replacement swaps. An identity without saved swap information needs the original transaction inspected; follow [unknown-operation recovery](recover-swaps.md).

## Python — concurrent swaps with a shared store

Python SDK 0.8.0 ports the same model: a record inventory store shared by every call, reservation before proving, reselection of the next eligible record when another swap took the first choice, and a journal that keeps uncertain inputs reserved. Use the `managed_session.py` from [UTXO management](swap-utxo-management.md#python--managed-facade-and-inventory-methods); a client from `ShieldSwap.from_profile()` alone is unmanaged. An explicit `token_record` is never replaced, and proving or broadcast errors are never retried.

Save as `concurrent_swaps.py`. Without `--execute` it reconciles, plans, and quotes, then stops:

```python
import sys
from concurrent.futures import ThreadPoolExecutor
from decimal import Decimal
from aleo.inventory import InventoryTarget
from managed_session import client, dex

count, token_in, token_out, amount_in = 6, "USDCx", "ETH", "0.1"
execute = "--execute" in sys.argv[1:]

pending = [entry for entry in client.inventory.reconcile_record_inventory()
           if entry.status in ("reserved", "prepared", "submitted")]
if pending:
    raise SystemExit(f"Reconcile {len(pending)} unresolved journal entries before another batch")
if dex.journal.pending_claims():
    raise SystemExit("Claim the pending swaps (dex.collect_all()) before another batch")

token = dex.api.get_token(token_in)
minimum = int(Decimal(amount_in).scaleb(token.decimals))
plan = dex.plan_inventory(token_in, InventoryTarget(records=count, min_record_amount=minimum,
                                                    distribution="balanced", tolerance_bps=0),
                          max_transactions=24)
for step in plan.steps:
    helper = step.join_program.program if step.join_program else "native"
    print(f"{step.kind:5} inputs={len(step.inputs):2} outputs={len(step.outputs)} via {helper}")
preview = dex.quote(token_in=token_in, token_out=token_out, amount_in=amount_in, slippage_bps=50)
print({"per_swap_minimum": preview.minimum_amount_out, "output_token": preview.token_out_id})
if not execute:
    raise SystemExit("Preview only. Pass --execute to prepare records, submit swaps and claim outputs.")

result = client.inventory.rebalance_record_inventory(plan, timeout=600.0, poll_interval=3.0)
if result.status != "complete":
    raise SystemExit(f"Inventory preparation interrupted: {result.reason}")

# Quote after maintenance so joins and splits do not consume its lifetime.
quote = dex.quote(token_in=token_in, token_out=token_out, amount_in=amount_in, slippage_bps=50)

def trade(index):
    try:
        handle = dex.swap(quote).delegate(wait=False)
    except Exception as error:  # reported per trade; never raised mid-batch
        return index, None, None, error
    try:
        claim = dex.claim_swap_output(handle, timeout=600.0).delegate(wait=True)
        return index, handle, claim, None
    except Exception as error:  # the journal keeps the handle for a later claim
        return index, handle, None, error

with ThreadPoolExecutor(max_workers=count) as pool:
    outcomes = list(pool.map(trade, range(1, count + 1)))

failures = 0
for index, handle, claim, error in outcomes:
    if claim is not None and handle is not None:
        print({"trade": index, "swap": handle.transaction_id, "claim": claim.transaction_id,
               "amount_out": claim.amount_out, "refunded_input": claim.amount_remaining})
    elif handle is not None:
        failures += 1
        print(f"{index}: swap {handle.transaction_id} submitted; claim failed: {type(error).__name__}", file=sys.stderr)
    else:
        failures += 1
        print(f"{index}: swap failed: {type(error).__name__}", file=sys.stderr)
if failures:
    raise SystemExit(f"{failures} trades need recovery; do not repeat the batch")
```

Run `python concurrent_swaps.py` to preview and `python concurrent_swaps.py --execute` only for an authorized batch. Each thread's swap journals its blinded identity and handle in the profile journal and reserves its input in `inventory.sqlite`. Printing exception types rather than messages keeps request details out of logs; inspect the protected journal for recovery material.

After a timeout, crash, or failed claim, keep the profile directory, stop other writers for the account, and run `python recover_batch.py`:

```python
from managed_session import client, dex

unresolved = [entry for entry in client.inventory.reconcile_record_inventory()
              if entry.status not in ("confirmed", "rejected", "cancelled")]
for entry in unresolved:
    print({"transaction_id": entry.transaction_id, "status": entry.status,
           "saved_transaction": entry.transaction is not None})
if unresolved:
    raise SystemExit("Resolve these transactions before retrying claims or swaps")
report = dex.collect_all()
print(report)
```

`reconcile_record_inventory()` reads the chain; `reconcile_record_inventory(rebroadcast=True)` resends a saved proved transaction with its original id after inspection. `collect_all()` claims every finalized swap recorded in the profile journal and submits no replacement swaps. Journal entries without a recovered swap id are not claimable automatically; follow [unknown-operation recovery](recover-swaps.md) for them.

`swap_many()` remains the bundled single-process batch helper. In 0.8.0 its record selection excludes nonces reserved in the journal, but it still pins an explicit record per swap, so it does not reselect after a conflict and requires `from_profile()`; it is not a substitute for the managed client above when other writers share the account.

## Verify completion

Report each swap and each claim separately: transaction IDs, `amountOut`, and `amountRemaining` in their tokens' base units. A batch where four claims succeed, one swap fails before proving, and one wait times out is four finished trades, one inventory check, and one recovery; it is not a reason to submit another batch. Rerun the [balance recipe](bridge-funds.md) after the claims and compare against the summed outputs, allowing for scanner lag.
