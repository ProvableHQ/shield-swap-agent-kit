# Inspect accounts and installed tools

Before showing the main menu, check the current project and known account locations to populate the compact **YOUR SETUP** box. Display detailed accounts and tool versions/locations only when **Check existing accounts** or **Check existing setup** is selected. The menu starts immediately below the box. An installed package, saved account, and working signer are separate facts.

## Run the local inspection

Use the bundled [setup inspector](../../tools/inspect-setup.mjs). Replace `KIT_DIRECTORY` with the installed kit's absolute path and `PROJECT_DIRECTORY` with the person's working project. If no project has been chosen, use the session's working directory. Do not use the kit's dependencies as evidence of tools installed in the person's project.

```sh
node KIT_DIRECTORY/tools/inspect-setup.mjs --project PROJECT_DIRECTORY
```

This prints the welcome, compact setup box, and main menu as Markdown. It does not print account or tool listings. Preserve the output's fenced banner and box; render the remaining Markdown normally. `--width 80` uses the compact heading. Use `--json` to obtain public fields for the host's own presentation. The JSON report includes full public addresses; the welcome does not display them. Funding and execution summaries still show the full destination.

The inspector needs Node.js, with no package installation. It probes installed command versions with a timeout and reads package metadata. It does not contact a chain, create accounts, authenticate, register scanners, or load private keys. Aleo's metadata APIs can tighten account-file permissions to owner-only. It never invokes wallet `check`, account `export`, or profile constructors to populate the menu.

For known custom locations, add `--accounts-dir DIRECTORY`, `--wallet-dir DIRECTORY`, or `--python /absolute/path/to/python`. Directory flags can be repeated. Reuse locations already identified by the project or conversation. Do not scan unrelated projects or the whole home directory.

## Explicit check commands

The agent's main menu exposes both checks under **GET STARTED**, as the first two options. Recognize the number only when the main menu is active; recognize the command words directly at any point.

| Menu | Agent command | Result |
| --- | --- | --- |
| 1 · Check existing accounts | `check accounts` | Refresh the Aleo, EVM, and Solana account inventory. Show full known public addresses, saved locations, storage, and current access status. |
| 2 · Check existing setup | `check setup` | Refresh the current project's accounts, installed tools/SDKs, versions, locations, and current agent connections. |

These are arguments or requests to the main Shield Swap skill, not separate globally installed slash commands. A direct command skips the onboarding menu and returns the requested report. Keep the selected account, project, and journey. Never turn an inspection request into creating an account, installing tools, unlocking a wallet, or authenticating a new session.

With the same `KIT_DIRECTORY` and `PROJECT_DIRECTORY` as above, run the matching shell command:

```sh
node KIT_DIRECTORY/tools/inspect-setup.mjs accounts --project PROJECT_DIRECTORY
```

```sh
node KIT_DIRECTORY/tools/inspect-setup.mjs setup --project PROJECT_DIRECTORY
```

`accounts` prints only the account report; it may probe installed metadata readers to obtain account details. `setup` prints the project and complete local inventory, without the welcome or journey menu. Both accept the custom-location flags and `--json`. The accounts JSON contains only account checks, sources, locations, and discovery issues; setup JSON contains the full report. `--help` lists commands without running any checks. With no command, the helper retains its full welcome output.

After the local command, add relevant current host facts using [agent connections](#add-agent-connections). Account checks include public accounts already exposed by those connections; setup checks also include their reported readiness, versions, and locations. The helper cannot perform those host checks itself. Setup inspection covers the selected project and known locations, not an exhaustive search for every project on the computer. If no project is known, inspect the current working directory and name it in the result.

## What is checked

| Area | Sources |
| --- | --- |
| Aleo | `~/.aleo/accounts`, `ALEO_ACCOUNTS_DIR`, and supplied account directories. Enumerates named files and reads public metadata through an installed Python keystore, Veil `accountInfo`, or Shield Swap CLI. |
| EVM and Solana bridge wallets | Public `wallet.json` manifests beneath `~/.aleo/funding-wallets`, the project's `funding/` and `.shield-swap/funding-wallets/`, and supplied wallet directories. Looks at most three subdirectories deep and skips symlinks. |
| Other EVM keystores | Public address metadata in Ethereum v3 keystores beneath `~/.ethereum/keystore`, `~/Library/Ethereum/keystore`, and `~/.foundry/keystores`. Does not decrypt them. |
| Solana CLI | Presence of `SOLANA_KEYPAIR_PATH` or `~/.config/solana/id.json`. Does not open a keypair file. Its address remains unchecked unless the existing connection already reports it. |
| Environment sources | Presence or emptiness of recognized Aleo, EVM, and Solana key variables, plus valid public address variables. Never prints key values, opens referenced key files, or assumes that a public address matches a key. |
| Commands | Node.js, npm, pnpm, Bun, uv, Shield Swap CLI, and Solana CLI on the current PATH, plus installed project Shield Swap CLI executables. Uses the resolved executable path and its reported version. |
| Python | The supplied interpreter, active virtual environment, project `.venv` or `venv`, and Python on PATH. Reads versions and locations for installed Aleo, Shield Swap, bridge, Web3, and Solders distributions without importing the SDKs for package discovery. |
| JavaScript/TypeScript | Installed Shield Swap, bridge, Veil, viem, and Solana Kit packages found through the project's `node_modules` lookup paths and npm/pnpm global package directories. Reports package locations and distinguishes global installs. |

Only installed packages count. Dependency declarations and lockfiles are not installation evidence. Different versions in different environments remain separate entries. Python aliases pointing to the same environment appear once. The first command found on PATH is the command this session would use; the inspector is not a search for every executable on the machine.

## Add agent connections

The local script cannot enumerate tools exposed by the host agent. Inspect the current tool catalog separately. Include configured wallet/MCP connections with their reported version, location or endpoint, and current readiness. If a provider does not report a version or location, say **Version not reported** or **Location not reported**. Never infer a version from a tool name or include authenticated URLs, headers, or provider configuration dumps.

For Shield, use its read-only readiness check when available. A tool being listed does not prove that the wallet is paired or unlocked. Follow the check's current guidance; do not open a pairing, unlock, or permission prompt merely to render the welcome. Add public accounts already returned by an existing connection, retaining its reported access state. Browser wallets and hosted Privy/Dynamic wallets are discoverable only through existing project configuration or a connected provider; the script does not enumerate their remote accounts.

When using [the renderer](../../tools/welcome.mjs) directly, append host facts as `connections: [{ name, status, version, location }]`. Connection statuses are `ready`, `locked`, `setup_required`, or `unavailable`. Add public account rows with `family`, `name`, `address`, and `status` of `usable` or `locked` only when a current check established that state. Otherwise retain `address_only` or `saved`. Never pass raw provider objects to a renderer or log.

## Present the result

Keep the welcome limited to the heading, **YOUR SETUP** box, and menu. For explicit check results, use **ACCOUNTS** for an account check or **EXISTING SETUP** with **ACCOUNTS** and **TOOLS** for a setup check:

- Account rows show the chain family, saved name or source, public address when known, storage, and access status. Combine aliases for the same address, preserving different identities even when names match. A configured environment source with an unknown address remains its own unchecked source.
- Tool rows show the name, installed version, and location. For Python packages, also identify the interpreter. For a failed version probe, show **Version unavailable**, preserving the detected executable path.
- **None found in checked locations** means that scoped search found no account. **Could not check** means the search or metadata reader failed. Neither means the person has no wallet elsewhere.

Do not call a password-protected account locked merely because it is encrypted; metadata discovery has not tried access. Do not mark an address-only account usable. If an old SDK cannot read saved account details, show **Account file found; details unavailable**, not **Not configured**. Failed reads must not trigger replacement-account creation.

Preserve the account selected in the conversation. This inventory never selects a new default or resolves competing key sources. The setup/funding journey uses the [SDK account selection rules](../../skills/aleo-funding/references/aleo-accounts.md) when it needs a destination or signer. Keep funding **Not checked** unless a current balance check already established otherwise.

If Node.js or terminal access is unavailable, render the welcome using the host's verified facts. Use installed public metadata commands where available; keep unperformed checks visibly **Not checked**. Do not install a runtime or SDK just to display the menu. Re-run inspection after a setup change or when the person asks to refresh status.
