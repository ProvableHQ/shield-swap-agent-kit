# Scanner lag

A confirmed transfer or claim can precede private-record visibility. Chain confirmation, DEX API indexing, and private-record scanning are separate observations.

## Check the original operation first

Confirm the original transaction on the selected network. For a swap, request confirmation is not enough: verify the claim transaction too. If the claim outcome is unknown, follow [recovery](../shield-swap-setup/recover-swaps.md) before treating this as scanner lag.

Then check the account, underlying token program, scan range, spent-status filter, and pagination. A wrong program, omitted older blocks, or already-spent output can also produce an empty scan.

## Veil record visibility

For a local signer, set `SHIELD_SWAP_CLAIM_TX_ID` and the verified `SHIELD_SWAP_RECORD_PROGRAM`. Save as `check-records.mts` and run `npx tsx check-records.mts`:

```ts
import { client } from './authenticate.mts'

const transactionId = process.env.SHIELD_SWAP_CLAIM_TX_ID
const program = process.env.SHIELD_SWAP_RECORD_PROGRAM
if (!transactionId || !program) throw new Error('Supply the claim ID and record program')
let matched = 0
let complete = false
for (let page = 0; page < 20; page++) {
  const records = await client.requestRecords({
    program, statusFilter: 'all', includePlaintext: false,
    filter: { resultsPerPage: 1000, page },
  })
  matched += records.filter(record => record.transactionId === transactionId).length
  if (records.length < 1000) { complete = true; break }
}
console.log({ transactionId, matchedRecords: matched, complete })
```

This checks visibility, including records that were subsequently spent. It does not establish the token amount or that the record remains available. Use [inventory checks](../shield-swap-setup/swap-utxo-management.md) for spendability. Missing transaction metadata or a capped scan limits the conclusion.

The inspected Veil record provider has no public scanner-progress method. Do not fabricate a scanner height or percentage from the newest returned record.

## Python checks

Use the [private-balance recipe](../shield-swap-setup/bridge-funds.md); scanning failures should surface rather than become a public-only status result. The underlying Aleo record service offers sync status, but the inspected Shield Swap facade does not expose a public scanner-status accessor.

In an application already retaining its underlying Aleo client, `aleo.records.status()` returns an `ok` flag and `data.synced`/`data.percentage`, not a height. Do not depend on a private `dex._aleo` member for a general kit recipe. Constructor registration can fail without aborting construction, so a constructed client is not proof that scanning works.

## Recover visibility

Retry reads with bounded backoff and an operator-visible deadline. Keep the accepted transaction IDs and state intact. If progress stalls, diagnose the scanner endpoint/credentials and scan range; do not re-register with a new identity or switch services without considering view-key disclosure.

Do not request another airdrop, re-claim, or trade again to fix missing records. Report separately: claim accepted, scanner output not yet visible. Resume spending only after a suitable unspent record is available.
