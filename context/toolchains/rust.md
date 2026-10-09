# Rust

The native Shield Swap Rust SDK is planned; this kit has no verified crate, installation command, or native swap recipe yet. Do not substitute a similarly named crate or translate private transaction construction from examples by hand.

## Use the existing execution surfaces deliberately

A Rust application can own strategy logic while a supported Veil/Python worker owns signing and the swap lifecycle. Alternatively, invoke the installed JS CLI as a subprocess. These are integration patterns, not a shipped Rust connector.

For the subprocess path:

1. Install or upgrade to the latest published [CLI](cli.md) in a stable runtime directory, then record the resolved version for deployment. Invoke the executable with an argument array, not shell-concatenated user input.
2. Set an explicit working directory and network. Keep credentials out of arguments; the configured session owns the key and identity store.
3. Parse JSON only for commands that support it. Decode base-unit integer strings losslessly; do not use floating-point amounts.
4. Persist the application operation ID before starting a write. Retain transaction/swap IDs and distinguish process failure from transaction rejection.
5. On process timeout, use [unknown-operation recovery](../shield-swap-setup/recover-swaps.md). Killing or restarting a subprocess does not undo a submitted transaction.

Do not spawn a new signing process for every polling request if a persistent worker can own the operation. Conversely, a long-lived worker must enforce account isolation and a bounded input queue.

## Future native path

Before selecting a Rust release, verify native support for network configuration, signing/proving, token units, quote constraints, durable identity allocation, claims, and recovery after restart. Passing a quote demo does not establish this complete lifecycle.

An actual remote MCP server can be consumed through a compatible Rust MCP client when available; the current TypeScript dispatcher export is not itself an endpoint. See [MCP](mcp.md).
