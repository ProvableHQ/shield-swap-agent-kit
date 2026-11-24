# Quote, bridge, and verify delivery

For Python, use [native Python funding](python-funding.md#quote-execute-and-recover). The route and funding constraints here apply to both SDKs; code examples and `transfer-state.mjs` are JavaScript/TypeScript implementations.

Use the installed bridge SDK for routing, transaction construction, approvals, signing, and recovery. This guide supplies the funding sequence. Prepare the [dependencies](dependencies.md) and copy [transfer-state.mjs](../scripts/transfer-state.mjs) into the application. Keep its state outside the installed skill, under a private persistent directory.

These are execution instructions for the agent. In guided funding, explain the selected transfer through its effect on the person's funds: what leaves the sending wallet, what arrives on Aleo, fees, any intermediate stop, and public or confidential delivery. Keep registry and SDK mechanics out of the conversation unless requested or needed to resolve a problem.

## Choose the route

Read `DEFAULT_BRIDGE_REGISTRY.getRoutes({ environment: 'mainnet', sourceChainId })` and retain only `availability === 'active'`. Resolve both asset IDs through the same registry. Do not hand-construct route IDs or token contracts. The source balance helper's `routesToAleo` finds direct routes and the supported two-transfer USDC paths.

Use these routes to populate **Assets you can send** in the combined Step 4 menu. For Python, use `DEFAULT_REGISTRY.routes(environment="mainnet", source_chain=SOURCE_CHAIN)` from the installed SDK. Include supported pairs across Ethereum, Base, Arbitrum, Arc, and Solana even when no source address is known. Only include a path through Arc when both legs are supported. Name the source asset, source network, and destination asset; show an intermediate network as “via Arc.” Group by network if needed, retaining asset-to-asset mappings. Keep route IDs and protocol names out of this menu. Omit routes known to be paused or unavailable; confirm the chosen pair's current availability and fees with a live quote before requesting funds.

The reviewed catalog offers:

| Source | Asset received on Aleo | Path |
| --- | --- | --- |
| Ethereum ETH, WBTC, USDT, BAT, USDG | Matching asset | Hyperlane |
| Solana SOL, BAT, USDG, ZEC | Matching asset | Hyperlane |
| Ethereum or Arc native USDC | USDCx | Circle xReserve |
| Base or Arbitrum native USDC | USDCx | Circle CCTP to Arc, then xReserve to Aleo |
| BSC wrapped ALEO | Public ALEO | Verulink, when explicitly selected and supported by the installed SDK |

Recheck the installed catalog and live quote before selecting a transfer. USDC.e and arbitrary L2 assets are not native USDC. Solana USDC is not among these Aleo routes. Offer BSC only when relevant; it is outside the initial four-network balance check. The local-wallet helper covers the listed EVM networks and Solana; BSC requires an existing compatible signer and its own BNB gas check.

## Connect public reads and the selected signer

Create EVM public clients using `createEvmClient({ transport: evmHttp(rpcUrl) })`. Use `createSolanaClient({ transport: solanaHttp(rpcUrl) })` for Solana. Add the signer only for the selected source wallet, from `loadLocalClient`, a hosted-wallet adapter, an existing viem wallet client, or an EIP-1193 provider. Preserve an existing wallet instead of exporting its key.

This example defines a bridge client for the selected source. Replace `SOURCE_CHAIN`, `SOURCE_RPC_URL`, and `WALLET_DIRECTORY`; it uses the saved local wallet. Other wallet choices supply their configured `source` in its place. Aleo public reads allow destination pause checks without an Aleo signer:

```js
import { createBridgeClient, createAleoClient } from '@provablehq/aleo-bridge-sdk'
import { createPublicClient, http } from '@provablehq/veil-core'
import { loadLocalClient } from './local-wallet.mjs'

const sourceChain = 'SOURCE_CHAIN'
const source = await loadLocalClient('WALLET_DIRECTORY', sourceChain, 'SOURCE_RPC_URL')
const aleoPublic = createPublicClient({ transport: http('https://edge.provable.com/api/v2', { network: 'mainnet' }) })
export const bridge = createBridgeClient({
  environment: 'mainnet',
  clients: { [sourceChain]: source, aleo: createAleoClient({ publicClient: aleoPublic }) },
})
export const sender = await source.walletClient.getAddress()
```

Save this as `bridge-session.mjs`. For browser wallet use, construct the same SDK client inside the application with `evmProvider(provider)` or `solanaWallet({ wallet, account, chain: 'solana:mainnet' })`. A terminal cannot use a browser's wallet provider by assuming `window.ethereum` exists.

Before execution, compare the source signer address with the intended wallet, verify EVM chain IDs against the registry's route metadata, and check source gas. For confidential USDCx minting or later shielding, add the existing Aleo signer and check it matches the recipient. Load the selected named account through `loadAccount({ name })` from `@provablehq/veil-aleo-sdk/node`, or keep the connected Aleo wallet. Account lookup must not generate a new address.

## Quote a direct transfer

Replace `SOURCE_CHAIN`, `SOURCE_ASSET`, `DESTINATION_ASSET`, `TRANSFER_AMOUNT`, and `ALEO_ADDRESS` with the selected registry keys, human decimal amount, and verified recipient. This public-delivery example imports the session above. Quoting reads services but does not sign:

```js
import { bridge, sender } from './bridge-session.mjs'
export const quote = await bridge.quote({
  source: { chain: 'SOURCE_CHAIN', asset: 'SOURCE_ASSET' },
  destination: { chain: 'aleo', asset: 'DESTINATION_ASSET' },
  amount: 'TRANSFER_AMOUNT', sender, recipient: 'ALEO_ADDRESS', mintMode: 'public',
})
if (quote.paused || quote.routeStatus?.sources.some(source => source.state === 'unknown' || source.state === 'skipped')) {
  throw new Error('Verify route availability before moving funds')
}
```

Retain the returned `quote.plan` for execution. Show the actual route, sender and recipient, amount, expected receipt, approval requirement, protocol fees, and source gas estimate. Quote fields differ by protocol; read them from the installed quote type. All atomic amounts are integer base units; format with the registry decimals. Do not print the raw client, key material, record contents, or private-mint options.

For xReserve, offer public delivery or a confidential mint according to recipient access and fee readiness. A private mint requires the Aleo recipient's signer, fee capacity, and a durable nonce identity store. Configure `fileXReservePrivateMintIdentityStore` from the SDK's `/node` entry point under the existing private state root and supply it as `circle.privateMintIdentities`. Keep that store with the selected Aleo account through recovery. Do not generate a fresh private-mint identity after a timeout. A public mint can fund an address whose private key the agent does not control, but does not create confidential holdings.

A new account may receive an asset and still lack ALEO for its mint or conversion fee. Check whether the configured fee sponsor covers that operation. If it does not, arrange a mainnet ALEO transfer from another wallet or a service that supports Aleo withdrawals, or inspect the BSC wrapped-ALEO route when relevant. Resolve this before promising confidential delivery. The testnet faucet cannot fund mainnet fees.

## Base or Arbitrum through Arc

Explain both transfers before asking someone to deposit. The Arc intermediate address must belong to a signer that can complete the second leg. For a local EOA this can be the same EVM address on both chains. Verify hosted or smart-wallet support on Arc explicitly. CCTP forwarding only pays for the Arc mint; it does not execute Arc → Aleo.

1. Configure clients for the source chain, Arc, and Aleo. Quote native USDC to Arc USDC with `bridgeProtocol: 'cctp'`, the verified Arc wallet as `recipient`, and `cctp: { speed: 'standard', forwarding: true }`. Show the quoted forwarding fee ceiling and source-chain gas. Use the quote's unchanged plan.
2. Execute the first authorized leg with its own state directory. Wait for verified Arc delivery. On a delay, recover this leg; never repeat its burn.
3. Read the actual Arc USDC balance and reserve current Arc gas for approval and deposit. Arc's native and ERC-20 USDC are the same balance. Do not spend the full received amount or reuse the original L2 amount without accounting for fees.
4. Quote Arc USDC → Aleo USDCx with a second state directory. Check current minimums and fees. Continue within an existing explicit authorization for both legs; otherwise obtain approval for the final amount and fee before the second transfer.

Do not use the SDK's roundtrip example to fund an account: its later legs withdraw the funds again. This journey ends on Aleo.

## Submit once and retain recovery state

After the concrete plan is authorized, use `executeOnce(bridge, directory, quote.plan, options)` from the bundled helper. `directory` is a new per-leg directory beneath an existing private parent. `options` carries required route-specific inputs, such as the retained private-mint configuration; keep secrets out of logs and state JSON.

```js
import { executeOnce } from './transfer-state.mjs'
// bridge and quote are the configured client and already reviewed quote above.
const execution = await executeOnce(bridge, 'TRANSFER_DIRECTORY', quote.plan)
const progress = await bridge.wait({
  progress: { next: 'wait', plan: quote.plan, receipt: execution.receipt },
})
```

The helper records intent before the SDK can submit, awaits checkpoint writes, and refuses to execute in an existing attempt directory. It locks each directory so concurrent processes cannot submit the same leg. It leaves an uncertain marker after a crash or exception, including when no transaction hash was returned. Never bypass that marker by choosing another directory.

Use `inspectTransfer(bridge, directory, options)` to recover the saved checkpoint without signing. Follow `progress.next`:

| Next action | What to do |
| --- | --- |
| `wait` | Poll the original progress with a bounded wait. Preserve the checkpoint. |
| `resume` | An unfinished source step may need a signature. Inspect the original submissions and authorization before `advanceTransfer(..., 'resume', options)`. |
| `complete` | A destination step may need a signature or proof. Retain the recipient, identity store and authorization before `advanceTransfer(..., 'complete', options)`. |
| `done` | Verify destination holdings and whether they are usable for the intended task. |
| `failed` | Inspect the original receipt and failure. A fresh deposit is not recovery. |

`advanceTransfer` rechecks the SDK's next action under the lock. After an interrupted source step, it can proceed to `complete` only when a saved source transaction ID and fresh SDK recovery establish that the original transfer is ready for its destination step. A missing source hash, an uncertain source retry, or an uncertain destination submission still blocks further writes. Use wallet history and chain evidence to reconcile those cases. Do not automatically clear the marker, remove an operation directory, or re-execute. A crash can leave a lock file; remove a stale lock only after confirming no process is active, retaining all state. SDK error bodies are omitted because they may contain request data; diagnose using public configuration and transaction status.

Provider-managed public xReserve delivery can stop at `DELIVERY_PENDING` after attestation; that is not confirmed Aleo receipt. Use bounded waits and destination verification instead of waiting indefinitely or repeating the source deposit. When a source or destination hash is missing after an error, do not treat that omission as proof that no transaction was submitted.

## Verify delivery and confidential holdings

Check the exact destination account/network and asset using the existing wallet or public node, and retain transaction evidence. Match provider and destination results where available. An unrelated balance increase by itself is not proof that this transfer arrived. A scanner still indexing the transaction is a pending check.

Hyperlane inbound transfers produce a public Aleo balance. Public xReserve minting does too. If the person wants confidential holdings, verify recipient control and Aleo fee funding, then quote/explain the additional conversion and use the SDK's `bridge.shield({ asset: { chain: 'aleo', asset: ASSET_KEY }, amount: DECIMAL_AMOUNT })` for a registry asset with a supported `privacy` capability. This is another authorized transaction. Keep its transaction ID and inspect it after a timeout; do not repeat the bridge or conversion blindly.

A completed private USDCx mint already creates a record; do not shield that amount again. Verify its availability through the configured record provider. Report a received public balance as public and any remaining conversion or gas requirement. Funding is ready for a confidential trade only after the intended asset is available in usable records and the application's fee path is configured.
