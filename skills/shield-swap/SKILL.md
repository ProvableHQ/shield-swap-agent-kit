---
name: shield-swap
description: Use when a user wants to build a Shield Swap integration or bot, choose a Shield Swap SDK or custody model, configure trading tools, or operate a Shield Swap account on Aleo.
---

# Shield Swap

Start with [build or trade now](context/decisions/build-or-trade-now.md). Preserve choices and authorization already supplied by the user. A request to build an integration does not require creating or funding a trading account.

This package currently provides context and routing to existing SDKs and tools. It does not bundle its own executable trading scripts or standalone MCP server. Use the installed toolchain's reference for exact APIs; do not invent an unavailable command or method.

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
