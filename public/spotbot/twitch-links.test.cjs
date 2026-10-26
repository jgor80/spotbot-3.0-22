const test = require('node:test');
const assert = require('node:assert');
const { Collection } = require('discord.js');
const { extractTwitchLogins, buildMatches, report, createTwitchLinks } = require('./twitch-links.cjs');

const msg = (id, authorId, content, mentions = []) => ({
  id,
  author: { id: authorId, bot: false },
  content,
  mentions: { users: new Collection(mentions.map((u) => [u, { id: u, bot: false }])) },
});

test('reads channel logins from twitch links and skips non-channel pages', () => {
  assert.deepStrictEqual(extractTwitchLogins('my stream https://www.twitch.tv/SamPlays_99 and twitch.tv/samplays_99'), ['samplays_99']);
  assert.deepStrictEqual(extractTwitchLogins('https://m.twitch.tv/abc123/videos/1'), ['abc123']);
  assert.deepStrictEqual(extractTwitchLogins('https://www.twitch.tv/videos/12345 twitch.tv/directory'), []);
  assert.deepStrictEqual(extractTwitchLogins('https://clips.twitch.tv/SomeClip and nottwitch.tv/x1y'), []);
});

test('links the author, or the one member they mention', () => {
  const { matches, problems } = buildMatches([
    msg('3', 'a', 'twitch.tv/alpha'),
    msg('2', 'b', '<@c> streams at twitch.tv/charlie', ['c']),
    msg('1', 'a', 'old one twitch.tv/alpha_old'),
  ]);
  assert.strictEqual(problems.length, 0);
  const a = matches.find((m) => m.userId === 'a');
  assert.strictEqual(a.login, 'alpha'); // newest message wins
  assert.deepStrictEqual(a.others, ['alpha_old']);
  assert.strictEqual(matches.find((m) => m.userId === 'c').login, 'charlie');
  assert.ok(!matches.some((m) => m.userId === 'b'));
});

test('leaves ambiguous ones alone', () => {
  const { matches, problems } = buildMatches([
    msg('5', 'a', 'twitch.tv/shared'),
    msg('4', 'b', 'twitch.tv/shared'),
    msg('3', 'c', '<@d> <@e> twitch.tv/dee', ['d', 'e']),
    msg('2', 'f', 'twitch.tv/newname'),
    msg('1', 'g', 'twitch.tv/gone'),
  ], { existing: new Map([['f', 'OldName']]), members: new Set(['a', 'b', 'c', 'd', 'e', 'f']) });
  assert.strictEqual(matches.length, 0);
  assert.deepStrictEqual(problems.map((p) => p.kind).sort(), ['different', 'left', 'mentions', 'shared', 'shared']);
});

test('already linked players are counted, not relinked', () => {
  const { matches } = buildMatches([msg('1', 'a', 'twitch.tv/Alpha')], { existing: new Map([['a', 'alpha']]) });
  assert.strictEqual(matches[0].already, true);
  assert.match(report({ matches, problems: [], scanned: 1, channelId: '9' }), /Nothing new to link/);
});

test('preview writes nothing; save upserts the clear matches', async () => {
  const writes = [];
  const supabase = {
    from: () => ({
      select: () => ({ in: async () => ({ data: [], error: null }) }),
      upsert: async (row) => { writes.push(row); return { error: null }; },
    }),
  };
  const messages = new Collection([['1', msg('1', 'a', 'twitch.tv/alpha')]]);
  const member = { id: 'a', displayName: 'Alpha', user: { username: 'alpha' } };
  const guild = { members: { me: {}, cache: new Collection([['a', member]]), fetch: async () => new Collection([['a', member]]) } };
  const channel = { id: '9', permissionsFor: () => ({ has: () => true }), messages: { fetch: async () => messages } };
  const links = createTwitchLinks({ supabase, getClient: () => ({ user: { id: 'bot' } }) });

  const preview = await links.importFromChannel({ guild, channel });
  assert.match(preview, /Ready to link \(1\)/);
  assert.strictEqual(writes.length, 0);

  const saved = await links.importFromChannel({ guild, channel, save: true });
  assert.match(saved, /Saved 1 Twitch link/);
  assert.strictEqual(writes[0].discord_user_id, 'a');
  assert.strictEqual(writes[0].twitch_username, 'alpha');
});
