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

// A fake profiles table: rows are { discord_user_id, twitch_username }
function fakeProfiles(rows, { upsertError = null } = {}) {
  const writes = [];
  const supabase = {
    from: () => ({
      select: () => ({ in: async (col, values) => ({ data: rows.filter((r) => values.includes(r[col])), error: null }) }),
      upsert: async (row) => { writes.push(row); return { error: upsertError }; },
    }),
  };
  return { supabase, writes };
}

function fakeChannel(list) {
  const members = new Collection(['a', 'b', 'z'].map((id) => [id, { id, displayName: id, user: { username: id } }]));
  const guild = { members: { me: {}, cache: members, fetch: async () => members } };
  const channel = { id: '9', permissionsFor: () => ({ has: () => true }), messages: { fetch: async () => new Collection(list.map((m) => [m.id, m])) } };
  return { guild, channel };
}

test('a login another profile already owns is never given to a second player', () => {
  const { matches, problems } = buildMatches([msg('1', 'a', 'twitch.tv/zed')], { owners: new Map([['zed', 'z']]) });
  assert.strictEqual(matches.length, 0);
  assert.deepStrictEqual(problems.map((p) => [p.kind, p.owner]), [['taken', 'z']]);
  // The owner reposting their own link is fine
  const own = buildMatches([msg('1', 'z', 'twitch.tv/zed')], { existing: new Map([['z', 'zed']]), owners: new Map([['zed', 'z']]) });
  assert.strictEqual(own.matches[0].already, true);
});

test('import checks owners outside the scanned channel and writes nothing for them', async () => {
  // z owns "zed" but never posted in this channel; a claims it
  const { supabase, writes } = fakeProfiles([{ discord_user_id: 'z', twitch_username: 'zed' }]);
  const { guild, channel } = fakeChannel([msg('2', 'a', 'twitch.tv/Zed'), msg('1', 'b', 'twitch.tv/bee')]);
  const links = createTwitchLinks({ supabase, getClient: () => ({ user: { id: 'bot' } }) });

  const preview = await links.importFromChannel({ guild, channel });
  assert.match(preview, /already linked to <@z>/);
  const saved = await links.importFromChannel({ guild, channel, save: true });
  assert.match(saved, /Saved 1 Twitch link/);
  assert.deepStrictEqual(writes.map((w) => [w.discord_user_id, w.twitch_username]), [['b', 'bee']]);
});

test('a unique-index clash at save time is reported, not counted as linked', async () => {
  const { supabase } = fakeProfiles([], { upsertError: { code: '23505', message: 'duplicate key' } });
  const { guild, channel } = fakeChannel([msg('1', 'a', 'twitch.tv/alpha')]);
  const links = createTwitchLinks({ supabase, getClient: () => ({ user: { id: 'bot' } }) });
  const saved = await links.importFromChannel({ guild, channel, save: true });
  assert.match(saved, /Saved 0 Twitch links/);
  assert.match(saved, /couldn't save \(linked to another player\)/);
});

test('the migration enforces one profile per Twitch login', () => {
  const sql = require('fs').readFileSync(require('path').join(__dirname, '../../supabase/migrations/20261026230000_profiles_twitch_username.sql'), 'utf8');
  assert.match(sql, /CREATE UNIQUE INDEX[\s\S]*lower\(twitch_username\)/i);
});
