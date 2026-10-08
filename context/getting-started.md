# Getting started

Use this page when the Shield Swap skill is invoked for setup, trading, or integration. Installing the skill does not run a startup hook. The host agent checks the current setup and renders this introduction in its response. Never print it on an MCP server's protocol stdout.

## Welcome

Opening the root skill without a concrete task starts this onboarding guide immediately; no separate menu request is needed. Show the banner when beginning onboarding and whenever the user asks an introductory question or requests the welcome/menu, including after setup in the same conversation. “How do I trade with Shield Swap?” is an introductory question. Preserve its spacing in a fenced text block. In a narrow display, use **SHIELD SWAP** on one line with the same tagline instead of wrapping the block letters. Do not emit ANSI escapes into chat. Use compact updates for intermediate operation/status replies; having an existing account or prior-session memory does not suppress an explicitly requested introduction.

```text
███████╗██╗  ██╗██╗███████╗██╗     ██████╗     ███████╗██╗    ██╗ █████╗ ██████╗
██╔════╝██║  ██║██║██╔════╝██║     ██╔══██╗    ██╔════╝██║    ██║██╔══██╗██╔══██╗
███████╗███████║██║█████╗  ██║     ██║  ██║    ███████╗██║ █╗ ██║███████║██████╔╝
╚════██║██╔══██║██║██╔══╝  ██║     ██║  ██║    ╚════██║██║███╗██║██╔══██║██╔═══╝
███████║██║  ██║██║███████╗███████╗██████╔╝    ███████║╚███╔███╔╝██║  ██║██║
╚══════╝╚═╝  ╚═╝╚═╝╚══════╝╚══════╝╚═════╝     ╚══════╝ ╚══╝╚══╝ ╚═╝  ╚═╝╚═╝

Private asset trading
```

For AgentKit MCP, render the `welcome` string returned by `setup` verbatim in a text block. It uses the shared [welcome renderer](../tools/welcome.mjs). For other interfaces, use the same layout below with verified facts. Keep **Tools**, **Aleo account**, and **Funding** as the three row labels. Do not substitute network rows or insert paths, script names, journals, SQLite, or signer implementation details.

Follow it with the status panel. This example is illustrative: replace every value with observed facts. Use ✓ for a verified check, ○ for missing or unchecked, and ! for a failed check. Do not invent percentages or show a check as running unless it is actually running.

```text
╭─ YOUR SETUP ───────────────────────────────────────╮
│  ✓ Tools          MCP connected                    │
│  ○ Aleo account   Not configured                   │
│  ○ Funding        Not checked                      │
╰───────────────────────────────────────────────────╯

GET STARTED
  1. Configure an Aleo account for Shield Swap
  2. Fund your account

WHAT WOULD YOU LIKE TO DO?
  Trade now              Complete a swap and receive your tokens.
  Connect trading tools  Connect your existing terminal, bot, or app.
  Build a strategy       Build and test a trading workflow.
  Explore markets        Discover assets and get quotes.
```

Show all four menu choices for introductory prompts, even when accounts are already configured. Only a concrete task (a specified swap, an identified tool to connect, or a strategy to build) replaces the menu with that task and its next missing step. Do not ask them to select it again. Omit completed setup steps. Report current unchecked funding as **Not checked**; historical funding notes do not prove present holdings. Give at most one short explanation of the swap lifecycle when helpful, and put technical detail in the relevant follow-up rather than turning the welcome into a protocol tutorial. Keep the account's existing configuration and the interface the user selected; do not add a network-choice step or a key-storage questionnaire to this introduction. Account storage is handled by the selected tool's local defaults and protected prompts. Resolve a real configuration conflict only when encountered.

## Check the existing setup

Start with the available interface and an existing account; see [tool selection](../tools/SKILL.md). Never inspect or print secret file contents to fill the panel.

For the AgentKit MCP, call `setup` with the selected `journey` and optional `profileId`. It performs local configuration inspection by default. `checks.account.status` distinguishes `missing`, `locked`, and `configured`; a configured profile is not yet verified signing access. Follow `nextAction` rather than rerunning account creation. A locked store does not reveal which profiles it contains.

When account access and holdings are relevant, call `setup` with `checkBalances: true`. It verifies signing/API access before reading balances. This may authenticate and initialize scanner state but never funds, signs a transaction, or grants execution permissions. Successful access is `usable`; failed access or scanning is `unavailable`, never a zero balance. Use `checkAccess: true` for account access alone.

If the required asset and amount are known, pass `funding: { tokenId, amount }`, with the discovered token ID and integer base-unit amount. This implies balance checking. `available` means sufficient aggregate private holdings for that requirement, or some private holdings if no requirement was given. Label the latter **Private funds found**, not **Ready to swap**. Public-only balances are insufficient for a private swap. Neither result verifies a covering record, fees, a valid quote, or execution permission. Keep those checks in the operation's existing preflight.

Use the same distinctions with an SDK or CLI: inspect the configured session, authenticate when needed, and read private holdings through its existing recipes. An absent MCP server does not make an existing SDK/CLI setup unusable. [Configuration](shield-swap-setup/configure-shield-swap.md) and [funding](shield-swap-setup/bridge-funds.md) explain the effects of each interface.

## Launch with local setup

When the user wants the kit to handle local setup and the Claude connection, use the [one-command launcher](../README.md#start-with-claude-code): `npm start` from the complete kit checkout, in the user's own terminal. It prints this intro, collects protected account inputs locally, then starts Claude with the skill and a connected MCP server. Do not run it through an agent's captured tool input to collect secrets. It reuses the existing default or explicitly selected profile and does not move funds or grant execution permissions.

For a plain introductory question in an existing agent conversation, show the screen immediately using current checks or **Not checked**. It does not require account creation or launching another Claude session first. Continue the selected journey afterward.

## The two setup steps

**1. Configure an Aleo account for Shield Swap.** Reuse the selected account. Otherwise offer import or explicit creation through [configure account](shield-swap-setup/configure-account.md), then verify [Shield Swap access](shield-swap-setup/configure-shield-swap.md). For the AgentKit MCP, the installed `shield-swap-mcp setup --guided` command handles local account selection; the repository build uses `node dist/cli.js setup --guided` from `mcp/`. Secrets go directly into the trusted terminal or the configured secret manager, never chat or tool arguments. Do not silently create a replacement account when unlocking or authentication fails.

**2. Fund your account.** Verify current holdings first. Continue with existing usable funds, receive funds on Aleo, or bridge from a supported external wallet. External wallets may use a local signer or an existing supported hosted wallet; discover actual routes before advertising a chain or provider. Follow [funding](shield-swap-setup/bridge-funds.md), including bridge completion and private-record verification. A bridge receipt alone does not finish this step. Funding a wallet does not authorize a swap or start a strategy.

These steps apply to **Connect trading tools** as well as **Trade now** and a funded **Build a strategy** journey. Users connecting a terminal, bot, or app ordinarily need an account and funds to use that integration. Reuse the same account, signer, and recovery state throughout. Do not end their journey at a successful quote while account setup or funding remains outstanding. An explicitly requested code-only, read-only, or dry-run milestone may stop earlier; state what is still required before trading.

## Canonical journeys

Preserve a supplied intent instead of forcing a menu choice. The identifiers below remain stable for clients and later measurement. They describe workflows, not installed connector or strategy implementations.

| Journey ID | User-facing choice | Path and completion |
| --- | --- | --- |
| `trade_now` | Trade now | Account → funds → [quote, execute, claim](shield-swap-setup/swap.md) → verify received spendable output and report partial fill/refund accurately. |
| `connect_trading_tools` | Connect trading tools | Identify the existing stack → account → funds → [terminal](decisions/trade/terminal-integration.md), [bot](decisions/trade/bot-integration.md), or [application integration](decisions/build/what-are-you-building.md#extend-an-existing-system) → demonstrate a quote through that integration using the same account. Execution verification follows when authorized. |
| `build_strategy` | Build a strategy | Define [strategy requirements](decisions/trade/what-is-your-strategy.md) → account → funds → build and dry-run the selected runner → enforce [unattended limits](safety/unattended-trading.md) → start only within the requested authority. An explicit dry-run-only task can defer funding. |
| `explore_markets` | Explore markets | [Discover assets, pools, and quotes](shield-swap-setup/discover-pools-and-get-quotes.md). Configure access only as required by the selected interface; funding is not required. |

For **Connect trading tools**, identify integration support before moving funds. If the named product has no usable connector/API, explain that gap and establish a viable path before funding it. Continue account and funding setup as part of the agreed operational integration; do not silently reduce the request to code generation.

For **Build a strategy**, suggest a price alert, a scheduled swap, or an arbitrage monitor according to the user's goal. These are projects to build, not bundled ready-to-run bots. Use [arbitrage setup](decisions/trade/arbitrage-setup.md) when requested; do not promise that a profitable opportunity will appear.

## Guided and unattended operation

Use these same journeys in both modes. Guided users receive only the next missing choice or local setup step. With `mode: "unattended"`, use the supplied profile, funding source, and authority. If a requirement is missing, return the journey, current checks, and `nextAction` to the caller; do not open an interactive prompt, infer a new account, or infer spending permission. The terminal supports explicit noninteractive key references or `--generate` only when account creation is already authorized. MCP never prompts on stdin.

`setup` returns observed checkpoints: `tools_available`, `account_configured`, `account_access_verified`, `funding_checked`, and `private_balance_observed`, only when each applies. Keep `profileId` and the selected journey in the caller's session. These are observations, not a persisted onboarding journal or timing metrics. Recheck facts after reconnecting; use existing durable operation IDs and recovery stores for in-flight bridges and swaps. Never repeat funding or a swap just to complete a checklist.

After setup, record the real journey milestones in the caller: integration quote verified, strategy dry run verified, bridge destination verified, or swap output claimed and verified. Those are distinct from setup checkpoints. A quote, an accepted transaction, and a completed swap are different outcomes. Keep errors and unknown outcomes visible so future measurements can distinguish setup, funding, integration work, and trading.
