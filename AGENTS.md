# Shield Swap agent journey

Start with [build or trade now](context/decisions/build-or-trade-now.md). Preserve choices and authorization already supplied by the user. A request to build an integration does not require creating or funding a trading account.

For immediate trading, default to the existing [CLI](context/toolchains/cli.md). For application development, use [Veil](context/toolchains/typescript.md) or [Python](context/toolchains/python.md) according to the user's stack. Preserve an explicitly selected interface, including an existing MCP connection; read [tool selection](tools/SKILL.md) for supported fallbacks.

Each operational page explains the shared behavior, then gives interface-specific recipes. Read the section for the chosen interface, not every implementation. The examples use testnet and run in the consumer's project, outside this installed kit. Change networks only to match the user's request. The kit does not yet bundle its own executable trading scripts or standalone MCP server.

## Setup and trading are separate journeys

For an account that needs setup, follow [configure account](context/shield-swap-setup/configure-account.md), then [configure Shield Swap](context/shield-swap-setup/configure-shield-swap.md). Configuration ends by linking to [funding](context/shield-swap-setup/bridge-funds.md).

Discover pools and obtain a quote only as part of a requested [swap](context/shield-swap-setup/swap.md) or inspection task. Funding does not select a trade or start a strategy. The `shield-swap-setup/` folder holds operational runbooks; do not execute every file in directory order.

## Select the relevant context

| Task | Read |
| --- | --- |
| TypeScript application, browser wallet, server, or bot | [TypeScript](context/toolchains/typescript.md) |
| Python application, notebook, server, or bot | [Python](context/toolchains/python.md) |
| Operate an account through terminal commands | [CLI](context/toolchains/cli.md) |
| Use or embed MCP tools | [MCP](context/toolchains/mcp.md) |
| Configure access or submit an operation | [Permissions](context/safety/permissions.md) |
| Select an account, signer, or state location | [Private keys and state](context/safety/private-key-handling.md) |

Load only the pages relevant to the task. For Rust or a terminal connector not covered here, state that this kit has no verified path and retain the user's choice; do not silently substitute a different stack.

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
