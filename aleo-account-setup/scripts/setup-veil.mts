import { mkdir } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { loadNetwork } from '@provablehq/veil-aleo-sdk'
import { loadAccount } from '@provablehq/veil-aleo-sdk/node'
import { shieldSwapActions } from '@provablehq/shield-swap-sdk'
import { swapFileStore } from '@provablehq/shield-swap-sdk/node'
import { assets, formatAmount, readRegistry, selectAsset, validateAddress } from './public-balances.mjs'

type Network = 'mainnet' | 'testnet'
type Options = { name: string; address: string; network: Network; stateRoot: string; prompt?: boolean }

// Use this factory in the new application so later runs keep the same account and recovery store.
export async function openSession(options: Options) {
  validateAddress(options.address)
  if (!options.name || !options.stateRoot || !['mainnet', 'testnet'].includes(options.network)) {
    throw new Error('Account name, network, and state directory are required.')
  }
  const loaded = await loadAccount({ name: options.name, prompt: options.prompt ?? false })
  if (loaded.account.address !== options.address) throw new Error('ADDRESS_MISMATCH')
  const aleo = await loadNetwork(options.network)
  const records = aleo.createRemoteScanner({ startBlock: 0, waitForSync: true, syncTimeoutMs: 20000 })
  const { walletClient } = aleo.createAleoClient({ privateKey: loaded.account.privateKey, records })
  const stateDir = join(resolve(options.stateRoot), options.network, options.address)
  await mkdir(stateDir, { recursive: true, mode: 0o700 })
  const client = walletClient.extend(shieldSwapActions({
    api: {}, blindedIdentities: swapFileStore(join(stateDir, 'blinded.json')),
  }))
  await client.authenticateShieldSwap()
  return { client, address: options.address, network: options.network, stateDir }
}

export async function checkPrivateBalances(session: Awaited<ReturnType<typeof openSession>>) {
  // This first read registers the view key and waits for history to catch up, including for empty accounts.
  await session.client.requestRecords({ program: 'credits.aleo', statusFilter: 'unspent' })
  let registry
  try {
    registry = await readRegistry(session.network)
  } catch {
    return assets.map(symbol => ({ symbol, status: 'registry_unavailable' }))
  }
  const tokens = assets.map(symbol => selectAsset(registry, symbol))
  const results = []
  for (const token of tokens) {
    if (token.status !== 'listed') {
      results.push(token)
      continue
    }
    try {
      const balances = await session.client.getPrivateBalances({ programs: [token.underlyingProgram] })
      const raw = balances[token.underlyingProgram] ?? 0n
      results.push({ symbol: token.symbol, status: 'checked', raw: raw.toString(), amount: formatAmount(raw, token.decimals) })
    } catch {
      results.push({ symbol: token.symbol, status: 'unavailable' })
    }
  }
  return results
}

async function main() {
  const { values } = parseArgs({ options: {
    account: { type: 'string' }, address: { type: 'string' }, network: { type: 'string' },
    'state-dir': { type: 'string' }, prompt: { type: 'boolean', default: false },
  } })
  if (!values.account || !values.address || !values['state-dir'] || !['mainnet', 'testnet', 'both'].includes(values.network ?? '')) {
    throw new Error('Usage: setup-veil.mts --account NAME --address ALEO_ADDRESS --network mainnet|testnet|both --state-dir DIRECTORY [--prompt]')
  }
  validateAddress(values.address)
  const networks: Network[] = values.network === 'both' ? ['mainnet', 'testnet'] : [values.network as Network]
  for (const network of networks) {
    let stage = 'account_and_authentication'
    let authenticated = false
    try {
      const session = await openSession({ name: values.account, address: values.address, network, stateRoot: values['state-dir'], prompt: values.prompt })
      authenticated = true
      stage = 'scanner_and_private_balances'
      const balances = await checkPrivateBalances(session)
      const complete = balances.every(asset => ['checked', 'not_listed'].includes(asset.status))
      console.log(JSON.stringify({ network, account: values.account, address: values.address, authenticated,
        scanner: 'synced', status: complete ? 'checked' : 'incomplete', stateDir: session.stateDir, visibility: 'private', assets: balances }))
      if (!complete) process.exitCode = 1
    } catch (error) {
      const code = (error as { code?: unknown }).code
      const pending = error instanceof Error && error.message === 'Record scanner synchronization timed out'
      // SDK exceptions can include request data. Report only the checkpoint and a known error code.
      const safeCode = typeof code === 'string' && /^[A-Z_]+$/.test(code) ? code : undefined
      console.log(JSON.stringify({ network, account: values.account, address: values.address, authenticated,
        stage, status: pending ? 'scan_pending' : 'unavailable', ...(safeCode ? { code: safeCode } : {}) }))
      process.exitCode = 1
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => {
    console.error('Setup could not start. Check the required account, public address, network, and state directory arguments.')
    process.exitCode = 1
  })
}
