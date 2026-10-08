import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const routePage = 'context/decisions/trade/bot-integration.md'

function section(markdown, heading) {
  const start = markdown.indexOf(heading)
  assert.notEqual(start, -1, `missing ${heading}`)
  const level = heading.match(/^#+/)[0].length
  const rest = markdown.slice(start + heading.length)
  const next = rest.search(new RegExp(`\\n#{1,${level}} `))
  return next === -1 ? rest : rest.slice(0, next)
}

test('the one-account bot scenario selects its route', async () => {
  const agents = await readFile(join(root, 'AGENTS.md'), 'utf8')
  assert.match(agents, /bot-integration\.md#build-a-one-account-bot/)
  const stack = await readFile(join(root, 'context/decisions/trade/what-is-your-trading-stack.md'), 'utf8')
  assert.match(stack, /bot-integration\.md#build-a-one-account-bot/)
  for (const page of ['context/toolchains/typescript.md', 'context/toolchains/python.md']) {
    const toolchain = await readFile(join(root, page), 'utf8')
    assert.match(toolchain, /bot-integration\.md#build-a-one-account-bot/)
  }
  const route = section(await readFile(join(root, routePage), 'utf8'), '## Build a one-account bot')
  assert.match(route, /one signer/)
  assert.match(route, /SDK durable store/)
  assert.match(route, /one writer that spends records/)
  assert.match(route, /Submit one swap, claim that same operation/)
  assert.match(route, /recover an unknown result before another write/)
})

test('the one-account bot route shows the production-tactic exclusion first', async () => {
  const page = await readFile(join(root, routePage), 'utf8')
  const route = section(page, '## Build a one-account bot')
  const exclusion = route.slice(route.indexOf('Leave these production tactics out:'))
  assert.notEqual(exclusion.indexOf('Leave these production tactics out:'), -1)
  for (const tactic of [
    'an application database',
    'provisional operation ids beyond the SDK store',
    'a custom wallet lock',
    'reservations across multiple strategies',
    'race classification, plan reuse, or record-cap clipping',
    'a deployment layout',
    'execution on another venue',
  ]) {
    assert.ok(exclusion.includes(tactic), tactic)
  }
  const arbitrage = await readFile(join(root, 'context/strategies/arbitrage.md'), 'utf8')
  assert.match(arbitrage, /design checklist/)
  assert.match(arbitrage, /bot-integration\.md#build-a-one-account-bot/)
})
