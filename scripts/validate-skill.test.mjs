import assert from 'node:assert/strict'
import { access, cp, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { validateRepository, validateSkillDirectory } from './validate-skill.mjs'

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const metadata = '---\nname: fixture\ndescription: Use when validating a test fixture.\n---\n\n'

async function temporaryDirectory(t) {
  const directory = await mkdtemp(join(tmpdir(), 'shield-swap-skill-test-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  return directory
}

async function fixture(t, body, header = metadata) {
  const parent = await temporaryDirectory(t)
  const directory = join(parent, 'fixture')
  await mkdir(directory)
  await writeFile(join(directory, 'SKILL.md'), header + body)
  return { parent, directory }
}

test('the real skill works when copied outside the repository', async (t) => {
  const parent = await temporaryDirectory(t)
  const destination = join(parent, 'shield-swap')
  const excluded = new Set(['.git', 'node_modules', '.agents', '.claude', '.codex', '.superpowers'])
  await cp(repository, destination, { recursive: true, filter: (source) => !excluded.has(basename(source)) })
  const result = await validateSkillDirectory(destination)
  assert.equal(result.name, 'shield-swap')
  assert.ok(result.markdownFiles > 1)
  await access(join(destination, 'AGENTS.md'))
  await access(join(destination, 'context/shield-swap-setup/bridge-funds.md'))
  await access(join(destination, 'tools/SKILL.md'))
})

test('the source repository name need not match the installed skill name', async () => {
  const result = await validateRepository(repository)
  assert.equal(result.skills[0].name, 'shield-swap')
})

test('the account setup skill works when installed without the rest of the kit', async (t) => {
  const result = await validateRepository(repository)
  assert.deepEqual(result.skills.map((skill) => skill.name), ['shield-swap', 'shield-swap-setup'])
  const parent = await temporaryDirectory(t)
  const destination = join(parent, 'shield-swap-setup')
  await cp(join(repository, 'shield-swap-setup'), destination, { recursive: true })
  assert.equal((await validateSkillDirectory(destination)).name, 'shield-swap-setup')
})

test('a bundled skill cannot link to the rest of the kit', async (t) => {
  const parent = await temporaryDirectory(t)
  await writeFile(join(parent, 'SKILL.md'), metadata)
  // The target exists, so the link is valid in the kit and only fails for the skill alone.
  await mkdir(join(parent, 'context'))
  await writeFile(join(parent, 'context', 'funding.md'), 'Funding\n')
  await mkdir(join(parent, 'shield-swap-setup'))
  await writeFile(
    join(parent, 'shield-swap-setup', 'SKILL.md'),
    metadata.replace('name: fixture', 'name: shield-swap-setup') + '[Funding](../context/funding.md)\n',
  )
  await assert.rejects(validateRepository(parent), /link escapes package/)
})

test('the root install entrypoint cannot refer to a missing journey guide', async (t) => {
  const { directory } = await fixture(t, '[Start](AGENTS.md)\n')
  await assert.rejects(validateSkillDirectory(directory), /AGENTS\.md/)
})

test('a missing bundled reference fails with its target', async (t) => {
  const { directory } = await fixture(t, '[Setup](missing.md)\n')
  await assert.rejects(validateSkillDirectory(directory), /missing\.md/)
})

test('a reference outside the skill fails even if that file exists', async (t) => {
  const { directory, parent } = await fixture(t, '[Repo docs](../outside.md)\n')
  await writeFile(join(parent, 'outside.md'), '# Present only in the repository\n')
  await assert.rejects(validateSkillDirectory(directory), /escapes/)
})

test('a symlink cannot smuggle a repository dependency into the bundle', async (t) => {
  const { directory, parent } = await fixture(t, '[Setup](reference.md)\n')
  await writeFile(join(parent, 'outside.md'), '# Outside\n')
  await symlink(join(parent, 'outside.md'), join(directory, 'reference.md'))
  await assert.rejects(validateSkillDirectory(directory), /symlink/i)
})

test('missing metadata and a mismatched skill name fail', async (t) => {
  const { directory } = await fixture(t, '# Instructions\n', '')
  await assert.rejects(validateSkillDirectory(directory), /frontmatter/i)
  await writeFile(join(directory, 'SKILL.md'), metadata.replace('name: fixture', 'name: other'))
  await assert.rejects(validateSkillDirectory(directory), /directory name/)
})

test('broken links in a referenced context page are checked too', async (t) => {
  const { directory } = await fixture(t, '[Setup](context.md)\n')
  await writeFile(join(directory, 'context.md'), '[Recovery](missing.md)\n')
  await assert.rejects(validateSkillDirectory(directory), /missing\.md/)
})

test('documentation examples do not act as real links', async (t) => {
  const { directory } = await fixture(t, '```md\n[Example](not-a-real-file.md)\n```\n')
  await validateSkillDirectory(directory)
})
