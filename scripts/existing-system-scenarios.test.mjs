import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const routePage = 'context/decisions/build/what-are-you-building.md'

function section(markdown, heading) {
  const start = markdown.indexOf(heading)
  assert.notEqual(start, -1, `missing ${heading}`)
  const level = heading.match(/^#+/)[0].length
  const rest = markdown.slice(start + heading.length)
  const next = rest.search(new RegExp(`\\n#{1,${level}} `))
  return next === -1 ? rest : rest.slice(0, next)
}

test('the existing-system route is selected from the agent journey', async () => {
  const agents = await readFile(join(root, 'AGENTS.md'), 'utf8')
  assert.match(agents, /what-are-you-building\.md#extend-an-existing-system/)
  const page = await readFile(join(root, routePage), 'utf8')
  const route = section(page, '## Extend an existing system')
  assert.match(route, /already has a runtime, signer, and network/)
  assert.match(route, /Skip account creation, funding, and strategy selection/)
})

test('the quote-only scenario stops before submission', async () => {
  const page = await readFile(join(root, routePage), 'utf8')
  const quote = section(section(page, '## Extend an existing system'), '### Quote only')
  assert.match(quote, /discover-pools-and-get-quotes\.md/)
  assert.match(quote, /existing client/)
  assert.match(quote, /Stop there/)
  assert.match(quote, /Do not create an account, request funding, or submit a swap/)
  assert.doesNotMatch(quote, /claimSwapOutput|claim_swap_output/)
})

test('the authorized-swap scenario stays on the original operation', async () => {
  const page = await readFile(join(root, routePage), 'utf8')
  const swap = section(section(page, '## Extend an existing system'), '### Authorized swap')
  assert.match(swap, /swap\.md/)
  assert.match(swap, /recover-swaps\.md/)
  assert.match(swap, /quote, submit, and claim/)
  assert.match(swap, /same client/)
  assert.match(swap, /resume the original operation/)
  assert.match(swap, /Do not create an account, request funding, choose a strategy, or submit another swap/)
})
