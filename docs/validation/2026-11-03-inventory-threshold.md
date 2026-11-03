# Available-record threshold validation — 2026-11-03

An independently installed MCP tarball exercised available-record replenishment on the same testnet account as the [concurrent-trading validation](2026-11-03-concurrent-record-trading.md). It used Veil 0.16.1 and SDK 0.13.0, requested FeeMaster sponsorship, and retained the existing 5 ALEO per-plan inventory fee ceiling. The test submitted one 0.1 USDCx → ETH swap at 50 bps slippage and claimed its output.

## Observed behavior

The job used `records: 16`, `replenishThreshold: 14`, `minRecordAmount: "0.1"`, and `intervalSeconds: 120`.

| Observation | Available covering records | Result |
| --- | ---: | --- |
| Initial inventory | 15 | Stayed idle despite being below the target of 16 |
| Swap input reserved | 14 | Triggered one inventory operation at the threshold |
| Refill and swap finished | 17 | Target restored; swap change contributed an additional record |

At the trigger, both observed reservation failures and shortages were zero. Available inventory drove the refill. The original inventory operation completed both planned split transactions; no second inventory operation was registered. Its journal recorded 2,199 microcredits per split. The swap returned 50,641,305,051,017 base units of ETH, all claimed, with zero input refund. USDCx inventory balance decreased by exactly the 100,000 base units sold.

Two MCP sessions referred to the same saved job. Before submitting the swap, closing the session that owned the attached worker stopped that worker; the second session observed its absence and restored the service through supervision. The saved job remained the same. Process tests separately verify OS-lock exclusion and replacement after `SIGKILL`.

The test disabled the maintenance job immediately after observing its first operation ID. Final reconciliation found zero unresolved journal entries. After closing the test sessions, a fresh MCP session verified the swap was complete, no job was enabled, and no maintenance worker was running.

## Transaction evidence

| Action | Confirmed transaction |
| --- | --- |
| Swap | [testnet transaction](https://api.provable.com/v2/testnet/transaction/confirmed/at172fjfqq0vvf7aqmmlzjq2kh2dgp2a4np6tsju36ss2yklc9t2cpqjscfft) |
| Refill split 1 | [testnet transaction](https://api.provable.com/v2/testnet/transaction/confirmed/at1gc565sqhhuta740z7ksga8p0h5svktzy90mugw9gmakzhgpnv5psyyyyzq) |
| Refill split 2 | [testnet transaction](https://api.provable.com/v2/testnet/transaction/confirmed/at17s74ucrlj9jzt4yuqg0jczwwnl34jjs2he9mayt64ze8cuc4lugqrsuevp) |
| Claim | [testnet transaction](https://api.provable.com/v2/testnet/transaction/confirmed/at1akvlakn4pfqyn8tas62xec5kt649j2qcz48rgjc7kyrrs9t2z5rqslsc4f) |

The installed CLI SHA-256 was `c8a49c28eb64ba6e95f805653ea8181b57c3f5bc207026ca71c656f74d68588d`.

## Verification and limits

Eight focused threshold tests cover triggering and refill hysteresis, acquisitions and releases during a scan, durable wakeups across connections/restarts, account isolation, failure backoff, and lock contention. Shortage tests verify definitive failures before proving and preserve uncertainty after the submission boundary. A real process test verifies worker crash replacement and shutdown. Type checking, build, 25 root checks, and installed-package lifecycle smoke checks passed.

The full MCP suite ran 151 tests: 142 passed; nine existing tests could not bind local sockets in the sandbox. These were two Claude-launcher scenarios and seven background-recovery scenarios (stalled headers/bodies, slot refill, SDK-session cancellation, exhausted-pool deadlines, fan-out cancellation, and bridge recovery). They are not reported as passing.

This live run covers one account and one token job. It does not establish sustained throughput, multi-account live behavior, arbitrary external-wallet coordination, or live exhaustion of every suitable record. Fail-fast shortages and uncertain outcomes were exercised offline. Replenishment still requires sufficient splittable inventory; only writers sharing the same state directory coordinate reservations.
