# Build or trade now

Use the user's request to select the path. Ask a focused question only if the intent or a consequential choice is missing.

## Build an integration

Identify the runtime and where signing keys belong. A browser application uses the connected wallet; a server or unattended bot needs an explicitly configured signer. A read-only prototype may need neither a signer nor a funded account.

- For browser applications or TypeScript services, read [TypeScript](../toolchains/typescript.md).
- For Python services, notebooks, or bots, read [Python](../toolchains/python.md).
- For exposing or consuming agent tools, also read [MCP](../toolchains/mcp.md).

Start from the selected SDK's documented client and API. Set up an account only when a requested integration test or operation actually requires it. Do not run a first-swap example as an installation check: it may create an account, request funding, and submit a trade.

## Operate an account

Identify the requested operation, network, account, and available interface. Reuse an existing configured account. If the account choice is unknown, resolve it before invoking any helper that can generate keys.

- Default to [CLI](../toolchains/cli.md) for agents trading immediately. This remains the default until the AgentKit MCP server is available.
- For an existing MCP connection, read [MCP](../toolchains/mcp.md) and inspect its actual tools.
- For a requested language-specific script, read the corresponding SDK page.

Select the interface once and carry it through the task. Use an SDK fallback only for a concrete CLI gap, preserving the same account, network, and recovery state. The CLI guide shows how a Veil script can reuse its session.

Then apply [permissions](../safety/permissions.md) and [private-key handling](../safety/private-key-handling.md). A request to inspect or quote authorizes that operation, not a swap. An explicit authorized trade should continue through its required claim and verification without repeatedly asking the user to approve the same scope.

If setup is needed, follow [configure account](../shield-swap-setup/configure-account.md) and [configure Shield Swap](../shield-swap-setup/configure-shield-swap.md), which ends at [funding](../shield-swap-setup/bridge-funds.md). Discovery and quoting belong to the separate [swap journey](../shield-swap-setup/swap.md); they are not setup gates.

## Shared rules

Authentication grants access; referrals are optional. If an older tool requires an invite code, identify the version mismatch and use a verified corrected path. Do not invent a code or disable authentication.

Keep setup separate from strategy execution. Never choose a trade size, token, network, or unattended strategy merely because an example uses it. Report missing tool support directly; this initial context package does not provide terminal connectors or strategy implementations.
