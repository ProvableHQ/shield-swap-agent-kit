# Recover swaps

Use this page to resolve an uncertain swap or claim, recover missing identifiers, and finish a known pending claim. Start a new trade through [swap](swap.md).

A lost response is not a failed transaction. Pause new writes using the affected budget and records while determining whether the original request or claim was accepted.

Preserve the same account, network, identity store/journal, transaction or proving-job ID, and failure stage. Keep an access-controlled backup before repair. Do not print raw handles or journals, reset counters, delete state, or create a new swap to recover the old one.

## Establish what happened

1. Use the [original transaction check](../troubleshooting/proving-failures.md#confirm-the-original-transaction), or inspect its proving job through the configured provider when supported. No transaction found yet is not proof that it was never broadcast.
2. Inspect local history for a provisional handle, request ID, swap ID, and later claim.
3. Read the original swap's output and execution receipt when its ID is known.
4. If a request succeeded, continue its claim. If a claim succeeded, wait for its private records. Retry a failed action only after its outcome is established and the original authorization still applies.

After resolving the original outcome, [resume one claim](#resume-one-claim) below. Neither an empty pending list nor a missing output settles an ambiguous broadcast.

## CLI recovery

From the original trading directory:

```sh
shield-swap history --network testnet --reconcile --pages 40 --json
```

This probes identities, reads transaction history, and updates the local store. It does not claim without execution flags. The page limit bounds work; a truncated search is not complete history. Raise or omit `--pages` when a wider search is needed. The identity probe also has a bounded `--window`; a probe finding nothing does not prove that all identities were recovered.

Inspect the result before any separate, targeted claim. Do not replace an existing store with an empty one to force reconciliation.

## Veil recovery

Save as `recover.mts` and run `npx tsx recover.mts` using the existing session:

```ts
import { client } from './authenticate.mts'

const result = await client.reconcileSwapHistory({
  maxPages: 40, pageSize: 50, concurrency: 8,
})
console.log({
  complete: result.complete,
  pagesScanned: result.pagesScanned,
  requestsRecovered: result.requests.length,
  claimsRecovered: result.claims.length,
})
const pending = await client.getUnclaimedSwaps()
console.log({
  pending: pending.swaps.map(swap => ({
    swapId: swap.swapId, claimable: swap.claimable,
    hasHandle: Boolean(swap.handle),
  })),
  unresolvableCount: pending.unresolvable.length,
})
```

The inspected implementation matches accepted single- and multi-hop requests and claims to identities already in the configured store. It can rebuild request handles using the stored blinding material. It cannot derive every lost secret from public history; an empty store is not a universal recovery mechanism.

`complete` describes that history walk, not proof that an unconfirmed operation failed or that every lifetime identity was discovered. Missing transactions, newer activity, and bounded identity discovery still require investigation. Some upstream comments understate request recovery; this recipe follows the implementation recorded in the [source map](../../docs/source-map.md).

The implementation also skips previously searched records and some records that already carry a handle, even if fields remain incomplete. `--reconcile` does not clear those markers. If the original transaction is known but this scan finds nothing, inspect that transaction directly; do not repeatedly run the same scan and assume it repairs every case.

## Python: include ID-less submissions

Save as `inspect_unknown.py` and run `python inspect_unknown.py`:

```python
from authenticate import dex

latest = {}
claimed = set()
for event in dex.journal.events():
    if event["type"] == "swap":
        latest[event["transaction_id"]] = event
    elif event["type"] == "claim":
        claimed.add(event["swap_id"])
for transaction_id, event in latest.items():
    swap_id = event.get("swap_id")
    print({
        "transaction_id": transaction_id, "swap_id": swap_id,
        "state": "needs_id_recovery" if not swap_id else
                 "claim_recorded" if swap_id in claimed else "unreconciled",
    })
```

The latest event per transaction avoids counting a provisional handle and its completed form as separate trades. `pending_claims()` skips ID-less entries; `status()` and `collect_all()` are not sufficient to resolve them.

The inspected Python SDK has no public one-call lost-ID recovery helper. Resolve the original transaction with the provider and the matching SDK transaction decoder before reconstructing a handle. Preserve the original blinding material and journal counter. If decoding or persistence repair cannot be verified, stop with the public transaction/job identifier and protected state location for an operator; do not edit secrets or fabricate IDs.

## Resume one claim

These recipes reuse the session from [account setup](configure-account.md) and [authentication](configure-shield-swap.md). They submit a claim and must only run for an authorized original swap, after resolving any uncertain earlier claim.

### CLI

Inspect first, then claim the selected swap:

```sh
shield-swap history --network testnet --json
shield-swap history --network testnet --claim --swap-id YOUR_SWAP_ID --execute --json
```

Replace the ID. Omitting it can claim other pending swaps. History reads can update local recovery state even without executing a claim.

### Veil

Save as `claim.mts`, set `SHIELD_SWAP_ID` to the original ID, and run `npx tsx claim.mts`:

```ts
import { client } from './authenticate.mts'

const swapId = process.env.SHIELD_SWAP_ID
if (!swapId) throw new Error('Supply the original swap ID')
const pending = await client.getUnclaimedSwaps()
const swap = pending.swaps.find(entry => entry.swapId === swapId)
if (!swap?.handle || !swap.claimable) {
  throw new Error('No claimable stored handle; inspect the original operation')
}
const claim = await client.claimSwapOutput({ handle: swap.handle })
console.log({
  swapId, transactionId: claim.transactionId,
  amountOut: claim.amountOut.toString(),
  refundedInput: claim.amountRemaining.toString(),
})
```

### Python

Save as `claim.py`, set `SHIELD_SWAP_ID`, and run `python claim.py`:

```python
import os
from authenticate import dex

swap_id = os.environ["SHIELD_SWAP_ID"]
handle = next((item for item in dex.journal.pending_claims()
               if item.swap_id == swap_id), None)
if handle is None:
    raise RuntimeError("No matching handle; inspect the original operation")
claim = dex.claim_swap_output(handle, timeout=300).delegate(wait=True)
print({"swap_id": swap_id, "transaction_id": claim.transaction_id,
       "amount_out": claim.amount_out, "refunded_input": claim.amount_remaining})
```

Python waits for the output before submitting this claim. Its journal view is not proof that another process has not already claimed it. Keep one claim worker per operation.

## Verify and stop

Retain both transaction IDs and the actual output/refund amounts, in their respective token base units. Verify the claim confirmation, then use the [private-balance checks](bridge-funds.md). If the claim is accepted but records are not visible, follow [scanner lag](../troubleshooting/scanner-lag.md); do not submit a replacement swap.

The local-signer recipes wait for confirmation; a browser wallet's write path can return a transaction ID before confirmation. Verify that transaction separately before reporting completion. Neither path guarantees immediate scanner visibility.

A missing output may mean not finalized or already claimed. An uncertain claim submission needs recovery, not a blind claim retry. Use [swap history](swap-history.md) and the original transaction to distinguish these cases.

## Unresolved cases

A lost store, malformed journal, missing transaction, or inconsistent node response needs operator-assisted recovery. Record what was checked and what remains unknown. Share sanitized identifiers and versions, not key files, scanner credentials, private records, or journal contents.
