const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const G = require('./graphics.cjs');
const { createAutopilot } = require('./autopilot.cjs');
const { createBroadcast } = require('./broadcast.cjs');

// Minimal chainable Supabase stand-in: every query on a table resolves to that table's rows
function fakeSupabase(tables, seen = []) {
  return {
    from(table) {
      const filters = [];
      const q = {
        select: () => q, order: () => q, limit: () => q, neq: () => q, gte: () => q, lte: () => q,
        eq: (k, v) => (filters.push(['eq', k, v]), q),
        in: (k, v) => (filters.push(['in', k, v]), q),
        maybeSingle: () => Promise.resolve({ data: (tables[table] || [])[0] || null }),
        then: (ok, bad) => {
          seen.push({ table, filters });
          const rows = (tables[table] || []).filter((r) => filters.every(([op, k, v]) => (op === 'eq' ? r[k] === undefined || r[k] === v : !(k in r) || v.includes(r[k]))));
          return Promise.resolve({ data: rows }).then(ok, bad);
        },
      };
      return q;
    },
  };
}

const pixel = (color) => `data:image/png;base64,${Buffer.from(G.render(`<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="${color}"/></svg>`)).toString('base64')}`;

const row = {
  id: 'm1', guild_id: 'g1', club_key: 'c1', created_at: '2026-10-11T00:30:00Z', result: 'win', score_for: 3, score_against: 1,
  opponent_club_name: 'Rivals FC', match_type: 'leagueMatch',
  player_stats: [
    { ea_username: 'Striker9', position: 'ST', goals: 2, assists: 0, rating: 8.6, motm: true, shots: 4, tackles: 1, interceptions: 0 },
    { ea_username: 'Maestro', position: 'CAM', goals: 1, assists: 2, rating: 8.1, tackles: 2, interceptions: 3 },
  ],
};
const club = { key: 'c1', name: 'Calcio Roma', autopilot: {} };

function autopilotWith(extra = {}) {
  return createAutopilot({
    supabase: fakeSupabase({ club_matches: [row] }),
    events: { getClient: () => ({ guilds: { cache: new Map() } }), serverPrefs: async () => ({}), onTick: () => {}, onClose: () => {} },
    ...extra,
  });
}

test('the bundled AI action backgrounds are gone from the recap graphic', () => {
  assert.ok(!fs.existsSync(path.join(__dirname, 'assets', 'backgrounds')));
  assert.ok(!/actionBackground|assets', 'backgrounds/.test(fs.readFileSync(path.join(__dirname, 'graphics.cjs'), 'utf8')));
  const base = { clubName: 'Club', opponentName: 'Other', result: 'win', players: [], motm: null };
  assert.notDeepEqual(G.recapGraphic({ ...base, background: pixel('#ff00ff') }), G.recapGraphic(base));
});

test('without an image the recap is one compact card', async () => {
  const msg = await autopilotWith().buildRecap(row, club);
  const e = msg.embeds[0].toJSON();
  assert.equal(e.title, '🟢 WIN · Calcio Roma 3-1 Rivals FC');
  assert.deepEqual(e.fields || [], []);
  const lines = e.description.split('\n');
  assert.ok(lines.length <= 5, e.description);
  assert.match(e.description, /^📰 /);
  assert.match(e.description, /⚽ Striker9 ×2, Maestro · 🎯 Maestro ×2 · ⭐ Striker9 \(8\.6\)/);
  assert.match(e.description, /-# Form 🟢$/);
});

test('with the recap image the text only adds what the image does not show', async () => {
  const ap = autopilotWith();
  let asked;
  ap.setRecapImage(async (args) => ((asked = args), Buffer.from('png')));
  const msg = await ap.buildRecap(row, club);
  const e = msg.embeds[0].toJSON();
  assert.equal(msg.files[0].name, 'recap.png');
  assert.equal(e.image.url, 'attachment://recap.png');
  assert.deepEqual(e.fields || [], []);
  // Headline, scorers, Man of the Match and the talking point are all in the image
  assert.ok(!/📰|⚽|🎯|⭐|Form/.test(e.description || ''), e.description);
  assert.ok(asked.headline);
});

test('recap background is an original upload from a match player, never generated art', async () => {
  const seen = [];
  const supabase = fakeSupabase({
    profiles: [{ discord_user_id: '111111111111', ea_username: 'Striker9' }, { discord_user_id: '222222222222', ea_username: 'Maestro' }],
    pro_photo_assets: [
      { discord_user_id: '222222222222', image_url: pixel('#00ff00'), source_kind: 'upload' },
      { discord_user_id: '111111111111', image_url: pixel('#0000ff'), source_kind: 'generated' },
    ],
    pro_photos: [],
  }, seen);
  const b = createBroadcast({ supabase, premium: {}, events: { onTick: () => {}, getClient: () => null }, autopilot: { setRecapImage: () => {} } });
  // Striker9 only has generated art, so the backdrop comes from Maestro's own upload
  assert.equal(await b.backgroundFor(['Striker9', 'Maestro'], 'm1'), pixel('#00ff00'));
  assert.ok(seen.some((q) => q.table === 'pro_photo_assets' && q.filters.some(([op, k, v]) => op === 'eq' && k === 'source_kind' && v === 'upload')));
  assert.equal(await b.backgroundFor([], 'm1'), null);
});
