# What are you building?

Choose the application's job before provisioning an account. Reuse requirements already present in the user's request.

| Product | Start with | The application must own |
| --- | --- | --- |
| Browser trading interface | Veil with a connected wallet | Wallet connection, transaction approval, pending-operation UI, and recovery after reload. |
| Bot or server | Veil or Python | Persistent account state, execution limits, job ownership, and restart recovery. |
| Research or quote service | SDK reads or existing read tools | Data freshness, exact asset identifiers, and a clear boundary before signing. |
| Agent tool integration | Existing SDK agent tooling or the [standalone MCP server](../../toolchains/mcp.md) when selected | Tool selection, signal-to-operation binding, configured signer policy, and operation status. |
| Terminal/chat integration | The selected product's supported integration surface | User/account binding, signal deduplication, and the distinction between the external and Shield Swap legs. |

A one-off request to trade belongs in [the trading path](../trade/what-is-your-trading-stack.md), not a new application scaffold.

## Extend an existing system

Use this route when the project already has a runtime, signer, and network. Keep that client. Skip account creation, funding, and strategy selection unless the user asked for them.

An existing MCP connection follows this route too: keep its configured profile, network, and state directory. Inspect `get_config` and `list_wallets` for the AgentKit server; other servers have different catalogs. Choosing MCP for a new integration does not automatically import an existing SDK client, browser signer, or recovery store.

### Quote only

Read [discover pools and get quotes](../../shield-swap-setup/discover-pools-and-get-quotes.md). Call quote on the existing client and return that quote. Stop there. Do not create an account, request funding, or submit a swap.

On the AgentKit MCP, use the [existing-profile quote recipe](../../toolchains/mcp.md#quote-on-an-existing-profile): discover identifiers with `list_tokens` or `list_pools` as needed, then call `quote` with the selected `profileId`. Return its `quoteId`, terms, and expiry without calling an execution tool.

### Authorized swap

Read [swap](../../shield-swap-setup/swap.md). Call quote, submit, and claim on that same client. When the submission or claim outcome is unknown, read [recover swaps](../../shield-swap-setup/recover-swaps.md) and resume the original operation. Do not create an account, request funding, choose a strategy, or submit another swap to recover the first.

For an existing AgentKit MCP profile, follow [execute and claim one swap](../../toolchains/mcp.md#execute-and-claim-one-swap). Preserve the original `quoteId`, idempotency key, and returned operation ID. Claim only that swap; an unknown result goes through operation status and recovery.

## Establish the minimum brief

Identify the runtime, who controls the signer, required operations, and whether live execution is needed now. Also establish whether the application serves one account or many: account isolation changes how credentials and recovery stores are selected.

For a frontend, determine whether the wallet supports the required Aleo signing/proving flow. For an unattended worker, decide where its durable state lives and which process owns in-flight operations. Do not make a browser wallet export its key to fit a server example.

A useful first milestone is a quote-only vertical slice: accept a pair and amount, resolve tokens, display native quote terms, and submit nothing. Account authentication may be needed; funding and trading are not prerequisites for that milestone.

Next: [choose the tool stack and SDK](choose-tool-stack-and-sdk.md), then [choose custody](choose-custody-mode.md).
