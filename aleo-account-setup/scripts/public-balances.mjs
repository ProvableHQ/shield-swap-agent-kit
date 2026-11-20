import { pathToFileURL } from 'node:url'

export const assets = ['BAT', 'ZEC', 'USDG', 'USDCX', 'ETH', 'wBTC', 'USDT', 'SOL']
export const networks = ['mainnet', 'testnet']
const apiOrigins = {
  mainnet: 'https://api.swap.shield.fi',
  testnet: 'https://api.testnet.swap.shield.fi',
}
const nodeOrigin = 'https://edge.provable.com/api/v2'
const programPattern = /^[a-zA-Z0-9_]+\.aleo$/

export function validateAddress(address) {
  if (!/^aleo1[023456789acdefghjklmnpqrstuvwxyz]{58}$/.test(address ?? '')) {
    throw new Error('Supply the verified public Aleo address.')
  }
}

export function formatAmount(raw, decimals) {
  const value = BigInt(raw)
  if (value < 0n || !Number.isInteger(decimals) || decimals < 0 || decimals > 38) {
    throw new Error('Invalid token amount or decimals.')
  }
  if (decimals === 0) return value.toString()
  const digits = value.toString().padStart(decimals + 1, '0')
  const fraction = digits.slice(-decimals).replace(/0+$/, '')
  return digits.slice(0, -decimals) + (fraction ? `.${fraction}` : '')
}

async function getJson(url, fetcher) {
  const response = await fetcher(url, { signal: AbortSignal.timeout(20000) })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return response.json()
}

export async function readRegistry(network, fetcher = fetch) {
  if (!networks.includes(network)) throw new Error('Unknown network.')
  const result = await getJson(`${apiOrigins[network]}/tokens`, fetcher)
  if (!Array.isArray(result?.data)) throw new Error('Invalid token registry.')
  return result.data
}

export function selectAsset(rows, symbol) {
  const matches = rows.filter(row => typeof row.symbol === 'string' && row.symbol.toLowerCase() === symbol.toLowerCase())
  if (!matches.length) return { symbol, status: 'not_listed' }
  if (matches.length !== 1) return { symbol, status: 'ambiguous' }
  const token = matches[0]
  if (!Number.isInteger(token.decimals) || token.decimals < 0 || token.decimals > 38 ||
      !programPattern.test(token.underlying_program ?? '') ||
      !programPattern.test(token.amm_token_program ?? '')) {
    return { symbol, status: 'invalid_metadata' }
  }
  return {
    symbol, status: 'listed', tokenId: token.address, decimals: token.decimals,
    underlyingProgram: token.underlying_program, wrapperProgram: token.amm_token_program,
  }
}

async function readContractBalance(network, program, address, fetcher) {
  const base = `${nodeOrigin}/${network}/program/${encodeURIComponent(program)}`
  // Confirm the program and mapping shape before interpreting an absent key as zero.
  const source = await getJson(base, fetcher)
  if (typeof source !== 'string' || !/mapping balances:\s+key as address\.public;\s+value as u128\.public;/.test(source)) {
    throw new Error('Unsupported public balance mapping.')
  }
  const value = await getJson(`${base}/mapping/balances/${encodeURIComponent(address)}`, fetcher)
  if (value === null) return 0n
  if (typeof value !== 'string' || !/^\d+u128$/.test(value.trim())) {
    throw new Error('Invalid public balance value.')
  }
  const amount = BigInt(value.trim().slice(0, -4))
  if (amount >= 2n ** 128n) throw new Error('Public balance exceeds u128.')
  return amount
}

export async function inspectNetwork(network, address, fetcher = fetch) {
  let registry
  try {
    registry = await readRegistry(network, fetcher)
  } catch {
    return { network, status: 'unavailable', assets: assets.map(symbol => ({ symbol, status: 'registry_unavailable' })) }
  }
  const results = []
  for (const symbol of assets) {
    const token = selectAsset(registry, symbol)
    if (token.status !== 'listed') {
      results.push(token)
      continue
    }
    const contracts = []
    for (const program of new Set([token.underlyingProgram, token.wrapperProgram])) {
      try {
        const raw = await readContractBalance(network, program, address, fetcher)
        contracts.push({ program, status: 'checked', raw: raw.toString(), amount: formatAmount(raw, token.decimals) })
      } catch {
        contracts.push({ program, status: 'unavailable' })
      }
    }
    const complete = contracts.every(result => result.status === 'checked')
    const raw = complete ? contracts.reduce((sum, result) => sum + BigInt(result.raw), 0n) : undefined
    results.push({
      ...token, status: complete ? 'checked' : 'unavailable', contracts,
      ...(complete ? { raw: raw.toString(), amount: formatAmount(raw, token.decimals) } : {}),
    })
  }
  return { network, status: results.every(result => ['checked', 'not_listed'].includes(result.status)) ? 'checked' : 'incomplete', assets: results }
}

export async function inspectPublicBalances(address, fetcher = fetch) {
  validateAddress(address)
  return {
    address, checkedAt: new Date().toISOString(), visibility: 'public',
    networks: await Promise.all(networks.map(network => inspectNetwork(network, address, fetcher))),
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv.length !== 3) throw new Error('Usage: node public-balances.mjs ALEO_ADDRESS')
    console.log(JSON.stringify(await inspectPublicBalances(process.argv[2]), null, 2))
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
