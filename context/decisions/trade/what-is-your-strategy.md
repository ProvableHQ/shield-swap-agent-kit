# What is your strategy?

Distinguish a one-off operation from a recurring strategy. Follow a supplied strategy rather than selecting assets, size, or risk limits on the user's behalf.

| Intent | Information needed before execution |
| --- | --- |
| One-off swap | Account/network, exact asset pair, input amount, slippage or output floor, and quote-only versus execute. |
| Scheduled buys or rebalancing | Trigger/cadence, total and per-run budget, allocation rule, expiry, and behavior after a missed run. |
| Threshold entry, take-profit, or stop-loss | Signal source, trigger, allowed assets, freshness limit, and which component owns the order. |
| Signal/copy-driven trading | Authorized signal source, asset mapping, deduplication, size rule, and behavior when a signal arrives late. |
| Arbitrage | Both venues, comparable inventory, net-edge calculation, execution order, and unmatched-leg policy. See [arbitrage](../../strategies/arbitrage.md). |

These are strategy requirements, not claims that the kit already implements each strategy. The current runbooks supply operational building blocks; they do not install schedulers, native limit orders, or terminal connectors.

## Keep decision and execution separate

The strategy decides whether a trade is wanted. The execution path validates the quote, limits, account, spendable records, and outstanding work before submitting. A new signal must not cause a retry of an operation whose outcome is still unknown.

For multiple strategies, assign each an identifier and budget, then enforce the combined account budget and record reservations centrally. Two individually valid strategies can still conflict over the same private record or exhaust the same daily allowance.

Next: [set up trading tools](setup-trading-tools.md). Recurring execution also needs [unattended-trading limits](../../safety/unattended-trading.md); a one-off swap does not.
