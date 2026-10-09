# Error handling

Classify an error by the last completed stage and possible side effects, not just its message. Keep the original operation identity across recovery.

For outdated commands, missing SDK methods, or obsolete setup prompts, inspect the installed versions and use the [latest SDK and CLI upgrade commands](../toolchains/updates.md). Preserve any pending operation and its recovery material; a dependency update is not a retry of the original transaction.

| Symptom | Action | Do not |
| --- | --- | --- |
| Invalid network, token, amount, or configuration | Correct the input before preparing a transaction. | Guess identifiers or silently switch accounts. |
| DEX 401/403 | Check the selected session and [authenticate](configure-shield-swap.md). | Require an invite code or re-onboard for funding. |
| Read-only 429/5xx or transport failure | Retry the read with bounded backoff; preserve the error if it persists. | Interpret an outage as empty state. |
| Expired/stale quote or unacceptable minimum output | Obtain fresh terms and check the existing authorization. | Widen slippage or approve a new trade automatically. |
| No suitable private record | Check funding type, fragmentation, scanner visibility, and reservations. | Treat aggregate balance as a guaranteed input. |
| Record spent / duplicate input | Stop competing writers and resolve the original spend. | Reuse the record after a timeout. |
| Proving or broadcast timeout | Preserve job/transaction IDs and inspect whether submission happened. | Wrap the whole swap in an automatic retry. |
| Accepted broadcast, confirmation missing | Follow [unknown-operation recovery](recover-swaps.md). | Equate broadcaster acceptance with chain acceptance. |
| Confirmed rejection | Record the rejection and fee effects; re-plan only within authorization. | Reset identity counters or reuse stale record snapshots. |
| Output missing / not finalized | Check original request and claim history. | Assume that missing output means no claim succeeded. |
| Confirmed claim, balance unchanged | Check [scanner lag](../troubleshooting/scanner-lag.md). | Claim again or place a replacement swap. |
| Journal/store persistence failure | Pause writes, preserve surviving material, and recover the accepted operation. | Delete state or rerun execution to recreate a handle. |

## Preserve structured evidence

For Veil, a confirmation timeout can expose `transactionId`, `timeoutMs`, and poll counts; a finalize rejection exposes its transaction ID and may include a fee transaction ID. Python confirmation timeouts carry `tx_id` and `timeout`. Preserve those fields in the protected operation record.

Log an allowlist: stage, error name, HTTP status, public identifiers, and timestamps. Error messages and bodies can include request data or credentials; do not blindly serialize exceptions.

Veil can fail after a successful swap while recording its handle. Such an error may carry the handle as recovery material. Keep it private; its presence is not permission to submit again. Python journals provisional swaps before a confirmation wait, but a timed-out claim may not yet have a claim journal event.

## Define retries by action

Retrying an idempotent read is different from retrying a transaction submission. SDKs already retry some service calls internally; an outer retry can multiply latency or duplicate writes.

A claim retry requires checking for an uncertain earlier claim. A new quote after rejection requires checking price and authorization again. If the outcome cannot be established, stop new writes and report the unresolved stage.

For unattended workers, enforce this policy in code using [unattended trading](../safety/unattended-trading.md), not only an agent instruction.
