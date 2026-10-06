# What is your trading stack?

Keep an explicit stack choice. If none is specified, choose a surface that fits the host's available tools, existing account setup, custody, and required operations. CLI, SDK, and MCP support differ; immediate trading does not imply one preferred interface.

| Existing environment | Continue with |
| --- | --- |
| Terminal-command workflow | [CLI](../../toolchains/cli.md) and the matching [tool setup](setup-trading-tools.md). |
| Existing Veil or Python trader | Its [TypeScript](../../toolchains/typescript.md) or [Python](../../toolchains/python.md) client and existing recovery state. |
| Connected MCP server | [MCP](../../toolchains/mcp.md): inspect the actual tools, account, network, and permissions. |
| Axiom, GMGN, Terminal, or fomo | [Terminal integration](terminal-integration.md). |
| BONKbot, Banana Gun, or another chat bot | [Bot integration](bot-integration.md). |

An external terminal login or API key does not automatically configure an Aleo account. Determine whether the user wants to operate Shield Swap alongside that product, build a connector, or trade only on the external venue.

## Carry forward

Retain the selected interface, intended operation, network, public account address, and state location. Keep credentials out of the conversational record. If an MCP-only host has no supported trading tool, report that missing capability rather than inventing a tool call.

Next: [identify the strategy](what-is-your-strategy.md). For a fully specified one-off trade, no strategy interview is needed; continue to [tool setup](setup-trading-tools.md) or the [swap recipe](../../shield-swap-setup/swap.md).
