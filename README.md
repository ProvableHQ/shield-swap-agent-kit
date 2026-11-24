# Shield Swap AgentKit

Give an agent the context and working recipes to build on Shield Swap or operate a trading account. Choose Veil, Python, the CLI, or available MCP tools according to the user's environment and task. The context explains account setup, authentication, private funding, and the swap/claim lifecycle directly.

Start with the [guided welcome](context/getting-started.md): **GET STARTED** offers account setup, funding, market exploration, and private trading integration. **STRATEGIES** opens arbitrage bot development. **INTEGRATIONS [Coming Soon]** lists planned Hummingbot, Hyperliquid, and prediction-market integrations. Existing accounts, funds, and project choices are reused.

## Open the onboarding guide

The root `shield-swap` skill is the usual top-level guide. Once [installed](#install-the-context), invoke `/shield-swap` in Claude Code or `$shield-swap` in Codex. With no specific task attached, it immediately presents the welcome, setup status, and numbered menu. No extra “show the menu” prompt is needed. A concrete task continues directly through its relevant journey.

To open the guide in a fresh agent session:

```sh
npx --yes skills@latest use ProvableHQ/shield-swap-agent-kit --skill shield-swap --agent claude-code
```

Use `--agent codex` for Codex CLI. The selected agent must already be installed and signed in.

This entrypoint works with SDK, CLI, or MCP paths. Opening the guide does not require a wallet or MCP connection; unknown setup facts start as **Not checked**.

The opening screen preserves **SHIELD SWAP**, **Private asset trading**, and the **YOUR SETUP** box. Options **1–5** route to account setup, funding, market exploration, trading integration, and arbitrage respectively. Options **6–8** stay visibly marked **Coming Soon**; they do not install connectors or execute trades. A direct request to make a swap still follows the complete swap-and-claim workflow.

Already inside Claude with the skill installed? Invoke `/shield-swap`, or ask “How do I trade with Shield Swap?” To try a checkout without reinstalling an older copy, send this single prompt:

```text
Read /path/to/shield-swap-agent-kit/SKILL.md and show the Shield Swap intro.
```

An introductory prompt shows the screen again even after account setup. The skill supplies the intro instructions; installing it alone does not run a startup hook.

## Current contents

The standalone [basic setup skill](skills/aleo-account-setup/SKILL.md) guides named-account creation or import, private key storage, public balances on mainnet and testnet, and connection of a Python, JavaScript, or existing trading setup. It authenticates with Shield Swap, registers with the record scanner, checks private balances, and offers the next step based on the holdings. Its scripts and instructions are bundled together. The main Shield Swap skill loads it when setup is selected.

The standalone [funding skill](skills/aleo-funding/SKILL.md) picks up the chosen funding option and Aleo address. Choose a guided bridge transfer or reusable funding scripts using Privy, Dynamic, a local account, or a deposit wallet. Script setup ends with files and run commands; it does not require a live transfer. The skill also covers source balances on Base, Ethereum, Arbitrum, and Arc, bridge recovery, receipt on Aleo, and the Aleo testnet faucet. Its local-wallet helper keeps credentials in the OS credential store. Transfer helpers retain an unresolved attempt after a timeout instead of submitting a replacement.

This version contains builder/trader decision paths, account configuration and funding, swap/claim and recovery runbooks, history and record management, SDK/CLI/MCP guidance, and troubleshooting. Product integration guides explain how to extend those workflows.

The [trading integration skill](skills/trading-integration/SKILL.md) includes worked guides for asset discovery, quotes, fees, record preparation, concurrent requests, claims, and recovery. Its callable Python and TypeScript/JavaScript modules serve local-account applications; a separate browser example retains the connected wallet and tracks both transaction confirmations. The [arbitrage skill](skills/arbitrage/SKILL.md) uses that execution guidance and provides a Python Shield Swap/Uniswap v3 reference bot with exact quote comparison, two-leg progress, and a stop policy for unmatched exposure. TypeScript applications retain their stack and adapt the native workflow; the included complete arbitrage reference is Python.

The kit does not include its own trading CLI or terminal connectors. SDK and CLI implementations remain in their existing packages. CLI recipes assume the CLI is installed and use `shield-swap` directly; selecting an SDK or an available MCP connection does not require installing the CLI.

## Layout

```text
AGENTS.md                    # Start the builder or trader journey
SKILL.md                     # Intro-first entrypoint for skill installers
skills/
  aleo-account-setup/        # Standalone basic setup, balance checks, and connection helpers
  aleo-funding/              # Standalone funding, source wallets, and bridge recovery
  trading-integration/      # Callable Python and TypeScript/JavaScript trading modules
  arbitrage/                # Strategy integration and a Python Uniswap v3 reference bot
context/
  getting-started.md          # Welcome, status panel, and canonical journeys
  decisions/                 # Choose the task and stack before provisioning
  shield-swap-setup/         # Operational runbooks, selected by task
  toolchains/                # TypeScript, Python, CLI, MCP, and Rust boundaries
  integrations/              # Verified product surfaces and connector requirements
  safety/                    # Permissions, custody, and unattended execution
  strategies/                # Strategy design; currently arbitrage
  troubleshooting/           # Scanner lag, record contention, proving failures
scripts/                     # Context validation and tests
tools/
  SKILL.md                   # When to use SDKs, CLI, MCP, or scripts
CONTRIBUTING.md              # Instructions for working on this repository
```

Keep context and tools at the top level. Standalone skills live under `skills/`, with their own references, scripts, and examples. Product integration guides describe their supported boundaries; installing a skill does not start a strategy.

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

The installer discovers the root `SKILL.md` and copies the root package, including `AGENTS.md`, `skills/`, `context/`, and `tools/`, to the selected agent. It does not install SDK dependencies, connect an MCP server, create an account, or authorize transactions.

To install account setup on its own from a local checkout, run this in a separate consuming project, replacing the source path:

```sh
npx skills add /path/to/shield-swap-agent-kit --skill aleo-account-setup
```

Invoke `/aleo-account-setup` in Claude Code or `$aleo-account-setup` in Codex. It covers basic setup through API access, scanner registration, and balance checks, then offers trading or funding choices. A selected funding option invokes `aleo-funding` with the verified address. Its [dependency instructions](skills/aleo-account-setup/references/dependencies.md) use Veil `main` and the latest Python SDK releases from PyPI. The skill name remains `aleo-account-setup` for existing installations.

To install the funding skill independently, use `npx skills add /path/to/shield-swap-agent-kit --skill aleo-funding` from the consuming project. Invoke `/aleo-funding` in Claude Code or `$aleo-funding` in Codex. Installing the root `shield-swap` package includes both setup and funding; installing just `aleo-account-setup` needs the funding companion when a funding option is selected.

For trading code and arbitrage, the root skill includes both new skills. To install them separately from a checkout, run these from the consuming project:

```sh
npx skills add /path/to/shield-swap-agent-kit --skill trading-integration
npx skills add /path/to/shield-swap-agent-kit --skill arbitrage
```

Invoke `/trading-integration` or `/arbitrage` in Claude Code, or `$trading-integration` or `$arbitrage` in Codex. Arbitrage uses the trading integration as its execution companion. Pass the existing project and preferred language; the skills build code there without starting a strategy automatically.

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

Requires Node.js 22.13 or newer and Python 3.10 or newer. No credentials or network access are needed for these checks.

```sh
npm test
```

Validation checks skill metadata, local links, packaging, and the bundled workflow modules in temporary consumer projects. Native SDK boundary tests run when their dependencies are installed; see [verification instructions](CONTRIBUTING.md#verification). The tests do not contact a chain or establish funded execution. Dated live checks are recorded in the [source map](docs/source-map.md).
