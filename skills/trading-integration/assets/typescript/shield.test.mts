import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadNetwork } from '@provablehq/veil-aleo-sdk'
import { shieldSwapActions } from '@provablehq/shield-swap-sdk'
import { swapFileStore } from '@provablehq/shield-swap-sdk/node'
import { InventoryStore } from './inventory.mjs'
import { ShieldVenue } from './shield.mjs'

test('the native adapter rejects a different account or network before writing', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'shield-native-'))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  const sdk = await loadNetwork('testnet')
  const account = sdk.generateAccount()
  const store = new InventoryStore(join(directory, 'inventory.sqlite'))
  t.after(() => store.close())
  const { walletClient } = sdk.createAleoClient({ privateKey: account.privateKey,
    recordManagement: { enabled: true, store, chainId: 'aleo:testnet' } })
  const client = walletClient.extend(shieldSwapActions({ api: {}, blindedIdentities: swapFileStore(join(directory, 'swaps.json')) }))
  new ShieldVenue(client, account.address, 'testnet').checkSession()
  assert.throws(() => new ShieldVenue(client, 'different', 'testnet').checkSession())
  assert.throws(() => new ShieldVenue(client, account.address, 'mainnet').checkSession())
  const existingStore = {
    list: store.list.bind(store), acquire: store.acquire.bind(store), update: store.update.bind(store),
  }
  client.recordManagement!.store = existingStore
  assert.throws(() => new ShieldVenue(client, account.address, 'testnet').checkSession())
  const injected = new ShieldVenue(client, account.address, 'testnet', existingStore)
  injected.checkSession()
  client.recordManagement!.store = store
  assert.throws(() => injected.checkSession(), /durable record management/)
})
