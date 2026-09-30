# Shield Swap AgentKit

Give an agent the context to build on Shield Swap or operate an existing trading account. The kit routes the task to the appropriate SDK, CLI, or MCP integration and explains the account, privacy, and recovery requirements.

## Current contents

This initial version contains one installable skill with build-or-trade routing, TypeScript and Python SDK guidance, CLI and MCP guidance, and permission and key-handling rules. It does not yet include its own executable trading scripts, standalone MCP server, terminal connectors, or strategy implementations. SDK and CLI implementations remain in their existing packages.

## Install the context

After this commit is published to the repository:

```sh
npx skills add ProvableHQ/shield-swap-agent-kit --skill shield-swap
```

The installer adds the skill and its supporting context to the selected agent. It does not install SDK dependencies, connect an MCP server, create an account, or authorize transactions.

From a local checkout, the equivalent command is:

```sh
npx skills add ./skills/shield-swap
```

See the [skills installer documentation](https://github.com/vercel-labs/skills) for agent selection and installation scope. The [skill entrypoint](skills/shield-swap/SKILL.md) can also be read directly by consumers that do not use that installer.

## Start a task

Examples:

- “Use Shield Swap to build a Python trading bot. Start by choosing the SDK and account setup.”
- “Help integrate Shield Swap into a browser app using the user's wallet.”
- “Use my existing Shield Swap account to inspect trading options. Do not submit a trade.”

The skill follows the stated intent. It asks for an account decision only when the task needs an account and the choice is missing. Authentication grants DEX access; referrals are optional.

## Documentation

- [Shield Swap documentation](https://shield.fi/docs) provides the product and protocol reference.
- [Source map](docs/source-map.md) records the SDK sources inspected, differences between implementations, and known corrections required before reusing their flows.
- [Contributor instructions](AGENTS.md) describe how to maintain this repository.

The installed skill contains its own routing and operational constraints. Detailed API reference stays with the relevant SDK and documentation site.

## Validate

Requires Node.js 22 or newer. No package installation, credentials, or network access are needed for these checks.

```sh
npm test
```

Validation checks skill metadata, local links, and packaging boundaries, then repeats the skill checks on a copy in a temporary directory. It does not execute the SDKs, contact a chain, or establish that a trading journey succeeds.
