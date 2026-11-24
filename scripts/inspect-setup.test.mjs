import assert from 'node:assert/strict';
import { chmod, cp, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { inspectSetup, runProbe } from '../tools/inspect-setup.mjs';
import { renderWelcome } from '../tools/welcome.mjs';

const aleo = 'aleo1' + 'q'.repeat(58);
const evm = '0x' + '1'.repeat(40);
const solana = '1'.repeat(32);
const secret = 'PRIVATE_TEST_SENTINEL_DO_NOT_REPORT';

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'shield-setup-inventory-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const home = join(root, 'home'), project = join(root, 'project'), bin = join(root, 'bin');
  await Promise.all([home, project, bin].map(path => mkdir(path)));
  return { root, home, project, bin, env: { PATH: bin } };
}
async function put(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, typeof value === 'string' ? value : JSON.stringify(value));
}
async function command(directory, name) {
  const path = join(directory, name);
  await put(path, '#!/bin/sh\nexit 1\n');
  await chmod(path, 0o700);
  return path;
}
const success = value => ({ ok: true, stdout: typeof value === 'string' ? value : JSON.stringify(value), stderr: '' });

test('discovers saved accounts across families without exposing credentials or changing funding', async t => {
  const f = await fixture(t);
  const cli = await command(f.bin, 'shield-swap');
  const accountFile = join(f.home, '.aleo/accounts/trading.json');
  await put(accountFile, { privateKey: secret });
  for (const [family, address] of [['evm', evm], ['solana', solana]]) {
    await put(join(f.home, '.aleo/funding-wallets', family, 'wallet.json'), {
      version: 1, service: 'shield-swap-funding', family, address, storage: 'os-keyring', credentialId: secret,
    });
  }
  await put(join(f.home, '.foundry/keystores/source'), { version: 3, address: evm.slice(2), crypto: { ciphertext: secret } });
  await put(join(f.home, '.config/solana/id.json'), secret);
  const calls = [];
  const report = await inspectSetup({ ...f, env: { ...f.env, EVM_PRIVATE_KEY: secret, SHIELD_SWAP_PRIVATE_KEY: '' },
    probe: async (path, args) => {
      calls.push([path, args]);
      assert.ok(path === cli || path === process.execPath);
      return args[0] === '--version' ? success('shield-swap 0.16.2')
        : success({ address: aleo, storage: 'keychain', privateKey: secret });
    } });
  assert.equal(report.accounts.filter(a => a.status === 'saved').length, 4);
  assert.equal(report.accounts.find(a => a.name === 'Solana CLI keypair').status, 'key_file_found');
  assert.equal(report.checks.account.status, 'configured');
  assert.equal(report.checks.funding.status, 'not_checked');
  assert.equal(report.sources.find(s => s.name === 'SHIELD_SWAP_PRIVATE_KEY').status, 'empty');
  assert.ok(calls.some(([, args]) => args.join(' ').startsWith('account show --name trading --dir ')));
  assert.equal(await readFile(accountFile, 'utf8'), JSON.stringify({ privateKey: secret }));
  assert.doesNotMatch(JSON.stringify(report), new RegExp(secret));
  const screen = renderWelcome(report);
  assert.doesNotMatch(screen, new RegExp(secret));
  assert.ok(screen.indexOf('**ACCOUNTS**') < screen.indexOf('**TOOLS**'));
  assert.ok(screen.indexOf('**TOOLS**') < screen.indexOf('**GET STARTED**'));
  assert.equal(screen.match(/\*\*EVM ·/g).length, 2); // One merged saved address and one unverified key source.
  assert.match(screen, /Version|0\.16\.2/);
  assert.match(screen, /Access not checked/);
});

test('retains saved names when no compatible SDK exists and distinguishes bad metadata from absence', async t => {
  const f = await fixture(t);
  await put(join(f.home, '.aleo/accounts/default.json'), { privateKey: secret });
  await put(join(f.project, 'funding/broken/wallet.json'), '{not-json');
  await symlink(join(f.home, '.aleo/accounts/default.json'), join(f.home, '.aleo/accounts/linked.json'));
  const report = await inspectSetup(f);
  assert.equal(report.accounts.length, 1);
  assert.equal(report.accounts[0].name, 'default');
  assert.equal(report.accounts[0].status, 'metadata_unavailable');
  assert.equal(report.checks.account.status, 'unavailable');
  assert.ok(report.issues.some(i => i.code === 'entry_skipped'));
  const screen = renderWelcome(report);
  assert.match(screen, /Account file found; details unavailable/);
  assert.match(screen, /Could not check all account locations/);
  assert.doesNotMatch(screen, /Not configured|PRIVATE_TEST_SENTINEL/);
});

test('checks explicit and standard locations without searching unrelated projects or following wallet symlinks', async t => {
  const f = await fixture(t);
  const custom = join(f.root, 'custom accounts');
  await put(join(custom, 'trading.json'), {});
  await put(join(f.home, '.aleo/accounts/trading.json'), {});
  const wallet = { version: 1, service: 'shield-swap-funding', family: 'evm', address: evm, storage: 'os-keyring' };
  await put(join(f.root, 'custom wallet/wallet.json'), wallet);
  await put(join(f.root, 'unrelated/wallet.json'), wallet);
  await mkdir(join(f.project, 'funding'));
  await symlink(join(f.root, 'unrelated'), join(f.project, 'funding/linked'));
  const report = await inspectSetup({ ...f, env: { ...f.env, ALEO_ACCOUNTS_DIR: custom },
    walletDirectories: [join(f.root, 'custom wallet')] });
  assert.equal(report.accounts.filter(a => a.family === 'aleo').length, 2);
  assert.equal(report.accounts.filter(a => a.family === 'evm').length, 1);
  assert.equal(report.accounts.find(a => a.family === 'evm').name, 'custom wallet');
});

test('reports installed versions and locations per environment; declarations alone do not count', async t => {
  const f = await fixture(t);
  await command(f.bin, 'node');
  const npm = await command(f.bin, 'npm');
  const py = await command(join(f.project, '.venv/bin'), 'python');
  const pyAlias = await command(f.bin, 'python3');
  await put(join(f.project, 'package.json'), { dependencies: { '@solana/kit': 'latest' } });
  const local = join(f.project, 'node_modules/@provablehq/shield-swap-sdk');
  const global = join(f.root, 'global/node_modules/@provablehq/shield-swap-sdk');
  await put(join(local, 'package.json'), { name: '@provablehq/shield-swap-sdk', version: '0.16.2' });
  await put(join(global, 'package.json'), { name: '@provablehq/shield-swap-sdk', version: '0.15.1' });
  const report = await inspectSetup({ ...f, probe: async (path, args) => {
    if (path === npm && args[0] === 'root') return success(dirname(dirname(global)) + '\n');
    if (path === py || path === pyAlias) return success({ version: '3.13.2', prefix: dirname(dirname(py)),
      packages: [{ name: 'shield-swap-sdk', version: '0.9.0', path: join(f.project, '.venv/lib/site-packages'), key: secret }] });
    return success('v22.13.0');
  } });
  assert.equal(report.tools.filter(tool => tool.name === 'Python').length, 1);
  assert.equal(report.tools.find(tool => tool.name === 'node').version, '22.13.0');
  const sdk = report.tools.filter(tool => tool.name === '@provablehq/shield-swap-sdk');
  assert.deepEqual(new Set(sdk.map(tool => tool.version)), new Set(['0.16.2', '0.15.1']));
  const globalPath = await realpath(global), localPath = await realpath(local);
  assert.ok(sdk.some(tool => tool.path === globalPath && tool.environment === 'global'));
  assert.ok(sdk.some(tool => tool.path === localPath && tool.environment === f.project));
  assert.ok(!report.tools.some(tool => tool.name === '@solana/kit'));
  assert.equal(report.tools.find(tool => tool.name === 'shield-swap-sdk').environment, py);
  assert.doesNotMatch(JSON.stringify(report), new RegExp(secret));
});

test('failed probes retain installation evidence without printing their output', async t => {
  const f = await fixture(t);
  const node = await command(f.bin, 'node');
  const report = await inspectSetup({ ...f, probe: async () => ({ ok: false, stdout: secret, stderr: secret }) });
  assert.deepEqual(report.tools, [{ name: 'node', kind: 'runtime', path: node, version: null }]);
  assert.match(renderWelcome(report), /Version unavailable/);
  assert.doesNotMatch(JSON.stringify(report), new RegExp(secret));
  const timed = await runProbe(process.execPath, ['-e', 'setTimeout(() => {}, 30000)'], { timeout: 30 });
  assert.equal(timed.ok, false);
});

test('the Veil metadata reader uses public API fields and keeps per-account failures visible', async t => {
  const f = await fixture(t);
  const sdk = join(f.project, 'node_modules/@provablehq/veil-aleo-sdk');
  await put(join(sdk, 'package.json'), { name: '@provablehq/veil-aleo-sdk', version: '1.0.0', type: 'module', exports: { './node': './node.js' } });
  await put(join(sdk, 'node.js'), `export function accountInfo({ name }) {
    if (name === 'broken') throw new Error('${secret}');
    return { address: '${aleo}', storage: 'encrypted', privateKey: '${secret}' };
  }
  export function loadAccount() { throw new Error('Must not load a private key'); }`);
  await put(join(f.home, '.aleo/accounts/trading.json'), secret);
  await put(join(f.home, '.aleo/accounts/broken.json'), secret);
  const report = await inspectSetup(f);
  assert.equal(report.accounts.find(item => item.name === 'trading').address, aleo);
  assert.equal(report.accounts.find(item => item.name === 'broken').status, 'metadata_unavailable');
  assert.doesNotMatch(JSON.stringify(report), new RegExp(secret));
});

test('an installed project CLI can inspect accounts without being on PATH', async t => {
  const f = await fixture(t);
  const cli = await command(join(f.project, 'node_modules/.bin'), 'shield-swap');
  await put(join(f.home, '.aleo/accounts/trading.json'), secret);
  const report = await inspectSetup({ ...f, probe: async (path, args) => {
    assert.ok(path === cli || path === process.execPath);
    return args[0] === '--version' ? success('0.16.2') : success({ address: aleo, storage: 'none' });
  } });
  assert.equal(report.accounts[0].address, aleo);
  assert.equal(report.tools.find(tool => tool.name === 'shield-swap').path, cli);
  assert.equal(report.tools.find(tool => tool.name === 'shield-swap').environment, f.project);
});

test('Python inspection reads distribution metadata without importing SDKs and only exports public account fields', async t => {
  const f = await fixture(t);
  const modules = join(f.root, 'python-modules');
  await put(join(modules, 'aleo_sdk-9.9.9.dist-info/METADATA'), 'Metadata-Version: 2.1\nName: aleo-sdk\nVersion: 9.9.9\n');
  await put(join(modules, 'aleo/__init__.py'), `raise RuntimeError('${secret}')`);
  const helper = fileURLToPath(new URL('../tools/inspect-python.py', import.meta.url));
  const env = { PATH: process.env.PATH, HOME: f.home, PYTHONPATH: modules, PYTHONDONTWRITEBYTECODE: '1' };
  const packages = await runProbe('python3', [helper, 'packages'], { env });
  assert.ok(packages.ok);
  assert.equal(JSON.parse(packages.stdout).packages.find(pkg => pkg.name === 'aleo-sdk').version, '9.9.9');
  await put(join(modules, 'aleo/__init__.py'), '');
  await put(join(modules, 'aleo/keystore.py'), `from types import SimpleNamespace
def info(*, name, dir):
    if name == 'broken':
        raise RuntimeError('${secret}')
    return SimpleNamespace(address='${aleo}', storage='keychain', private_key='${secret}')
def load(*args, **kwargs):
    raise RuntimeError('Must not load a private key')
`);
  const result = await runProbe('python3', [helper, 'accounts'], { env,
    input: JSON.stringify([{ name: 'trading', directory: f.home }, { name: 'broken', directory: f.home }]) });
  assert.ok(result.ok);
  assert.deepEqual(JSON.parse(result.stdout), { supported: true,
    accounts: [{ address: aleo, storage: 'keychain' }, { status: 'unavailable' }] });
  assert.doesNotMatch(result.stdout + result.stderr, new RegExp(secret));
});

test('a copied inspector runs outside the kit with no SDK dependencies or private account access', async t => {
  const f = await fixture(t);
  const copied = join(f.root, 'installed/tools');
  const source = join(dirname(fileURLToPath(import.meta.url)), '../tools');
  await mkdir(copied, { recursive: true });
  for (const name of ['inspect-setup.mjs', 'inspect-python.py', 'welcome.mjs']) await cp(join(source, name), join(copied, name));
  const result = await runProbe(process.execPath, [join(copied, 'inspect-setup.mjs'), '--project', f.project, '--json'],
    { cwd: f.project, env: { HOME: f.home, PATH: f.bin }, timeout: 10000 });
  assert.ok(result.ok, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.project, f.project);
  assert.equal(report.checks.account.status, 'missing');
  assert.deepEqual(report.accounts, []);
  assert.deepEqual(report.sources, []);
  assert.equal(report.tools.find(tool => tool.name === 'node').version, process.versions.node);
});
