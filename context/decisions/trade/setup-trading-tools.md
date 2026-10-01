# Set up trading tools

Install and configure only the selected execution interface. Run in a stable application/trading directory outside the installed kit so updating the context cannot remove account state.

## CLI path

1. Use the installed `shield-swap` command; [install once](../../toolchains/cli.md) only if it is missing. Record the installed version and check `shield-swap setup --help` and `shield-swap swap --help` before using unfamiliar flags.
2. Follow [configure account](../../shield-swap-setup/configure-account.md) to reuse or deliberately create the account. Keep `.shield-swap/` private and out of version control.
3. Follow [configure Shield Swap](../../shield-swap-setup/configure-shield-swap.md) for authentication. Referrals are optional; no invite code is needed.
4. Continue to [funding](../../shield-swap-setup/bridge-funds.md) and check existing private holdings before moving funds.

The existing CLI combines account setup, authentication, token creation, and conditional testnet funding. If setup already completed those stages, verify their results instead of repeating them page by page.

## SDK or MCP path

Use the selected [Veil](../../toolchains/typescript.md), [Python](../../toolchains/python.md), or [MCP](../../toolchains/mcp.md) guide. A CLI-to-Veil fallback uses the existing CLI session; it does not create a new account or reset the recovery store.

For MCP, verify the server's actual catalog and signer binding. Installing context does not register a server. A future tool name in a design is not a callable capability.

## Readiness check

Run the selected [environment diagnostics](../../shield-swap-setup/diagnose-environment.md). Record the public address, network, dependency versions, and whether authentication and private record reads succeeded. Do not expose configuration contents.

Setup ends with funding, not a discovery or swap test. For inspection only, use [discover pools and get quotes](../../shield-swap-setup/discover-pools-and-get-quotes.md); quoting does not require funding. Continue to [swap](../../shield-swap-setup/swap.md) only when that is the requested operation. A recurring strategy must also meet [unattended-trading requirements](../../safety/unattended-trading.md).
