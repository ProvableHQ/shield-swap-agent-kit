# Concurrent swaps and recovery

Concurrent swaps need distinct covering records, distinct SDK identities, and durable request ownership. A large balance alone does not establish any of these.

The reference workflow allows different requests to execute together. Its operation limit counts unresolved submissions and claims as in flight. The SDK reserves records before proving. A reservation conflict must never cause a second attempt under a new application ID.

Use the SDK inventory planner to inspect a desired record layout. Show the planned joins/splits, amounts, fees, and affected inventory before executing it under the caller's authority. Do not reshape the whole account merely to satisfy a sample batch. An ongoing inventory maintainer is optional application behavior, not a prerequisite for a single trade.

Python uses the SDK's durable SQLite store. The JavaScript adapter implements Veil's public record-store interface: acquisition is atomic, mutations finish durably, confirmed records remain excluded from stale scans, and a rejected transaction still holds a charged private fee record. Distinct requests can continue while unresolved requests hold their own inputs, subject to the configured operation capacity.

## Inspect and prepare records

Use the selected token ID and its decimal count from discovery. Choose a desired record count from the number of simultaneous trades and a minimum amount from their maximum input size. For unequal sizes, a uniform minimum equal to the largest trade is conservative; review whether it would over-reshape the account. Existing adequate records should be preserved.

Python, using the configured `venue` and the copied workflow module:

```python
from workflow import inventory_summary, plan_inventory, execute_inventory_plan

def preview_inventory(venue, token_id, count, minimum_base_units, max_transactions):
    current = inventory_summary(venue, token_id)
    plan = plan_inventory(venue, token_id, count=count,
                          minimum_base_units=minimum_base_units,
                          max_transactions=max_transactions)
    summary = {'current': current, 'steps': len(plan.steps),
               'operations': [step.kind for step in plan.steps],
               'intrinsic_deduction_base_units': str(plan.deduction)}
    return plan, summary

def prepare_authorized_inventory(venue, reviewed_plan, max_fee_microcredits):
    return execute_inventory_plan(venue, reviewed_plan,
                                  max_fee_microcredits=max_fee_microcredits)
```

The helper resolves the funding record program and passes an `InventoryTarget` with `distribution='preserve'` to `aleo.inventory.plan_record_inventory`. The write passes the **same plan** to `aleo.inventory.rebalance_record_inventory`; calling `dex.rebalance_inventory` instead would obtain a new plan. The wrapper's `execution_enabled` flag does not gate this separate SDK operation.

TypeScript, using the configured `WalletClient & ShieldSwapActions`:

```typescript
import type { WalletClient, InventoryPlan } from '@provablehq/veil-core'
import type { ShieldSwapActions } from '@provablehq/shield-swap-sdk'
import { inventorySummary, planInventory, executeInventoryPlan } from './workflow.mjs'

export async function previewInventory(client: WalletClient & ShieldSwapActions,
  tokenId: string, count: number, minimumBaseUnits: bigint, maxTransactions: number) {
  const current = await inventorySummary(client, tokenId)
  const plan = await planInventory(client, tokenId, count, minimumBaseUnits, maxTransactions)
  return { plan, summary: { current, steps: plan.steps.length,
    operations: plan.steps.map(step => step.kind), deductionBaseUnits: plan.deduction.toString() } }
}

export function prepareAuthorizedInventory(client: WalletClient & ShieldSwapActions,
  plan: InventoryPlan, maxFeeMicrocredits: bigint) {
  return executeInventoryPlan(client, plan, maxFeeMicrocredits)
}
```

Planning reads the scanner and deployed program interface but does not reserve records or submit anything. Show the affected asset, record counts, joins/splits, intrinsic deduction, and separate network-fee budget. Credits splits have an intrinsic deduction; it is not included in the network-fee ceiling. Do not assume every token program supports the same joins or splits.

Connect preview and execution to the application's review/authorization flow. Bind the approved asset, unchanged plan, account/network, and fee budget to one preparation job. Persist its result and prevent two handlers from executing that job together. The callable example is a native SDK recipe, not a review UI or an application authorization service. Avoid reshaping inventory while the same strategy is scheduling new trades; retain SDK reservations for any unrelated outstanding work.

Execution rescans and checks the plan, reserves inputs, submits each step, and waits for its confirmed output records before the next step. `complete` means those steps finished. `interrupted` includes known transaction IDs, completed steps, and a reason. Preserve it, follow [recovery](recovery.md), then rescan before deciding whether a new plan is needed. Accepted steps are not rolled back. Browser wallets cannot enforce this planner's local fee ceiling; use the wallet-specific approval path rather than dropping the limit silently.

## Run independent requests

After preparing inventory, obtain fresh offers and validate them against the caller's policy. Preparation can outlast a quote. Use distinct persistent order IDs, not array indexes regenerated on restart.

Python, with an execution-enabled `Trading` instance:

```python
from workflow import progress

def run_authorized_batch(trading, reviewed_requests):
    # reviewed_requests contains (stable_request_id, original_offer) pairs.
    return [progress(row) for row in trading.execute_many(reviewed_requests)]
```

TypeScript: `await trading.executeMany(reviewedRequests)`, where each element is `[stableRequestId, originalOffer]`. Display each result through `progress` from `workflow.mts`. Keep the configured maximum in-flight operations at or above the intended simultaneous batch size, within the caller's authority. A batch larger than the current free capacity can return `not_started` for excess requests; it is not a durable work queue.

Complete or reconcile outstanding requests before scheduling further work. `execute_many` / `executeMany` returns per-request outcomes; one success does not imply the rest succeeded. Do not rerun the whole batch under new IDs after one failure. For sequential dependencies, wait for the first trade's actual claim and available records before quoting the next input.

## Resume the original request

| Saved status | Next action |
| --- | --- |
| `submitted` | Inspect the original handle, wait for its output, then make its first claim attempt. |
| `submitting` or `submission_unknown` | Stop replacement submissions. Inspect the SDK journal and original transaction or proving job. |
| `claiming` or `claim_unknown` | Inspect the original claim, SDK inventory, and swap history before any further write. |
| `complete` | Return the saved claim result, including any refund. |

The reference wrappers do not treat a missing response as failure. Their automated continuation covers a known submitted handle before its first claim. Use [the recovery procedures](recovery.md) for exact SDK calls and evidence needed to resolve ambiguous writes.

Stop active writers before account-wide inventory reconciliation. Reconciliation may rebroadcast a saved proved transaction depending on the SDK method and options. Inspect the installed method's behavior and authorization first. Never recover by deleting state, creating a replacement account, burning another trade ID, or rerunning a batch.

All processes spending from an account must share its reservation and identity coordination. Separate journals do not coordinate. The included single-host SQLite adapters do not provide distributed coordination across machines. Existing distributed applications should implement the SDK storage contract in their shared database.
