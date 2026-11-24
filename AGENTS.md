# Shield Swap agent journey

Start with [getting started](context/getting-started.md): show the branded intro and setup status when the skill opens without a concrete task or receives an introductory prompt, including after earlier setup, then follow the requested journey. Load detailed trading guides after presenting the intro. Preserve choices and authorization already supplied by the user. Connecting trading tools includes account setup and funding before declaring the operational integration complete. Explicit code-only or read-only tasks may defer those steps. Use [build or trade now](context/decisions/build-or-trade-now.md) for the detailed routing.

Choose [Veil](context/toolchains/typescript.md), [Python](context/toolchains/python.md), the [CLI](context/toolchains/cli.md), or available [MCP tools](context/toolchains/mcp.md) according to the user's stack, custody model, and required operations. Preserve an explicitly selected interface. When none is specified, use the existing setup and verified capabilities to choose a suitable surface; read [tool selection](tools/SKILL.md) for the options and supported fallbacks.

Each operational page explains the shared behavior, then gives interface-specific recipes. Read the section for the chosen interface, not every implementation. The examples use testnet and run in the consumer's project, outside this installed kit. Change networks only to match the user's request. The kit does not bundle its own trading CLI.

## Setup and trading are separate journeys

For basic setup, load [basic Shield Swap setup](skills/aleo-account-setup/SKILL.md). Its own resources cover account and storage choices, public balances on mainnet and testnet, a new Python/JavaScript setup or an existing project, API authentication, scanner registration, and private balances. Finish with its balance-based next-step menu. Do not route account creation into a combined setup/funding command or select testnet automatically. Funding is a separate choice after basic setup.

When a funding option is chosen, load [fund an Aleo account](skills/aleo-funding/SKILL.md), passing the verified Aleo address and setup context. For bridging, it separates a guided transfer now from building reusable funding scripts with Privy, Dynamic, a local account, or a deposit wallet. Script setup can finish without moving funds; preserve the actual funding status. A faucet selection goes directly to the testnet path. Keep an explicitly selected existing execution interface.

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
| Build a one-account bot from scratch | [One-account bot](context/decisions/trade/bot-integration.md#build-a-one-account-bot): native SDK |
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
