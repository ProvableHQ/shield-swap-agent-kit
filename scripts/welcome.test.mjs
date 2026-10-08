import { test } from 'node:test';
import assert from 'node:assert/strict';
import { banner, renderWelcome } from '../tools/welcome.mjs';

function assertIntro(screen) {
  assert.ok(screen.startsWith(banner + '\n\nPrivate asset trading'));
  for (const label of ['Tools', 'Aleo account', 'Funding', 'Trade now', 'Connect trading tools', 'Build a strategy', 'Explore markets']) {
    assert.ok(screen.includes(label), label);
  }
  const box = screen.split('\n').filter(line => /^[╭│╰]/u.test(line));
  assert.deepEqual(box.map(line => [...line].length), [60, 60, 60, 60, 60]);
}

test('new users see the heading, two setup steps, and all four journeys', () => {
  const screen = renderWelcome({ checks: { account: { status: 'missing' } } });
  assertIntro(screen);
  assert.match(screen, /1\. Configure an Aleo account for Shield Swap/);
  assert.match(screen, /2\. Fund your account/);
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
  assert.ok(screen.startsWith('SHIELD SWAP\n\nPrivate asset trading'));
  assert.match(screen, /Connect trading tools/);
  assert.doesNotMatch(screen, /\u001b/);
});
