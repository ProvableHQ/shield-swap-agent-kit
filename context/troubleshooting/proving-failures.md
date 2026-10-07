# Proving failures

Distinguish local preparation, proof generation, broadcast, confirmation, and claim. A failure late in this sequence may leave a live transaction.

## Identify the stage

| Stage | Check |
| --- | --- |
| Preparation | Correct account/network, token program, amount units, quote terms, and suitable input record. |
| Proving | Runtime/WASM compatibility, memory, configured prover endpoint, and sanitized HTTP status. |
| Broadcast | Whether the service returned a transaction ID or accepted the broadcast. |
| Confirmation | The original transaction's accepted/rejected outcome, not just the broadcast response. |
| Claim | Whether output is available, already claimed, or a prior claim is uncertain. |

Do not use a fresh swap as a prover health check. Preparing a swap can reserve an identity, and simulation can produce authorization material.

Published Provable API docs describe proving at `https://api.provable.com/prove/{network}` and record scanning at `https://api.provable.com/scanner/{network}`. An `x-api-key` header selects a Standard or Enterprise key; a request without it uses the Free tier. Consumer registration and JWT exchange are retired. The account recipes keep the SDK edge defaults, `https://edge.provable.com/api/prove` and `https://edge.provable.com/api/scanner`, unless the user configured a host or key. DEX authentication is separate. Inspect the selected endpoint instead of adding obsolete credentials.

## Confirm the original transaction

Veil — set `SHIELD_SWAP_TRANSACTION_ID`, save as `check-transaction.mts`, run `npx tsx check-transaction.mts`:

```ts
import { getConfirmedTransaction } from '@provablehq/veil-core'
import { client } from './session.mts'

const transactionId = process.env.SHIELD_SWAP_TRANSACTION_ID
if (!transactionId) throw new Error('Supply the original transaction ID')
const confirmed = await getConfirmedTransaction(client, { id: transactionId })
console.log({ transactionId, status: confirmed.status })
```

Use a compatible direct `@provablehq/veil-core` dependency. Preserve transport errors; an explicit not-found response still does not prove permanent failure. The inspected convenience `transactionStatus()` can mask read failures as `not_found`, so it is insufficient on its own for recovery decisions.

Python — set the same variable, save as `check_transaction.py`, run `python check_transaction.py`:

```python
import os
from aleo import Aleo, HTTPProvider
from session import dex

transaction_id = os.environ["SHIELD_SWAP_TRANSACTION_ID"]
reader = Aleo(HTTPProvider(dex.profile.endpoint, network=dex.profile.network))
reader.network.wait_for_transaction(transaction_id, timeout=180.0, poll_interval=2.0)
print({"transaction_id": transaction_id, "status": "accepted"})
```

This creates an unsigned read client for the existing profile's network. Rejection and timeout raise rather than reaching the success print. A timeout carries the original transaction ID; keep it for recovery.

## Retry only the unresolved stage

A proven rejection, a pre-submission failure, and a lost broadcast response need different handling. Preserve proving-job IDs if the provider exposes them, but do not invent a Shield SDK job-status or cancel method.

Confirmation timeouts are not whole-workflow speed limits. Measure proving, broadcast, chain confirmation, output availability, and scanner visibility separately. SDK retry behavior can add time before an exception surfaces.

If submission may have happened, follow [unknown-operation recovery](../shield-swap-setup/recover-swaps.md). If it did not, correct the cause and recheck the original authorization before another attempt. Never loosen slippage, discard recovery state, or repeatedly submit to work around an outage.
