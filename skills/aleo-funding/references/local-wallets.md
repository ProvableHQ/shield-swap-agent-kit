# Local wallets and deposit addresses

Offer a reusable EVM wallet or a dedicated EVM/Solana wallet for one funding journey. Both need persistent credentials. The bridge SDK supplies signing adapters; it does not secure or back up a new private key for the application.

Use the [working folder and language](working-context.md) chosen earlier for wallet helpers and bridge execution. If either is unresolved, ask before creating the wallet or its scripts. Choosing a temporary EVM wallet does not select JavaScript.

For guided funding, explain the deposit wallet as a temporary wallet created on this computer, with keys the person retains and an address shown in the conversation. Temporary describes its purpose; keep the keys after the transfer. Sending to it and bridging to Aleo are separate transfers. Its saved network and asset describe this funding task; they do not make an EVM wallet address exclusive to that network or asset. Give the exact sending instructions for the selected transfer.

## Reuse a saved wallet

When the person chooses a saved bridge wallet, keep its address and storage directory. Load it with the existing project's integration, `load_local_client` for Python, or `loadLocalClient` for JavaScript/TypeScript. Verify that the loaded signer matches the displayed address. Do not run wallet creation or replace an inaccessible key. Retain existing backup arrangements.

Check the original transfer state before preparing a new transfer. A submitted or uncertain operation keeps its original recipient and follows [recovery](bridge-transfer.md#submit-once-and-retain-recovery-state). A historical recipient alone does not prevent using the wallet for a new transfer: when no unresolved operation remains, prepare it for the currently selected Aleo account with separate transfer state. Preserve the old manifest and history; show the new recipient in the transfer review.

Use funds already present rather than asking for the token deposit again. If gas is missing, give instructions to fund that same wallet with the required fee asset on the selected network. Estimate the amount from the chosen route, then recheck balances and quote before the transfer review. Choosing this wallet does not approve spending its full balance; retain the selected asset, amount, and transfer authorization.

## Choose storage

On a Mac, recommend Keychain. The bundled helper stores the private key through the OS credential API and writes only a public manifest on disk. Windows uses its credential store. Linux requires a persistent, unlocked Secret Service store. The helper stops when storage is unavailable; it does not fall back to plaintext or a keyring that disappears on reboot.

For a server without that store, retain an existing secrets manager or choose a hosted wallet. An encrypted file is also a possible custody design, but this skill does not implement a second encryption format. Do not write an unencrypted temporary key file while improvising one. A runtime environment variable is a delivery mechanism for an existing secret, not a backup.

Explain the scope plainly: a process permitted to unlock the stored key can spend from this wallet. Keychain protects storage; it does not impose a bridge-only spending policy. Use a dedicated funding wallet, keep only the intended transfer and gas there, and retain a backup outside this machine before depositing.

## Create and check

For Python, use [native wallet creation](python-funding.md#create-or-reuse-the-source-wallet) with `local_wallet.py`, keeping the storage and backup requirements above. The commands and connection module below are for JavaScript/TypeScript. Do not install Node or create a JavaScript project for a Python wallet.

Install the [local-wallet dependencies](dependencies.md), then copy [local-wallet.mjs](../scripts/local-wallet.mjs) into the application. Choose a new directory under a persistent private parent such as `~/.aleo/funding-wallets`. Create the parent with owner-only permissions first. Keep this storage separate from `~/.aleo/accounts`, whose schema is for Aleo accounts.

Replace `WALLET_DIRECTORY`, `SOURCE_CHAIN`, `SOURCE_ASSET`, and `ALEO_ADDRESS` with the selected new directory, registry chain/asset keys, and verified mainnet recipient. Supported chain arguments are `ethereum`, `base`, `arbitrum`, `arc`, and `solana`. Select and verify the route before creation.

```sh
node local-wallet.mjs create --state-dir WALLET_DIRECTORY --chain SOURCE_CHAIN --asset SOURCE_ASSET --recipient ALEO_ADDRESS --purpose deposit
node local-wallet.mjs check --state-dir WALLET_DIRECTORY
```

Use `--purpose reusable` for a local Ethereum account meant for later transfers. The second command reloads the credential in a new process and verifies its address. Report only the returned public metadata. Creation cannot overwrite an existing directory. If creation stops before writing the manifest, run `node local-wallet.mjs recover --state-dir WALLET_DIRECTORY`. It reopens the credential named in the saved reservation and restores the public manifest with the original configuration. It never generates a key. Missing credentials or an unavailable store still stop recovery; retain the reservation and inspect the chosen store before creating anything else.

Before displaying deposit instructions, give the person this command to run in their own terminal:

```sh
node local-wallet.mjs backup --state-dir WALLET_DIRECTORY
```

It displays the EVM private key or Solana CLI-format keypair for saving in their password manager. Never execute `backup` through an agent tool, capture its output, or ask them to paste it back. Confirm they saved it without requesting the secret. A manifest alone cannot restore a wallet on another computer.

## Use the saved wallet with the bridge

In the application, replace the three public configuration values. This creates a client and reads its public address; it does not submit anything:

```js
import { loadLocalClient } from './local-wallet.mjs'
const source = await loadLocalClient('WALLET_DIRECTORY', 'SOURCE_CHAIN', 'SOURCE_RPC_URL')
console.log({ address: await source.walletClient.getAddress() })
```

Use `source` in the bridge client under that chain's SDK name. For an EVM route through Arc, the same stored EOA can sign on both networks when explicitly configured with each network's RPC. A smart wallet address or provider wallet must be verified separately on Arc; an address that receives USDC is not automatically a usable Arc signer.

For an already managed secret, use `evmPrivateKey(secret)` or `solanaKeyPair(secretBytes)` with the bridge SDK. Load the value inside the process from the chosen secret source, verify the derived address, and never pass the secret as a command-line argument. Importing an existing wallet into this helper is not required.

## Keep the wallet until settlement

Save the source network, exact asset/mint, intended deposit amount, final Aleo recipient, and per-leg recovery paths alongside the public manifest. Wait for the deposit on that exact network. Check gas and the amount again before quoting.

After delivery, retain the wallet for late deposits, refunds, and residual gas. Offer a sweep only with an explicitly confirmed destination and amount. A source transaction's sender, especially an exchange's hot wallet, is not a safe inferred refund address. Never delete keys as a side effect of funding completion.
