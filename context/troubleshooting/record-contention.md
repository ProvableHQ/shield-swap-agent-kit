# Record contention

A private record can only be spent once. Two workers may both see enough balance and select the same input before either transaction becomes visible to the scanner. With record management enabled (Veil 0.14.0, Python 0.8.0, CLI 0.14.0, and the AgentKit MCP), participating calls reserve inputs atomically in a shared journal before proving, and automatic selection moves to the next covering record after a conflict. Contention still occurs between writers that do not share that journal.

## Distinguish the failure

- **Fragmentation:** the aggregate balance covers the trade, but no single suitable record does.
- **Contention:** another in-flight operation already selected or consumed the record. Veil reports a reservation conflict before proving as `RecordReservationConflictError` when every candidate is held.
- **Reserved inventory:** the record is held by a journal entry (`reserved`, `prepared`, `submitted`, or `confirmed` but still reported by the scanner). An inventory read lists it under `reserved`.
- **Scanner delay:** a confirmed output/change record is not visible yet.
- **Wrong inventory:** funds are public, on another network, in another program, or recipient-bound rather than ordinary spendable records.

Use [UTXO management](../shield-swap-setup/swap-utxo-management.md) to inspect available and reserved counts, the largest suitable record, and one-swap readiness. Do not print records to diagnose them.

## Resolve the current operation

1. Pause writers sharing the affected account/record.
2. Resolve each original transaction, including timeouts, through [recovery](../shield-swap-setup/recover-swaps.md). Reconcile the record journal so settled entries release or permanently exclude their inputs.
3. Keep records reserved while a spend is pending or unknown. A missing transaction or 404 is not a rejection.
4. After confirmed consumption, refresh inventory and wait for change. After established rejection, the journal releases the execution inputs; a charged private fee record stays excluded.
5. Requote only if the requested trade still needs to happen and remains authorized.

An accepted request followed by a failed claim needs claim recovery, not a second swap. A spent-record error does not establish which worker succeeded; correlate transaction IDs.

## Prevent recurrence

Give every writer for an account the same record store and chain identity: the CLI's `VEIL_INVENTORY_DB` journal, one SQLite or custom store passed to every Veil client, one Python store shared by every client, or one MCP state directory. Separate journals do not coordinate. Enforce account-wide budget limits in the worker before preparation.

Blinded identity counters and input records are separate resources. Record reservations do not allocate identities; Veil's bundled identity stores coordinate counters within one process, and Python's journal locks under its profile. Keep one trader process per account with those stores, or supply distinct explicit identities per process.

Prepare inventory with a reviewed plan before a batch instead of reshaping records on every trade. Reshaping consumes records, submits transactions, and waits for scanner visibility; an interrupted plan is reconciled and replanned, not repeated.

Measure contention/rejection count and time waiting for spendable change, separately from proving latency. Increasing worker count without enough independent records can reduce completed-trade throughput.
