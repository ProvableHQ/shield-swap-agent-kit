# Privy and Dynamic wallets

Use a hosted wallet when the application already has a provider account or wants server signing without keeping a raw wallet private key locally. Ask **Privy or Dynamic?** only if a provider has not been selected. Keep an existing wallet. Creating a provider account, configuring ownership, and provisioning a wallet are separate from the bridge SDK adapter.

For Python, use the [native hosted-wallet adapters](python-funding.md#connect-privy-or-dynamic). The modules and provider calls below are JavaScript/TypeScript recipes. Preserve the chosen provider and wallet identity across languages; do not provision another wallet to match an example.

Credentials and authorization keys go into the existing secrets manager or trusted terminal, never chat, command arguments, checkpoints, or logs. Explain who can authorize transactions under the chosen provider policy. Configure the relevant chains, contracts, and spending limits before depositing. Do not infer that an API credential gives permission to spend from every wallet.

## Privy

Use [Privy's wallet creation flow](https://docs.privy.io/wallets/wallets/create/create-a-wallet) to create the provider app and choose wallet ownership. The person completes signup and dashboard access. For an existing app, reuse its secret source and wallet IDs. For a new server-controlled wallet, provision once through the installed Privy SDK's `wallets().create` API with `chain_type: 'ethereum'` or `'solana'`, the chosen owner, and applicable policies. Check the installed SDK's request type before creation; ownership determines the authorization needed later.

Persist the wallet ID and exact public address before presenting it for funding. A retry after a lost creation response must first look up the original wallet through the provider; do not create another one on every launch. Verify the wallet's address and chain type through the provider before connecting it.

Save the following as the application's Privy EVM connection module. `PRIVY_APP_ID`, `PRIVY_APP_SECRET`, and optional `PRIVY_AUTHORIZATION_PRIVATE_KEY` come from the configured secret source. `PRIVY_EVM_WALLET_ID`, `PRIVY_EVM_ADDRESS`, and `SOURCE_RPC_URL` select the verified wallet and source network.

```js
import { PrivyClient } from '@privy-io/node'
import { createPrivyEvmClient } from '@provablehq/aleo-bridge-sdk/privy'
import { evmHttp } from '@provablehq/aleo-bridge-sdk'

const required = name => {
  if (!process.env[name]) throw new Error(`Configure ${name}`)
  return process.env[name]
}
const provider = new PrivyClient({ appId: required('PRIVY_APP_ID'), appSecret: required('PRIVY_APP_SECRET') })
const authorizationContext = process.env.PRIVY_AUTHORIZATION_PRIVATE_KEY
  ? { authorization_private_keys: [process.env.PRIVY_AUTHORIZATION_PRIVATE_KEY] }
  : undefined
const wallet = await provider.wallets().get(required('PRIVY_EVM_WALLET_ID'))
  .catch(() => { throw new Error('PROVIDER_WALLET_UNAVAILABLE') })
if (wallet.chain_type !== 'ethereum' || wallet.address.toLowerCase() !== required('PRIVY_EVM_ADDRESS').toLowerCase()) {
  throw new Error('PROVIDER_WALLET_MISMATCH')
}
export const source = await createPrivyEvmClient({
  client: provider,
  walletId: required('PRIVY_EVM_WALLET_ID'),
  address: required('PRIVY_EVM_ADDRESS'),
  authorizationContext,
  transport: evmHttp(required('SOURCE_RPC_URL')),
})
```

For Solana, use `createPrivySolanaClient` from the same entry point with the Solana wallet ID/address and `solanaHttp` transport. Verify the provider's `chain_type` is `solana` and compare the address case-sensitively. Creating either bridge client does not create a wallet or submit a transaction. Verify the resulting `source.walletClient.getAddress()` against the saved identity. A successful lookup confirms provider access and identity; review the wallet's owner and signing policy separately before funding it.

## Dynamic

Follow [Dynamic's server-wallet setup](https://www.dynamic.xyz/docs/node/wallets/server-wallets/overview) for the provider environment and API token. The application authenticates a `DynamicEvmWalletClient` or `DynamicSvmWalletClient` with `authenticateApiToken`. Dynamic requires a supported standard Node runtime with native addons.

Provision once with `createWalletAccount`, selecting the provider's threshold scheme and backup policy. For encrypted provider backup, set `backUpToDynamic: true` and supply the password from the secret source. Preserve the complete returned `walletMetadata`, including `externalServerKeySharesBackupInfo`. Store caller-managed `externalServerKeyShares` in a secrets vault when using that custody mode. Saving only the address or wallet ID is insufficient. See [Dynamic's storage rules](https://www.dynamic.xyz/docs/node/wallets/server-wallets/storage-best-practices).

Reload the saved metadata on restart; do not reconstruct it from an address lookup or create a new wallet. Keep metadata current after password or share changes. Before showing a deposit address, recover the encrypted backup without signing, and keep the returned shares only in memory or the existing secrets vault. Adapter construction and address comparison alone do not check the password or backup.

This EVM connection uses the full metadata file, an encrypted provider backup, and the selected RPC. `DYNAMIC_ENVIRONMENT_ID`, `DYNAMIC_API_TOKEN`, and `DYNAMIC_WALLET_PASSWORD` come from runtime configuration; `DYNAMIC_METADATA_FILE` points to the saved full metadata object.

```js
import { readFile } from 'node:fs/promises'
import { DynamicEvmWalletClient } from '@dynamic-labs-wallet/node-evm'
import { createDynamicEvmClient } from '@provablehq/aleo-bridge-sdk/dynamic'
import { evmHttp } from '@provablehq/aleo-bridge-sdk'

const required = name => {
  if (!process.env[name]) throw new Error(`Configure ${name}`)
  return process.env[name]
}
const provider = new DynamicEvmWalletClient({ environmentId: required('DYNAMIC_ENVIRONMENT_ID') })
await provider.authenticateApiToken(required('DYNAMIC_API_TOKEN'))
  .catch(() => { throw new Error('PROVIDER_AUTHENTICATION_FAILED') })
const walletMetadata = JSON.parse(await readFile(required('DYNAMIC_METADATA_FILE'), 'utf8'))
const password = required('DYNAMIC_WALLET_PASSWORD')
const externalServerKeyShares = await provider.getExternalServerKeyShares({
  accountAddress: walletMetadata.accountAddress, password, walletMetadata,
})
  .catch(() => { throw new Error('WALLET_BACKUP_RECOVERY_FAILED') })
if (!Array.isArray(externalServerKeyShares) || externalServerKeyShares.length === 0) {
  throw new Error('WALLET_BACKUP_RECOVERY_FAILED')
}
export const source = await createDynamicEvmClient({
  client: provider, walletMetadata, password, externalServerKeyShares,
  transport: evmHttp(required('SOURCE_RPC_URL')),
})
```

For Solana, use `DynamicSvmWalletClient`, `createDynamicSolanaClient`, a Solana RPC transport, and `chainId: '101'` for the provider's mainnet policy context. Keep the case-sensitive address from creation metadata. The bridge adapter retains its own transaction signatures; do not enable provider gas sponsorship that changes the Solana fee payer.

Provider provisioning and credential recovery require the provider's actual app configuration. If the person has no app, guide that setup before requesting a deposit. Offer the local deposit-wallet option when they prefer to fund from a wallet or exchange without setting up a provider integration.
