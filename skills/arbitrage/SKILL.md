---
name: arbitrage
description: Build or integrate a Shield Swap arbitrage bot, starting with a Python Shield Swap and Uniswap v3 implementation that compares executable quotes, tracks both legs, and preserves interrupted cycles.
---

# Build an arbitrage bot

Build a bot that compares the cost of buying an asset on one venue with the proceeds from selling it on another. It needs funds at both venues and a plan for what happens when only one trade completes.

Use the `trading-integration` skill for Shield Swap execution. This skill adds the second venue, opportunity calculation, and cycle state. The agent helps create and configure the code; the resulting application runs without rereading a skill for each trade.

## Choose the first case

Keep the project, language, accounts, network, pair, and venues already supplied. If the project is unknown, ask where the bot will run and what it already uses for market data and execution. Suggest relevant existing projects from the conversation.

Establish the exact assets at both venues, trade size, quote age, minimum net result after costs, slippage, gas budget, and behavior if a leg fails. Ask only for missing inputs. Equal symbols do not establish equivalent assets. Confirm the underlying asset and redemption/bridge relationship before comparing them.

The bundled reference sells an exact amount on Shield Swap, claims it, then buys that same quantity on a configured Uniswap v3 pool. It uses prefunded accounts. Bridging is a separate inventory-rebalancing workflow. The initial implementation supports Python; keep a selected TypeScript application and adapt the workflow using Veil and its existing EVM client rather than creating a Python subprocess.

## Produce working code

Read [the Python reference](references/python.md) to integrate the maintained modules, and [execution and recovery](references/execution.md) before enabling writes. For TypeScript applications, read [the native TypeScript approach](references/typescript.md).

Locate the installed `trading-integration` skill or the root kit's `skills/trading-integration` directory. Copy its selected language modules into the consumer's package and retain their imports. If it is unavailable, install that companion from `ProvableHQ/shield-swap-agent-kit` with the normal skill installer. Do not fabricate a local dependency path or duplicate SDK signing and recovery logic inside the strategy.

Offer the form that fits the project: add a strategy to its existing bot, expose callable strategy functions, or create a script/CLI when requested. Keep setup and funding in their existing skills and pass account/project context through. A code-only deliverable does not require moving funds.

## Observe, then execute under the caller's limits

Start with `plan()`. Show comparable quantities, minimum sale proceeds, maximum purchase cost, additional fees, available inventory, and the reason a candidate is rejected. Test stale data, amount precision, duplicate cycle IDs, restart, partial fills, and uncertain results before a funded run.

For a funded test, retain the authorized accounts and total spending limit, including fees and possible loss. A positive quoted edge is not guaranteed profit. Require inventory and gas at both venues before the first leg. Do not use bridging or an unapproved hedge as an improvised recovery action.

Return the actual files, entrypoints, test results, and current operation status. Separate simulated results, read-only live quotes, and funded transactions. When a cycle is unresolved, identify its existing ID and next inspection step instead of declaring the bot ready for unattended execution.
