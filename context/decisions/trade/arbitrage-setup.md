# Set up an arbitrage bot

Use this page to stand up the Shield Swap side of an arbitrage bot on testnet in about ten minutes. A returned quote is the success condition. That result shows that the account, store, and quote path work. It is not evidence of an edge.

Follow [Build a one-account bot](bot-integration.md#build-a-one-account-bot) for the native SDK or MCP option, its signer and durable state, and the single writer. The [arbitrage checklist](../../strategies/arbitrage.md) is the design reference for a later comparison. This page does not add a strategy engine or a second-venue connector.

## Required inputs

Record these before quoting:

- Network. This setup uses testnet.
- Pair and size cap.
- Maximum quote age.
- Minimum edge.
- What happens if the other leg cannot execute.
- The second venue, when the user already has a way to read its quote.

Stop when the size cap or the minimum edge is missing. Do not invent either value.

## Plumbing on testnet

Reuse the selected account or configure the [account](../../shield-swap-setup/configure-account.md) and [Shield Swap access](../../shield-swap-setup/configure-shield-swap.md) when needed. Keep one signer and one writer that spends records. Native clients use the SDK durable store; the standalone MCP uses its encrypted state directory.

For MCP, follow [quote on an existing profile](../../toolchains/mcp.md#quote-on-an-existing-profile) on the selected testnet profile. Apply the requested size cap and maximum quote age before comparing prices. `quote` returns Shield Swap terms; it does not enforce the strategy's minimum edge or obtain a second-venue quote.

Read [discover pools and get quotes](../../shield-swap-setup/discover-pools-and-get-quotes.md). Call quote for the pair within the size cap and return that quote. Stop there. Do not submit a swap.

## One Shield Swap leg

Take this step only after the user authorizes a trade. Read [swap](../../shield-swap-setup/swap.md). Quote, submit, and claim that same operation. A timeout, restart, duplicate signal, or refund stays on that operation. Read [recover swaps](../../shield-swap-setup/recover-swaps.md) before another write.

With MCP, use the [single-swap recipe](../../toolchains/mcp.md#execute-and-claim-one-swap) and retain the quote and operation IDs for this signal. Select the original swap in `claim_unclaimed_swaps`; a refund does not authorize another `execute`.

## Two-venue comparison

The other quote is supplied by the user. This kit does not install that venue's connector. A data feed is not permission to trade there.

Read the comparison in the [arbitrage checklist](../../strategies/arbitrage.md#define-the-trade-before-calculating-an-edge). Use the same pair and size on both quotes. When the other quote is missing, or the asset or size does not match, stop. Do not invent a trade.

A testnet comparison is plumbing. The first live observation is a mainnet quote-only pass after the user names mainnet, both inventories, and a maximum size. That pass returns quotes and submits nothing. Submit a mainnet Shield Swap leg only when that trade is authorized on its own.

Leave bridging out of this setup. A bridge is a separate leg, and this setup does not include a verified bridge execution recipe. Funding choices stay on [bridge funds](../../shield-swap-setup/bridge-funds.md). For a separately requested MCP bridge, check the [documented route validation and recovery limits](../../../mcp/README.md#mainnet-validation); support for a swap does not establish bridge delivery verification.
