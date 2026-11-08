// The gamertag → profile lookup that match ingest and linking share
const test = require('node:test');
const assert = require('node:assert');
const eaProfiles = require('./ea-profiles.cjs');

// Just enough of the Supabase client for profiles.ilike(...).limit(...)
function fakeDb(rows, { fail = false } = {}) {
  return {
    from: () => {
      let pattern = null;
      const q = {
        select: () => q,
        ilike: (_k, v) => { pattern = v; return q; },
        limit: async () => {
          if (fail) return { data: null, error: { message: 'boom' } };
          const lit = pattern.replace(/\\([\\%_])/g, '$1').toLowerCase();
          return { data: rows.filter((r) => String(r.ea_username).toLowerCase() === lit), error: null };
        },
      };
      return q;
    },
  };
}

test('a linked profile wins over a placeholder carrying the same gamertag', async () => {
  // The sync made ea_AceStriker before the player linked, so two rows share the name (in any case)
  const db = fakeDb([
    { discord_user_id: 'ea_AceStriker', ea_username: 'AceStriker' },
    { discord_user_id: '123456789012345678', ea_username: 'acestriker' },
  ]);
  assert.strictEqual((await eaProfiles.linkedProfileForGamertag(db, 'AceStriker')).discord_user_id, '123456789012345678');
  assert.strictEqual((await eaProfiles.profileForGamertag(db, 'ACESTRIKER')).discord_user_id, '123456789012345678');
  assert.deepStrictEqual(await eaProfiles.placeholderIdsForGamertag(db, 'AceStriker'), ['ea_AceStriker']);
});

test('placeholders are found whatever spelling made their ID', async () => {
  const db = fakeDb([
    { discord_user_id: 'ea_ace striker', ea_username: 'Ace Striker' },
    { discord_user_id: 'ea_Ace_Striker', ea_username: 'Ace Striker' },
  ]);
  assert.deepStrictEqual((await eaProfiles.placeholderIdsForGamertag(db, 'Ace Striker')).sort(), ['ea_Ace_Striker', 'ea_ace striker']);
  assert.strictEqual(await eaProfiles.linkedProfileForGamertag(db, 'Ace Striker'), null);
});

test('wildcards in a gamertag are matched literally', async () => {
  const db = fakeDb([{ discord_user_id: '1', ea_username: 'AceX10' }]);
  assert.strictEqual(eaProfiles.escapeLike('Ace_10%'), 'Ace\\_10\\%');
  assert.strictEqual(await eaProfiles.profileForGamertag(db, 'Ace_10'), null);
});

test('a failed lookup returns nothing instead of throwing', async () => {
  const quiet = console.error; console.error = () => {};
  try { assert.deepStrictEqual(await eaProfiles.profilesForGamertag(fakeDb([], { fail: true }), 'Ace'), []); }
  finally { console.error = quiet; }
});

test('new placeholders keep the spelling the EA sync has always used', () => {
  assert.strictEqual(eaProfiles.placeholderIdFor(' AceStriker '), 'ea_AceStriker');
});

// Table-backed fake with unique keys, so a blind move that would collide fails like Postgres does
function tableDb(tables) {
  const unique = {
    player_stats: (r) => r.ea_match_id == null ? null : [r.guild_id, r.discord_user_id, r.ea_match_id].join('|'),
    player_ratings: (r) => [r.guild_id, r.discord_user_id].join('|'),
    player_summary: (r) => [r.guild_id, r.discord_user_id].join('|'),
    player_club_stats: (r) => [r.guild_id, r.discord_user_id, r.club_key].join('|'),
    position_preferences: (r) => [r.guild_id, r.user_id].join('|'),
  };
  return {
    from(name) {
      const rows = tables[name] || (tables[name] = []);
      const filters = []; let op = 'select', payload = null, cap = Infinity;
      const q = {
        select() { return q; }, update(v) { op = 'update'; payload = v; return q; }, delete() { op = 'delete'; return q; },
        eq(k, v) { filters.push((r) => r[k] === v); return q; },
        in(k, vs) { filters.push((r) => vs.includes(r[k])); return q; },
        limit(n) { cap = n; return q; },
        then(res, rej) { return run().then(res, rej); },
      };
      async function run() {
        const hit = rows.filter((r) => filters.every((f) => f(r)));
        if (op === 'select') return { data: hit.slice(0, Math.min(cap, 1000)).map((r) => ({ ...r })), error: null };
        if (op === 'delete') { hit.forEach((r) => rows.splice(rows.indexOf(r), 1)); return { data: null, error: null }; }
        const key = unique[name];
        const after = rows.map((r) => (hit.includes(r) ? { ...r, ...payload } : r)).map(key).filter(Boolean);
        if (key && new Set(after).size !== after.length) return { data: null, error: { message: 'duplicate key value violates unique constraint' } };
        hit.forEach((r) => Object.assign(r, payload));
        return { data: null, error: null };
      }
      return q;
    },
  };
}

test('merging a placeholder keeps the real rows and moves the rest, in every server', async () => {
  const real = '123456789012345678';
  let id = 0;
  const tables = {
    profiles: [{ id: ++id, discord_user_id: 'ea_Ace' }, { id: ++id, discord_user_id: real }],
    player_stats: [
      { id: ++id, guild_id: 'g1', discord_user_id: 'ea_Ace', ea_match_id: 'm1' },
      { id: ++id, guild_id: 'g1', discord_user_id: real, ea_match_id: 'm1' },
      { id: ++id, guild_id: 'g2', discord_user_id: 'ea_Ace', ea_match_id: 'm1' },
      { id: ++id, guild_id: 'g1', discord_user_id: 'ea_Ace', ea_match_id: null },
    ],
    player_ratings: [{ id: ++id, guild_id: 'g1', discord_user_id: 'ea_Ace' }, { id: ++id, guild_id: 'g1', discord_user_id: real }, { id: ++id, guild_id: 'g2', discord_user_id: 'ea_Ace' }],
    player_summary: [{ id: ++id, guild_id: 'g2', discord_user_id: 'ea_Ace' }],
    player_club_stats: [{ id: ++id, guild_id: 'g1', discord_user_id: 'ea_Ace', club_key: 'a' }, { id: ++id, guild_id: 'g1', discord_user_id: real, club_key: 'a' }, { id: ++id, guild_id: 'g1', discord_user_id: 'ea_Ace', club_key: 'b' }],
    position_preferences: [{ id: ++id, guild_id: 'g1', user_id: 'ea_Ace' }, { id: ++id, guild_id: 'g1', user_id: real }],
  };
  const res = await eaProfiles.mergePlaceholderInto(tableDb(tables), 'ea_Ace', real);
  assert.deepStrictEqual(res, { ok: true });
  for (const [name, rows] of Object.entries(tables)) {
    const col = name === 'position_preferences' ? 'user_id' : 'discord_user_id';
    assert.ok(rows.every((r) => r[col] !== 'ea_Ace'), `${name} still has placeholder rows`);
  }
  assert.deepStrictEqual(tables.player_stats.map((r) => r.id), [4, 5, 6]);
  assert.deepStrictEqual(tables.player_ratings.map((r) => [r.guild_id, r.id]), [['g1', 8], ['g2', 9]]);
  assert.strictEqual(tables.player_summary[0].discord_user_id, real);
  assert.deepStrictEqual(tables.player_club_stats.map((r) => r.club_key), ['a', 'b']);
  assert.strictEqual(tables.position_preferences.length, 1);
});

test('a big placeholder moves completely even past the row cap', async () => {
  const real = '123456789012345678';
  const tables = { profiles: [{ discord_user_id: 'ea_Ace' }], player_stats: [] };
  for (let i = 0; i < 1500; i++) tables.player_stats.push({ id: i, guild_id: 'g1', discord_user_id: 'ea_Ace', ea_match_id: `m${i}` });
  for (let i = 0; i < 300; i++) tables.player_stats.push({ id: 5000 + i, guild_id: 'g1', discord_user_id: real, ea_match_id: `m${i}` });
  assert.deepStrictEqual(await eaProfiles.mergePlaceholderInto(tableDb(tables), 'ea_Ace', real), { ok: true });
  assert.strictEqual(tables.player_stats.length, 1500);
  assert.ok(tables.player_stats.every((r) => r.discord_user_id === real));
  assert.strictEqual(tables.profiles.length, 0);
});

test('the placeholder stays when a move fails, so nothing is orphaned', async () => {
  const db = tableDb({ profiles: [{ discord_user_id: 'ea_Ace' }], player_stats: [{ id: 1, guild_id: 'g1', discord_user_id: 'ea_Ace', ea_match_id: 'm1' }] });
  const broken = { from: (name) => (name === 'player_stats' ? { select: () => ({ eq: () => ({ limit: async () => ({ data: null, error: { message: 'down' } }) }) }) } : db.from(name)) };
  const res = await eaProfiles.mergePlaceholderInto(broken, 'ea_Ace', '123456789012345678');
  assert.strictEqual(res.ok, false);
  const { data } = await db.from('profiles').select('discord_user_id');
  assert.strictEqual(data.length, 1);
});
