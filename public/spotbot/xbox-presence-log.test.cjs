const test = require('node:test');
const assert = require('node:assert');
const { createPresenceLog, presenceLines } = require('./xbox-presence-log.cjs');

test('keeps the top line and each title line', () => {
  const l = presenceLines({ presenceState: 'Online', presenceText: 'EA SPORTS FC 27', presenceDetails: [{ TitleId: '1', PresenceText: 'Clubs: 1-0 67\'', Device: 'Scarlett', IsPrimary: true }] });
  assert.strictEqual(l.text, 'EA SPORTS FC 27');
  assert.strictEqual(l.details[0].text, 'Clubs: 1-0 67\'');
});

test('saves only players in voice, only when their text changes', async () => {
  const inserted = [];
  const supabase = {
    from: (t) => t === 'profiles'
      ? { select: () => ({ in: () => ({ not: async () => ({ data: [{ discord_user_id: 'u1', xbox_xuid: '25', xbox_gamertag: 'GT' }] }) }) }) }
      : { insert: async (rows) => { inserted.push(...rows); return { error: null }; } },
  };
  const client = { guilds: { cache: new Map([['g', { id: 'g', voiceStates: { cache: new Map([['u1', { id: 'u1', channelId: 'c', member: { user: { bot: false } } }]]) } }]]) } };
  let text = 'Clubs: 0-0 5\'';
  const fetchFn = async () => ({ ok: true, json: async () => ({ people: [{ xuid: '25', gamertag: 'GT', presenceState: 'Online', presenceText: text }] }) });
  const log = createPresenceLog({ client, supabase, apiKey: 'k', fetchFn });
  await log.poll(); await log.poll();
  text = 'Clubs: 1-0 12\'';
  await log.poll();
  assert.deepStrictEqual(inserted.map((r) => r.presence_text), ['Clubs: 0-0 5\'', 'Clubs: 1-0 12\'']);
  assert.strictEqual(inserted[0].guild_id, 'g');
});
