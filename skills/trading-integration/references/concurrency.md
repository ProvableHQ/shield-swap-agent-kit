# Concurrent swaps and recovery

Concurrent swaps need distinct covering records, distinct SDK identities, and durable request ownership. A large balance alone does not establish any of these.

The reference workflow allows different requests to execute together. Its operation limit counts unresolved submissions and claims as in flight. The SDK reserves records before proving. A reservation conflict must never cause a second attempt under a new application ID.

Use the SDK inventory planner to inspect a desired record layout. Show the planned joins/splits, amounts, fees, and affected inventory before executing it under the caller's authority. Do not reshape the whole account merely to satisfy a sample batch. An ongoing inventory maintainer is optional application behavior, not a prerequisite for a single trade.

Python uses the SDK's durable SQLite store. The JavaScript adapter implements Veil's public record-store interface: acquisition is atomic, mutations finish durably, confirmed records remain excluded from stale scans, and a rejected transaction still holds a charged private fee record. Distinct requests can continue while unresolved requests hold their own inputs, subject to the configured operation capacity.

## Resume the original request

| Saved status | Next action |
| --- | --- |
| `submitted` | Inspect the original handle, wait for its output, then make its first claim attempt. |
| `submitting` or `submission_unknown` | Stop replacement submissions. Inspect the SDK journal and original transaction or proving job. |
| `claiming` or `claim_unknown` | Inspect the original claim, SDK inventory, and swap history before any further write. |
| `complete` | Return the saved claim result, including any refund. |

The reference wrappers deliberately do not decide that a missing response means failure. Their automated continuation covers a known submitted handle before its first claim. Ambiguous writes require reconciliation through the SDK and chain before the application checkpoint can be resolved; they are not automatically retried.

Stop active writers before account-wide inventory reconciliation. Reconciliation may rebroadcast a saved proved transaction depending on the SDK method and options. Inspect the installed method's behavior and authorization first. Never recover by deleting state, creating a replacement account, burning another trade ID, or rerunning a batch.

All processes spending from an account must share its reservation and identity coordination. Separate journals do not coordinate. The included single-host SQLite adapters do not provide distributed coordination across machines. Existing distributed applications should implement the SDK storage contract in their shared database.
