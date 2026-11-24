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

Use the layout below with verified facts, or the shared [welcome renderer](../tools/welcome.mjs). Keep **Tools**, **Aleo account**, and **Funding** as the three row labels. Put the discovered accounts and installed tool versions/locations in separate **ACCOUNTS** and **TOOLS** sections below the box, following [setup inspection](shield-swap-setup/inspect-setup.md). Keep journals and signer implementation details out of the introduction.

Follow it with the status panel. This example is illustrative: replace every value with observed facts. Use ✓ for a verified check, ○ for missing or unchecked, and ! for a failed check. Do not invent percentages or show a check as running unless it is actually running.

Keep the banner and setup box in fenced text blocks. Render the menus below them as Markdown, with bold option titles and regular descriptions. Keep the menus outside code fences so the bold formatting renders.

```text
╭─ YOUR SETUP ───────────────────────────────────────╮
│  ✓ Tools          Available                        │
│  ○ Aleo account   Not configured                   │
│  ○ Funding        Not checked                      │
╰───────────────────────────────────────────────────╯
```

Insert **ACCOUNTS** and **TOOLS** here using the current inspection. Show Aleo, EVM, and Solana account names, known public addresses, and access status. List each detected tool with its installed version and location. These sections precede the unchanged menu below; never replace them with only “Available” or “Configured.”

**GET STARTED**

1. **Configure an Aleo account for Shield Swap**\
   Setup an Aleo account to trade privately on Shield Swap.

2. **Fund an account**\
   Bridge assets from Ethereum or Solana privately to Aleo

3. **Explore markets**\
   Explore market opportunities on Shield Swap

4. **Setup a private trading integration**\
   Integrate trading on Shield Swap into your application

**STRATEGIES**

5. **Create an arbitrage bot**

**INTEGRATIONS [Coming Soon]**

6. **Hummingbot:** Add a privacy layer to hummingbot.
7. **Hyperliquid:** Trade perpetual futures privately on Hyperliquid.
8. **Prediction Markets:** Create a private vault around prediction market trades.

Show all three menu sections and keep options 1–8 in this order, even when accounts are already configured. Preserve the menu wording above. Options 1–5 have routes; 6–8 stay under **INTEGRATIONS [Coming Soon]**. Do not omit or renumber options based on setup status. Skip completed setup work within the selected route. Only a concrete task (a specified swap, an identified tool to connect, or a strategy to build) replaces the menu with that task and its next missing step. Do not ask them to select it again. Report current unchecked funding as **Not checked**; historical funding notes do not prove present holdings. Show tool installation paths in **TOOLS**; keep network choices, storage questions, and protocol details out of this introduction. Account storage is handled by the setup skill; resolve a real configuration conflict only when encountered.

## Check the existing setup

Run [setup inspection](shield-swap-setup/inspect-setup.md) against the working project, then add current agent connection facts. This provides the existing account inventory and tool versions/locations for the main screen. See [tool selection](../tools/SKILL.md) when a journey is chosen. Never print secret file contents to fill the panel.

Inspect the configured account and session without provisioning a replacement. Distinguish a missing account, a locked account, and a configured account whose access has not yet been checked. When access and holdings are relevant, follow [configuration](shield-swap-setup/configure-shield-swap.md) and [funding](shield-swap-setup/bridge-funds.md) using the selected interface. Authentication and scanner registration can change session state; they do not authorize funding or trading. Failed access or scanning is an unavailable check, never a zero balance.

If the required asset and amount are known, compare them with the observed private holdings using discovered token metadata. Otherwise label observed private holdings **Private funds found**, not **Ready to swap**. Public-only balances are insufficient for a private swap. Aggregate holdings do not verify a covering record, fees, a valid quote, or execution permission. Keep those checks in the operation's existing preflight.

For a plain introductory question, perform the bounded local inspection and show the screen. If a check cannot run, use **Not checked** or **Could not check** for that item. Do not defer all discovery to the funding journey. It does not require account creation first. Continue the selected journey afterward.

## The two setup steps

**1. Configure an Aleo account for Shield Swap.** Load [basic Shield Swap setup](../skills/aleo-account-setup/SKILL.md). Stay in that skill for account and storage choices, public balances on both networks, the trading language or existing project, API authentication, scanner registration, and private balances. It offers the next step based on the observed holdings. Creating an account does not select testnet or authorize the CLI's combined setup/funding command. Secrets go directly into the trusted terminal or configured secret manager, never chat or tool arguments. Preserve existing account, signer, network, and recovery state.

**2. Fund an account.** Load [fund an Aleo account](../skills/aleo-funding/SKILL.md) with the verified address and setup context. When coming from basic setup, retain its public/private balance checks and selected funding option. For a general funding request, use the funding skill's opening choices; a specific bridge or faucet request goes directly to that path. Script setup can finish with files and run commands while funding remains outstanding. Do not start funding as a setup side effect. A bridge receipt alone does not finish funding. Funding a wallet does not authorize a swap or start a strategy.

Account setup and funding also apply when bringing a trading integration or arbitrage bot into operation, and when executing a requested swap. Reuse the same account, signer, and recovery state throughout. Do not end an operational integration at a successful quote while account setup or funding remains outstanding. An explicitly requested code-only, read-only, or dry-run milestone may stop earlier; state what is still required before trading.

## Canonical journeys

Preserve a supplied intent instead of forcing a menu choice. Interpret a number against the most recently displayed menu: once a child skill opens its own menu, its numbering applies. Pass the selected project, language, account, network, interface, and existing authorization to the destination; do not ask for them again.

| Main-menu option | Journey ID | Destination and result |
| --- | --- | --- |
| 1 · Configure an Aleo account for Shield Swap | `configure_account` | [Account setup](../skills/aleo-account-setup/SKILL.md): create/import or reuse the selected account, choose storage, authenticate, register the scanner, and inspect balances. |
| 2 · Fund an account | `fund_account` | [Funding](../skills/aleo-funding/SKILL.md): continue with the selected account and funding path. |
| 3 · Explore markets | `explore_markets` | [Discover pools and get quotes](shield-swap-setup/discover-pools-and-get-quotes.md#explore-markets-from-the-main-menu): show available pairs, liquidity and recent activity, then quote a requested pair and amount without executing. |
| 4 · Setup a private trading integration | `trading_integration` | [Trading integration](../skills/trading-integration/SKILL.md): build callable trading code in the user's project, retaining its language and account setup. |
| 5 · Create an arbitrage bot | `arbitrage` | [Arbitrage](../skills/arbitrage/SKILL.md): build and test the strategy using the shared trading integration. |
| 6 · Hummingbot | `hummingbot` | Coming soon; no executable route. |
| 7 · Hyperliquid | `hyperliquid` | Coming soon; no executable route. |
| 8 · Prediction Markets | `prediction_markets` | Coming soon; no executable route. |

The coming-soon descriptions express intended integrations, not current execution or privacy capabilities. If selected, say that integration is not available in the kit yet and ask what the user wants it to do. Do not install a connector, provision an account, move funds, or substitute an unrelated workflow merely because the option was selected. A separately requested integration-development task can be scoped from that conversation.

Direct requests remain supported without adding them to the main menu. `trade_now` follows [swap](shield-swap-setup/swap.md) through claim and verified output. Existing `connect_trading_tools` requests identify the actual stack and use [terminal](decisions/trade/terminal-integration.md), [bot](decisions/trade/bot-integration.md), or [application integration](decisions/build/what-are-you-building.md#extend-an-existing-system) guidance as appropriate. Existing `build_strategy` requests use [strategy requirements](decisions/trade/what-is-your-strategy.md); route arbitrage specifically to option 5's skill. Preserve these identifiers for callers already using them.

Verify integration support before moving funds. Building a strategy does not authorize starting it; apply [unattended limits](safety/unattended-trading.md) when execution is requested. Do not promise a profitable opportunity.

## Guided and unattended operation

Use these same journeys in both modes. Guided users receive only the next missing choice or local setup step. For unattended operation, use the supplied account, funding source, and authority. If a requirement is missing, report the journey, current checks, and required next action to the caller; do not open an interactive prompt, infer a new account, or infer spending permission. Use the selected tool's supported noninteractive setup only when already authorized.

Keep the selected account and journey in the caller's session. Record tool availability, account configuration, verified access, and observed funding only when checked. Recheck facts after reconnecting; use existing durable operation IDs and recovery stores for in-flight bridges and swaps. Never repeat funding or a swap just to complete a checklist.

After setup, record the real journey milestones in the caller: integration quote verified, strategy dry run verified, bridge destination verified, or swap output claimed and verified. Those are distinct from setup checkpoints. A quote, an accepted transaction, and a completed swap are different outcomes. Keep errors and unknown outcomes visible so future measurements can distinguish setup, funding, integration work, and trading.
