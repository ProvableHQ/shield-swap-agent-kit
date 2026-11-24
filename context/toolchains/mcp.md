# MCP

Use an available MCP connection for capabilities it actually exposes when it fits the requested workflow. Inspect the selected implementation and actual tool catalog before making calls. Installing this skill does not install, register, or launch a server.

If a required capability is missing, consider a supported SDK or CLI path that the host can run while preserving the account and recovery state; see [tool selection](../../tools/SKILL.md).

## TypeScript SDK interface

`createShieldSwapMcpServer(...)` from `@provablehq/shield-swap-sdk/mcp` returns tool definitions and `handleToolCall`. It does not start a process or implement stdio/HTTP transport. A host must wire MCP initialization, tool listing, invocation, result formatting, and errors to a transport.

`createShieldSwapAgentTools(...)` from the SDK's `/agent` entrypoint provides schemas and handlers for framework integrations. Reuse these definitions. Tool presence depends on the configured client/API and options.

`includeWrites: false` excludes money-moving tools, but authentication and API-token mutations can still be present when their backing clients are configured. Select an actual read-only tool set before advertising a read-only server. Tool metadata alone does not enforce a spending policy.

## Existing Python server

The Python SDK has a stdio entrypoint. Its package documents installation and launch as:

```sh
python -m pip install --upgrade --only-binary=aleo-sdk aleo-sdk 'shield-swap-sdk[mcp]'
python -m aleo_shield_swap.mcp
```

These commands install the latest SDK releases from PyPI and launch the existing SDK server as an optional integration. Check the installed capabilities and record the resolved versions in the application's lockfile before using it with an account.

The inspected server binds `ALEO_PRIVATE_KEY` when supplied, otherwise creates/loads a signing profile through `ShieldSwap.from_profile()`. Omitting the environment key does not make it read-only. Resolve the profile before launch. Its fallback does not forward the initially read network/endpoint settings into `from_profile()`; inspect the profile's stored configuration.

Its catalog exposes lifecycle operations including onboarding, batch swaps, liquidity, and collection. The inspected version does not expose separate quote, single-swap, and individual-claim tools. Do not promise SDK/MCP parity or invent tool names.

## Using a connected server

Confirm the account, network, advertised tools, and enforced permissions. Call only tools appropriate to the requested task. A tool list containing `swap` does not itself authorize a trade. Read [permissions](../safety/permissions.md) and [private keys and state](../safety/private-key-handling.md) before configuring signing access.

A documentation MCP searches reference material. An operational MCP calls SDK/API functions. Connecting either one does not connect the other, and adding an operational server does not automatically load this skill's context.
