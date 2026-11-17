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
  assert.match(guide, /one message with both choices, what each one means, and what happens next/)
  assert.match(guide, /hidden prompt in their own terminal/)
  assert.match(guide, /do not use or repeat it/)
})

test('the setup skill asks both choices in one message that explains each option', async () => {
  const ask = section(await readFile(join(root, skillPath), 'utf8'), '## 2. Ask the two choices')
  assert.match(ask, /send this message as written/)
  assert.match(ask, /> Your account is the address that holds your funds and the key that signs your trades/)
  assert.match(ask, /> \*\*1\. Which account\?\*\*/)
  assert.match(ask, /> - \*\*New\*\*: I create a fresh account now/)
  assert.match(ask, /> - \*\*Existing\*\*: you already have an Aleo account/)
  assert.match(ask, /> \*\*2\. Where should the key be kept\?\*\*/)
  assert.match(ask, /> Reply with one of each, for example \*\*new, keychain\*\*/)
  assert.match(ask, /> After that I'll show you the account's address/)
  assert.match(ask, /never choose New for them/)
  assert.match(ask, /drop the numbers, and write "One choice" for "Two choices"/)
  assert.match(ask, /Reply \*\*keychain\*\* or \*\*file\*\*\. If you don't choose, I'll use the file\./)
  assert.match(ask, /Reply \*\*new\*\* or \*\*existing\*\*\./)
})

test('unencrypted is the default and Keychain is strongly recommended, once', async () => {
  const skill = await readFile(join(root, skillPath), 'utf8')
  const ask = section(skill, '## 2. Ask the two choices')
  assert.match(ask, /> - \*\*Keychain\*\* \(strongly recommended\): in your Mac's Keychain/)
  assert.match(ask, /> - \*\*File\*\*: unencrypted, in a file only your user account can read/)
  assert.match(ask, /If you only answer the first, I'll use the file/)
  assert.match(ask, /does not answer the storage question: still show it/)
  assert.match(ask, /use the file and move on\. Do not ask again/)
  assert.match(ask, /Keychain is not available\. Replace that option with "\*\*Encrypted\*\* \(recommended\)/)
  assert.match(ask, /End the File option with "You can encrypt it later with one command\."/)
  const storage = section(skill, '## 3. What the storage choices mean')
  assert.match(storage, /saved unencrypted unless the user chooses otherwise/)
  assert.match(storage, /\| File \(the default\) \| `plaintext`, or no flag \|/)
  assert.match(storage, /\| Keychain \(strongly recommended on macOS\) \| `keychain` \|/)
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
