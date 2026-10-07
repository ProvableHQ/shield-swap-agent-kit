import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const routePage = 'context/decisions/trade/arbitrage-setup.md'

function section(markdown, heading) {
  const start = markdown.indexOf(heading)
  assert.notEqual(start, -1, `missing ${heading}`)
  const level = heading.match(/^#+/)[0].length
  const rest = markdown.slice(start + heading.length)
  const next = rest.search(new RegExp(`\\n#{1,${level}} `))
  return next === -1 ? rest : rest.slice(0, next)
}

test('the arbitrage setup is selected after the one-account bot', async () => {
  const agents = await readFile(join(root, 'AGENTS.md'), 'utf8')
  assert.match(agents, /decisions\/trade\/arbitrage-setup\.md/)
  const page = await readFile(join(root, routePage), 'utf8')
  assert.match(page, /bot-integration\.md#build-a-one-account-bot/)
  assert.match(page, /testnet/)
  const inputs = section(page, '## Required inputs')
  assert.match(inputs, /size cap/)
  assert.match(inputs, /Minimum edge/)
  assert.match(inputs, /Do not invent either value/)
})

test('the quote-only arbitrage setup submits nothing', async () => {
  const page = await readFile(join(root, routePage), 'utf8')
  const plumbing = section(page, '## Plumbing on testnet')
  assert.match(plumbing, /discover-pools-and-get-quotes\.md/)
  assert.match(plumbing, /return that quote/)
  assert.match(plumbing, /Stop there/)
  assert.match(plumbing, /Do not submit a swap/)
  assert.doesNotMatch(plumbing, /claimSwapOutput|claim_swap_output/)
})

test('a missing second venue does not invent a trade', async () => {
  const page = await readFile(join(root, routePage), 'utf8')
  const comparison = section(page, '## Two-venue comparison')
  assert.match(comparison, /When the other quote is missing/)
  assert.match(comparison, /stop/)
  assert.match(comparison, /Do not invent a trade/)
  assert.match(comparison, /mainnet quote-only pass/)
  assert.match(comparison, /submits nothing/)
  assert.match(comparison, /does not include a verified bridge execution recipe/)
})
