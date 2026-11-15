// Transfer board in Discord: the digest's transfer news and the recruitment poster's public board row
const test = require('node:test');
const assert = require('node:assert/strict');
const { transferDigestFields, createTransferNews } = require('./transfer-news.cjs');
const { wantedRow } = require('./recruit-cards.cjs');
const { RECRUIT_COMMANDS } = require('./recruitment.cjs');

const move = (name, from, to, days) => ({ ea_username: name, platform: 'common-gen5', from_club_id: from, from_club_name: `Club ${from}`, to_club_id: to, to_club_name: `Club ${to}`, detected_at: new Date(Date.now() - days * 86400000).toISOString() });

test('digest names who joined and who left', () => {
  const [field] = transferDigestFields([move('Nine', '1', '5', 1), move('Ten', '5', '7', 2)], '5');
  assert.match(field.name, /Transfer news/);
  assert.match(field.value, /Nine\*\* joined from Club 1/);
  assert.match(field.value, /Ten\*\* left for Club 7/);
  assert.deepEqual(transferDigestFields([], '5'), []);
  assert.deepEqual(transferDigestFields([move('Nine', '1', '5', 1)], null), []);
});

test('the digest hook only runs for clubs with an EA ID', async () => {
  let hook = null;
  const queries = [];
  const supabase = {
    from: () => {
      const q = { select: () => q, or: (f) => (queries.push(f), q), gte: () => q, order: () => q, limit: async () => ({ data: [move('Nine', '1', '5', 1)], error: null }) };
      return q;
    },
  };
  createTransferNews({ autopilot: { onDigest: (fn) => (hook = fn) }, supabase });
  assert.deepEqual(await hook('g', { key: 'a' }), []);
  const fields = await hook('g', { key: 'a', ea_club_id: '5' });
  assert.equal(fields.length, 1);
  assert.equal(queries[0], 'from_club_id.eq.5,to_club_id.eq.5');
});

test('recruitment posters go on the public board for 14 days', () => {
  const now = Date.UTC(2026, 10, 15);
  const row = wantedRow({ guildId: 'g', club: { key: 'a', name: 'Us FC', ea_club_id: 123, ea_platform: 'switch' }, positions: 'CB, GK', notes: 'Comp', record: '10W 2D 1L', division: 'Division 2', invite: 'https://discord.gg/x', crest: 'http://insecure/crest.png', now });
  assert.equal(row.ea_platform, 'nx');
  assert.equal(row.ea_club_id, '123');
  assert.equal(row.crest_url, null);
  assert.equal(new Date(row.expires_at).getTime() - now, 14 * 86400000);
  const plain = wantedRow({ guildId: 'g', club: { key: 'b', name: 'No EA' }, positions: 'ST', now });
  assert.equal(plain.ea_club_id, null);
  assert.equal(plain.ea_platform, null);
});

test('free agents and posters can opt in or out of the public board', () => {
  const fa = RECRUIT_COMMANDS.find((c) => c.name === 'fa');
  assert.ok(fa.options.some((o) => o.name === 'public_board' && o.type === 5));
  const post = RECRUIT_COMMANDS.find((c) => c.name === 'recruit').options.find((o) => o.name === 'post');
  assert.ok(post.options.some((o) => o.name === 'public_board' && o.type === 5));
});
