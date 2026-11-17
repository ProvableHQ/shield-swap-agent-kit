import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const skillPath = 'shield-swap-setup/SKILL.md'

// Returns the text under a heading, up to the next heading of the same or a
// higher level. Lines inside code fences are never headings.
function section(page, heading) {
  const lines = page.split('\n')
  const start = lines.indexOf(heading)
  assert.notEqual(start, -1, `missing section: ${heading}`)
  const level = heading.match(/^#+/)[0].length
  const body = []
  let fenced = false
  for (const line of lines.slice(start + 1)) {
    if (/^\s*(`{3,}|~{3,})/.test(line)) fenced = !fenced
    else if (!fenced && new RegExp(`^#{1,${level}} `).test(line)) break
    body.push(line)
  }
  return body.join('\n')
}

test('the kit sends account setup to the setup skill', async () => {
  const routes = {
    'SKILL.md': /\]\(shield-swap-setup\/SKILL\.md\)/,
    'AGENTS.md': /\]\(shield-swap-setup\/SKILL\.md\)/,
    'context/getting-started.md': /\]\(\.\.\/shield-swap-setup\/SKILL\.md\)/,
    'context/shield-swap-setup/configure-account.md': /\]\(\.\.\/\.\.\/shield-swap-setup\/SKILL\.md\)/,
    'context/safety/private-key-handling.md': /\]\(\.\.\/\.\.\/shield-swap-setup\/SKILL\.md\)/,
  }
  for (const [path, link] of Object.entries(routes)) {
    assert.match(await readFile(join(root, path), 'utf8'), link, path)
  }
})

test('the account runbook loads the shared account and holds no key recipe', async () => {
  const page = await readFile(join(root, 'context/shield-swap-setup/configure-account.md'), 'utf8')
  assert.match(section(page, '## Veil — local-key applications'), /loadAccount\(\{ name: 'trading' \}\)/)
  assert.match(section(page, '## Python — profile on the shared account'), /create=False/)
  assert.match(section(page, '## CLI'), /shield-swap setup --network testnet --name trading/)
  assert.doesNotMatch(page, /new-account\.key|readFile\(keyPath|SHIELD_SWAP_PRIVATE_KEY/)
})

test('the setup skill guides: the agent runs what needs no secret and asks only what is open', async () => {
  const guide = section(await readFile(join(root, skillPath), 'utf8'), '## How to guide')
  assert.match(guide, /Run every command that involves no secret yourself/)
  assert.match(guide, /ask them in one short message so the user answers once/)
  assert.match(guide, /hidden prompt in their own terminal/)
  assert.match(guide, /do not use or repeat it/)
})

test('the setup skill waits for the new-or-existing answer', async () => {
  const choice = section(await readFile(join(root, skillPath), 'utf8'), '## 2. New account or an existing one?')
  assert.match(choice, /shall I create a new one\?/)
  assert.match(choice, /wait for the answer/)
})

test('unencrypted is the default and Keychain is strongly recommended, once', async () => {
  const storage = section(await readFile(join(root, skillPath), 'utf8'), '## 3. Recommend Keychain')
  assert.match(storage, /saved unencrypted unless the user chooses otherwise/)
  assert.match(storage, /I strongly recommend keeping the key in your Mac's Keychain/)
  assert.match(storage, /`plaintext` \(the default\)/)
  assert.match(storage, /`keychain` \(strongly recommended on macOS\)/)
  assert.match(storage, /does not answer it: make the recommendation once anyway/)
  assert.match(storage, /use the default and move on\. Do not ask again/)
  assert.match(storage, /Keychain is not available\. Recommend password encryption/)
})

test('the setup skill creates without a terminal and imports through the user\'s terminal', async () => {
  const create = section(await readFile(join(root, skillPath), 'utf8'), '## 4. Create or import the account')
  assert.match(create, /Run it yourself/)
  assert.match(create, /shield-swap account create --name trading --storage keychain/)
  assert.match(create, /The user runs the import in their own terminal/)
  assert.match(create, /does not contact the network, sign in to Shield Swap, or move funds/)
  assert.match(create, /exists only in this Mac's Keychain/)
})

test('the setup skill ends by connecting a tool, not by trading', async () => {
  const connect = section(await readFile(join(root, skillPath), 'utf8'), '## 5. Connect the tool that will trade')
  assert.match(connect, /shield-swap setup --network testnet --name trading/)
  assert.match(connect, /create=False/)
  assert.match(connect, /loadAccount\(\{ name: 'trading' \}\)/)
  assert.match(connect, /are not part of this skill/)
})
