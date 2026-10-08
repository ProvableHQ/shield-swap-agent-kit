import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { operationScenarios } from './operation-scenarios.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

async function pages(paths) {
  const contents = await Promise.all(paths.map((path) => readFile(join(root, path), 'utf8')))
  return contents.join('\n')
}

for (const scenario of operationScenarios) {
  test(`${scenario.name} names its pages, stop, and forbidden actions`, async () => {
    assert.ok(scenario.read.length > 0)
    assert.ok(scenario.stop.length > 0)
    assert.ok(scenario.mustNot.length > 0)
    const text = await pages(scenario.read)
    for (const phrase of [...scenario.stop, ...scenario.mustNot]) {
      assert.ok(text.includes(phrase), `${scenario.name} missing: ${phrase}`)
    }
  })
}
