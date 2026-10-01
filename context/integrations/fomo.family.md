# fomo.family

Status: integration guidance only; AgentKit has no fomo connector. Sources checked 2026-10-01.

The [official fomo site](https://fomo.family/) describes mobile and web trading, a social feed, trader-following features, and trade notifications. These product features are not evidence of a public automation API. A programmatic order/status interface was not verified in the reviewed public material.

## Separate social signals from execution

A feed item or notification is an observation about another trader. It is not the user's authorization, an executable quote, or proof that the same asset exists on Aleo.

For a signal-driven integration, retain the original event ID, timestamp, chain, token address, and observed action. Apply the user's size and freshness rules, then obtain a separate Shield Swap quote. Late notifications should not bypass the maximum quote/signal age.

For an in-app integration, first establish the supported partner/API or extension surface, account consent flow, and order lifecycle. Do not automate a private mobile/web endpoint or assume an embedded wallet can sign Aleo transactions.

## Privacy boundary

Publishing a trade, portfolio change, account link, or timestamp to a social feed can reveal information independently of the chain. Routing an Aleo leg privately does not make the source trade, bridge transfers, or social identity unlinkable.

Keep signal intake and trade-result sharing separate. Do not publish Shield Swap history or account associations back to the social product without explicit user direction.

Test duplicate notifications, mobile/web reconnects, stale signals, and a successful external trade followed by an unresolved Shield Swap leg before enabling automatic execution.

Continue with [terminal integration](../decisions/trade/terminal-integration.md) and [unattended-trading limits](../safety/unattended-trading.md).
