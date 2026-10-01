# Unattended trading

Unattended execution needs an enforceable policy in the worker/server/signing layer. A prompt saying "trade safely" does not restrict what a signer can spend.

## Establish the operating limits

Record the authorized account/network, allowed token IDs and venues, per-trade and total spend limits, slippage/output floors, maximum in-flight operations, maximum inventory exposure, and expiry of the authorization. Choose the counting window explicitly and use integer base units or exact decimal arithmetic.

The policy also needs a stop condition for stale quotes/data, scanner or prover outages, repeated rejection, unknown submissions, and loss of durable state. An operator must be able to pause new trades without abandoning already submitted swaps or claims.

These values are user decisions, not kit defaults. Do not infer an unlimited budget from permission to run a bot.

## Coordinate the account

Reserve budget and input records before submission. Keep one durable operation record across planning, proving, submission, waiting, and claiming. All strategies sharing an account must use coordinated reservations and account-wide limits; independent per-strategy budgets alone are insufficient.

On restart, recover in-flight work before admitting new writes. A timed-out submission remains in flight until its outcome is resolved. Return the original operation for duplicate signals rather than launching another swap.

Separate "stop new trades" from "cancel an accepted transaction." The latter is not generally possible. Claims and any hedge/unwind action need an explicit recovery policy and authority, not an improvised exception to the spend cap.

## Test the operating policy

Before an authorized limited rollout, demonstrate:

- Duplicate signals and worker restarts produce no duplicate submission.
- Wrong network/token, excessive spend, stale terms, and expired authorization fail before signing.
- Two strategies cannot reserve the same input record or exceed the combined budget.
- Lost responses preserve operation state and stop automatic retries.
- A partial fill, refund-only outcome, or failed second leg follows the agreed recovery policy.
- Logs exclude keys, view keys, private records, raw handles, and API secrets.

Measure quote latency, proving/submission latency, time until output is claimable, claim confirmation, scanner visibility, and unresolved operations separately. Track p50/p95/p99 with sample count, SDK version, network, and cold/warm state. Do not call a bot fast based only on HTTP response time.

Use [UTXO management](../shield-swap-setup/swap-utxo-management.md) for record readiness and [unknown-operation recovery](../shield-swap-setup/recover-swaps.md) for ambiguous outcomes.
