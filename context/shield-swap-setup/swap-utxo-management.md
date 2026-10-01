# Swap UTXO management

Private balances live in spendable records. Two records containing 1 token each are not automatically one input containing 2 tokens. A pending swap also ties up its input until its change/output becomes available.

The inspected SDKs do not provide a general split/join/autojoin helper. This page explains record readiness and coordination; it does not install an autojoin service.

## Check one-trade readiness

Use the [balance checks](bridge-funds.md) first, then distinguish aggregate holdings from a single suitable record.

Python — save as `check_inventory.py`, run `python check_inventory.py`:

```python
from authenticate import dex

token = dex.api.get_token("USDCx")
print({"token_id": token.address,
       "covers_one_swap": dex.has_swap_balance(token.address, "1.5")})
```

The decimal string is in token units; an integer input would be base units. Replace the token and amount with the intended trade. This checks availability, not reservation.

Veil selects the smallest single suitable unspent record for a local signer. To diagnose fragmentation, resolve the underlying record program and token ID from metadata, then set `SHIELD_SWAP_RECORD_PROGRAM` and `SHIELD_SWAP_TOKEN_ID`. For a multi-token registry the token filter is essential.

Save as `inventory.mts` and run `npx tsx inventory.mts`:

```ts
import { parseTokenRecordInfo } from '@provablehq/shield-swap-sdk'
import { client } from './authenticate.mts'

const program = process.env.SHIELD_SWAP_RECORD_PROGRAM
const tokenId = process.env.SHIELD_SWAP_TOKEN_ID
if (!program || !tokenId) throw new Error('Supply the verified record program and token ID')
let count = 0
let total = 0n
let largest = 0n
let complete = false
for (let page = 0; page < 20; page++) {
  const records = await client.requestRecords({
    program, statusFilter: 'unspent', includePlaintext: true,
    filter: { resultsPerPage: 1000, page },
  })
  for (const record of records) {
    if (!('recordPlaintext' in record)) continue
    const info = parseTokenRecordInfo(record.recordPlaintext)
    if (!info || info.recipientBound) continue
    if (info.tokenId !== undefined && info.tokenId !== tokenId) continue
    count++
    total += info.amount
    if (info.amount > largest) largest = info.amount
  }
  if (records.length < 1000) { complete = true; break }
}
console.log({ count, total: total.toString(), largest: largest.toString(), complete })
```

Use this local-signer recipe only for a verified token program. Records without token IDs are attributed by their program. Amounts are base units. A capped scan with `complete: false` is partial. Never log plaintext records. Recipient-bound wrapper records are excluded from ordinary spendable inventory.

## Coordinate before adding concurrency

Start with one writer per account. A persistent blinding counter prevents identity reuse; it does not reserve input records.

To support concurrent swaps, reserve distinct records and budget in one shared coordinator before preparing requests. Keep reservations through unknown outcomes. Release them only after rejection or settled consumption is established, and wait for new change records before reuse. All processes sharing the account must participate.

Python `swap_many()` avoids record reuse within its batch, not across unrelated workers. Veil's identity-store lock is not a cross-process record lock. A command named concurrent swaps is not evidence that an arbitrary account has enough independent inputs.

## When records need reshaping

Joining or splitting is another transaction with its own fee, proving time, record consumption, and scanner delay. It requires the selected token program's verified ABI and user authorization. Do not invent `autojoin()` or assume every token supports the same operation.

For a fast bot, prepare suitable inventory before the strategy runs rather than putting record reshaping on every trade's critical path. Recheck availability immediately before spending; inventory measurements are snapshots.

If holdings exist but a trade cannot select a record, follow [record contention](../troubleshooting/record-contention.md) and [scanner lag](../troubleshooting/scanner-lag.md).
