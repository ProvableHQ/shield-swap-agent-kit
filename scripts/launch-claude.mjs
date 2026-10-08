#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname, delimiter, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const kit = dirname(dirname(fileURLToPath(import.meta.url)));
const mcp = join(kit, 'mcp');
const args = process.argv.slice(2);
function run(command, argv, options = {}) {
  return new Promise((done, reject) => {
    const child = spawn(command, argv, { shell: false, ...options });
    const interrupt = () => {};
    const terminate = () => child.kill('SIGTERM');
    process.on('SIGINT', interrupt); process.on('SIGTERM', terminate);
    const cleanup = () => { process.off('SIGINT', interrupt); process.off('SIGTERM', terminate); };
    child.once('error', error => { cleanup(); reject(error); });
    child.once('exit', (code, signal) => { cleanup(); code === 0 ? done(0) : reject(new Error(signal ? 'Command interrupted.' : 'Command failed.')); });
  });
}
async function executable(name) {
  const candidates = name.includes('/') ? [resolve(name)] : (process.env.PATH ?? '').split(delimiter).map(path => join(path, name));
  for (const path of candidates) { try { await access(path, constants.X_OK); return path; } catch {} }
  return undefined;
}
async function main() {
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major < 22 || (major === 22 && minor < 13)) throw new Error('Shield Swap requires Node.js 22.13 or newer.');
  try {
    parseArgs({ args, strict: true, options: { help: { type: 'boolean', short: 'h' }, project: { type: 'string' }, 'state-dir': { type: 'string' }, profile: { type: 'string' }, network: { type: 'string' }, 'key-env': { type: 'string' }, generate: { type: 'boolean' } } });
  } catch { throw new Error('Invalid launcher arguments. Use --help; never pass keys or passphrases as arguments.'); }
  if (args.includes('--help') || args.includes('-h')) {
    process.stdout.write('Shield Swap for Claude Code\nUsage: node scripts/launch-claude.mjs [--project PATH] [--state-dir PATH] [--profile NAME]\nAdvanced account options: --network mainnet|testnet, --key-env NAME, --generate\nInstalls MCP dependencies, builds, shows the intro, guides protected local account setup, and starts Claude with its MCP connection.\n');
    return;
  }
  if (process.platform === 'win32') throw new Error('The launcher currently supports macOS and Linux.');
  if (!await executable(process.env.SHIELD_SWAP_CLAUDE_COMMAND ?? 'claude')) throw new Error('Install Claude Code and sign in once, then rerun this launcher.');
  const pnpm = await executable('pnpm');
  const runner = pnpm ?? await executable('npx');
  if (!runner) throw new Error('Install pnpm 10.33.2 or npm (with npx), then rerun this launcher.');
  const prefix = pnpm ? [] : ['--yes', 'pnpm@10.33.2'];
  // Build tools receive system/package-manager settings, never wallet variables.
  const buildEnv = Object.fromEntries(Object.entries(process.env).filter(([name]) => /^(PATH|HOME|USER|LOGNAME|SHELL|TMPDIR|TEMP|TMP|TERM|LANG|CI|HTTP_PROXY|HTTPS_PROXY|NO_PROXY|LC_.*|XDG_.*|PNPM_.*|NPM_.*|npm_config_.*|COREPACK_.*)$/.test(name)));
  process.stderr.write('Preparing Shield Swap tools…\n');
  try {
    await run(runner, [...prefix, 'install', '--frozen-lockfile', '--prefer-offline'], { cwd: mcp, env: buildEnv, stdio: ['ignore', 'ignore', 'inherit'] });
    await run(runner, [...prefix, 'run', 'build'], { cwd: mcp, env: buildEnv, stdio: ['ignore', 'ignore', 'inherit'] });
  } catch { throw new Error('Could not prepare Shield Swap tools. Check dependency installation in the mcp directory, then rerun this command.'); }
  await run(process.execPath, [join(mcp, 'dist/claude-launch.js'), ...args], { stdio: 'inherit' });
}
void main().catch(error => { process.stderr.write(error.message + '\n'); process.exitCode = 1; });
