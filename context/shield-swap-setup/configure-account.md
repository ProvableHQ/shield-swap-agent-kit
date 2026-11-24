# Configure an account

For initial setup, use [basic Shield Swap setup](../../skills/aleo-account-setup/SKILL.md) through its public balance check, language or existing-project choice, API/scanner setup, private balance check, and next-step menu. This page supplies connection recipes for an already selected operational integration; it is not the next step after creating a private key. Reuse an existing account unless the user requests a new one. An explicit code-only/read-only milestone can defer this page; an operational trading-tool connection includes account setup and funding.

The examples use **testnet**. Keep the account's state outside the installed kit, exclude it from version control, and use a private working directory. On macOS/Linux, `umask 077` before running scripts makes newly created state owner-only. See [private keys and state](../safety/private-key-handling.md) for custody boundaries.

## CLI

Follow [Aleo account setup](../../skills/aleo-account-setup/SKILL.md) first if the account is not selected and verified. The account commands create or import the shared account without signing in or moving funds. Install or upgrade the [CLI dependencies](../../skills/aleo-account-setup/references/dependencies.md#veil-and-the-shield-swap-cli) from npm.

For an explicitly requested CLI session with authentication, API-token creation, and testnet funding, the combined command below can perform those effects. Basic onboarding uses the standalone skill's separate checks instead. Verify the selected public identity and existing recovery state in the working directory before running this command; do not infer an account mismatch from the directory name:

```sh
npx --no-install shield-swap setup --network testnet
```

Retain `ALEO_ACCOUNT` or add `--name` with the selected account name. Keep `ALEO_ACCOUNTS_DIR` if a custom location was used. The command records the address and account name in `.shield-swap/testnet/state.json`, alongside DEX credentials. Swap recovery data stays in `.shield-swap/testnet/blinded.json`. The private key stays in the shared account storage or comes from the environment; older state files can still contain a legacy private key.

Check the printed address against the selected account. If it differs, resolve the selection without overwriting existing trading state. The CLI's obsolete invite-code check can still block setup after authentication; use the [CLI session fallback](../toolchains/cli.md#reuse-a-cli-account-from-a-script). Authentication grants access; no invite code is needed.

## Veil local applications

Install the [TypeScript dependencies](../toolchains/typescript.md) and complete [Aleo account setup](../../skills/aleo-account-setup/SKILL.md). Save this as `session.mts` in the application. It loads the account selected by `ALEO_ACCOUNT`, or `default`, from the shared storage or environment:

```ts
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { loadNetwork } from '@provablehq/veil-aleo-sdk'
import { loadAccount } from '@provablehq/veil-aleo-sdk/node'
import { shieldSwapActions } from '@provablehq/shield-swap-sdk'
import { swapFileStore } from '@provablehq/shield-swap-sdk/node'

export const network = 'testnet'
const loaded = await loadAccount()
const aleo = await loadNetwork(network)
export const { walletClient, account } = aleo.createAleoClient({
  privateKey: loaded.account.privateKey,
})
const stateDir = join('.shield-swap', network, account.address)
await mkdir(stateDir, { recursive: true, mode: 0o700 })

export const client = walletClient.extend(shieldSwapActions({
  api: {},
  blindedIdentities: swapFileStore(join(stateDir, 'blinded.json')),
}))
```

Keep the selected account and password source in the application's runtime configuration. `loadAccount()` never creates an account. `api: {}` selects the DEX API for the client's network. The file store retains swap recovery material across restarts. This module does not authenticate, request funds, or submit a transaction.

To verify the selected account, save as `check-account.mts` and run `npx --no-install tsx check-account.mts`:

```ts
import { account, network } from './session.mts'
console.log({ address: account.address, network })
```

If extending a CLI account, use the [CLI session recipe](../toolchains/cli.md#reuse-a-cli-account-from-a-script) to retain its recovery store. A browser application uses its connected wallet; do not embed this Node module in frontend code.

## Python profiles

Install the [Python dependencies](../toolchains/python.md) and complete [Aleo account setup](../../skills/aleo-account-setup/SKILL.md). Select `SHIELD_SWAP_HOME` for an existing profile or a separate account/network; the default is `~/.shield-swap`. Keep `ALEO_ACCOUNT` and any custom account directory or secret source available to this process.

Save this as `session.py` in the application:

```python
from aleo_shield_swap import Profile, ShieldSwap

network = "testnet"
profile = Profile.load_or_create(network=network, create=False)
if profile.network != network:
    raise RuntimeError("The profile belongs to another network; select its matching profile directory")
# An existing profile can be read before its private key is available.
# Resolve it now to verify the signing account, without printing it.
_ = profile.private_key
dex = ShieldSwap.from_profile(home=profile.home)
```

`create=False` prevents missing account material from generating a new private key. For a new profile, the SDK records the selected account name, address, and network in `profile.json`; an environment private key is not persisted. Existing profiles retain their network, credentials, and journal. Loading the private key checks that it matches the profile's address.

`from_profile()` attaches `journal.jsonl` and attempts scanner registration. It does not request an airdrop or run `onboard()`. Scanner errors can surface later when balances are read.

Save as `check_account.py` and run `python check_account.py`:

```python
from session import dex
print({"address": dex.profile.address, "network": dex.profile.network})
```

Keep the whole profile directory private because the journal contains claim secrets. Shared account storage lets both SDKs use the same address; their trading profiles and recovery data remain separate.

## Verify and continue

Confirm the intended public address, network, and state location. No pool discovery, quote, or trade is needed to verify an account.

Next: [configure Shield Swap](configure-shield-swap.md). If CLI setup already authenticated, use that page to verify the result rather than rerunning the combined setup.
