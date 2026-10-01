# Swap

Discovery and quoting begin here for a requested trade or inspection task. They are separate from account configuration and funding. This page defines the journey; the kit's deterministic swap scripts are not implemented yet.

1. **Discover.** Read actual token metadata, available pools or routes, and relevant liquidity through the chosen SDK. Check the selected account's spendable holdings when execution is requested. Do not invent token identifiers, decimals, or a trade size.
2. **Quote.** Request a quote for the specified pair and amount. Apply the installed SDK's unit conventions and show the route, expected output, minimum output, and expiry. A quote-only request ends here and does not require funding a new account.
3. **Execute within scope.** Verify account, network, amount, and quote constraints against the user's authorization. Pass the executable quote through the documented SDK path and configure durable claim state before submitting.
4. **Claim and verify.** Wait for the original swap to finalize, claim its output, and verify the resulting operation and balances through the selected SDK. Keep state available across restarts.

Use [TypeScript](../toolchains/typescript.md), [Python](../toolchains/python.md), [CLI](../toolchains/cli.md), or the actual tools exposed by [MCP](../toolchains/mcp.md). Follow [permissions](../safety/permissions.md) and [private-key handling](../safety/private-key-handling.md).

If the account needs setup or funding, link back to [configure account](configure-account.md) or [funding](bridge-funds.md) at that point. An unknown submission result requires inspecting and recovering the original operation, not starting this journey again from execution.
