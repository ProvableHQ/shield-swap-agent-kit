# Account setup commands

Read the section for the selected interface. Account operations are local and network-neutral. Keep the application's existing network when connecting the account afterward.

## Keep the chosen account name

Ask for a name before creating or importing an account unless one was already supplied. The examples below use `ALEO_ACCOUNT` to carry that choice. Set it in the terminal or process environment that will run the commands, replacing `trading` with the chosen name:

```sh
export ALEO_ACCOUNT='trading'
```

The name is not a secret. Keep it in the application's runtime configuration so later runs select the same account. An export in one terminal does not configure a separate agent or application process; supply the same variable there, or pass CLI `--name`, Veil `name`, or Python `name` explicitly. Preserve an existing account name, and do not replace it with the example name.

## Inspect the selected account

Use one of these commands for public details. Neither displays nor unlocks the private key:

```sh
npx --no-install shield-swap account show --json
```

```sh
python -m aleo.keystore show --json
```

The result contains `name`, `address`, `storage`, and `path`. `ACCOUNT_NOT_FOUND` means no account file exists at the selected location. Environment-only accounts can still load successfully.

In a Veil project, use `accountInfo()` from `@provablehq/veil-aleo-sdk/node`. It returns the same public fields, or `undefined` if there is no account file. Do not inspect an entire account JSON file to obtain these details.

`ALEO_ACCOUNTS_DIR` defaults to `~/.aleo/accounts`. CLI `--dir`, Veil `dir`, or Python `dir` override that directory. The SDK falls back to the name `default` when no name is configured; onboarding must use the person's chosen name. Retain the same name and directory during creation, verification, and subsequent use.

## Create or import with a terminal command

For the Shield Swap CLI, choose one operation and storage:

```sh
npx --no-install shield-swap account create --storage keychain
npx --no-install shield-swap account import --storage keychain
```

In a Python project, use the native command:

```sh
python -m aleo.keystore create --storage encrypted
python -m aleo.keystore import --storage encrypted
```

Both interfaces accept `--storage keychain`, `--storage encrypted`, and `--storage plaintext`. Use the chosen value, not every example. Successful operations report the public address, storage, and file path. Keychain is available only on macOS. Unencrypted storage is the default if the flag is omitted; specify it only when selected.

For import, enter the existing private key or seed phrase at the hidden prompt in a personal terminal. Both commands first check configured private key environment variables; use the intended source and resolve stale variables before prompting. `--key-file` reads a private key file and `--mnemonic-file` reads a seed phrase file. Import leaves those source files in place. Explain that an unencrypted source file still needs protection; do not delete an original backup automatically.

For encrypted storage, the command takes the password from `ALEO_ACCOUNT_PASSWORD` or asks for it twice in a terminal. Let the person enter it there. `--save-password` also stores that password in macOS Keychain when requested. Encryption and Keychain protect stored material; processes with access to the account's runtime secrets can still use it.

Seed phrase imports default to account index `0` and `standard` derivation. Use `--index` and `--derivation legacy` only to match the original wallet. Confirm the resulting public address with that wallet.

## Create with Veil

A Node application can use Veil directly. Save this as `create-account.mts` in the application and run `npx --no-install tsx create-account.mts` once, after new-account and storage choices are settled:

```ts
import { generateAccount } from '@provablehq/veil-aleo-sdk'
import { saveAccount } from '@provablehq/veil-aleo-sdk/node'

const stored = await saveAccount(generateAccount(), { storage: 'keychain' })
console.log({ name: stored.name, address: stored.address, storage: stored.storage, path: stored.path })
```

Set `storage` to the selected value. For `encrypted`, run the script in the person's terminal to collect the password, or use their existing secret injection. For an import already supplied through the environment, `loadAccount({ prompt: false })` resolves it; pass its `account` to `saveAccount` only if saving that private key was requested. For manual private key or seed phrase entry, use the Shield Swap account import command in a personal terminal. This is a setup helper; the application can continue using Veil.

## Supply the account through the environment

Use the application's secret manager, or have the person configure their own terminal. Never show an assignment containing the actual secret.

| Variable | Purpose |
| --- | --- |
| `ALEO_PRIVATE_KEY` | Supplies the private key to the process. |
| `ALEO_PRIVATE_KEY_FILE` | Points to a text file containing only the private key. It is not the shared account JSON file. |
| `ALEO_ACCOUNT_PASSWORD` | Unlocks a password-encrypted account file. |
| `ALEO_ACCOUNT` | Selects a saved account name, defaulting to `default`. |
| `ALEO_ACCOUNTS_DIR` | Selects the account directory, defaulting to `~/.aleo/accounts`. |

The loaders check an explicit private key argument, then `ALEO_PRIVATE_KEY`, then `ALEO_PRIVATE_KEY_FILE`, then the selected account file. The older aliases `SHIELD_SWAP_PRIVATE_KEY` and `SHIELD_SWAP_PRIVATE_KEY_FILE` are also recognized. Different keys in configured sources produce `KEY_CONFLICT`; an empty source produces `EMPTY_KEY_SOURCE`. Resolve the intended source without printing any values.

An environment private key must match the address in a selected account file if that file exists. Use a distinct account name when intentionally selecting a different account. Loading from the environment does not save an account file or private key.

For a new account with no locally stored private key, the person can run `create --storage none` using their selected terminal command. It displays the new private key once and writes an address-only account file. Explain this before they run it, have them save the private key in their secret manager, and verify a later load from that source. Never run this command in captured output. Do not use `saveAccount(..., { storage: 'none' })` to generate a new account whose private key would be lost on exit.

## Verify access without a transaction

Run only the selected language's check from the consumer application. These examples load the private key in memory and print only public fields. They create no account and submit nothing.

Veil, saved as `check-account.mts` and run with `npx --no-install tsx check-account.mts`:

```ts
import { loadAccount } from '@provablehq/veil-aleo-sdk/node'

const { account, source } = await loadAccount({ prompt: false })
console.log({ address: account.address, source })
```

Python, saved as `check_account.py` and run with `python check_account.py`:

```python
from aleo import keystore

loaded = keystore.load(prompt=False)
print({"address": loaded.address, "source": loaded.source})
```

For an encrypted account without a configured password source, have the person run the check in their terminal with `prompt: true` in Veil or `prompt=True` in Python. Do not collect the password through an agent terminal tool. CLI projects can use the Veil check with the same account selection. `account show` alone verifies the saved details, not access to the private key.

## Backup or change storage

`export` displays a private key after confirmation. Give the person the appropriate command to run in their own terminal, with the selected `--name` if needed:

```sh
npx --no-install shield-swap account export
```

```sh
python -m aleo.keystore export
```

Have them save it in their password manager or another backup they control. A new account saved only in Keychain has no second copy until they make one. An encrypted account file needs its password to restore access. New accounts do not have a seed phrase unless `create --mnemonic` was requested; that option displays the phrase once and also belongs in a personal terminal.

To change protection, use the selected interface's `protect --storage keychain` or `protect --storage encrypted`. This keeps the address and funds. An already encrypted account needs its current password; changing that password also requires a new password in the person's terminal. Never fall back to unencrypted storage after an unlock failure.

For a private key still in a legacy CLI state or Python profile, use `migrate --from PATH --storage STORAGE --remove-legacy-key` after agreeing to move it. Replace `PATH` with the existing state/profile file and `STORAGE` with the chosen storage. Both interfaces support these flags. The removal flag verifies the destination before removing the old private key; without it, the original readable copy remains. Preserve all other state and recovery files.

## When setup needs attention

| Result | Next action |
| --- | --- |
| `ACCOUNT_NOT_FOUND` | Check account selection and environment sources, then ask about new or existing if still undecided. |
| `KEY_NOT_STORED` | Supply the original private key for the address-only account. |
| `PASSWORD_REQUIRED`, `TERMINAL_REQUIRED` | Continue in a personal terminal or with the existing secret manager. |
| `WRONG_PASSWORD` | Retry the intended password source. Do not create a replacement account. |
| `ACCOUNT_EXISTS` | Retain that account or choose another name for the requested new account. |
| `ADDRESS_MISMATCH`, `KEY_CONFLICT`, `EMPTY_KEY_SOURCE` | Resolve account selection, conflicting variables, or the named empty source. Keep existing files intact. |
| `KEYCHAIN_UNAVAILABLE`, `KEYCHAIN_ITEM_NOT_FOUND`, `KEYCHAIN_FAILED` | Check this Mac's Keychain or restore the original private key from backup. A new storage choice needs agreement. |
| `ACCOUNT_BUSY` | Let the other account operation finish, inspect the result, then retry if still needed. |

Surface invalid or unsupported account files as errors. Do not replace them or move on to funding with an unverified account.
