# Axiom

Status: integration guidance only; AgentKit has no Axiom connector. Sources checked 2026-10-01.

Axiom documents a browser trading interface with wallet tracking, market trading, and limit orders. Its FAQ describes a wallet integration using Turnkey, while the limit-order guide describes chart/menu-based order placement. These pages do not establish a public programmatic trade API for this kit. [Product docs](https://docs.axiom.trade/), [wallet FAQ](https://docs.axiom.trade/faqs.md), [limit orders](https://docs.axiom.trade/axiom/swap/limit-orders.md).

## Decide the connection

For a user operating both products, keep Axiom execution and Shield Swap execution separate. The user can provide a trade intent or approved signal; the agent then resolves the Aleo token and obtains a Shield Swap quote. An Axiom wallet connection is not an Aleo signer.

To build an in-terminal integration, obtain Axiom's supported extension/API or partner interface first. Record its account binding, order submission/status/cancellation behavior, and rate limits. Do not treat browser requests or a third-party unofficial SDK as an approved integration surface.

## Strategy implications

A limit order owned by Axiom is not also a Shield Swap limit order. If a separate worker acts on the same price condition, assign exactly one execution owner per intended leg and persist correlation IDs to avoid double buying.

For a cross-venue strategy, verify asset equivalence and available inventory on both sides. Do not send an Aleo key to Axiom or assume a Solana asset can be bought on Shield Swap from its ticker.

Before enabling execution, test duplicate triggers, an external fill followed by Shield Swap failure, stale quotes, and recovery when either venue's order outcome is unknown.

Continue with [terminal integration](../decisions/trade/terminal-integration.md) and the [swap flow](../shield-swap-setup/swap.md).
