import assert from 'node:assert/strict'
import test from 'node:test'
import { formatAmount, inspectPublicBalances, selectAsset } from './public-balances.mjs'

const address = 'aleo1' + 'q'.repeat(58)
const source = 'mapping balances:\n    key as address.public;\n    value as u128.public;'
const token = (symbol, program, wrapper = program) => ({
  symbol, address: '1field', decimals: 18, underlying_program: program, amm_token_program: wrapper,
})

test('public inspection needs no account and preserves exact large amounts across both networks', async () => {
  const requests = []
  const fetcher = async (url, options) => {
    requests.push(url)
    assert.equal(options.method, undefined)
    assert.equal(options.headers, undefined)
    if (url.endsWith('/tokens')) return Response.json({ data: [token('BAT', 'bat.aleo', 'wrapped_bat.aleo'), token('ETH', 'eth.aleo')] })
    if (!url.includes('/mapping/')) return Response.json(source)
    return Response.json(url.includes('/bat.aleo/') ? '1000000000000000001u128' : null)
  }
  const report = await inspectPublicBalances(address, fetcher)
  assert.equal(report.networks.length, 2)
  for (const network of report.networks) {
    const bat = network.assets.find(asset => asset.symbol === 'BAT')
    assert.equal(bat.amount, '1.000000000000000001')
    assert.equal(bat.contracts.length, 2)
    assert.equal(network.assets.find(asset => asset.symbol === 'ETH').contracts.length, 1)
    assert.equal(network.assets.find(asset => asset.symbol === 'ETH').amount, '0')
    assert.deepEqual(network.assets.find(asset => asset.symbol === 'USDG'), { symbol: 'USDG', status: 'not_listed' })
  }
  assert.ok(requests.some(url => url.includes('/mainnet/')))
  assert.ok(requests.some(url => url.includes('/testnet/')))
})

test('failed, missing, or malformed mappings never become zero balances', async () => {
  for (const mode of ['http404', 'http503', 'bad_value', 'bad_program']) {
    const fetcher = async url => {
      if (url.endsWith('/tokens')) return Response.json({ data: [token('ETH', 'eth.aleo')] })
      if (!url.includes('/mapping/')) return Response.json(mode === 'bad_program' ? 'mapping other:' : source)
      if (mode.startsWith('http')) return new Response('', { status: Number(mode.slice(4)) })
      return Response.json('balance: 23u128')
    }
    const report = await inspectPublicBalances(address, fetcher)
    const eth = report.networks[0].assets.find(asset => asset.symbol === 'ETH')
    assert.equal(eth.status, 'unavailable', mode)
    assert.equal(eth.amount, undefined, mode)
  }
})

test('an unavailable registry remains unknown for every requested asset', async () => {
  const report = await inspectPublicBalances(address, async () => new Response('', { status: 503 }))
  for (const network of report.networks) {
    assert.equal(network.status, 'unavailable')
    assert.equal(network.assets.length, 8)
    assert.ok(network.assets.every(asset => asset.status === 'registry_unavailable' && asset.amount === undefined))
  }
})

test('ambiguous symbols, invalid metadata, and invalid addresses are rejected', async () => {
  assert.equal(selectAsset([token('USDCx', 'one.aleo'), token('USDCX', 'two.aleo')], 'USDCX').status, 'ambiguous')
  assert.equal(selectAsset([{ ...token('ETH', 'eth.aleo'), decimals: -1 }], 'ETH').status, 'invalid_metadata')
  await assert.rejects(inspectPublicBalances('invalid', () => assert.fail('Must not make a request')), /public Aleo address/)
  assert.equal(formatAmount(1234500n, 6), '1.2345')
  assert.equal(formatAmount(0n, 18), '0')
})
