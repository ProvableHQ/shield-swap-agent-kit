# Build or trade now

Use the [welcome and canonical journeys](../getting-started.md) and the user's request to select the path. Ask a focused question only if the intent or a consequential choice is missing.

## Build an integration

Start with [what are you building?](build/what-are-you-building.md), then [choose the tool stack and SDK](build/choose-tool-stack-and-sdk.md) and [custody mode](build/choose-custody-mode.md). Skip decisions already answered by the user's request.

Identify the runtime and where signing keys belong. A browser application uses the connected wallet; a server or unattended bot needs an explicitly configured signer. A read-only prototype may need neither a signer nor a funded account.

- For browser applications or TypeScript services, read [TypeScript](../toolchains/typescript.md).
- For Python services, notebooks, or bots, read [Python](../toolchains/python.md).
- For exposing or consuming agent tools, also read [MCP](../toolchains/mcp.md).

Start from the selected SDK's documented client and API. For an operational connection to trading tools, configure the account and verify funding as part of the journey, carrying the same signer and recovery state into the integration. Explicit code-only or read-only work can defer these steps. Do not run a first-swap example as an installation check: it may create an account, request funding, and submit a trade.

## Operate an account

Start with [the trading stack](trade/what-is-your-trading-stack.md), [strategy requirements](trade/what-is-your-strategy.md), and [tool setup](trade/setup-trading-tools.md). For a fully specified trade on an existing account, go straight to the requested operation.

Identify the requested operation, network, account, and available interface. Reuse an existing configured account. If the account choice is unknown, resolve it before invoking any helper that can generate keys.

- For a terminal-command workflow, read [CLI](../toolchains/cli.md).
- For an existing MCP connection, read [MCP](../toolchains/mcp.md) and inspect its actual tools.
- For a requested language-specific script, read the corresponding SDK page.

Select the interface from the user's choice, existing setup, runtime, custody model, and the capabilities needed for the operation. Carry it through the task; use a fallback for a concrete capability gap, preserving the same account, network, and recovery state. For a CLI-to-Veil fallback, the CLI guide shows how to reuse its session.

Then apply [permissions](../safety/permissions.md) and [private-key handling](../safety/private-key-handling.md). A request to inspect or quote authorizes that operation, not a swap. An explicit authorized trade should continue through its required claim and verification without repeatedly asking the user to approve the same scope.

If setup is needed, follow [configure account](../shield-swap-setup/configure-account.md) and [configure Shield Swap](../shield-swap-setup/configure-shield-swap.md), which ends at [funding](../shield-swap-setup/bridge-funds.md). For inspection only, use [discover pools and get quotes](../shield-swap-setup/discover-pools-and-get-quotes.md). For execution, use the complete [swap journey](../shield-swap-setup/swap.md). Neither is a setup gate, and a quote does not require funding.

## Shared rules

Authentication grants access; referrals are optional. If an older tool requires an invite code, [upgrade to the latest published SDK or CLI](../toolchains/updates.md), check its documented behavior, and use the supported session fallback if still needed. Do not invent a code or disable authentication.

Keep setup separate from strategy execution. Never choose a trade size, token, network, or unattended strategy merely because an example uses it. Report missing tool support directly; this initial context package does not provide terminal connectors or strategy implementations.
