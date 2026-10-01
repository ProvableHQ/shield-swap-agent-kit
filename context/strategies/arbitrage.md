# Arbitrage

Use this guide to design a price-discrepancy strategy, not as a ready-to-run strategy engine. The kit supplies the Shield Swap execution leg; it does not ship a second-venue connector or guarantee profitable execution.

## Define the trade before calculating an edge

Identify both venues, networks, exact asset representations, trade direction, and inventory available at each venue. Equal tickers do not establish equivalent assets or an available bridge route.

For a pre-funded two-venue trade, buy a quantity of the base asset on one venue and sell that quantity from inventory on the other. Track both inventory changes. Bridging during execution adds a separate asynchronous leg; it is not an instantaneous transfer between quotes.

Calculate proceeds and costs in one settlement asset, using executable size-dependent quotes rather than a chart price:

```text
estimated net result
  = sale proceeds on venue B
  - purchase cost on venue A
  - incremental execution/claim fees not already included in quotes
  - inventory rebalancing costs
  - configured uncertainty allowance
```

Do not double-count fees embedded in a quote. Compare conservative output bounds as well as estimates. A positive calculation is not a guarantee: one leg can fail, fill partially, or complete after the other venue's price changes.

## Configure the strategy

Specify allowed pairs/venues, quote-age limit, minimum net edge, maximum size, total budget, maximum unmatched exposure, concurrency, and stop conditions. Also decide which leg executes first and what happens if the second leg cannot execute within its limits.

Use [unattended-trading policy](../safety/unattended-trading.md) to enforce those values. A fallback that increases slippage or launches an unapproved hedge is a new trading decision, not error recovery.

## Execution loop

1. Read both inventories and outstanding operations. Skip inventory reserved by another strategy or pending claim.
2. Obtain comparable quotes for the same quantity and record their timestamps and units. Reject stale data and inconsistent asset mappings.
3. Compute the net result including claim and later inventory-rebalancing costs. If the authorized threshold is not met, do nothing.
4. Reserve the required budgets and records; recheck both terms immediately before the first submission.
5. Execute in the approved order. Persist each venue's operation/transaction ID and monitor each leg independently.
6. Complete the Shield Swap [execute-and-claim flow](../shield-swap-setup/swap.md). Unclaimed output is not available inventory.
7. Reconcile actual fills, refunds, fees, and the remaining exposure. Apply the preauthorized unmatched-leg policy or stop for a decision.

A multi-hop Shield Swap route is not evidence that a cross-venue arbitrage cycle is atomic. Do not advertise an all-or-nothing trade unless the actual execution mechanism guarantees it.

## Validate before live use

Start with quote-only observation. Record rejected opportunities as well as apparent opportunities; measure the age of both quotes and whether the quoted size was executable. Paper results omit real proving, contention, failed legs, and claims, so label them as estimates.

An authorized testnet or bounded live evaluation should include stale quotes, record contention, partial fills, unknown submissions, restart during either leg, and delayed claims. Report realized results separately from mark-to-market inventory changes. Use [trade history](../shield-swap-setup/swap-history.md#build-an-account-ledger) for the accounting boundary.

External interfaces are selected through [terminal integration](../decisions/trade/terminal-integration.md) or [bot integration](../decisions/trade/bot-integration.md). A data feed alone does not supply execution authority on that venue.
