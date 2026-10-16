const test = require('node:test');
const assert = require('node:assert');
const { cleanText, visibleServerIds, clubLine } = require('./network.cjs');

test('cleanText strips links, invites and mentions, and caps the length', () => {
  const out = cleanText('Need a CB <@123456789012345678> @everyone join discord.gg/abc https://x.com/y tonight');
  assert.strictEqual(out, 'Need a CB join tonight');
  assert.ok(cleanText('a'.repeat(500)).length <= 200);
  assert.strictEqual(cleanText(''), '');
  assert.strictEqual(cleanText(null), '');
});

test('cleanText masks blocked words, including ones added by env', () => {
  assert.strictEqual(cleanText('what the fuck'), 'what the f***');
  process.env.NETWORK_BLOCKED_WORDS = 'muppet';
  try {
    assert.strictEqual(cleanText('you muppets'), 'you m******');
  } finally {
    delete process.env.NETWORK_BLOCKED_WORDS;
  }
});

test('visibleServerIds hides self, off, suspended and blocked servers in both directions', () => {
  const rows = [
    { guild_id: 'me', enabled: true },
    { guild_id: 'a', enabled: true },
    { guild_id: 'b', enabled: false },
    { guild_id: 'c', enabled: true, suspended_at: '2026-10-16T00:00:00Z' },
    { guild_id: 'd', enabled: true },
    { guild_id: 'e', enabled: true },
  ];
  const blocks = [
    { guild_id: 'me', blocked_guild_id: 'd' },
    { guild_id: 'e', blocked_guild_id: 'me' },
  ];
  assert.deepStrictEqual(visibleServerIds(rows, blocks, 'me'), ['a']);
});

test('clubLine shows only public club info', () => {
  const line = clubLine({ name: 'Palermo Pros', platform: 'common-gen5', division: 3, skill: 1450, stats: { wins: 10, draws: 2, losses: 4 }, region: 'Europe', serverName: null });
  assert.strictEqual(line, '**Palermo Pros** · PS5 / Xbox Series / PC · Div 3 · SR 1450 · 10W 2D 4L · Europe');
  assert.match(clubLine({ name: 'New FC' }), /no EA stats yet/);
});

const { faMatches, isOpen } = require('./network-replacements.cjs');

test('faMatches: main or second position, same EA platform, still listed and contactable', () => {
  const now = Date.parse('2026-10-16T20:00:00Z');
  const req = { position: 'CB', platform: 'common-gen5' };
  const fa = { status: 'looking', no_contact: false, updated_at: '2026-10-10T00:00:00Z', position: 'CB', platform: 'ps5' };
  assert.ok(faMatches(fa, req, now));
  assert.ok(faMatches({ ...fa, position: 'RB', secondary_position: 'CB', platform: 'xbox-series-xs' }, req, now));
  assert.ok(!faMatches({ ...fa, position: 'ST' }, req, now));
  assert.ok(!faMatches({ ...fa, platform: 'switch' }, req, now));
  assert.ok(!faMatches({ ...fa, no_contact: true }, req, now));
  assert.ok(!faMatches({ ...fa, status: 'off' }, req, now));
  assert.ok(!faMatches({ ...fa, updated_at: '2026-09-01T00:00:00Z' }, req, now));
});

test('isOpen: open until it expires', () => {
  const now = Date.parse('2026-10-16T20:00:00Z');
  assert.ok(isOpen({ status: 'open', expires_at: '2026-10-16T21:00:00Z' }, now));
  assert.ok(!isOpen({ status: 'open', expires_at: '2026-10-16T19:00:00Z' }, now));
  assert.ok(!isOpen({ status: 'filled', expires_at: '2026-10-16T21:00:00Z' }, now));
});
