# Using Shield Swap tools

Use this guide inside the complete AgentKit. The repository's root `SKILL.md` is the installable entrypoint; this file explains when to use deterministic tools.

Preserve the user's selected interface. Otherwise, choose based on the host's available tools, existing account setup, runtime, custody, and the capabilities needed to complete and recover the operation. Trading immediately does not by itself select the CLI. Ask a focused question only if a consequential choice remains unclear.

| Task | Interface |
| --- | --- |
| Build application code | The chosen [TypeScript](../context/toolchains/typescript.md) or [Python](../context/toolchains/python.md) SDK. |
| Operate through terminal commands | The existing [Shield Swap CLI](../context/toolchains/cli.md), using structured output and the documented planning mode where available. |
| Trade through an existing application or script | Its configured Veil or Python client, retaining the same account and recovery state. |
| Operate through an existing agent tool connection | The configured [MCP interface](../context/toolchains/mcp.md), after checking its actual tool catalog and permissions. |
| Repeat a workflow or validate deterministic results | A tested script under `tools/js/` or `tools/python/` when that script is implemented. |

The [setup inspector](inspect-setup.mjs) discovers local accounts and installed tool versions/locations for the setup summary and explicit check reports. Its `accounts` and `setup` commands also power main-menu options **1** and **2**, or direct `check accounts` / `check setup` requests. See [its commands, scope, and host connection handling](../context/shield-swap-setup/inspect-setup.md). The JS/Python trading-command suite and `tool-definitions.json` manifests have not been added. Operational context pages contain code to save and run in the consumer's project; these are recipes, not preinstalled commands. For a CLI gap, use the documented Veil session export to retain the same account and recovery store.

Tool manifests must describe actual scripts and their installed dependency versions. Reuse or generate SDK tool schemas when they already exist. A tool description is not a spending limit; apply the [permission rules](../context/safety/permissions.md) and the execution layer's enforcement.

Use the [welcome and canonical journeys](../context/getting-started.md) for the numbered main menu. Options 1 and 2 inspect existing accounts and setup; option 5 inspects markets, option 6 opens trading integration, and option 7 opens arbitrage. The coming-soon integrations have no executable route. An operational trading integration includes account setup and funding, followed by integration verification; explicit code-only work may defer these. Keep setup and funding separate from transaction execution. Follow the [swap workflow](../context/shield-swap-setup/swap.md) for discovery, quoting, authorized execution, and claiming. Do not submit a swap to prove that setup worked.
