import { mkdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { loadNetwork } from '@provablehq/veil-aleo-sdk'
import { shieldSwapActions, type ShieldSwapActions, type SwapQuote, type SwapHandle, type MultiHopSwapHandle } from '@provablehq/shield-swap-sdk'
import { swapFileStore } from '@provablehq/shield-swap-sdk/node'
import type { RecordManagementConfig } from '@provablehq/veil-core'
import { InventoryStore } from './inventory.mjs'
import { validateOffer, type Offer } from './trading.mjs'

type Client = ShieldSwapActions & {
  account?: { address: string; type: string }
  transport: { config: { network?: string | null } }
  recordManagement?: RecordManagementConfig
}
type Handle = SwapHandle | MultiHopSwapHandle

export class ShieldVenue {
  readonly scope: string
  constructor(readonly client: Client, readonly address: string, readonly network: 'mainnet' | 'testnet') {
    this.scope = `aleo:${network}:${address}`
  }
  async quote(from: string, to: string, amountIn: string, slippageBps: number, maxAgeMs: number): Promise<Offer<SwapQuote>> {
    const native = await this.client.quote({ from, to, amountIn, slippageBps })
    if (native.network !== this.network) throw Error('Quote network differs from the selected account')
    const offer = { scope: this.scope, native, quotedAt: native.quotedAt, maxAgeMs: Math.min(maxAgeMs, native.expiresAt - native.quotedAt) }
    validateOffer(offer, this.scope)
    return offer
  }
  checkSession() {
    if (this.client.account?.type !== 'local' || this.client.account.address !== this.address || this.client.transport.config.network !== this.network || !this.client.recordManagement?.enabled || !(this.client.recordManagement.store instanceof InventoryStore)) {
      throw Error('Reuse the selected local account and network with enabled durable record management')
    }
  }
  async submit(quote: SwapQuote) {
    this.checkSession()
    if (quote.network !== this.network) throw Error('Wrong quote network')
    return this.client.swap({ quote })
  }
  async ready(handle: Handle) {
    if (!handle.swapId) return false
    return Boolean(await this.client.getSwapOutput({ swapId: handle.swapId, program: handle.program }))
  }
  async claim(handle: Handle) {
    this.checkSession()
    return this.client.claimSwapOutput({ handle })
  }
}

/** An existing account supplies privateKey in memory. No account is created. */
export async function openSession(options: {
  privateKey: string; address: string; network: 'mainnet' | 'testnet'; stateRoot: string
}) {
  const { privateKey, address, network, stateRoot } = options
  const directory = join(stateRoot, network, address)
  mkdirSync(directory, { recursive: true, mode: 0o700 })
  if (statSync(directory).mode & 0o077) throw Error('Account state directory must have mode 0700')
  const inventory = new InventoryStore(join(directory, 'inventory.sqlite'))
  const sdk = await loadNetwork(network)
  const { walletClient, account } = sdk.createAleoClient({ privateKey,
    recordManagement: { enabled: true, store: inventory, chainId: `aleo:${network}` } })
  if (account.address !== address) { inventory.close(); throw Error('Account address does not match the selected recipient') }
  const client = walletClient.extend(shieldSwapActions({ api: {}, blindedIdentities: swapFileStore(join(directory, 'swaps.json')) }))
  await client.authenticateShieldSwap()
  return { venue: new ShieldVenue(client, address, network), client, inventory }
}
