# Record contention

A private record can only be spent once. Two workers may both see enough balance and select the same input before either transaction becomes visible to the scanner.

## Distinguish the failure

- **Fragmentation:** the aggregate balance covers the trade, but no single suitable record does.
- **Contention:** another in-flight operation already selected or consumed the record.
- **Scanner delay:** a confirmed output/change record is not visible yet.
- **Wrong inventory:** funds are public, on another network, in another program, or recipient-bound rather than ordinary spendable records.

Use [UTXO management](../shield-swap-setup/swap-utxo-management.md) to inspect counts, largest suitable record, and one-swap readiness. Do not print records to diagnose them.

## Resolve the current operation

1. Pause writers sharing the affected account/record.
2. Resolve each original transaction, including timeouts, through [recovery](../shield-swap-setup/recover-swaps.md).
3. Keep records reserved while a spend is pending or unknown.
4. After confirmed consumption, refresh inventory and wait for change. After established rejection, recheck chain/scanner state before making the input available again.
5. Requote only if the requested trade still needs to happen and remains authorized.

An accepted request followed by a failed claim needs claim recovery, not a second swap. A spent-record error does not establish which worker succeeded; correlate transaction IDs.

## Prevent recurrence

Use one writer per account until a shared reservation mechanism exists. For concurrent execution, assign distinct suitable records to operations and enforce account-wide budget limits before preparation.

Blinded identity counters and input records are separate resources. Veil's store locking does not provide cross-process record reservation. Python's journal locks counters; `swap_many()` excludes reused records within its batch, not across independent processes.

Record reshaping may improve future capacity but consumes records and submits transactions itself. Neither inspected SDK supplies a universal autojoin helper. Verify token-specific behavior before implementing it.

Measure contention/rejection count and time waiting for spendable change, separately from proving latency. Increasing worker count without enough independent records can reduce completed-trade throughput.
