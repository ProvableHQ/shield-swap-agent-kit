# Two-venue execution and recovery

The included bot executes one cycle at a time. Its Shield execution component supports independent concurrent swaps; simultaneous arbitrage cycles need an additional account-wide exposure policy. Do not increase concurrency merely because the SDK accepts more requests.

A cycle carries one stable application ID and two child IDs: `:shield` and `:evm`. The Shield child uses the trading integration's operation database and native SDK journals. The EVM child saves its nonce, signed transaction, and locally derived hash before broadcast. Treat all state files as private and keep them out of version control.

| Cycle state | Meaning and next step |
| --- | --- |
| `shield_pending` | Inspect or claim the original Shield request. Do not buy on Uniswap yet. |
| `shield_complete` | Recheck the original strategy against a fresh purchase quote. |
| `evm_pending` | Inspect the original transaction receipt until the configured confirmations arrive. |
| `complete` | Both legs completed. Read actual claims, receipts, and fees before reporting realized results. |
| `unmatched` | A partial fill, changed edge, or failed second leg left exposure. Stop new cycles and apply the caller's explicitly authorized recovery decision. |
| `needs_review` or an interrupted starting state | The write boundary is unresolved. Inspect the existing child records and SDK/chain evidence. |

`resume()` continues a known submitted Shield operation to its first claim, or checks the original EVM receipt. It does not regenerate a missing EVM submission. A missing receipt is pending/unknown, not a failed trade. A reverted receipt is failure only after the configured confirmations.

The reference leaves ambiguous Shield submissions and claims for SDK/chain reconciliation. It does not infer failure from an empty output mapping, because a consumed claim can produce the same absence. Preserve the original journals and proved transaction evidence.

Use one owner for the EVM signer while a cycle or approval is pending. Other applications can otherwise consume its nonce or balance. The SQLite checkpoints coordinate participating local processes, not unrelated wallets, funding scripts, or machines.

The configured `costs` are an input to the decision, not a live oracle. Include both legs' fees and quote-currency conversion, and use a conservative bound appropriate to the selected network. L2 fees can include components beyond execution gas. Do not label a result profitable when these costs are missing or stale.

The strategy is not atomic across venues. A successful first trade can be followed by a failed or uneconomic second trade. The default recovery policy stops; it does not automatically bridge, hedge, or liquidate.

## Build around settled amounts

Keep the original plan, both child IDs, request/claim IDs, and EVM receipt with the cycle. `shield_complete` means the first claim was confirmed, not that the account has its original inventory back. A refund changes the sold quantity; the reference stops with unmatched exposure rather than buying the originally planned quantity blindly.

After the first claim, check the new purchase against actual proceeds, fees, minimum net result, and the original maximum spend. A second quote that is executable but less favorable than the caller permitted cannot complete this cycle automatically. Show the held assets and the specific failed condition.

After both legs confirm, calculate realized proceeds and costs from actual claims and receipts. Keep scanner availability separate from settlement before scheduling another cycle. Repeated cycles deplete prefunded inventory on opposite venues; bridging that inventory back is a separately configured funding workflow, with its own fees and authorization.

For an uncertain Shield child, load the companion trading skill's recovery reference and inspect its original SDK state. For an uncertain EVM child, keep the stored nonce, signed bytes, and locally derived hash. An unrelated transaction with the same asset and amount is not evidence for this cycle. Do not mark the parent complete until both child outcomes have been established.
