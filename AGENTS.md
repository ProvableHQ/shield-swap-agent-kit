# Shield Swap agent journey

Start with [build or trade now](context/decisions/build-or-trade-now.md). Preserve choices and authorization already supplied by the user. A request to build an integration does not require creating or funding a trading account.

Choose [Veil](context/toolchains/typescript.md), [Python](context/toolchains/python.md), the [CLI](context/toolchains/cli.md), or available [MCP tools](context/toolchains/mcp.md) according to the user's stack, custody model, and required operations. Preserve an explicitly selected interface. When none is specified, use the existing setup and verified capabilities to choose a suitable surface; read [tool selection](tools/SKILL.md) for the options and supported fallbacks.

Each operational page explains the shared behavior, then gives interface-specific recipes. Read the section for the chosen interface, not every implementation. The examples use testnet and run in the consumer's project, outside this installed kit. Change networks only to match the user's request. The kit includes a [draft standalone MCP server](mcp/README.md) with terminal setup, swap and bridge integration, and documented validation limits. It does not bundle its own trading CLI.

## Setup and trading are separate journeys

For an account that needs setup, follow [configure account](context/shield-swap-setup/configure-account.md), then [configure Shield Swap](context/shield-swap-setup/configure-shield-swap.md). Configuration ends by linking to [funding](context/shield-swap-setup/bridge-funds.md).

For inspection without execution, use [discover pools and get quotes](context/shield-swap-setup/discover-pools-and-get-quotes.md). For an authorized trade, [swap](context/shield-swap-setup/swap.md) keeps the complete discovery-to-claim flow. Neither is a setup gate. Funding does not select a trade or start a strategy. The `shield-swap-setup/` folder holds operational runbooks; do not execute every file in directory order.

## Select the relevant context

| Task | Read |
| --- | --- |
| TypeScript application, browser wallet, server, or bot | [TypeScript](context/toolchains/typescript.md) |
| Python application, notebook, server, or bot | [Python](context/toolchains/python.md) |
| Operate an account through terminal commands | [CLI](context/toolchains/cli.md) |
| Use or embed MCP tools | [MCP](context/toolchains/mcp.md) |
| Select a build architecture, SDK, and signer | [Builder decisions](context/decisions/build/what-are-you-building.md) |
| Extend an application that already has a stack, signer, and network | [Existing system](context/decisions/build/what-are-you-building.md#extend-an-existing-system) |
| Select a trading stack or strategy | [Trader decisions](context/decisions/trade/what-is-your-trading-stack.md) |
| Inspect available pools or obtain a quote without trading | [Discover pools and get quotes](context/shield-swap-setup/discover-pools-and-get-quotes.md) |
| Complete a submitted swap | [Execute and claim](context/shield-swap-setup/recover-swaps.md#resume-one-claim) |
| Submission or claim outcome is unknown | [Recover the original operation](context/shield-swap-setup/recover-swaps.md) |
| Inspect this account's swaps or accounting | [Swap history](context/shield-swap-setup/swap-history.md) |
| Read pool-wide market activity | [Pool trade feed](context/shield-swap-setup/discover-pools-and-get-quotes.md#read-market-trades) |
| Prepare records for repeated trading | [UTXO management](context/shield-swap-setup/swap-utxo-management.md) |
| Diagnose a broken environment or operation | [Diagnostics](context/shield-swap-setup/diagnose-environment.md) / [error handling](context/shield-swap-setup/error-handling.md) |
| Integrate a terminal or chat bot | [Terminal integration](context/decisions/trade/terminal-integration.md) / [bot integration](context/decisions/trade/bot-integration.md) |
| Build a one-account bot from scratch | [One-account bot](context/decisions/trade/bot-integration.md#build-a-one-account-bot): native SDK or MCP |
| Set up an arbitrage bot | [Arbitrage setup](context/decisions/trade/arbitrage-setup.md) |
| Configure access or submit an operation | [Permissions](context/safety/permissions.md) |
| Select an account, signer, or state location | [Private keys and state](context/safety/private-key-handling.md) |
| Run recurring strategies | [Unattended trading](context/safety/unattended-trading.md) |

Load only the pages relevant to the task. The [Rust guide](context/toolchains/rust.md) and product integration pages distinguish available interfaces from unimplemented connectors. Retain the user's stack; do not silently substitute another one or claim that context alone installs an integration.

## Operational facts

- Authentication grants DEX access. Referral codes are optional attribution; never require or solicit an invite code as an access prerequisite.
- Choose the existing account or an explicitly requested new account before any profile-creating helper. Never request private keys in chat.
- A private swap includes submission and a later claim. Persist claim material using the SDK's durable store before submitting a trade.
- A submission timeout is an unknown result. Inspect the original operation and persistent state before retrying; do not launch another swap to recover a missing response.
- Preserve an executable quote's route, expiry, and minimum output. Distinguish human decimal quote inputs from base-unit transaction fields using the installed SDK's documentation.
- Discover token metadata, pools, and liquidity. Do not invent identifiers or assume a public balance includes private records.
- Public-chain confidentiality does not guarantee privacy from the chosen wallet, scanner, prover, or API operator. Use the documented service and custody boundaries when explaining privacy.

The [Shield Swap documentation](https://shield.fi/docs) supplies the deeper product and protocol reference. Documentation retrieval does not itself execute an operation or authorize spending.

When editing this repository, also read [CONTRIBUTING.md](CONTRIBUTING.md).
