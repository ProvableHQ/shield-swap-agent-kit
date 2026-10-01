# CLI

Use the existing `@provablehq/shield-swap-cli` for immediate trading. It installs the `shield-swap` command; AgentKit does not require a second CLI.

## Install in the trading project

```sh
npm install @provablehq/shield-swap-cli
npx --package @provablehq/shield-swap-cli shield-swap --help
npm ls @provablehq/shield-swap-cli
```

Keep the project's lockfile. The recipes were checked against the source versions in the [source map](../../docs/source-map.md), not every published release. Check the installed command's help when its flags differ.

The runbooks name the scoped package explicitly so `npx` resolves the Shield Swap CLI, including when it needs to download it. For a repeatable bot deployment, install and lock the dependency version in the consuming project. Run commands from the same trading directory: state is relative to the working directory, not the installed skill.

## What the command does

| Command | Behavior |
| --- | --- |
| `setup --network testnet` | Loads an account, authenticates, creates an API token if needed, and can request testnet funding. Not configuration-only. |
| `balances --network testnet --all --json` | Reads public and private holdings. |
| `pools --network testnet --json` | Lists pools and checks their on-chain liquidity and trading status. |
| `swap ... --json` | Checks private balance and prepares a quote; does not submit. |
| `swap ... --execute --json` | Obtains a fresh quote, submits the swap, and attempts its claim. |
| `history --network testnet --json` | Inspects swaps and pending proceeds; can update local history. |

`--json` is supported by the operational commands above, but not by the inspected `setup` command. JSON token amounts are base-unit strings; use each token's decimals rather than floating-point conversion.

Both pool reads and swap planning use a configured, authenticated session. The current swap command also checks holdings before quoting. For an unfunded quote-only request, use the SDK quote recipe rather than requesting funds merely to satisfy the CLI.

## Reuse a CLI account from a script

When a CLI flag cannot express a task, use the session export. The shared SDK recipes also import formatting helpers from the Shield Swap SDK. Add that direct dependency at a version compatible with the installed CLI, plus the script runner:

```sh
npm install @provablehq/shield-swap-sdk
npm install --save-dev tsx
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

The current CLI keeps the key and API credentials in `.shield-swap/<network>/state.json`, and swap identities and handles in `.shield-swap/<network>/blinded.json`. Keep the directory private and exclude it from version control. Changing the working directory can make an existing account look unconfigured.

Continue with [configure account](../shield-swap-setup/configure-account.md), or go directly to the requested [swap](../shield-swap-setup/swap.md) if setup and funding are already complete.
