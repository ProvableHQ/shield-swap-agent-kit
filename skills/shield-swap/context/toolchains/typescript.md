# TypeScript

Use the existing Veil and Shield Swap packages. Choose the client by where the keys live.

| Runtime | Packages and entrypoints |
| --- | --- |
| Browser wallet | `@provablehq/shield-swap-sdk` with `@provablehq/veil-aleo-react-hooks` and supported wallet adapters; use `@provablehq/veil-aleo-wallet-adapter` directly outside React. |
| Local-key service or bot | `@provablehq/shield-swap-sdk` with `@provablehq/veil-aleo-sdk`. |
| Framework tool integration | `@provablehq/shield-swap-sdk/agent`; `createShieldSwapAgentTools()` binds schemas and handlers to a client. |
| MCP integration | `@provablehq/shield-swap-sdk/mcp`; see [MCP](mcp.md) for the transport distinction. |

Record the installed versions and read their bundled SDK README before writing code. The [SDK source and reference](https://github.com/ProvableHQ/veil/tree/main/packages/shield-swap) and [Veil package guide](https://github.com/ProvableHQ/veil) provide the full API. The kit does not require access to a Veil checkout.

## Local-key client

The inspected SDK composes `loadNetwork(network)` from `@provablehq/veil-aleo-sdk`, its `createAleoClient(...)`, and `shieldSwapActions(...)`. A persistent `swapFileStore(...)` is exported by `@provablehq/shield-swap-sdk/node`. Follow the installed version's examples for their exact arguments.

Use `client.authenticateShieldSwap()` for the DEX session. This is separate from proving and scanning: the default Provable edge gateway does not require consumer registration. Authentication grants DEX access; referrals are optional.

Configure the account, network, and durable identity store before writes. Browser clients use the connected wallet's account and signing path instead of a local private key and file store. See [private keys and state](../safety/private-key-handling.md).

## Quote and operation lifecycle

The inspected high-level path is `client.quote(...)`, `client.swap({ quote })`, then `client.claimSwapOutput(...)` after finalization. Quote strings are human token amounts; low-level amount fields may be base units. Preserve the quote object and its output minimum.

SDK primitives also include waiting for swap output, unclaimed-swap inspection, and history reconciliation. Consult the installed reference before use; a timeout does not authorize resubmission. The kit does not yet bundle an executable lifecycle or recovery script.

Some existing SDK runbooks retain obsolete invite, state-path, and counter-allocation guidance. Apply this kit's current access rule and verify the installed implementation before copying those snippets. Use [permissions](../safety/permissions.md) to distinguish reads, authentication, and money movement.
