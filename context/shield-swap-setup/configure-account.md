# Configure an account

Select the account, network, and persistent state before authenticating or trading. Reuse an existing account unless the user requests a new one. An explicit code-only/read-only milestone can defer this page; an operational trading-tool connection includes this step and funding.

The examples use **testnet**. Keep each tool's state outside the installed kit, exclude it from version control, and use a private working directory. See [private keys and state](../safety/private-key-handling.md) for custody boundaries.

## Create or import the account

For the CLI, Veil, and Python, the account is one shared step: follow the [account setup skill](../../shield-swap-setup/SKILL.md). It looks for an existing account, asks whether to create or import one, strongly recommends keeping the key in macOS Keychain, and runs the tool's own account command. The key is saved unencrypted when the user prefers that. The account is stored as `~/.aleo/accounts/<name>.json`, which all three tools read, so it is set up once.

Return here with the account's name and address. The sections below connect one interface to that account; they do not create one. The recipes use the name `trading`; leave the name out when the account is `default`.

The shared account file needs `@provablehq/shield-swap-cli` and `@provablehq/veil-aleo-sdk` 0.17.0 or later, or `aleo-sdk` and `shield-swap-sdk` 0.9.0 or later. An earlier release keeps the key in the tool's own state file: upgrade before following these recipes.

## AgentKit MCP

For an existing connection, use `get_config` and `list_wallets` to select the configured profile and verify its public address and network. Reuse that profile and state directory; do not create another account for a quote or an authorized swap.

MCP `setup` reports the selected profile’s account and funding checks. For guided configuration, run the installed `shield-swap-mcp setup --guided` (or `node dist/cli.js setup --guided` from the built `mcp/` directory). It reuses the configured default profile unless another is selected; for a missing profile it offers import or explicit creation. Existing profiles retain their configuration; new guided profiles default to mainnet, so preserve an explicitly requested testnet with `--network testnet`. Non-guided setup continues to require an explicit network. See [trusted-terminal wallet configuration](../../mcp/README.md#configure-an-existing-wallet). Import the selected existing key through an environment reference or hidden terminal input. Never pass keys or passphrases in MCP arguments. Account creation requires choosing Create in the trusted terminal or the explicit `--generate` option. Setup stores configuration with execution disabled and does not authenticate, fund, or trade. Continue to [configure Shield Swap](configure-shield-swap.md). The MCP server keeps its own encrypted store and does not read the shared account file described above.

## CLI

Install the [CLI](../toolchains/cli.md) and run from the directory where trading state should live. The `setup` command selects the account, authenticates, can create an API token, and requests testnet funds when it finds no holdings. Use it when that combined setup is wanted. To select the account without those effects, use the SDK path below.

```sh
# Select the account created or imported by the setup skill.
shield-swap setup --network testnet --name trading
```

The command prints the account address and state directory. Check the address against the account from the setup skill. It stores the account's name and address and the API credentials in `.shield-swap/testnet/state.json`, and swap recovery data in `.shield-swap/testnet/blinded.json`. The key stays in the account file or Keychain. Reuse that directory across sessions; do not print either file.

`setup --new` and `setup --private-key-file <path>` create or import an account in the same command and save its key unencrypted. Prefer the setup skill, which offers Keychain first.

If `NEEDS_CONFIG_DECISION` appears, no account was found for this directory. Return to the setup skill rather than assuming the user has no account elsewhere. A state directory belongs to one address: a key for a different account is rejected, so choose a separate working directory instead of overwriting it.

A state file written by an earlier release can still hold the key itself. It keeps working, and the CLI prints a notice that names `shield-swap account migrate`; the setup skill covers that move.

The inspected CLI still has an obsolete invite-code check after authentication. If it blocks setup, use the [CLI session fallback](../toolchains/cli.md#reuse-a-cli-account-from-a-script), which reuses the saved account. Authentication grants access; no invite code is needed.

## Veil — local-key applications

Install the [TypeScript dependencies](../toolchains/typescript.md). Do not put a key literal in a script, and do not read a key file by hand: `loadAccount` resolves the account.

Save this as `session.mts` in the application. If extending an existing CLI account, use the CLI's `session.mts` recipe instead so its recovery store is retained.

```ts
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { loadNetwork } from '@provablehq/veil-aleo-sdk'
import { loadAccount } from '@provablehq/veil-aleo-sdk/node'
import { shieldSwapActions } from '@provablehq/shield-swap-sdk'
import { swapFileStore } from '@provablehq/shield-swap-sdk/node'

export const network = 'testnet'
// The account from the setup skill. Without `name`: ALEO_ACCOUNT, then `default`.
const { account: signer } = await loadAccount({ name: 'trading' })

const aleo = await loadNetwork(network)
export const { walletClient, account } = aleo.createAleoClient({ privateKey: signer.privateKey })
const stateDir = join('.shield-swap', network, account.address)
await mkdir(stateDir, { recursive: true, mode: 0o700 })

export const client = walletClient.extend(shieldSwapActions({
  api: {},
  blindedIdentities: swapFileStore(join(stateDir, 'blinded.json')),
}))
```

`loadAccount` uses a key from `ALEO_PRIVATE_KEY` or `ALEO_PRIVATE_KEY_FILE` when one is set, and otherwise the account file. It never generates or saves a key, and it throws a `KeystoreError` with code `ACCOUNT_NOT_FOUND` when neither exists. A password-encrypted account asks for its password at the terminal or reads `ALEO_ACCOUNT_PASSWORD`; a Keychain account needs nothing.

`api: {}` selects the DEX API for the client's network. The file store retains blinded identities and swap handles across restarts. It is not a wallet backup: keep a copy of the account's key too. This module does not authenticate, request funds, or submit a transaction.

To verify the selected account, save as `check-account.mts` and run `npx tsx check-account.mts`:

```ts
import { account, network } from './session.mts'
console.log({ address: account.address, network })
```

Exclude `.shield-swap/` from version control before running it.

A browser application uses its connected wallet instead. Do not embed this local-key module in frontend code; use the [wallet toolchain](../toolchains/typescript.md).

## Python — profile on the shared account

Install the [Python dependencies](../toolchains/python.md). Select `SHIELD_SWAP_HOME` if the account uses a non-default profile directory. Otherwise the SDK uses `~/.shield-swap`.

Save this as `session.py` in the application:

```python
from aleo_shield_swap import Profile, ShieldSwap

network = "testnet"
home = Profile.default_home()
# The account from the setup skill. create=False never generates a key.
profile = Profile.load_or_create(home, network=network, account="trading", create=False)
if profile.network != network:
    raise RuntimeError("The profile belongs to another network; select its matching profile directory")
dex = ShieldSwap.from_profile(home=home)
```

For an existing profile, this keeps its address, endpoint, credentials, and journal. For a new profile directory, it records the account's name and address in `profile.json`; the key is not copied there. With `create=False`, a missing account raises `aleo.keystore.KeystoreError` with code `ACCOUNT_NOT_FOUND`. Without it, the profile generates an account and saves the key unencrypted, which skips the storage choice in the setup skill.

A key supplied through `ALEO_PRIVATE_KEY` or `ALEO_PRIVATE_KEY_FILE` is used for that process in place of the account file and must match the profile's address. A profile written by an earlier release can still hold the key in `profile.json`; it keeps working and logs the `python -m aleo.keystore migrate` command that moves it.

`from_profile()` attaches `journal.jsonl` and attempts scanner registration. It does not request an airdrop or run `onboard()`. Scanner errors can surface later when balances are read.

Save as `check_account.py` and run `python check_account.py`:

```python
from session import dex
print({"address": dex.profile.address, "network": dex.profile.network})
```

A profile directory belongs to one address and one network. Two directories that select the same account share it; for a second account, use a second account name and a second directory.

The profile's journal contains claim secrets. Keep the whole profile directory private. The account is shared between tools, but Python profiles and CLI state are different formats: a swap is claimed with the tool that made it.

## Verify and continue

Confirm the intended public address, network, and state location. No pool discovery, quote, or trade is needed to verify an account.

Next: [configure Shield Swap](configure-shield-swap.md). If CLI setup already authenticated, use that page to verify the result rather than rerunning the combined setup.
