# Inspect and recover the original trade

A missing response leaves the original transaction unresolved. Reopen the same account, network, application database, SDK identity journal, and record store. Preserve them before repairing state. Stop competing writers before account-wide reconciliation.

## Decide which operation can continue

| Application state | Next action |
| --- | --- |
| No row for this ID | It has not started through this database. Confirm this is the original database before interpreting absence. |
| `submitted` with a handle | Call `continue_trade` / `continueTrade` from the bundled workflow. It reads readiness and can make the first claim. |
| `submitting` or `submission_unknown` | Inspect SDK journals and the original transaction/proving job. Do not call `swap` again. |
| `claiming` or `claim_unknown` | Inspect the original claim transaction and SDK history. A missing output mapping can mean it was already claimed. |
| `complete` | Return the saved output/refund result. If holdings are delayed, inspect scanner visibility. |

The normal restart path is in [Python](python.md#continue-after-restart) and [TypeScript](typescript.md#submit-and-continue-the-same-trade). `status` reads local state only. A timeout does not make an unknown state safe to reset.

## Inspect Python evidence

Use the configured `venue` from the original session. This function reads SDK files only and returns public identifiers. Raw journal events contain claim secrets and must stay inside the trusted process.

```python
def inspect_sdk_journals(venue):
    latest = {}
    claims = {}
    for event in venue.dex.journal.events():
        if event['type'] == 'swap':
            latest[event['transaction_id']] = event
        elif event['type'] == 'claim':
            claims[event['swap_id']] = event
    swaps = []
    for transaction_id, event in latest.items():
        swap_id = event.get('swap_id')
        claim = claims.get(swap_id, {})
        swaps.append({'request_transaction_id': transaction_id,
                      'swap_id': swap_id,
                      'claim_transaction_id': claim.get('transaction_id'),
                      'needs_id_recovery': not bool(swap_id)})
    inventory = venue.aleo.inventory
    spends = venue.aleo.record_management.store.list(inventory.scope())
    return {'swaps': swaps, 'record_spends': [
        {'id': s.id, 'status': s.status, 'transaction_id': s.transaction_id}
        for s in spends]}
```

Deduplicate provisional and later completed swap events by transaction ID, as above. `pending_claims()` omits entries without a swap ID, so an empty pending list does not settle an ID-less submission.

For a known public transaction ID, call `venue.aleo.network.get_confirmed_transaction(transaction_id)`. Inspect acceptance or rejection and the original transition. A not-found response is still unresolved; transport/authentication errors are errors, not empty history. The request's accepted result establishes submission, while an accepted matching claim establishes delivery. Reading `venue.dex.get_swap_output(swap_id)` establishes a currently claimable output, not the fate of a missing one.

To update record reservations from chain evidence, use the following separate reconciliation action. It writes the local SDK journal, but neither broadcasts nor releases unprepared reservations:

```python
def reconcile_record_status(venue):
    entries = venue.aleo.inventory.reconcile_record_inventory(
        rebroadcast=False, release_reserved=False)
    return [{'id': e.id, 'status': e.status, 'transaction_id': e.transaction_id}
            for e in entries]
```

`rebroadcast=True` resends the exact saved proved transaction under its original ID. Treat that as an explicitly selected write. `release_reserved=True` is only for proven abandoned pre-preparation work after every active writer has stopped. It is not a timeout remedy.

## Inspect TypeScript evidence

Use the original configured client. This refreshes local record and swap-history checkpoints while reading chain evidence. It does not claim or rebroadcast:

```typescript
import type { WalletClient } from '@provablehq/veil-core'
import type { ShieldSwapActions } from '@provablehq/shield-swap-sdk'

export async function inspectRecovery(client: WalletClient & ShieldSwapActions) {
  const records = await client.reconcileRecordInventory({ rebroadcast: false })
  const history = await client.reconcileSwapHistory({
    maxPages: 40, pageSize: 50, concurrency: 4,
  })
  const pending = await client.getUnclaimedSwaps()
  return {
    records: records.map(r => ({ id: r.id, status: r.status, transactionId: r.transactionId })),
    history: { complete: history.complete, pagesScanned: history.pagesScanned,
      requestsRecovered: history.requests.length, claimsRecovered: history.claims.length },
    pending: pending.swaps.map(s => ({ swapId: s.swapId, claimable: s.claimable,
      hasHandle: Boolean(s.handle) })),
    unresolvable: pending.unresolvable.length,
  }
}
```

`history.complete` describes that bounded walk, not every past identity or unconfirmed transaction. History can skip previously searched identities or existing handles. Repeating the same scan does not guarantee repair. Inspect a known transaction with the public client's `getConfirmedTransaction({ id: TRANSACTION_ID })` and retain its native response for acceptance and transition matching.

The configured identity store can recover supported request handles from retained derivation material. An empty or replaced store cannot recover every lost secret. Browser wallets retain derivation material themselves; use [the browser procedure](browser.md) for their handles and request IDs.

## Reconcile application progress with SDK evidence

The application database, SDK identity journal, and record-spend journal use different IDs. A swap ID is not an application request ID or a transaction ID. Match the original account, network, request transaction, and swap identity before repairing a checkpoint. Similar amounts, nearby timestamps, or the only visible pending trade are not sufficient when multiple requests may exist.

The reference wrapper does not persist an application-request-to-SDK-spend link before the SDK call returns. After a lost submission response, journal entries can therefore be **candidates**, not proven matches. Present them as such. If the original provider job or transaction correlation was captured by the application's execution hooks, use it; otherwise preserve the unknown state for investigation. Do not assign a recovered handle to an application ID by guessing.

For a positively matched accepted request with no claim attempt, restore its original SDK handle and transition the application checkpoint to `submitted` through a guarded repair in the application's service. For a positively matched accepted claim, record its actual result as `complete`. Record the supporting public transaction IDs and require the expected old checkpoint so another worker cannot race the repair. The bundled wrappers intentionally have no automatic unknown-write resolver; build this adapter only where the available evidence establishes the match.

Rejection proves failure only for the matched transaction. A rejected transaction can still charge a fee and consume its fee record. Let SDK reconciliation decide the reservation state. Do not delete rows or release all records to recover capacity.

## Verify delivery

Retain request and claim transaction IDs, the swap ID, actual output, and input refund. Match the claim to the original swap and confirm acceptance. Then read confidential holdings and record inventory again. A missing mapping alone is ambiguous; a balance delta alone is also ambiguous while other trades run.

Scanner lag can leave a confirmed claim temporarily unavailable for the next trade. Continue bounded read-only checks or report the delay. Never repeat the swap or claim to make the balance display update.
