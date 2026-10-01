# Using Shield Swap tools

Use this guide inside the complete AgentKit. The repository's root `SKILL.md` is the installable entrypoint; this file explains when to use deterministic tools.

| Task | Interface |
| --- | --- |
| Build application code | The chosen [TypeScript](../context/toolchains/typescript.md) or [Python](../context/toolchains/python.md) SDK. |
| Trade immediately, with no interface specified | Default to the existing [Shield Swap CLI](../context/toolchains/cli.md), using structured output and the documented planning mode where available. |
| Operate through an existing agent tool connection | The configured [MCP interface](../context/toolchains/mcp.md), after checking its actual tool catalog and permissions. |
| Repeat a workflow or validate deterministic results | A tested script under `tools/js/` or `tools/python/` when that script is implemented. |

The JS/Python script suite and `tool-definitions.json` manifests have not been added yet. The operational context pages contain code to save and run in the consumer's project; these are recipes, not preinstalled commands. For a CLI gap, use the documented Veil session export to retain the same account and recovery store.

Tool manifests must describe actual scripts and their installed dependency versions. Reuse or generate SDK tool schemas when they already exist. A tool description is not a spending limit; apply the [permission rules](../context/safety/permissions.md) and the execution layer's enforcement.

Keep setup and funding separate from trading. A future `configure/setup` helper should configure the chosen account and return a funding next step. A future `trade/swap` helper owns discovery, quoting, authorized execution, and claiming. Do not submit a swap to prove that setup worked.
