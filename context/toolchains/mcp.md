# MCP

AgentKit includes a [draft standalone TypeScript server](../../mcp/README.md) in `mcp/`. Installing the skill does not install its dependencies, register it, or launch it. Existing SDK servers expose different interfaces; inspect the selected implementation and actual tool catalog before making calls.

Use an available MCP connection for capabilities it actually exposes when it fits the requested workflow. If a required capability is missing, consider a supported SDK or CLI path that the host can run while preserving the account and recovery state; see [tool selection](../../tools/SKILL.md). The standalone server README contains its current setup instructions and tool catalog. Its validation section records which wallet and route combinations have been exercised; do not infer coverage for other combinations.

## AgentKit standalone server

The draft server pins published Veil packages to 0.12.0 and runs over stdio on Node.js 22.13 or newer. `setup` provides onboarding instructions; signing keys and execution permissions are configured only in the trusted terminal. Starting an unconfigured server does not create an account.

Its swap workflow is `quote` → `execute` → operation polling → `claim_unclaimed_swaps`. Executions consume durable quotes using idempotency keys. `swap_history` reads the encrypted identity store and reports recovery coverage. SDKs still own transaction construction, signing, and protocol logic; this server adds transport, operation IDs, encrypted storage, and local policy enforcement.

Offline tests and an independently installed tarball verify terminal key import, encrypted persistence, stdio discovery, restart, and recovery failure cases. Bridge regressions cover SDK recovery, destination verification, and lost RPC responses. Separate mainnet checks completed a local Aleo swap and claim, an Ethereum-to-Aleo ETH bridge, and a USDC round trip. The return USDC payment was inspected independently; SDK status still requires external destination verification. Follow the [server README](../../mcp/README.md) for the current limitations.

## TypeScript SDK interface

`createShieldSwapMcpServer(...)` from `@provablehq/shield-swap-sdk/mcp` returns tool definitions and `handleToolCall`. It does not start a process or implement stdio/HTTP transport. A host must wire MCP initialization, tool listing, invocation, result formatting, and errors to a transport.

`createShieldSwapAgentTools(...)` from the SDK's `/agent` entrypoint provides schemas and handlers for framework integrations. Reuse these definitions. Tool presence depends on the configured client/API and options.

`includeWrites: false` excludes money-moving tools, but authentication and API-token mutations can still be present when their backing clients are configured. Select an actual read-only tool set before advertising a read-only server. Tool metadata alone does not enforce a spending policy.

## Existing Python server

The Python SDK has a stdio entrypoint. Its package documents installation and launch as:

```sh
python -m pip install 'shield-swap-sdk[mcp]'
python -m aleo_shield_swap.mcp
```

These commands describe the existing SDK server, not an AgentKit server or a required setup step. Evaluate and pin the dependency version before using it with an account.

The inspected server binds `ALEO_PRIVATE_KEY` when supplied, otherwise creates/loads a signing profile through `ShieldSwap.from_profile()`. Omitting the environment key does not make it read-only. Resolve the profile before launch. Its fallback does not forward the initially read network/endpoint settings into `from_profile()`; inspect the profile's stored configuration.

Its catalog exposes lifecycle operations including onboarding, batch swaps, liquidity, and collection. The inspected version does not expose separate quote, single-swap, and individual-claim tools. Do not promise SDK/MCP parity or invent tool names.

## Using a connected server

Confirm the account, network, advertised tools, and enforced permissions. Call only tools appropriate to the requested task. A tool list containing `swap` does not itself authorize a trade. Read [permissions](../safety/permissions.md) and [private keys and state](../safety/private-key-handling.md) before configuring signing access.

A documentation MCP searches reference material. An operational MCP calls SDK/API functions. Connecting either one does not connect the other, and adding an operational server does not automatically load this skill's context.
