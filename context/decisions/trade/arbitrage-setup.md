# Set up an arbitrage bot

Load the standalone [arbitrage skill](../../../skills/arbitrage/SKILL.md). It carries the project and strategy choices into the [trading integration](../../../skills/trading-integration/SKILL.md) and includes a Python Shield Swap/Uniswap v3 reference implementation.

Keep the selected language, project, accounts, networks, and limits. The strategy skill starts with comparable quotes and inventory, then supports an authorized two-leg cycle. A quote-only request remains read-only. The [arbitrage checklist](../../strategies/arbitrage.md) covers asset correspondence, costs, and unmatched exposure.

Account setup and funding are separate prerequisites for execution. Reuse existing configuration; do not create a testnet account or start a trade merely because the requested deliverable is a bot.
