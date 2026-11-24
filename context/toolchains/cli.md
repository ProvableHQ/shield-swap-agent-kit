# CLI

Use the existing `@provablehq/shield-swap-cli` for terminal-command workflows. It installs the `shield-swap` command; AgentKit does not require a second CLI.

## Use the installed command

The runbooks assume `shield-swap` is already installed and on `PATH`:

```sh
shield-swap --help
```

If it is missing or outdated, follow [Veil and CLI dependency setup](../../skills/aleo-account-setup/references/dependencies.md#veil-and-the-shield-swap-cli) to check npm and install or upgrade to `@latest`. Update the installation actually selected by the project or PATH, then retry the command. Account features are available in 0.17.0+; they do not require a local Veil build. For a project-local installation, use `npx --no-install shield-swap` wherever the runbooks say `shield-swap`.

For repeatable bot deployments, pin the dependency version and expose its binary through the application's runtime environment. The recipes were checked against the source versions in the [source map](../../docs/source-map.md), not every published release. Check the installed command's help when its flags differ.

Run commands from the same trading directory: state is relative to the working directory, not the installed skill.

## What the command does

| Command | Behavior |
| --- | --- |
| `account show --json` | Reads the saved account's public details without unlocking its private key. |
| `account create` / `account import` | Saves the selected account with the chosen private key storage, without authenticating or funding it. Follow [account setup](../../skills/aleo-account-setup/SKILL.md). |
| `setup --network testnet` | Loads an account, authenticates, creates an API token if needed, and can request testnet funding. Not configuration-only. |
| `balances --network testnet --all --json` | Reads public and private holdings. |
| `pools --network testnet --json` | Lists pools and checks their on-chain liquidity and trading status. |
| `swap ... --json` | Checks private balance and prepares a quote; does not submit. |
| `swap ... --execute --json` | Obtains a fresh quote, submits the swap, and attempts its claim. |
| `history --network testnet --json` | Inspects swaps and pending proceeds; can update local history. |

`--json` is supported by the operational commands above, but not by the inspected `setup` command. JSON token amounts are base-unit strings; use each token's decimals rather than floating-point conversion.

Both pool reads and swap planning use a configured, authenticated session. The current swap command also checks holdings before quoting. For an unfunded quote-only request, use the SDK quote recipe rather than requesting funds merely to satisfy the CLI.

## Reuse a CLI account from a script

When a CLI flag cannot express a task, use the session export. The shared SDK recipes also import formatting helpers from the Shield Swap SDK. Follow [dependency setup](../../skills/aleo-account-setup/references/dependencies.md#veil-and-the-shield-swap-cli) to install the published CLI, SDK, and script runner in the project. A global executable alone does not supply project imports:

```sh
npm ls @provablehq/shield-swap-cli @provablehq/shield-swap-sdk
```

Save this as `session.mts` in that project:

```ts
import { loadSession } from '@provablehq/shield-swap-cli/session'

export const { client, account, network } = await loadSession({
  network: 'testnet',
})
```

Other `.mts` files can import `{ client, account, network }` from `./session.mts` and run with `npx tsx filename.mts`. Loading the session authenticates and uses the CLI's existing identity store. It does not run setup, request an airdrop, or submit a swap.

Use this path after setup has saved the account, including when the obsolete invite-code check blocks the remaining setup stages. It still needs working DEX authentication. Do not construct a second wallet or copy state into a Python profile as an implicit fallback.

## Persistent state

The CLI records the account name, address, and API credentials in `.shield-swap/<network>/state.json`, and swap identities and handles in `.shield-swap/<network>/blinded.json`. The private key comes from shared account storage or the environment. Older state files can still contain a private key; [account setup](../../skills/aleo-account-setup/references/commands.md#backup-or-change-storage) covers migration. Keep trading state private and exclude it from version control. Changing the working directory can make an existing trading session look unconfigured.

Continue with [configure account](../shield-swap-setup/configure-account.md), or go directly to the requested [swap](../shield-swap-setup/swap.md) if setup and funding are already complete.
