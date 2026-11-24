# Select proving and budget both transactions

A trade can incur pool fees, request and claim network fees, proving-service charges, and record-preparation costs. Keep fees already embedded in the quote separate from additional charges. Reserve enough budget for the claim before submitting the request.

## Determine who pays

Retain the project's configured prover and payer. A local private key describes custody; it does not mean proving runs locally. A delegated prover receives proving inputs, while a connected wallet owns its proving and fee approval flow. Explain those service boundaries when choosing an integration.

The bundled Python adapter calls `DexCall.delegate`: `wait=False` for submission and `wait=True` for claim. In the validated published SDK, its fee master pays by default. The bundled Veil factory uses `createAleoClient`, whose default proving mode is delegated. Inspect the returned client's `proving.mode` and `proving.useFeeMaster` and the service's actual configuration; do not infer sponsorship solely from the word “delegated.” No service default is a promise that all future transactions are free.

When adapting Python's `ShieldVenue.submit` and `claim`, use the same explicit execution policy on both `DexCall` objects. These are native alternatives, not operations to run during preview:

```python
def execute_call(call, *, wait, proving, pay_own_fee, priority_microcredits):
    if proving == 'delegated':
        return call.delegate(wait=wait, pay_own_fee=pay_own_fee,
                             priority_fee=priority_microcredits)
    if proving == 'local' and pay_own_fee:
        return call.transact(wait=wait, priority_fee=priority_microcredits)
    raise ValueError('Choose a supported prover and fee payer explicitly')
```

`call` is `dex.swap(native_quote)` or `dex.claim_swap_output(handle)`. `priority_microcredits` is the caller's chosen integer priority fee, not a total fee ceiling. Self-paid delegated fees may require local execution/proving to construct their fee authorization. For a confidential fee, the native call accepts a fee record; use the SDK's managed record path so that record is reserved with the trade input. Do not reuse one fee record across concurrent transactions.

In Veil, preserve `provingMode`, `useFeeMaster`, provider authentication, and fee behavior when constructing the SDK client. The high-level quote is not a place to invent `gas`, `maxFee`, or `privateFee` properties. Configure supported execution/provider options at their native layer and typecheck them against the installed package. A browser wallet reviews fees through its wallet request, not the Node adapter.

## Enforce supported ceilings

The local SDK record-management configuration checks the proved transaction's fee before broadcast. Set it when constructing an account-paid client:

```python
from aleo.inventory import RecordManagementConfig

def managed_records(store, chain_id, max_fee_microcredits):
    return RecordManagementConfig(enabled=True, store=store, chain_id=chain_id,
                                  max_fee_microcredits=max_fee_microcredits)
```

```typescript
import type { RecordInventoryStore, RecordManagementConfig } from '@provablehq/veil-core'

export function managedRecords(store: RecordInventoryStore, chainId: string,
  maxFeeMicrocredits: bigint): RecordManagementConfig {
  return { enabled: true, store, chainId, maxFeeMicrocredits }
}
```

Pass this configuration into the native client's construction and retain the shared store. These are per-transaction checks; the Python configuration is immutable. Do not try to mutate its fields after construction. Under fee-master sponsorship, the transaction fee may belong to the sponsor, so it is not the account's personal spend. Proving work may already have happened when a fee ceiling rejects a transaction.

For inventory preparation, `max_fee_microcredits` / `maxFeeMicrocredits` on the rebalance call limits that run's network fees, excluding intrinsic split deductions. This is distinct from the client's per-transaction ceiling. Wallet RPC paths cannot provide the same local enforcement; do not promise a limit the wallet cannot enforce.

## Maintain an application budget

The bundled `Trading` class limits concurrent operations and duplicate requests. It does not enforce total daily spend, maximum position size, or accumulated loss. Add those controls in the caller's existing policy/budget service before enabling unattended execution. Reserve the request's maximum input and account-paid fee allowance before writing; retain reservations while outcomes are unknown, then settle against confirmed receipts and refunds.

For an arbitrage decision, convert additional costs into the comparison asset using an explicit current rate or conservative bound. Keep approval, claim, and later inventory rebalancing costs in that calculation. If sponsorship, fees, or conversion cannot be established, return an incomplete cost assessment rather than a positive-profit claim.
