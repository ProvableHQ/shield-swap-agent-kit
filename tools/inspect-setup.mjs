import { access, lstat, readFile, readdir, realpath } from 'node:fs/promises';
import { constants } from 'node:fs';
import { execFile } from 'node:child_process';
import { homedir } from 'node:os';
import { basename, delimiter, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { renderWelcome } from './welcome.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const packageNames = ['@provablehq/shield-swap-cli', '@provablehq/shield-swap-sdk',
  '@provablehq/aleo-bridge-sdk', '@provablehq/veil-core', '@provablehq/veil-aleo-sdk',
  '@provablehq/veil-wallet', 'viem', '@solana/kit'];
const commands = ['node', 'npm', 'pnpm', 'bun', 'uv', 'shield-swap', 'solana'];
const secretVariables = {
  aleo: ['ALEO_PRIVATE_KEY', 'SHIELD_SWAP_PRIVATE_KEY', 'ALEO_PRIVATE_KEY_FILE', 'SHIELD_SWAP_PRIVATE_KEY_FILE'],
  evm: ['EVM_PRIVATE_KEY', 'ETH_PRIVATE_KEY', 'ETHEREUM_PRIVATE_KEY'],
  solana: ['SOLANA_PRIVATE_KEY', 'SOLANA_KEYPAIR_PATH'],
};
const addressVariables = {
  aleo: ['ALEO_ADDRESS'], evm: ['EVM_ADDRESS', 'ETH_ADDRESS', 'PRIVY_EVM_ADDRESS', 'DYNAMIC_EVM_ADDRESS'],
  solana: ['SOLANA_ADDRESS', 'PRIVY_SOLANA_ADDRESS', 'DYNAMIC_SOLANA_ADDRESS'],
};
const patterns = { aleo: /^aleo1[023456789acdefghjklmnpqrstuvwxyz]{58}$/,
  evm: /^0x[0-9a-fA-F]{40}$/, solana: /^[1-9A-HJ-NP-Za-km-z]{32,44}$/ };
const storageTypes = new Set(['none', 'plaintext', 'encrypted', 'keychain', 'os-keyring']);
const versionPattern = /(?<![\d.])\d+\.\d+(?:\.\d+)?(?:[-+][0-9A-Za-z.-]+)?/;

/** Capture subprocess output internally; callers return allowlisted fields only. */
export function runProbe(command, args, { cwd, env, input = '', timeout = 4000 } = {}) {
  return new Promise(resolveResult => {
    const child = execFile(command, args, { cwd, env, timeout, maxBuffer: 256 * 1024,
      windowsHide: true }, (error, stdout, stderr) => resolveResult({ ok: !error, stdout, stderr }));
    child.stdin.on('error', () => {});
    child.stdin.end(input);
  });
}

function parsed(result) {
  if (!result.ok) return undefined;
  try { return JSON.parse(result.stdout); } catch { return undefined; }
}
function expand(path, home, project) {
  return resolve(project, path === '~' ? home : path.startsWith('~/') ? join(home, path.slice(2)) : path);
}
async function executable(path) {
  try { await access(path, constants.X_OK); return (await lstat(path)).isDirectory() ? false : true; }
  catch { return false; }
}
async function onPath(name, env, project) {
  for (const directory of (env.PATH ?? '').split(delimiter).filter(Boolean)) {
    const path = resolve(project, directory, name);
    if (await executable(path)) return path;
  }
}
async function jsonFile(path) {
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink() || info.size > 256 * 1024) throw new Error('UNREADABLE_METADATA');
  return JSON.parse(await readFile(path, 'utf8'));
}

/** Inspect known local locations. Never install packages, load signing keys, or contact a chain. */
export async function inspectSetup({ project = process.cwd(), home = homedir(), env = process.env,
  accountDirectories = [], walletDirectories = [], python, probe = runProbe } = {}) {
  project = resolve(project);
  const tools = [], accounts = [], sources = [], issues = [];
  const note = (family, location, code) => issues.push({ family, location, code });
  const paths = Object.fromEntries(await Promise.all(commands.map(async name => [name, await onPath(name, env, project)])));
  paths.node ??= process.execPath;
  const run = (path, args, input = '', cwd = project) => probe(path, args, { cwd, env, input });
  await Promise.all(commands.filter(name => paths[name]).map(async name => {
    const result = await run(paths[name], ['--version']);
    tools.push({ name, kind: name === 'node' || name === 'bun' ? 'runtime' : 'cli',
      path: paths[name], version: result.ok ? (result.stdout.match(versionPattern)?.[0] ?? null) : null });
  }));

  const pythonPaths = [...new Set([python && expand(python, home, project),
    env.VIRTUAL_ENV && join(expand(env.VIRTUAL_ENV, home, project), 'bin/python'),
    join(project, '.venv/bin/python'), join(project, 'venv/bin/python'),
    await onPath('python3', env, project), await onPath('python', env, project)].filter(Boolean))];
  const pythonEnvironments = [];
  const seenPython = new Set();
  for (const path of pythonPaths) {
    if (!await executable(path)) continue;
    const result = parsed(await run(path, [join(here, 'inspect-python.py'), 'packages']));
    if (result?.prefix && seenPython.has(result.prefix)) continue;
    if (result?.prefix) seenPython.add(result.prefix);
    tools.push({ name: 'Python', kind: 'runtime', path, version: result?.version?.match(versionPattern)?.[0] ?? null });
    if (!result) { note('tools', path, 'probe_unavailable'); continue; }
    pythonEnvironments.push({ path, packages: result.packages ?? [] });
    for (const pkg of result.packages ?? []) tools.push({ name: pkg.name, version: pkg.version,
      path: pkg.path, kind: 'sdk', environment: path });
  }

  // Node resolves dependencies through the project's ancestors. Include global
  // packages separately, without treating them as project dependencies.
  const roots = [];
  for (let directory = project; ; directory = dirname(directory)) {
    roots.push({ path: join(directory, 'node_modules'), environment: project });
    if (dirname(directory) === directory) break;
  }
  for (const manager of ['npm', 'pnpm']) if (paths[manager]) {
    const result = await run(paths[manager], ['root', '--global']);
    const path = result.ok && result.stdout.trim();
    if (path && /^(\/|[A-Za-z]:[\\/])/.test(path) && !/[\r\n]/.test(path)) roots.push({ path, environment: 'global' });
  }
  // A globally installed CLI can exist without npm on PATH.
  if (paths['shield-swap']) {
    try {
      let directory = dirname(await realpath(paths['shield-swap']));
      while (dirname(directory) !== directory && basename(directory) !== 'node_modules') directory = dirname(directory);
      if (basename(directory) === 'node_modules') roots.push({ path: directory, environment: 'global' });
    } catch { note('tools', paths['shield-swap'], 'probe_unavailable'); }
  }
  const seenPackages = new Set();
  for (const root of roots) for (const name of packageNames) {
    try {
      const path = await realpath(join(root.path, name));
      if (seenPackages.has(path)) continue;
      const pkg = await jsonFile(join(path, 'package.json'));
      if (pkg.name !== name || typeof pkg.version !== 'string' || !versionPattern.test(pkg.version)) continue;
      seenPackages.add(path);
      tools.push({ name, kind: 'sdk', version: pkg.version.match(versionPattern)[0], path, environment: root.environment });
    } catch { /* Absent package or unsupported installation layout. */ }
  }
  const cliPaths = new Set(paths['shield-swap'] ? [paths['shield-swap']] : []);
  for (const root of roots.filter(item => item.environment === project)) {
    const path = join(root.path, '.bin/shield-swap');
    if (cliPaths.has(path) || !await executable(path)) continue;
    cliPaths.add(path);
    const result = await run(path, ['--version']);
    tools.push({ name: 'shield-swap', kind: 'cli', path, environment: project,
      version: result.ok ? result.stdout.match(versionPattern)?.[0] ?? null : null });
  }

  async function entries(directory, family) {
    try {
      if ((await lstat(directory)).isSymbolicLink()) { note(family, directory, 'symlink_skipped'); return []; }
      return (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name));
    } catch (error) {
      if (error.code !== 'ENOENT') note(family, directory, 'directory_unavailable');
      return [];
    }
  }

  const directories = [...new Set([...accountDirectories, env.ALEO_ACCOUNTS_DIR,
    join(home, '.aleo/accounts')].filter(Boolean).map(path => expand(path, home, project)))];
  if (env.ALEO_ACCOUNTS_DIR === '') note('aleo', 'ALEO_ACCOUNTS_DIR', 'empty_configuration');
  const aleoFiles = [];
  for (const directory of directories) for (const entry of await entries(directory, 'aleo')) {
    if (/^[a-z0-9][a-z0-9_-]{0,63}\.json$/.test(entry.name) && entry.isFile()) {
      aleoFiles.push({ name: entry.name.slice(0, -5), directory });
    } else if (entry.name.endsWith('.json')) note('aleo', join(directory, entry.name), 'entry_skipped');
  }
  let metadata;
  if (aleoFiles.length) {
    // Prefer a Python environment already containing the keystore, then Veil,
    // then the installed CLI. No key loader or profile constructor is invoked.
    for (const environment of pythonEnvironments.filter(item => item.packages.some(pkg => pkg.name === 'aleo-sdk'))) {
      const result = parsed(await run(environment.path, [join(here, 'inspect-python.py'), 'accounts'], JSON.stringify(aleoFiles)));
      if (result?.supported) { metadata = result.accounts; break; }
    }
    if (!metadata) for (const pkg of tools.filter(item => item.name === '@provablehq/veil-aleo-sdk')) {
      const result = parsed(await run(paths.node ?? process.execPath, ['--input-type=module', '--eval', aleoReader], JSON.stringify(aleoFiles), pkg.path));
      if (result?.supported) { metadata = result.accounts; break; }
    }
    if (!metadata) {
      for (const path of cliPaths) {
        const results = [];
        for (const entry of aleoFiles) results.push(parsed(await run(path,
          ['account', 'show', '--name', entry.name, '--dir', entry.directory, '--json'])));
        if (results.some(info => patterns.aleo.test(info?.address ?? ''))) { metadata = results; break; }
      }
    }
    aleoFiles.forEach((entry, index) => {
      const info = metadata?.[index];
      const valid = patterns.aleo.test(info?.address ?? '') && storageTypes.has(info?.storage);
      accounts.push({ family: 'aleo', name: entry.name, path: join(entry.directory, entry.name + '.json'),
        status: valid ? 'saved' : 'metadata_unavailable',
        ...(valid ? { address: info.address, storage: info.storage } : {}) });
    });
  }

  const walletRoots = [...new Set([join(home, '.aleo/funding-wallets'), join(project, 'funding'),
    join(project, '.shield-swap/funding-wallets'), ...walletDirectories.map(path => expand(path, home, project))])];
  const visited = new Set();
  async function scanWallets(directory, depth = 0) {
    if (visited.has(directory)) return;
    visited.add(directory);
    for (const entry of await entries(directory, 'source_wallets')) {
      const path = join(directory, entry.name);
      if (entry.isSymbolicLink()) { note('source_wallets', path, 'symlink_skipped'); continue; }
      if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules' && depth < 3) await scanWallets(path, depth + 1);
      if (entry.name !== 'wallet.json' || !entry.isFile()) continue;
      try {
        const wallet = await jsonFile(path);
        if (wallet.version !== 1 || wallet.service !== 'shield-swap-funding' ||
          !['evm', 'solana'].includes(wallet.family) || !patterns[wallet.family].test(wallet.address ?? '') ||
          wallet.storage !== 'os-keyring') throw new Error('INVALID_MANIFEST');
        accounts.push({ family: wallet.family, name: basename(directory), address: wallet.address,
          storage: 'os-keyring', status: 'saved', path });
      } catch { note('source_wallets', path, 'metadata_unavailable'); }
    }
  }
  for (const directory of walletRoots) await scanWallets(directory);

  const evmDirectories = [join(home, '.ethereum/keystore'), join(home, 'Library/Ethereum/keystore'), join(home, '.foundry/keystores')];
  for (const directory of evmDirectories) for (const entry of await entries(directory, 'evm')) {
    if (entry.isSymbolicLink()) { note('evm', join(directory, entry.name), 'symlink_skipped'); continue; }
    if (!entry.isFile()) continue;
    const path = join(directory, entry.name);
    try {
      const value = await jsonFile(path);
      const address = typeof value.address === 'string' ? '0x' + value.address.replace(/^0x/, '') : '';
      if (value.version !== 3 || !patterns.evm.test(address) || !(value.crypto ?? value.Crypto)) throw new Error('INVALID_KEYSTORE');
      accounts.push({ family: 'evm', name: entry.name, address, storage: 'encrypted', status: 'saved', path });
    } catch { note('evm', path, 'metadata_unavailable'); }
  }

  const solanaKeypair = env.SOLANA_KEYPAIR_PATH
    ? expand(env.SOLANA_KEYPAIR_PATH, home, project) : join(home, '.config/solana/id.json');
  try {
    const info = await lstat(solanaKeypair);
    if (info.isSymbolicLink()) note('solana', solanaKeypair, 'symlink_skipped');
    if (info.isFile()) accounts.push({ family: 'solana', name: 'Solana CLI keypair',
      path: solanaKeypair, status: 'key_file_found' });
  } catch (error) { if (error.code !== 'ENOENT') note('solana', solanaKeypair, 'metadata_unavailable'); }

  for (const [family, names] of Object.entries(secretVariables)) for (const name of names) {
    if (Object.hasOwn(env, name)) sources.push({ family, name, status: env[name] ? 'configured' : 'empty' });
  }
  for (const [family, names] of Object.entries(addressVariables)) for (const name of names) {
    if (!Object.hasOwn(env, name)) continue;
    if (patterns[family].test(env[name])) accounts.push({ family, name, address: env[name], status: 'address_only', path: 'environment' });
    else note(family, name, 'invalid_address');
  }
  const aleo = accounts.filter(item => item.family === 'aleo');
  const accountStatus = aleo.some(item => item.status === 'saved') ? 'configured'
    : aleo.length || issues.some(item => item.family === 'aleo') ? 'unavailable'
      : sources.some(item => item.family === 'aleo') ? 'not_checked' : 'missing';
  return { version: 1, checkedAt: new Date().toISOString(), project,
    checks: { tools: { status: tools.length ? 'available' : 'missing' }, account: { status: accountStatus }, funding: { status: 'not_checked' } },
    accounts, sources, tools: tools.sort((a, b) => a.name.localeCompare(b.name) || a.path.localeCompare(b.path)), issues,
    scope: { accountDirectories: directories, walletDirectories: walletRoots, evmDirectories, solanaKeypair },
  };
}

const aleoReader = `
let reader;
try { reader = (await import('@provablehq/veil-aleo-sdk/node')).accountInfo; } catch {}
if (typeof reader !== 'function') { console.log(JSON.stringify({supported:false})); }
else {
  let input = ''; for await (const chunk of process.stdin) input += chunk;
  const accounts = [];
  for (const entry of JSON.parse(input)) {
    try {
      const info = await reader({name:entry.name, dir:entry.directory});
      accounts.push(info ? {address:info.address, storage:info.storage} : {status:'unavailable'});
    } catch { accounts.push({status:'unavailable'}); }
  }
  console.log(JSON.stringify({supported:true, accounts}));
}`;

if (process.argv[1] && await realpath(process.argv[1]).catch(() => '') === fileURLToPath(import.meta.url)) {
  try {
    const { values } = parseArgs({ options: { project: { type: 'string' }, python: { type: 'string' },
      'accounts-dir': { type: 'string', multiple: true }, 'wallet-dir': { type: 'string', multiple: true },
      json: { type: 'boolean' }, width: { type: 'string' } } });
    const report = await inspectSetup({ project: values.project, python: values.python,
      accountDirectories: values['accounts-dir'], walletDirectories: values['wallet-dir'] });
    console.log(values.json ? JSON.stringify(report, null, 2) : renderWelcome(report, { width: Number(values.width ?? 100) }));
  } catch {
    console.error('Setup inspection could not finish. Keep the accounts and tools marked as not checked.');
    process.exitCode = 1;
  }
}
