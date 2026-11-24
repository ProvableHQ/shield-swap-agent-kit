import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'

test('durable reservations conflict atomically and retain private fee inputs after rejection', async t => {
  assert.ok(existsSync(new URL('./inventory.mjs', import.meta.url)), 'inventory adapter must be implemented')
  const { InventoryStore } = await import('./inventory.mjs')
  const root = mkdtempSync(join(tmpdir(), 'records-test-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const first = new InventoryStore(join(root, 'records.sqlite'))
  const second = new InventoryStore(join(root, 'records.sqlite'))
  t.after(() => { first.close(); second.close() })
  const entry = { scope: 'aleo:testnet:a', records: ['token', 'fee'], feeRecordId: 'fee', program: 'p.aleo', function: 'swap', status: 'reserved', createdAt: 1, accountType: 'local' }
  const [a, b] = await Promise.all([first.acquire(entry), second.acquire(entry)])
  assert.ok(a)
  assert.equal(b, undefined)
  await first.update(entry.scope, a.id, { status: 'prepared', transactionId: 'original', transaction: { id: 'original' } })
  assert.equal((await second.list(entry.scope))[0].transactionId, 'original')
  await first.update(entry.scope, a.id, { status: 'rejected', transaction: undefined })
  assert.equal((await second.list(entry.scope))[0].transaction, undefined)
  assert.equal(await second.acquire({ ...entry, records: ['fee'] }), undefined)
  assert.ok(await second.acquire({ ...entry, records: ['token'], feeRecordId: undefined }))
})

test('the Python SDK can read a JavaScript reservation and reject its conflicting input', { skip: !process.env.TRADING_TEST_PYTHON }, async t => {
  const { InventoryStore } = await import('./inventory.mjs')
  const root = mkdtempSync(join(tmpdir(), 'records-interop-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const path = join(root, 'inventory.sqlite')
  const store = new InventoryStore(path)
  t.after(() => store.close())
  const entry = { scope: 'aleo:testnet:a', records: ['token'], program: 'p.aleo', function: 'swap', status: 'reserved', createdAt: 1, accountType: 'local' }
  await store.acquire(entry)
  const output = execFileSync(process.env.TRADING_TEST_PYTHON, ['-c', `
import sys
from aleo.inventory import SqliteRecordInventoryStore
with SqliteRecordInventoryStore(sys.argv[1]) as store:
    row = store.list('aleo:testnet:a')[0]
    assert row.id == '1'
    assert store.acquire(row) is None
    print('shared reservation retained')
`, path], { encoding: 'utf8' })
  assert.match(output, /shared reservation retained/)
})
