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
