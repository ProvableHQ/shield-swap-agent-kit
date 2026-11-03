# Background recovery validation — 2026-11-03

PR #13's original recovery loop selected eight operations and waited for the whole batch. The MCP timer suppressed new batches until the slowest lookup settled. The regression test failed on the original implementation: with Alice's first lookup held open, Bob's operations 8 and 9 remained unvisited after six ticks.

Recovery now tracks each operation separately, refills free slots on completion, and preserves the limit of eight in-flight operations. Completed attempts have a 15-second cooldown. Each background attempt has a 60-second deadline; shutdown cancels it immediately. Abort signals reach the configured SDK HTTP transports and response bodies, and identity-lock acquisition observes cancellation. Separate read clients avoid sharing writer authentication or interrupting active submissions. Shutdown awaits request cleanup before closing encrypted state. An aborted scope cannot make subsequent store calls or network retries.

## Controlled performance comparison

Run from `mcp/`:

```sh
node --import tsx scripts/benchmark-recovery.ts
```

The benchmark compares the previous `fcf9363` batch algorithm and CLI guard with the new scheduler, using the real runtime, OS operation locks, encrypted SQLite store and local HTTP server. Ten operations span two accounts; Bob owns the last two. Each normal response waits 20 ms and includes a 16 KiB payload. One scenario holds Alice's first response for 500 ms. Both schedulers receive the same accelerated 5 ms timer ticks, isolating the batch barrier from the production 15-second interval. Native fetch and storage paths are warmed first; five samples alternate execution order.

| Scenario | Previous median: Bob finished | New median: Bob finished | Previous median: all finished | New median: all finished |
| --- | ---: | ---: | ---: | ---: |
| All responses healthy | 54.9 ms | 54.5 ms | 54.9 ms | 54.5 ms |
| One 500 ms stalled response | 539.6 ms | 54.8 ms | 539.6 ms | 506.9 ms |

Each run made exactly ten requests, with at most eight concurrent requests in this workload. Healthy-account latency during the stall fell about 90%; normal latency showed no slowdown in these samples. The separate never-settling-request regression confirms later operations progress before the stalled response is released. These measurements concern recovery scheduling, not proving speed, chain confirmation time, or live swap throughput.

## Regression coverage

The combined branch passes 129 MCP tests, 25 repository checks, TypeScript checking and the build. The independently installed CLI matches the built artifact, SHA-256 `5d94551887b03406be9a15d0ec2600ea413e9793fb5259a9b24a1fc5d7cb1854`.

Tests exercise stalled headers and bodies over actual local HTTP connections, a fully stalled eight-operation pool, immediate slot refill, duplicate-ID exclusion, cooldown after timeout, SDK fan-out cleanup, a 1,000-completed-operation history with only one discovery scan per tick, identity-lock cancellation, and rejection of delayed store access. They verify that deadlines preserve unresolved proofs, checkpoints and reservations; cancellation leaves unrelated requests and writer sessions working. Real SDK session tests cover cancellable chain transports and public bridge recovery clients without hosted-wallet authentication.

The installed-CLI scenario uses a fresh consumer outside SDK workspaces, disposable accounts, persisted operations and a local chain endpoint:

```sh
node --import tsx scripts/verify-installed-background-recovery.ts /absolute/path/to/independent-project
node scripts/smoke-installed.mjs /absolute/path/to/independent-project
node scripts/smoke-installed-recovery.mjs /absolute/path/to/independent-project
```

The installed process recovered nine operations while the first response body remained stalled. SIGTERM cancelled that request, released its operation lock, and retained the unresolved proof and reservation. A second process loaded the same store and reconciled the original transaction after the endpoint returned a confirmed rejection. No transaction was submitted. Existing installed-package checks also cover tool discovery, maintenance-worker exclusion and crash replacement, and uncertain claim recovery across restarts.

This follow-up uses controlled endpoints and simulated chain outcomes; it does not repeat funded swaps. The earlier [14-swap testnet run](2026-11-03-concurrent-record-trading.md) remains separate evidence. The cancellation deadline applies to background operation recovery; active writes still drain normally, and explicit status/history calls can take longer. Deep history scans that exceed the background deadline retain unresolved state and may need an explicit status check with a longer client timeout.
