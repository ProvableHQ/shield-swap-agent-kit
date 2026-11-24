import assert from 'node:assert/strict'
import test from 'node:test'
import { EVM_NETWORKS, inspectSourceBalances, routesToAleo } from './source-balances.mjs'

const address = `0x${'1'.repeat(40)}`
const contract = `0x${'2'.repeat(40)}`
const assets = Object.keys(EVM_NETWORKS).map(chain => ({ id: `${chain}/usdc`, key: 'usdc', chainId: chain,
  symbol: 'USDC', decimals: 6, locator: { kind: 'evm-contract', value: contract } }))
assets.push({ id: 'aleo/usdcx', chainId: 'aleo' })
const route = (sourceAssetId, destinationAssetId, protocol, availability = 'active') => ({
  id: `${protocol}:${sourceAssetId}->${destinationAssetId}`, sourceAssetId, destinationAssetId, protocol, availability, environment: 'mainnet',
})
const registry = { version: 'fixture', assets, routes: [
  route('ethereum/usdc', 'aleo/usdcx', 'xreserve'), route('arc/usdc', 'aleo/usdcx', 'xreserve'),
  route('base/usdc', 'arc/usdc', 'cctp'), route('arbitrum/usdc', 'arc/usdc', 'cctp'),
  route('base/usdc', 'aleo/usdcx', 'hyperlane', 'metadata-required'),
] }
const hex = number => `0x${BigInt(number).toString(16)}`
function mockRpc(override = () => undefined) {
  const calls = []
  const fetcher = async (url, options) => {
    const request = JSON.parse(options.body)
    calls.push(request)
    assert.ok(['eth_chainId', 'eth_getBalance', 'eth_call'].includes(request.method))
    const [chain, config] = Object.entries(EVM_NETWORKS).find(([, item]) => item.rpc === url)
    const replacement = override(chain, request)
    if (replacement instanceof Error) throw replacement
    let result = replacement
    if (result === undefined) result = request.method === 'eth_chainId' ? hex(config.chainId)
      : request.method === 'eth_getBalance' ? hex(2n * 10n ** 18n)
      : request.params[0].data === '0x313ce567' ? hex(6) : hex(123456789012345678901n)
    return { ok: true, json: async () => ({ jsonrpc: '2.0', id: request.id, result }) }
  }
  return { fetcher, calls }
}

test('public source inspection preserves precision and counts Arc USDC only once', async () => {
  const mock = mockRpc()
  const result = await inspectSourceBalances(address, registry, mock)
  assert.deepEqual(result.networks.map(row => row.chain), ['base', 'ethereum', 'arbitrum', 'arc'])
  const arc = result.networks.find(row => row.chain === 'arc')
  assert.equal(arc.assets.length, 1)
  assert.equal(arc.assets[0].amount, '123456789012345.678901')
  assert.equal(arc.assets[0].alsoPaysGas, true)
  assert.equal(result.networks[0].assets.find(row => row.symbol === 'ETH').amount, '2')
  assert.equal(result.networks[0].assets.find(row => row.symbol === 'USDC').routes[0].length, 2)
  assert.equal(routesToAleo(registry, 'ethereum/usdc')[0].length, 1)
  assert.equal(mock.calls.some(call => /send|sign|approve/i.test(call.method)), false)
})

test('wrong networks, failed calls, and token-decimal mismatches never become zero', async () => {
  const mock = mockRpc((chain, request) => {
    if (chain === 'base' && request.method === 'eth_chainId') return hex(1)
    if (chain === 'ethereum' && request.method === 'eth_call') return new Error('RPC outage')
    if (chain === 'arbitrum' && request.method === 'eth_call' && request.params[0].data === '0x313ce567') return hex(18)
    if (chain === 'arc' && request.method === 'eth_call' && request.params[0].data !== '0x313ce567') return hex(0)
  })
  const result = await inspectSourceBalances(address, registry, mock)
  assert.equal(result.networks[0].status, 'unavailable')
  assert.ok(result.networks[0].assets.every(row => row.amount === undefined))
  assert.equal(result.networks[1].assets.find(row => row.symbol === 'ETH').amount, '2')
  assert.equal(result.networks[1].assets.find(row => row.symbol === 'USDC').status, 'unavailable')
  assert.equal(result.networks[2].assets.find(row => row.symbol === 'USDC').status, 'unavailable')
  assert.equal(result.networks[3].assets[0].amount, '0')
})

test('unavailable Arc leg removes the two-transfer route and invalid addresses make no RPC calls', async () => {
  const withoutArc = { ...registry, routes: registry.routes.map(item => item.sourceAssetId === 'arc/usdc' ? { ...item, availability: 'disabled' } : item) }
  assert.deepEqual(routesToAleo(withoutArc, 'base/usdc'), [])
  const mock = mockRpc()
  await assert.rejects(inspectSourceBalances('not-an-address', registry, mock), /INVALID_EVM_ADDRESS/)
  assert.equal(mock.calls.length, 0)
  const malformed = await inspectSourceBalances(address, registry, mockRpc((_chain, request) => request.method === 'eth_call' ? '0x' : undefined))
  assert.ok(malformed.networks.every(row => row.assets.filter(asset => asset.symbol === 'USDC').every(asset => asset.status === 'unavailable')))
  const oldRegistry = await inspectSourceBalances(address, { ...registry, assets: registry.assets.filter(asset => asset.id !== 'arc/usdc') }, mockRpc())
  assert.equal(oldRegistry.networks[3].assets[0].status, 'unavailable')
  assert.equal(oldRegistry.networks[3].status, 'incomplete')
})
