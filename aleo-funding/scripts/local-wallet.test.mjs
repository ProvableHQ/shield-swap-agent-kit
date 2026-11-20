import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile, chmod, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { createLocalWallet, loadLocalWallet, recoverLocalWallet } from './local-wallet.mjs'

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'funding-wallet-test-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const directory = join(root, 'deposit')
  const secrets = new Map()
  let generated = 0
  const deps = { entryFor: async id => ({ getPassword: () => secrets.get(id) ?? null, setPassword: secret => secrets.set(id, secret) }),
    generate: async () => { generated++; return 'private-fixture-material' }, derive: async () => `0x${'3'.repeat(40)}` }
  const config = { directory, chain: 'base', asset: 'usdc', purpose: 'deposit', recipient: `aleo1${'a'.repeat(58)}` }
  return { directory, config, deps, secrets, generated: () => generated }
}

test('wallet reload keeps its identity without writing secret material into files', async t => {
  const { config, directory, deps, generated } = await fixture(t)
  const metadata = await createLocalWallet(config, deps)
  assert.equal((await loadLocalWallet(directory, deps)).metadata.address, metadata.address)
  for (const filename of ['wallet.json', 'reservation.json']) assert.ok(!(await readFile(join(directory, filename), 'utf8')).includes('private-fixture-material'))
  await assert.rejects(createLocalWallet(config, deps), { code: 'EEXIST' })
  assert.equal(generated(), 1)
})

test('locked or missing credentials do not create replacement keys', async t => {
  const { config, directory, deps, secrets, generated } = await fixture(t)
  await createLocalWallet(config, deps)
  secrets.clear()
  await assert.rejects(loadLocalWallet(directory, deps), /CREDENTIAL_UNAVAILABLE/)
  assert.equal(generated(), 1)
  const brokenDirectory = `${directory}-locked`
  await assert.rejects(createLocalWallet({ ...config, directory: brokenDirectory }, { ...deps, entryFor: async () => { throw new Error('locked') } }), /locked/)
  await assert.rejects(readFile(join(brokenDirectory, 'wallet.json')), { code: 'ENOENT' })
  assert.equal(generated(), 1)
})

test('a changed identity or readable credential manifest fails before returning a signer', async t => {
  const { config, directory, deps } = await fixture(t)
  const metadata = await createLocalWallet(config, deps)
  await writeFile(join(directory, 'wallet.json'), JSON.stringify({ ...metadata, address: 'different' }))
  await assert.rejects(loadLocalWallet(directory, deps), /WALLET_ADDRESS_MISMATCH/)
  if (process.platform !== 'win32') {
    await chmod(join(directory, 'wallet.json'), 0o644)
    await assert.rejects(loadLocalWallet(directory, deps), /INSECURE_WALLET_PATH/)
  }
})

test('an interrupted manifest write restores the original stored wallet without generating a key', async t => {
  const { config, directory, deps, generated } = await fixture(t)
  const metadata = await createLocalWallet(config, deps)
  await unlink(join(directory, 'wallet.json'))
  assert.deepEqual(await recoverLocalWallet(directory, deps), metadata)
  assert.deepEqual(await recoverLocalWallet(directory, deps), metadata)
  assert.equal(generated(), 1)
})
