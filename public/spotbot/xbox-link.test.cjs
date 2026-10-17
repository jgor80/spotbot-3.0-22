const test = require('node:test');
const assert = require('node:assert');
const { createXboxLink, gamertagFor, pickExact } = require('./xbox-link.cjs');

test('only looks up players we know are on Xbox', () => {
  assert.strictEqual(gamertagFor({ xbox_gamertag: 'Verified GT', ea_username: 'x', ea_platform: 'ps5' }), 'Verified GT');
  assert.strictEqual(gamertagFor({ ea_username: 'Pro9', ea_platform: 'xbox-series-xs' }), 'Pro9');
  assert.strictEqual(gamertagFor({ ea_username: 'Pro9', ea_platform: 'ps5' }), null);
  assert.strictEqual(gamertagFor({ ea_username: 'Pro9' }), null);
});

test('never takes a near match', () => {
  const people = [{ xuid: '1', gamertag: 'Pro9x' }, { xuid: '2', gamertag: 'pro9' }];
  assert.strictEqual(pickExact(people, 'Pro9').xuid, '2');
  assert.strictEqual(pickExact([{ xuid: '1', gamertag: 'Pro9x' }], 'Pro9'), null);
});

function fakeSupabase(rows) {
  const updates = [];
  const q = {
    select: () => q, is: () => q, or: () => q, eq: () => q,
    limit: async () => ({ data: rows, error: null }),
    update: (fields) => ({ eq: async (_c, id) => { updates.push({ id, ...fields }); return { error: null }; } }),
  };
  return { updates, from: () => q };
}

test('backfill saves found accounts, marks misses and skips placeholders and recent misses', async () => {
  const rows = [
    { discord_user_id: '10', ea_username: 'Pro9', ea_platform: 'xbox-series-xs' },
    { discord_user_id: '11', xbox_gamertag: 'Nobody' },
    { discord_user_id: 'ea_Temp', ea_username: 'Temp', ea_platform: 'xbox-series-xs' },
    { discord_user_id: '12', ea_username: 'Old', ea_platform: 'xbox-series-xs', xbox_lookup_at: new Date().toISOString() },
  ];
  const sb = fakeSupabase(rows);
  const calls = [];
  const fetchFn = async (url) => {
    calls.push(url);
    const people = url.endsWith('/Pro9') ? [{ xuid: '2535', gamertag: 'Pro9' }] : [];
    return { ok: true, status: 200, json: async () => ({ people }) };
  };
  const out = await createXboxLink({ supabase: sb, apiKey: 'k', fetchFn }).backfill();
  assert.deepStrictEqual(out, { linked: 1, not_found: 1, skipped: 0 });
  assert.strictEqual(calls.length, 2);
  assert.strictEqual(sb.updates.find((u) => u.id === '10').xbox_xuid, '2535');
  assert.ok(sb.updates.find((u) => u.id === '11').xbox_lookup_at);
  assert.strictEqual(sb.updates.find((u) => u.id === '11').xbox_xuid, undefined);
});

test('backfill stops on rate limit', async () => {
  const rows = [1, 2, 3].map((i) => ({ discord_user_id: String(i), xbox_gamertag: `G${i}` }));
  let n = 0;
  const fetchFn = async () => { n += 1; return { ok: false, status: 429 }; };
  const out = await createXboxLink({ supabase: fakeSupabase(rows), apiKey: 'k', fetchFn }).backfill();
  assert.strictEqual(n, 1);
  assert.strictEqual(out.linked, 0);
});
