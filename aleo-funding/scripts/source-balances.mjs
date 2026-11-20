import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const EVM_NETWORKS = Object.freeze({
  base: { chainId: 8453, rpc: 'https://mainnet.base.org', gas: 'ETH' },
  ethereum: { chainId: 1, rpc: 'https://ethereum-rpc.publicnode.com', gas: 'ETH' },
  arbitrum: { chainId: 42161, rpc: 'https://arb1.arbitrum.io/rpc', gas: 'ETH' },
  arc: { chainId: 5042, rpc: 'https://rpc.mainnet.arc.io', gas: 'USDC' },
})

export function validateEvmAddress(address) {
  if (!/^0x[0-9a-fA-F]{40}$/.test(address) || /^0x0{40}$/.test(address)) throw new Error('INVALID_EVM_ADDRESS')
}

export function formatAmount(raw, decimals) {
  if (typeof raw !== 'bigint' || raw < 0n || !Number.isInteger(decimals) || decimals < 0 || decimals > 36) throw new Error('INVALID_AMOUNT')
  if (!decimals) return String(raw)
  const digits = String(raw).padStart(decimals + 1, '0')
  const fraction = digits.slice(-decimals).replace(/0+$/, '')
  return digits.slice(0, -decimals) + (fraction ? `.${fraction}` : '')
}

function quantity(value) {
  if (typeof value !== 'string' || !/^0x[0-9a-fA-F]{1,64}$/.test(value)) throw new Error('INVALID_RPC_VALUE')
  return BigInt(value)
}

// Discover only direct transfers and the supported USDC route through Arc.
// A catalog route still needs a live quote and pause checks before execution.
export function routesToAleo(registry, assetId) {
  const assets = new Map(registry.assets.map(asset => [asset.id, asset]))
  const routes = registry.routes.filter(route => route.environment === 'mainnet' && route.availability === 'active')
  const first = routes.filter(route => route.sourceAssetId === assetId)
  const paths = first.filter(route => assets.get(route.destinationAssetId)?.chainId === 'aleo').map(route => [route.id])
  if (assetId === 'base/usdc' || assetId === 'arbitrum/usdc') {
    for (const leg of first.filter(route => route.protocol === 'cctp' && route.destinationAssetId === 'arc/usdc')) {
      for (const last of routes.filter(route => route.protocol === 'xreserve' && route.sourceAssetId === 'arc/usdc' && route.destinationAssetId === 'aleo/usdcx')) {
        paths.push([leg.id, last.id])
      }
    }
  }
  return paths
}

export async function inspectSourceBalances(address, registry, { fetcher = fetch, rpcUrls = {} } = {}) {
  validateEvmAddress(address)
  let requestId = 0
  async function rpc(url, method, params) {
    const id = ++requestId
    const response = await fetcher(url, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id, method, params }), signal: AbortSignal.timeout(15_000),
    })
    if (!response.ok) throw new Error('RPC_UNAVAILABLE')
    const body = await response.json()
    if (body.id !== id || body.error || !Object.hasOwn(body, 'result')) throw new Error('RPC_UNAVAILABLE')
    return body.result
  }
  const networks = await Promise.all(Object.entries(EVM_NETWORKS).map(async ([chain, config]) => {
    const assets = registry.assets.filter(asset => asset.chainId === chain && asset.locator && ['native', 'evm-contract'].includes(asset.locator.kind))
    if (!assets.some(asset => asset.locator.kind === 'native') && chain !== 'arc') {
      assets.unshift({ id: `${chain}/gas`, key: 'eth', symbol: 'ETH', decimals: 18, locator: { kind: 'native' } })
    }
    if (chain === 'arc' && !assets.some(asset => asset.key === 'usdc')) {
      assets.push({ id: 'arc/usdc', key: 'usdc', symbol: 'USDC', decimals: 6 })
    }
    const url = rpcUrls[chain] || config.rpc
    const base = { chain, address, chainId: config.chainId }
    try {
      if (quantity(await rpc(url, 'eth_chainId', [])) !== BigInt(config.chainId)) throw new Error('WRONG_NETWORK')
    } catch {
      return { ...base, status: 'unavailable', assets: assets.map(asset => ({ symbol: asset.symbol, assetId: asset.id, status: 'unavailable' })) }
    }
    const balances = await Promise.all(assets.map(async asset => {
      const row = { symbol: asset.symbol, assetId: asset.id, decimals: asset.decimals, routes: routesToAleo(registry, asset.id) }
      try {
        if (!asset.locator) throw new Error('MISSING_TOKEN_METADATA')
        let raw
        if (asset.locator.kind === 'native') raw = quantity(await rpc(url, 'eth_getBalance', [address, 'latest']))
        else {
          validateEvmAddress(asset.locator.value)
          const call = data => rpc(url, 'eth_call', [{ to: asset.locator.value, data }, 'latest'])
          const decimals = quantity(await call('0x313ce567'))
          if (decimals !== BigInt(asset.decimals)) throw new Error('DECIMALS_MISMATCH')
          raw = quantity(await call(`0x70a08231${address.slice(2).padStart(64, '0')}`))
        }
        return { ...row, status: 'checked', raw: String(raw), amount: formatAmount(raw, asset.decimals),
          ...(chain === 'arc' && asset.key === 'usdc' ? { alsoPaysGas: true } : {}) }
      } catch { return { ...row, status: 'unavailable' } }
    }))
    return { ...base, status: balances.every(row => row.status === 'checked') ? 'checked' : 'incomplete', assets: balances }
  }))
  return { address, environment: 'mainnet', registryVersion: registry.version, scope: 'Bridge registry assets and native gas; not a full wallet portfolio', networks }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { DEFAULT_BRIDGE_REGISTRY } = await import('@provablehq/aleo-bridge-sdk')
    const address = process.argv[2]
    if (process.argv.length !== 3) throw new Error('USAGE: node source-balances.mjs EVM_ADDRESS')
    const rpcUrls = Object.fromEntries(Object.keys(EVM_NETWORKS).map(chain => [chain, process.env[`${chain.toUpperCase()}_RPC_URL`]?.trim()]))
    const result = await inspectSourceBalances(address, DEFAULT_BRIDGE_REGISTRY, { rpcUrls })
    console.log(JSON.stringify(result, null, 2))
    if (result.networks.some(network => network.status !== 'checked')) process.exitCode = 1
  } catch { console.error('Balance check unavailable. Verify the public address, installed bridge SDK, and RPC configuration.'); process.exitCode = 1 }
}
