import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { banner, renderInspection, renderWelcome } from '../tools/welcome.mjs';

function assertIntro(screen) {
  assert.ok(screen.startsWith('```text\n' + banner + '\n\nPrivate asset trading'));
  for (const label of ['Tools', 'Aleo account', 'Funding', 'GET STARTED', 'STRATEGIES', 'INTEGRATIONS [Coming Soon]', 'CHECK YOUR SETUP']) {
    assert.ok(screen.includes(label), label);
  }
  assert.deepEqual([...screen.matchAll(/^(\d+)\. \*\*([^*]+)\*\*(.*)$/gm)].map(match => [match[1], (match[2] + match[3]).replace(/\\$/, '').trimEnd()]), [
    ['1', 'Configure an Aleo account for Shield Swap'],
    ['2', 'Fund an account'],
    ['3', 'Explore markets'],
    ['4', 'Setup a private trading integration'],
    ['5', 'Create an arbitrage bot'],
    ['6', 'Hummingbot: Add a privacy layer to hummingbot.'],
    ['7', 'Hyperliquid: Trade perpetual futures privately on Hyperliquid.'],
    ['8', 'Prediction Markets: Create a private vault around prediction market trades.'],
    ['9', 'Check existing accounts'],
    ['10', 'Check existing setup'],
  ]);
  const box = screen.split('\n').filter(line => /^[╭│╰]/u.test(line));
  assert.deepEqual(box.map(line => [...line].length), [60, 60, 60, 60, 60]);
  const menu = screen.slice(screen.indexOf('**GET STARTED**'));
  assert.ok(menu.startsWith('**GET STARTED**'));
  assert.doesNotMatch(menu, /```/);
  assert.match(menu, /^   Setup an Aleo account to trade privately on Shield Swap\.$/m);
}

test('new users see the unchanged heading and setup box with the full numbered menu', () => {
  const screen = renderWelcome({ checks: { account: { status: 'missing' } } });
  assertIntro(screen);
  assert.match(screen, /1\. \*\*Configure an Aleo account for Shield Swap\*\*/);
  assert.match(screen, /2\. \*\*Fund an account\*\*/);
});

test('the renderer and installed agent guide show the same menu', async () => {
  const guide = await readFile(new URL('../context/getting-started.md', import.meta.url), 'utf8');
  const welcome = renderWelcome();
  const menu = welcome.slice(welcome.indexOf('**GET STARTED**'));
  assert.ok(guide.includes(menu));
});

test('configured and funded accounts retain the whole introduction on repeated visits', () => {
  for (const status of ['configured', 'usable']) {
    const report = { checks: { tools: { status: 'available' }, account: { status }, funding: { status: 'available' } } };
    assertIntro(renderWelcome(report));
    assertIntro(renderWelcome(report));
    assert.match(renderWelcome(report), /Private funds found/);
  }
});

test('historical notes and backend details cannot turn unchecked funding into a funded claim', () => {
  const screen = renderWelcome({
    profileId: '/private/account-path', previouslyFunded: true,
    checks: { account: { status: 'configured', network: 'testnet' }, funding: { status: 'not_checked', history: 'funded yesterday', error: 'SECRET' } },
  });
  assertIntro(screen);
  assert.match(screen, /Funding\s+Not checked/);
  assert.doesNotMatch(screen, /funded yesterday|testnet|SECRET|account-path|Private funds found/);
  assert.match(renderWelcome({ checks: { funding: { status: 'unavailable' } } }), /Could not check/);
});

test('narrow displays retain a plain heading, tagline, status and choices', () => {
  const screen = renderWelcome({}, { width: 80 });
  assert.ok(screen.startsWith('```text\nSHIELD SWAP\n\nPrivate asset trading'));
  assert.match(screen, /4\. \*\*Setup a private trading integration\*\*/);
  assert.match(screen, /5\. \*\*Create an arbitrage bot\*\*/);
  assert.doesNotMatch(screen, /\u001b/);
  assert.match(screen, /\*\*Aleo\*\* · Not checked/);
  assert.match(screen, /Local tools not checked/);
  assert.doesNotMatch(screen, /None found in checked locations/);
});

test('inventory keeps the setup box and menu while showing account access and exact tool locations', () => {
  const screen = renderWelcome({ checks: { account: { status: 'configured' } }, accounts: [
    { family: 'aleo', name: 'trading', address: 'aleo1' + 'q'.repeat(58), storage: 'encrypted', status: 'saved', privateKey: 'SECRET' },
    { family: 'evm', name: 'browser', address: '0x' + '1'.repeat(40), status: 'locked' },
  ], tools: [{ name: 'shield-swap', version: '0.16.2', path: '/opt/bin/shield-swap', stderr: 'SECRET' }],
    connections: [{ name: 'Shield', status: 'setup_required', error: 'SECRET',
      location: 'https://user:SECRET@example.com/mcp?token=SECRET#SECRET' }] });
  assert.match(screen, /Encrypted file · Access not checked/);
  assert.match(screen, /Unlock required/);
  assert.match(screen, /\*\*Solana\*\* · None found in checked locations/);
  assert.match(screen, /\*\*shield-swap\*\* · 0\.16\.2/);
  assert.match(screen, /\/opt\/bin\/shield-swap/);
  assert.match(screen, /Connection setup required · Version not reported/);
  assert.match(screen, /https:\/\/example\.com\/mcp/);
  assert.doesNotMatch(screen, /SECRET/);
  assert.deepEqual([...screen.matchAll(/^(\d+)\. \*\*/gm)].map(match => match[1]), ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10']);
  const box = screen.split('\n').filter(line => /^[╭│╰]/u.test(line));
  assert.deepEqual(box.map(line => [...line].length), [60, 60, 60, 60, 60]);
});

test('merging the same address retains each connection access status', () => {
  const address = '0x' + '1'.repeat(40);
  const screen = renderWelcome({ accounts: [
    { family: 'evm', name: 'local', address, storage: 'encrypted', status: 'saved' },
    { family: 'evm', name: 'browser', address, status: 'usable' },
  ], tools: [] });
  assert.equal(screen.match(/\*\*EVM ·/g).length, 1);
  assert.match(screen, /local: Access not checked; browser: Access verified/);
});

test('explicit inspection shows full account details without repeating onboarding', () => {
  const address = 'aleo1' + 'q'.repeat(58);
  const report = { project: '/projects/bot', accounts: [{ family: 'aleo', name: 'trading', address,
    path: '/accounts/trading.json', status: 'saved', storage: 'keychain' }],
    tools: [{ name: 'node', version: '24.12.0', path: '/bin/node' }],
    connections: [{ name: 'Shield', status: 'locked' }] };
  const accounts = renderInspection(report, 'accounts');
  assert.ok(accounts.includes(address));
  assert.match(accounts, /Location \(trading\): \/accounts\/trading\.json/);
  assert.doesNotMatch(accounts, /\*\*TOOLS\*\*|GET STARTED|YOUR SETUP|SHIELD SWAP|\/bin\/node/);
  const setup = renderInspection(report, 'setup');
  assert.match(setup, /Project: \/projects\/bot/);
  assert.match(setup, /24\.12\.0/);
  assert.match(setup, /\/bin\/node/);
  assert.match(setup, /Unlock required/);
  assert.doesNotMatch(setup, /GET STARTED|Create an arbitrage bot/);
});
