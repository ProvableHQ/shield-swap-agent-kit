# What is your trading stack?

Keep an explicit stack choice. If the user wants to trade immediately and has not chosen one, default to the JS CLI until the AgentKit MCP server is available.

| Existing environment | Continue with |
| --- | --- |
| Agent with terminal access | [Set up trading tools](setup-trading-tools.md), using the CLI. |
| Existing Veil or Python trader | Its [TypeScript](../../toolchains/typescript.md) or [Python](../../toolchains/python.md) client and existing recovery state. |
| Connected MCP server | [MCP](../../toolchains/mcp.md): inspect the actual tools, account, network, and permissions. |
| Axiom, GMGN, Terminal, or fomo | [Terminal integration](terminal-integration.md). |
| BONKbot, Banana Gun, or another chat bot | [Bot integration](bot-integration.md). |

An external terminal login or API key does not automatically configure an Aleo account. Determine whether the user wants to operate Shield Swap alongside that product, build a connector, or trade only on the external venue.

## Carry forward

Retain the selected interface, intended operation, network, public account address, and state location. Keep credentials out of the conversational record. If an MCP-only host has no supported trading tool, report that missing capability rather than inventing a tool call.

Next: [identify the strategy](what-is-your-strategy.md). For a fully specified one-off trade, no strategy interview is needed; continue to [tool setup](setup-trading-tools.md) or the [swap recipe](../../shield-swap-setup/swap.md).
