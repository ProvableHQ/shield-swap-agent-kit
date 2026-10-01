import { access, lstat, readFile, readdir, realpath } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const ignoredDirectories = new Set(['.git', 'node_modules', '.agents', '.claude', '.codex', '.superpowers'])

function inside(root, target) {
  const path = relative(root, target)
  return path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path)
}

async function filesWithin(directory, { bundle = false } = {}) {
  const files = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isSymbolicLink()) {
      throw new Error(`Symlink is not portable: ${path}`)
    }
    if (entry.isDirectory()) {
      if (!bundle && ignoredDirectories.has(entry.name)) continue
      files.push(...await filesWithin(path, { bundle }))
    } else if (entry.isFile()) {
      files.push(path)
    }
  }
  return files
}

// The authored Markdown uses inline links. Ignore fenced examples before
// checking local file targets; remote URLs and fragment contents are not fetched.
function localLinks(markdown) {
  let fence
  const prose = []
  for (const line of markdown.split('\n')) {
    const marker = line.match(/^\s*(`{3,}|~{3,})(.*)$/)
    if (marker) {
      if (!fence) fence = marker[1]
      else if (marker[1][0] === fence[0] && marker[1].length >= fence.length && !marker[2].trim()) fence = undefined
      continue
    }
    if (!fence) prose.push(line)
  }
  return [...prose.join('\n').matchAll(/!?\[[^\]\n]*\]\(([^\s)]+)(?:\s+"[^"]*")?\)/g)]
    .map((match) => match[1])
    .filter((target) => !/^(https?:|mailto:)/i.test(target))
}

async function validateLinks(files, root) {
  const markdownFiles = files.filter((file) => file.endsWith('.md'))
  for (const file of markdownFiles) {
    for (const link of localLinks(await readFile(file, 'utf8'))) {
      const path = decodeURIComponent(link.split(/[?#]/, 1)[0])
      if (!path) continue
      if (isAbsolute(path) || /^[a-z][a-z0-9+.-]*:/i.test(path)) {
        throw new Error(`${file}: use a relative bundled path or HTTPS URL: ${link}`)
      }
      const target = resolve(dirname(file), path)
      if (!inside(root, target)) throw new Error(`${file}: link escapes package: ${link}`)
      try {
        await access(target)
        if (!inside(root, await realpath(target))) throw new Error('resolved target escapes package')
      } catch (error) {
        throw new Error(`${file}: broken local link ${link}: ${error.message}`)
      }
    }
  }
  return markdownFiles.length
}

/** Validate this project's single-line skill metadata and bundled local files. */
export async function validateSkillDirectory(directory, { sourceRepository = false } = {}) {
  if ((await lstat(directory)).isSymbolicLink()) throw new Error(`Symlink skill directory: ${directory}`)
  const root = await realpath(directory)
  const files = await filesWithin(root, { bundle: !sourceRepository })
  const content = await readFile(join(root, 'SKILL.md'), 'utf8')
  const metadata = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)
  if (!metadata) throw new Error(`${root}: SKILL.md requires YAML frontmatter`)
  const name = metadata[1].match(/^name: ([a-z0-9]+(?:-[a-z0-9]+)*)\r?$/m)?.[1]
  const description = metadata[1].match(/^description: (.+)\r?$/m)?.[1].trim()
  if (!name || name.length > 64) throw new Error(`${root}: invalid skill name`)
  if (!sourceRepository && name !== basename(root)) throw new Error(`${root}: skill name must match directory name`)
  if (!description || description.length > 1024 || /^[>|]/.test(description)) {
    throw new Error(`${root}: description must be a nonempty single line of at most 1024 characters`)
  }
  const markdownFiles = await validateLinks(files, root)
  return { name, markdownFiles }
}

/** Check the root skill and its context in a source checkout of any directory name. */
export async function validateRepository(root = repository) {
  root = await realpath(root)
  const skill = await validateSkillDirectory(root, { sourceRepository: true })
  return { markdownFiles: skill.markdownFiles, skills: [skill] }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = process.argv[2]
      ? await validateSkillDirectory(resolve(process.argv[2]))
      : await validateRepository()
    console.log(`Context validation passed: ${JSON.stringify(result)}`)
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
