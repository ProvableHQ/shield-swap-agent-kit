# Configure an account

Select the account, network, and persistent state before authenticating or trading. Reuse an existing account unless the user requests a new one. A builder can defer this page until an account-backed operation is needed.

The examples use **testnet**. Keep the account's state outside the installed kit, exclude it from version control, and use a private working directory. On macOS/Linux, `umask 077` before running scripts makes newly created state owner-only. See [private keys and state](../safety/private-key-handling.md) for custody boundaries.

## CLI

Install the [CLI](../toolchains/cli.md) and run from the directory where trading state should live. The current `setup` command also authenticates, can create an API token, and requests testnet funds when it finds no holdings. Use it when that combined setup is wanted. For account configuration without those effects, use the SDK path below.

Choose **one**:

```sh
# Reuse the account already configured in this directory.
shield-swap setup --network testnet

# Import an existing key from a file supplied outside the conversation.
shield-swap setup --network testnet --private-key-file /absolute/path/private-key.txt

# Create an account only when the user chose a new account.
shield-swap setup --network testnet --new
```

The command prints the account address and state directory. Check the address against the requested account. It stores account credentials in `.shield-swap/testnet/state.json` and swap recovery data in `.shield-swap/testnet/blinded.json`. Reuse that directory across sessions; do not print either file.

If `NEEDS_CONFIG_DECISION` appears, the directory has no configured account. Choose import or new rather than assuming the user has no account elsewhere. A different imported key is rejected when state already belongs to another account; choose a separate working directory instead of overwriting it.

The inspected CLI still has an obsolete invite-code check after authentication. If it blocks setup, use the [CLI session fallback](../toolchains/cli.md#reuse-a-cli-account-from-a-script), which reuses the saved account. Authentication grants access; no invite code is needed.

## Veil — local-key applications

Install the [TypeScript dependencies](../toolchains/typescript.md). Have the user supply `SHIELD_SWAP_PRIVATE_KEY_FILE` or `SHIELD_SWAP_PRIVATE_KEY` outside chat. Do not put a key literal in a script.

Save this as `session.mts` in the application. If extending an existing CLI account, use the CLI's `session.mts` recipe instead so its recovery store is retained.

```ts
import { readFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { loadNetwork } from '@provablehq/veil-aleo-sdk'
import { shieldSwapActions } from '@provablehq/shield-swap-sdk'
import { swapFileStore } from '@provablehq/shield-swap-sdk/node'

export const network = 'testnet'
const keyPath = process.env.SHIELD_SWAP_PRIVATE_KEY_FILE
const privateKey = (keyPath
  ? await readFile(keyPath, 'utf8')
  : process.env.SHIELD_SWAP_PRIVATE_KEY)?.trim()
if (!privateKey) throw new Error('Configure an existing key before loading the session')

const aleo = await loadNetwork(network)
export const { walletClient, account } = aleo.createAleoClient({ privateKey })
const stateDir = join('.shield-swap', network, account.address)
await mkdir(stateDir, { recursive: true, mode: 0o700 })

export const client = walletClient.extend(shieldSwapActions({
  api: {},
  blindedIdentities: swapFileStore(join(stateDir, 'blinded.json')),
}))
```

`api: {}` selects the DEX API for the client's network. The file store retains blinded identities and swap handles across restarts. It is not a wallet backup: retain the original key too. This module does not authenticate, request funds, or submit a transaction.

To verify the selected account, save as `check-account.mts` and run `npx tsx check-account.mts`:

```ts
import { account, network } from './session.mts'
console.log({ address: account.address, network })
```

For an explicitly requested **new** account, run this separate script once, then point `SHIELD_SWAP_PRIVATE_KEY_FILE` at the resulting file:

```ts
import { writeFile } from 'node:fs/promises'
import { loadNetwork } from '@provablehq/veil-aleo-sdk'

const aleo = await loadNetwork('testnet')
const generated = aleo.generateAccount()
await writeFile('new-account.key', generated.privateKey, { flag: 'wx', mode: 0o600 })
console.log({ address: aleo.privateKeyToAccount(generated.privateKey).address })
```

`flag: 'wx'` refuses to overwrite an existing key file. Exclude `new-account.key` and `.shield-swap/` from version control before running it.

A browser application uses its connected wallet instead. Do not embed this local-key module in frontend code; use the [wallet toolchain](../toolchains/typescript.md).

## Python — existing profile or key import

Install the [Python dependencies](../toolchains/python.md). Select `SHIELD_SWAP_HOME` if the account uses a non-default profile directory. Otherwise the SDK uses `~/.shield-swap`.

Save this as `session.py` in the application:

```python
import os
from pathlib import Path
from aleo_shield_swap import Profile, ShieldSwap

network = "testnet"
home = Profile.default_home()
has_profile = (home / "profile.json").is_file()
if not has_profile:
    imported_key = (os.environ.get("SHIELD_SWAP_PRIVATE_KEY") or "").strip()
    key_file = os.environ.get("SHIELD_SWAP_PRIVATE_KEY_FILE")
    if not imported_key and key_file:
        imported_key = Path(key_file).read_text().strip()
    if not imported_key:
        raise RuntimeError("Select an existing profile or supply a nonempty key before loading the session")

profile = Profile.load_or_create(home, network=network)
if profile.network != network:
    raise RuntimeError("The profile belongs to another network; select its matching profile directory")
dex = ShieldSwap.from_profile(home=home)
```

For an existing profile, this retains its key, endpoint, credentials, and journal. For a new profile directory with an imported key, it writes that key to the protected profile. An existing profile takes precedence over import variables: verify its address instead of assuming the variable switched accounts.

`from_profile()` attaches `journal.jsonl` and attempts scanner registration. It does not request an airdrop or run `onboard()`. Scanner errors can surface later when balances are read.

Save as `check_account.py` and run `python check_account.py`:

```python
from session import dex
print({"address": dex.profile.address, "network": dex.profile.network})
```

For a **new** account, choose a fresh `SHIELD_SWAP_HOME`, ensure neither key-import variable is set, and run this once before loading `session.py`:

```python
import os
from aleo_shield_swap import Profile

home = Profile.default_home()
if (home / "profile.json").exists():
    raise RuntimeError("A profile already exists here")
if os.environ.get("SHIELD_SWAP_PRIVATE_KEY") or os.environ.get("SHIELD_SWAP_PRIVATE_KEY_FILE"):
    raise RuntimeError("Key import is configured; resolve the account choice first")
profile = Profile.load_or_create(home, network="testnet")
print({"address": profile.address, "network": profile.network})
```

The profile's journal contains claim secrets. Keep the whole profile directory private. Python profiles and CLI state are different formats, not interchangeable files.

## Verify and continue

Confirm the intended public address, network, and state location. No pool discovery, quote, or trade is needed to verify an account.

Next: [configure Shield Swap](configure-shield-swap.md). If CLI setup already authenticated, use that page to verify the result rather than rerunning the combined setup.
