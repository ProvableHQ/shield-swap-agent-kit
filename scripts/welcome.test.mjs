import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { banner, renderWelcome } from '../tools/welcome.mjs';

function assertIntro(screen) {
  assert.ok(screen.startsWith('```text\n' + banner + '\n\nPrivate asset trading'));
  for (const label of ['Tools', 'Aleo account', 'Funding', 'GET STARTED', 'STRATEGIES', 'INTEGRATIONS [Coming Soon]']) {
    assert.ok(screen.includes(label), label);
  }
  assert.deepEqual([...screen.matchAll(/^(\d)\. \*\*([^*]+)\*\*(.*)$/gm)].map(match => [match[1], (match[2] + match[3]).replace(/\\$/, '').trimEnd()]), [
    ['1', 'Configure an Aleo account for Shield Swap'],
    ['2', 'Fund an account'],
    ['3', 'Explore markets'],
    ['4', 'Setup a private trading integration'],
    ['5', 'Create an arbitrage bot'],
    ['6', 'Hummingbot: Add a privacy layer to hummingbot.'],
    ['7', 'Hyperliquid: Trade perpetual futures privately on Hyperliquid.'],
    ['8', 'Prediction Markets: Create a private vault around prediction market trades.'],
  ]);
  const box = screen.split('\n').filter(line => /^[╭│╰]/u.test(line));
  assert.deepEqual(box.map(line => [...line].length), [60, 60, 60, 60, 60]);
  const menu = screen.split('```\n\n')[1];
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
  const menu = renderWelcome().split('```\n\n')[1];
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
});
