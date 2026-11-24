# Getting started

Use this page when the Shield Swap skill is invoked for setup, trading, or integration. Installing the skill does not run a startup hook. The host agent checks the current setup and renders this introduction in its response.

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

Use the layout below with verified facts, or the shared [welcome renderer](../tools/welcome.mjs). Keep **Tools**, **Aleo account**, and **Funding** as the three row labels. Do not substitute network rows or insert paths, script names, journals, SQLite, or signer implementation details.

Follow it with the status panel. This example is illustrative: replace every value with observed facts. Use ✓ for a verified check, ○ for missing or unchecked, and ! for a failed check. Do not invent percentages or show a check as running unless it is actually running.

```text
╭─ YOUR SETUP ───────────────────────────────────────╮
│  ✓ Tools          Available                        │
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

Inspect the configured account and session without provisioning a replacement. Distinguish a missing account, a locked account, and a configured account whose access has not yet been checked. When access and holdings are relevant, follow [configuration](shield-swap-setup/configure-shield-swap.md) and [funding](shield-swap-setup/bridge-funds.md) using the selected interface. Authentication and scanner registration can change session state; they do not authorize funding or trading. Failed access or scanning is an unavailable check, never a zero balance.

If the required asset and amount are known, compare them with the observed private holdings using discovered token metadata. Otherwise label observed private holdings **Private funds found**, not **Ready to swap**. Public-only balances are insufficient for a private swap. Aggregate holdings do not verify a covering record, fees, a valid quote, or execution permission. Keep those checks in the operation's existing preflight.

For a plain introductory question, show the screen immediately using current checks or **Not checked**. It does not require account creation first. Continue the selected journey afterward.

## The two setup steps

**1. Configure an Aleo account for Shield Swap.** Load [basic Shield Swap setup](../skills/aleo-account-setup/SKILL.md). Stay in that skill for account and storage choices, public balances on both networks, the trading language or existing project, API authentication, scanner registration, and private balances. It offers the next step based on the observed holdings. Creating an account does not select testnet or authorize the CLI's combined setup/funding command. Secrets go directly into the trusted terminal or configured secret manager, never chat or tool arguments. Preserve existing account, signer, network, and recovery state.

**2. Fund your account.** Basic setup first checks public and private holdings and offers bridging to Aleo mainnet, testnet ALEO funds from the Aleo faucet, or use of existing funds as appropriate. When an option is selected, load [fund an Aleo account](../skills/aleo-funding/SKILL.md) with the verified address and setup context. For bridging, choose a guided transfer or reusable funding scripts unless the request already specifies one. Script setup can finish with files and run commands while funding remains outstanding. Do not start funding as a setup side effect. A bridge receipt alone does not finish funding. Funding a wallet does not authorize a swap or start a strategy.

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

Use these same journeys in both modes. Guided users receive only the next missing choice or local setup step. For unattended operation, use the supplied account, funding source, and authority. If a requirement is missing, report the journey, current checks, and required next action to the caller; do not open an interactive prompt, infer a new account, or infer spending permission. Use the selected tool's supported noninteractive setup only when already authorized.

Keep the selected account and journey in the caller's session. Record tool availability, account configuration, verified access, and observed funding only when checked. Recheck facts after reconnecting; use existing durable operation IDs and recovery stores for in-flight bridges and swaps. Never repeat funding or a swap just to complete a checklist.

After setup, record the real journey milestones in the caller: integration quote verified, strategy dry run verified, bridge destination verified, or swap output claimed and verified. Those are distinct from setup checkpoints. A quote, an accepted transaction, and a completed swap are different outcomes. Keep errors and unknown outcomes visible so future measurements can distinguish setup, funding, integration work, and trading.
