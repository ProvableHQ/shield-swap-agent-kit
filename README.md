# Shield Swap AgentKit

Give an agent the context and working recipes to build on Shield Swap or operate a trading account. Choose Veil, Python, the CLI, or available MCP tools according to the user's environment and task. The context explains account setup, authentication, private funding, and the swap/claim lifecycle directly.

## Current contents

This version contains builder/trader decision paths, account configuration and funding, swap/claim and recovery runbooks, history and record management, SDK/CLI/MCP guidance, and troubleshooting. Product integration guides and an arbitrage design guide explain how to extend those workflows.

The [draft standalone MCP server](mcp/README.md) now provides terminal wallet setup, encrypted state, stdio transport, and swap operations. Bridge integration and live validation are still in progress. The kit does not include its own trading CLI, terminal connectors, or strategy implementations. SDK and CLI implementations remain in their existing packages. CLI recipes assume the CLI is installed and use `shield-swap` directly; selecting an SDK or MCP path does not require installing the CLI.

## Layout

```text
AGENTS.md                    # Start the builder or trader journey
SKILL.md                     # Thin entrypoint for skill installers
context/
  decisions/                 # Choose the task and stack before provisioning
  shield-swap-setup/         # Operational runbooks, selected by task
  toolchains/                # TypeScript, Python, CLI, MCP, and Rust boundaries
  integrations/              # Verified product surfaces and connector requirements
  safety/                    # Permissions, custody, and unattended execution
  strategies/                # Strategy design; currently arbitrage
  troubleshooting/           # Scanner lag, record contention, proving failures
mcp/                         # Draft standalone TypeScript MCP server
tools/
  SKILL.md                   # When to use SDKs, CLI, MCP, or scripts
CONTRIBUTING.md              # Instructions for working on this repository
```

Keep context and tools at the top level. Executable JS/Python scripts, CLI/MCP code, and examples belong in their corresponding directories when implemented. Integration context is not a working connector, and strategy guidance is not a running strategy. The draft MCP README identifies incomplete bridge actions; do not use them as evidence of working bridge support.

Setup follows account configuration, then Shield Swap authentication with optional referrals, then a link to funding. [Discover pools and get quotes](context/shield-swap-setup/discover-pools-and-get-quotes.md) supports standalone inspection; [swap](context/shield-swap-setup/swap.md) retains its complete discovery-to-claim flow. The `shield-swap-setup/` folder is a collection of runbooks, not a sequence that starts trading automatically.

Its operational guides are:

```text
shield-swap-setup/
  configure-account.md
  configure-shield-swap.md
  bridge-funds.md
  discover-pools-and-get-quotes.md
  swap.md
  swap-history.md
  recover-swaps.md
  swap-utxo-management.md
  diagnose-environment.md
  error-handling.md
```

## Install the context

Install the version published to GitHub:

```sh
npx skills add ProvableHQ/shield-swap-agent-kit --skill shield-swap
```

The installer discovers the root `SKILL.md` and copies the root package, including `AGENTS.md`, `context/`, and `tools/`, to the selected agent. It does not install SDK dependencies, connect an MCP server, create an account, or authorize transactions.

To test an unpublished checkout, run the following from a separate consuming project, replacing the path with the checkout location. Keep the destination outside the source checkout because the root package is copied:

```sh
npx skills add /path/to/shield-swap-agent-kit --skill shield-swap
```

See the [skills installer documentation](https://github.com/vercel-labs/skills) for agent selection and installation scope. Consumers that do not use the installer start directly from [AGENTS.md](AGENTS.md).

## Start a task

Examples:

- “Use Shield Swap to build a Python trading bot. Start by choosing the SDK and account setup.”
- “Help integrate Shield Swap into a browser app using the user's wallet.”
- “Use my existing Shield Swap account to inspect trading options. Do not submit a trade.”

The skill follows the stated intent. It asks for an account decision only when the task needs an account and the choice is missing. Authentication grants DEX access; referrals are optional.

## Documentation

- [Shield Swap documentation](https://shield.fi/docs) provides the product and protocol reference.
- [Source map](docs/source-map.md) records the SDK sources inspected, differences between implementations, and known corrections required before reusing their flows.
- [Contributor instructions](CONTRIBUTING.md) describe how to maintain this repository.

The installed skill contains task explanations, commands, SDK code examples, verification steps, and recovery guidance. Save example scripts in the consuming project, not inside the installed kit. Full API reference stays with the relevant SDK and documentation site.

## Validate

Requires Node.js 22 or newer. No package installation, credentials, or network access are needed for these checks.

```sh
npm test
```

Validation checks skill metadata, local links, and packaging boundaries, then repeats the skill checks on a copy in a temporary directory. It does not execute the SDKs, contact a chain, or establish that a trading journey succeeds.
