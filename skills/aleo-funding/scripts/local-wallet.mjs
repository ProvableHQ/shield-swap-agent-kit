import { randomBytes, randomUUID } from 'node:crypto'
import { mkdir, open, readFile, lstat, link, unlink } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

const SERVICE = 'shield-swap-funding'
const CHAINS = ['ethereum', 'base', 'arbitrum', 'arc', 'solana']

function validateConfiguration({ chain, asset, recipient, purpose }) {
  if (!CHAINS.includes(chain) || !['deposit', 'reusable'].includes(purpose) || !/^[a-z0-9-]+$/.test(asset ?? '') || !/^aleo1[023456789acdefghjklmnpqrstuvwxyz]{58}$/.test(recipient ?? '')) throw new Error('INVALID_WALLET_CONFIGURATION')
}

async function checkPrivatePath(path) {
  const info = await lstat(path)
  if (info.isSymbolicLink() || (process.platform !== 'win32' && (info.mode & 0o077))) throw new Error('INSECURE_WALLET_PATH')
}

async function keyringEntry(id) {
  const { Entry } = await import('@napi-rs/keyring')
  // The kernel fallback on Linux does not survive reboot.
  return new Entry(SERVICE, id, { linux: { store: 'secret-service' } })
}

async function generateSecret(family) {
  if (family === 'evm') {
    const { generatePrivateKey } = await import('viem/accounts')
    return generatePrivateKey()
  }
  const { createKeyPairFromPrivateKeyBytes } = await import('@solana/kit')
  const seed = randomBytes(32)
  const pair = await createKeyPairFromPrivateKeyBytes(seed)
  const publicBytes = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey))
  return JSON.stringify([...seed, ...publicBytes])
}

async function clientFromSecret(family, secret, rpcUrl) {
  const sdk = await import('@provablehq/aleo-bridge-sdk')
  if (family === 'evm') return sdk.createEvmClient({ transport: sdk.evmHttp(rpcUrl), account: sdk.evmPrivateKey(secret) })
  const bytes = JSON.parse(secret)
  if (!Array.isArray(bytes) || bytes.length !== 64 || bytes.some(byte => !Number.isInteger(byte) || byte < 0 || byte > 255)) throw new Error('INVALID_SOLANA_KEY')
  return sdk.createSolanaClient({ transport: sdk.solanaHttp(rpcUrl), account: sdk.solanaKeyPair(Uint8Array.from(bytes)) })
}

async function addressFromSecret(family, secret) {
  // Resolving a local account address does not contact this unused transport.
  const client = await clientFromSecret(family, secret, 'http://127.0.0.1:1')
  return client.walletClient.getAddress()
}

async function writeNewJson(path, value) {
  const temporary = join(dirname(path), `.manifest-${randomUUID()}.tmp`)
  const file = await open(temporary, 'wx', 0o600)
  try {
    try { await file.writeFile(`${JSON.stringify(value, null, 2)}\n`); await file.sync() } finally { await file.close() }
    // Publish a complete file atomically; link refuses to overwrite an existing manifest.
    await link(temporary, path)
    if (process.platform !== 'win32') {
      const parent = await open(dirname(path), 'r')
      try { await parent.sync() } finally { await parent.close() }
    }
  } finally { await unlink(temporary) }
}

export async function createLocalWallet({ directory, chain, asset, recipient, purpose }, dependencies = {}) {
  validateConfiguration({ chain, asset, recipient, purpose })
  const family = chain === 'solana' ? 'solana' : 'evm'
  const entryFor = dependencies.entryFor ?? keyringEntry
  const generate = dependencies.generate ?? generateSecret
  const derive = dependencies.derive ?? addressFromSecret
  // One directory reserves the name before generating a key. Existing state is never replaced.
  await mkdir(directory, { mode: 0o700 })
  const id = randomUUID()
  await writeNewJson(join(directory, 'reservation.json'), { version: 1, service: SERVICE, credentialId: id, family, chain, asset, recipient, purpose })
  const entry = await entryFor(id)
  if (entry.getPassword() !== null) throw new Error('CREDENTIAL_ALREADY_EXISTS')
  const secret = await generate(family)
  const address = await derive(family, secret)
  entry.setPassword(secret)
  if (entry.getPassword() !== secret) throw new Error('CREDENTIAL_VERIFICATION_FAILED')
  const metadata = { version: 1, service: SERVICE, credentialId: id, family, address, sourceChain: chain,
    sourceAsset: asset, recipient, environment: 'mainnet', purpose, storage: 'os-keyring' }
  await writeNewJson(join(directory, 'wallet.json'), metadata)
  // No deposit address is returned until both credential and metadata are durable.
  return metadata
}

export async function loadLocalWallet(directory, dependencies = {}) {
  for (const path of [directory, join(directory, 'wallet.json')]) await checkPrivatePath(path)
  const metadata = JSON.parse(await readFile(join(directory, 'wallet.json'), 'utf8'))
  if (metadata.version !== 1 || metadata.service !== SERVICE || !['evm', 'solana'].includes(metadata.family) || !/^[a-f0-9-]{36}$/.test(metadata.credentialId ?? '')) throw new Error('INVALID_WALLET_METADATA')
  const entry = await (dependencies.entryFor ?? keyringEntry)(metadata.credentialId)
  const secret = entry.getPassword()
  if (!secret) throw new Error('CREDENTIAL_UNAVAILABLE')
  const address = await (dependencies.derive ?? addressFromSecret)(metadata.family, secret)
  if (address !== metadata.address) throw new Error('WALLET_ADDRESS_MISMATCH')
  return { metadata, secret }
}

/** Restore public metadata after an interruption; never generates a key. */
export async function recoverLocalWallet(directory, dependencies = {}) {
  try { return (await loadLocalWallet(directory, dependencies)).metadata } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
  for (const path of [directory, join(directory, 'reservation.json')]) await checkPrivatePath(path)
  const reservation = JSON.parse(await readFile(join(directory, 'reservation.json'), 'utf8'))
  validateConfiguration(reservation)
  if (reservation.version !== 1 || reservation.service !== SERVICE || !/^[a-f0-9-]{36}$/.test(reservation.credentialId ?? '') || reservation.family !== (reservation.chain === 'solana' ? 'solana' : 'evm')) throw new Error('INVALID_RESERVATION')
  const entry = await (dependencies.entryFor ?? keyringEntry)(reservation.credentialId)
  const secret = entry.getPassword()
  if (!secret) throw new Error('CREDENTIAL_UNAVAILABLE')
  const address = await (dependencies.derive ?? addressFromSecret)(reservation.family, secret)
  const metadata = { version: 1, service: SERVICE, credentialId: reservation.credentialId, family: reservation.family,
    address, sourceChain: reservation.chain, sourceAsset: reservation.asset, recipient: reservation.recipient,
    environment: 'mainnet', purpose: reservation.purpose, storage: 'os-keyring' }
  await writeNewJson(join(directory, 'wallet.json'), metadata)
  return metadata
}

export async function loadLocalClient(directory, chain, rpcUrl) {
  const { metadata, secret } = await loadLocalWallet(directory)
  if (!CHAINS.includes(chain) || (chain === 'solana') !== (metadata.family === 'solana')) throw new Error('WALLET_CHAIN_MISMATCH')
  return clientFromSecret(metadata.family, secret, rpcUrl)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { positionals, values } = parseArgs({ allowPositionals: true, options: Object.fromEntries(
      ['state-dir', 'chain', 'asset', 'recipient', 'purpose'].map(name => [name, { type: 'string' }])) })
    if (!values['state-dir'] || positionals.length !== 1) throw new Error('INVALID_ARGUMENTS')
    const directory = resolve(values['state-dir'])
    if (positionals[0] === 'create') {
      console.log(JSON.stringify(await createLocalWallet({ directory, chain: values.chain, asset: values.asset, recipient: values.recipient, purpose: values.purpose }), null, 2))
    } else if (positionals[0] === 'check') {
      console.log(JSON.stringify((await loadLocalWallet(directory)).metadata, null, 2))
    } else if (positionals[0] === 'recover') {
      console.log(JSON.stringify(await recoverLocalWallet(directory), null, 2))
    } else if (positionals[0] === 'backup') {
      if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error('BACKUP_REQUIRES_YOUR_OWN_TERMINAL')
      console.log((await loadLocalWallet(directory)).secret)
    } else throw new Error('INVALID_COMMAND')
  } catch { console.error('Wallet operation stopped. Check the command, private state directory, and unlocked OS credential store. Reuse existing state; do not replace a wallet after an error.'); process.exitCode = 1 }
}
