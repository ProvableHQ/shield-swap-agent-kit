# What are you building?

Choose the application's job before provisioning an account. Reuse requirements already present in the user's request.

| Product | Start with | The application must own |
| --- | --- | --- |
| Browser trading interface | Veil with a connected wallet | Wallet connection, transaction approval, pending-operation UI, and recovery after reload. |
| Bot or server | Veil or Python | Persistent account state, execution limits, job ownership, and restart recovery. |
| Research or quote service | SDK reads or existing read tools | Data freshness, exact asset identifiers, and a clear boundary before signing. |
| Agent tool integration | Existing SDK agent tooling or an explicitly selected MCP server | Tool selection, validated arguments, signer policy, and operation status. |
| Terminal/chat integration | The selected product's supported integration surface | User/account binding, signal deduplication, and the distinction between the external and Shield Swap legs. |

A one-off request to trade belongs in [the trading path](../trade/what-is-your-trading-stack.md), not a new application scaffold.

## Establish the minimum brief

Identify the runtime, who controls the signer, required operations, and whether live execution is needed now. Also establish whether the application serves one account or many: account isolation changes how credentials and recovery stores are selected.

For a frontend, determine whether the wallet supports the required Aleo signing/proving flow. For an unattended worker, decide where its durable state lives and which process owns in-flight operations. Do not make a browser wallet export its key to fit a server example.

A useful first milestone is a quote-only vertical slice: accept a pair and amount, resolve tokens, display native quote terms, and submit nothing. Account authentication may be needed; funding and trading are not prerequisites for that milestone.

Next: [choose the tool stack and SDK](choose-tool-stack-and-sdk.md), then [choose custody](choose-custody-mode.md).
