# Shield Swap AgentKit

Give an agent the context and working recipes to build on Shield Swap or operate a trading account. Immediate trading defaults to the existing CLI; builders use Veil or Python. The context explains account setup, authentication, private funding, and the swap/claim lifecycle directly.

## Current contents

This version contains the agent journey entrypoint, build-or-trade routing, account configuration and funding guidance, a separate swap journey, TypeScript and Python SDK guidance, and CLI/MCP and safety context. It does not yet include its own executable trading scripts, standalone MCP server, terminal connectors, or strategy implementations. SDK and CLI implementations remain in their existing packages.

## Layout

```text
AGENTS.md                    # Start the builder or trader journey
SKILL.md                     # Thin entrypoint for skill installers
context/
  decisions/                 # Choose the task and stack before provisioning
  shield-swap-setup/         # Operational runbooks, selected by task
  toolchains/                # TypeScript, Python, CLI, and MCP guidance
  safety/                    # Permissions, custody, and recovery state
tools/
  SKILL.md                   # When to use SDKs, CLI, MCP, or scripts
CONTRIBUTING.md              # Instructions for working on this repository
```

Keep context and tools at the top level. JS/Python scripts, CLI/MCP code, integration and strategy guides, and examples will occupy the corresponding directories in the agreed design as their implementations become available. No empty executable stubs are shipped.

Setup follows account configuration, then Shield Swap authentication with optional referrals, then a link to funding. Pool discovery and quoting belong to `swap.md`. The `shield-swap-setup/` folder is a collection of runbooks, not a sequence that starts trading automatically.

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
