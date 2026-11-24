import test from 'node:test'
import assert from 'node:assert/strict'
import { cp, mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { promisify } from 'node:util'
import { execFile } from 'node:child_process'

const exec = promisify(execFile)

test('Python trading and arbitrage modules work together outside the kit', async t => {
  const root = await mkdtemp(join(tmpdir(), 'trading-consumer-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  await cp(new URL('../skills/trading-integration/assets/python/', import.meta.url), root, { recursive: true, filter: source => !source.includes('__pycache__') })
  await cp(new URL('../skills/arbitrage/assets/python/', import.meta.url), root, { recursive: true, filter: source => !source.includes('__pycache__') })
  const { stdout, stderr } = await exec(process.env.TRADING_TEST_PYTHON ?? 'python3', ['-m', 'unittest', 'discover', '-s', root, '-p', 'test_*.py'], { cwd: root })
  assert.match(stdout + stderr, /OK/)
})

test('JavaScript trading modules work independently of SDK workspaces', async t => {
  const root = await mkdtemp(join(tmpdir(), 'trading-js-consumer-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  await cp(new URL('../skills/trading-integration/assets/typescript/', import.meta.url), root, { recursive: true })
  const env = { ...process.env }
  delete env.NODE_TEST_CONTEXT
  const { stdout } = await exec(process.execPath, ['--test', 'trading.test.mjs', 'inventory.test.mjs'], { cwd: root, env })
  assert.match(stdout, /(?:fail 0|# fail 0)/)
})
