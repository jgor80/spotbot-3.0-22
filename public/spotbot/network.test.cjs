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

const { networkRecords, rankClubs, rankServers } = require('./network-leaderboard.cjs');

test('leaderboard: ranks by EA skill rating and counts games against other network clubs', () => {
  const clubs = [
    { guildId: 'g1', key: 'c1', eaClubId: '100', name: 'Alpha', skill: 1200, stats: { wins: 5 } },
    { guildId: 'g2', key: 'c1', eaClubId: '200', name: 'Bravo', skill: 1500, stats: { wins: 2 }, serverName: 'Bravo HQ' },
    { guildId: 'g2', key: 'c2', eaClubId: '201', name: 'Bravo B', skill: null, stats: { wins: 9 }, serverName: 'Bravo HQ' },
  ];
  assert.deepStrictEqual(rankClubs(clubs).map((c) => c.name), ['Bravo', 'Alpha', 'Bravo B']);
  const recs = networkRecords(clubs, [
    { guild_id: 'g1', club_key: 'c1', opponent_club_id: '200', result: 'win' },
    { guild_id: 'g1', club_key: 'c1', opponent_club_id: 200, result: 'draw' },
    { guild_id: 'g1', club_key: 'c1', opponent_club_id: '999', result: 'win' },
    { guild_id: 'g2', club_key: 'c1', opponent_club_id: '200', result: 'win' },
  ]);
  assert.deepStrictEqual(recs.get('g1:c1'), { w: 1, d: 1, l: 0 });
  assert.strictEqual(recs.get('g2:c1'), undefined);
  const servers = rankServers(clubs);
  assert.deepStrictEqual(servers.map((s) => [s.guildId, s.clubs, s.best, s.w]), [['g2', 2, 1500, 11], ['g1', 1, 1200, 5]]);
});

const { fixtureForMatch, suggestClubs } = require('./network-friendlies.cjs');

test('friendlies: a synced game matches the accepted fixture between the same two EA clubs near kick-off', () => {
  const kickoff = Date.parse('2026-10-16T20:00:00Z');
  const fx = { id: 'f1', status: 'accepted', from_guild_id: 'g1', from_club_key: 'c1', from_ea_club_id: '100', to_guild_id: 'g2', to_club_key: 'c1', to_ea_club_id: '200', kickoff_at: new Date(kickoff).toISOString() };
  const row = (over) => ({ opponent_club_id: '200', match_data: { timestamp: (kickoff + 15 * 60000) / 1000 }, ...over });
  assert.strictEqual(fixtureForMatch([fx], 'g1', 'c1', row())?.id, 'f1');
  assert.strictEqual(fixtureForMatch([fx], 'g2', 'c1', row({ opponent_club_id: 100 }))?.id, 'f1');
  assert.strictEqual(fixtureForMatch([fx], 'g1', 'c1', row({ opponent_club_id: '999' })), null);
  assert.strictEqual(fixtureForMatch([fx], 'g1', 'c1', row({ match_data: { timestamp: (kickoff + 6 * 3600000) / 1000 } })), null);
  assert.strictEqual(fixtureForMatch([{ ...fx, status: 'played' }], 'g1', 'c1', row()), null);
});

test('friendlies: suggestions are same platform, closest skill rating first', () => {
  const clubs = [
    { name: 'Far', platform: 'common-gen5', skill: 2000 },
    { name: 'Switch', platform: 'nx', skill: 1210 },
    { name: 'Near', platform: 'common-gen5', skill: 1250 },
  ];
  assert.deepStrictEqual(suggestClubs(clubs, 'common-gen5', 1200).map((c) => c.name), ['Near', 'Far']);
});

const { bracketSize, seedOrder, firstRound, nextSlot, roundName } = require('./network-byot.cjs');

test('byot: bracket size, standard seeding and byes for the top seeds', () => {
  assert.strictEqual(bracketSize(2), 2);
  assert.strictEqual(bracketSize(5), 8);
  assert.deepStrictEqual(seedOrder(8), [1, 8, 4, 5, 2, 7, 3, 6]);
  const entries = [1300, 1500, 1100, 1400, 1200].map((sr, i) => ({ id: `e${i}`, skill_rating: sr }));
  const { size, rounds, pairs } = firstRound(entries);
  assert.strictEqual(size, 8);
  assert.strictEqual(rounds, 3);
  // Seeds: 1500, 1400, 1300, 1200, 1100 → seed 1 (1500) has a bye, 4 v 5 meet
  assert.deepStrictEqual(pairs.map((p) => [p.home?.skill_rating ?? null, p.away?.skill_rating ?? null]), [
    [1500, null],
    [1200, 1100],
    [1400, null],
    [1300, null],
  ]);
});

test('byot: winners move to the next slot, even slots at home', () => {
  assert.deepStrictEqual(nextSlot(1, 0), { round: 2, slot: 0, side: 'from' });
  assert.deepStrictEqual(nextSlot(1, 3), { round: 2, slot: 1, side: 'to' });
  assert.strictEqual(roundName(3, 3), 'Final');
  assert.strictEqual(roundName(2, 3), 'Semi-finals');
  assert.strictEqual(roundName(1, 4), 'Round 1');
});

// A small in-memory stand-in for supabase-js: enough for the BYOT bracket to run end to end
function memoryDb() {
  const tables = {};
  let n = 0;
  const from = (table) => {
    const rows = (tables[table] = tables[table] || []);
    const filters = [];
    let op = 'select';
    let payload = null;
    let returning = false;
    const q = {
      select: () => ((returning = true), q),
      insert: (p) => ((op = 'insert'), (payload = p), q),
      update: (p) => ((op = 'update'), (payload = p), q),
      upsert: (p) => ((op = 'insert'), (payload = p), q),
      eq: (k, v) => (filters.push((r) => r[k] === v), q),
      in: (k, vs) => (filters.push((r) => vs.includes(r[k])), q),
      is: (k, v) => (filters.push((r) => (r[k] ?? null) === v), q),
      gte: () => q,
      lte: () => q,
      or: () => q,
      order: () => q,
      limit: () => q,
      run() {
        if (op === 'insert') {
          const row = { id: `id${++n}`, ...payload };
          if (row.tournament_id && row.round != null && rows.some((r) => r.tournament_id === row.tournament_id && r.round === row.round && r.slot === row.slot)) {
            return { data: null, error: { message: 'duplicate' } };
          }
          rows.push(row);
          return { data: [row], error: null };
        }
        const hit = rows.filter((r) => filters.every((f) => f(r)));
        if (op === 'update') hit.forEach((r) => Object.assign(r, payload));
        return { data: hit.map((r) => ({ ...r })), error: null };
      },
      single: async () => {
        const { data, error } = q.run();
        return { data: data?.[0] || null, error };
      },
      maybeSingle: async () => ({ data: q.run().data?.[0] || null }),
      then: (resolve) => resolve(q.run()),
    };
    return q;
  };
  return { from, tables };
}

test('byot: five clubs play through to a champion, byes and all', async () => {
  const { createNetworkByot } = require('./network-byot.cjs');
  const db = memoryDb();
  const posted = [];
  const network = {
    addSubcommand() {},
    addComponent() {},
    isOn: () => true,
    postToChannel: async (_c, guildId, payload) => (posted.push([guildId, payload.content]), null),
    notifyHost: async () => {},
  };
  const byot = createNetworkByot({ supabase: db, network, client: () => ({ channels: { fetch: async () => null } }) });
  const T1 = '00000000-0000-4000-8000-000000000001';
  const t = { id: T1, name: 'Cup', platform: 'common-gen5', max_teams: 8, round_minutes: 45, starts_at: new Date(Date.now() + 3600000).toISOString(), status: 'signup', created_by_discord_id: 'host', posts: [] };
  db.tables.network_tournaments = [t];
  db.tables.network_tournament_entries = [1500, 1400, 1300, 1200, 1100].map((sr, i) => ({
    id: `e${i}`, tournament_id: T1, guild_id: `g${i}`, club_key: 'c1', club_name: `Club ${sr}`, ea_club_id: String(100 + i), skill_rating: sr, status: 'entered',
  }));
  const res = await byot.start(t);
  assert.ok(res.ok);
  const fixtures = () => db.tables.network_fixtures;
  // Round 1: one real game (4 v 5) plus three byes; seeds 1 v (4/5) waits, 2 v 3 is created at once
  const r2 = fixtures().filter((f) => f.round === 2);
  assert.deepStrictEqual(r2.map((f) => [f.from_club_name, f.to_club_name]), [['Club 1400', 'Club 1300']]);
  const r1game = fixtures().find((f) => f.round === 1 && f.to_entry_id);
  await byot.settle(r1game, 'to'); // Club 1100 beats Club 1200
  const semis = fixtures().filter((f) => f.round === 2).sort((a, b) => a.slot - b.slot);
  assert.deepStrictEqual(semis.map((f) => [f.from_club_name, f.to_club_name]), [['Club 1500', 'Club 1100'], ['Club 1400', 'Club 1300']]);
  await byot.settle(semis[0], 'from');
  await byot.settle(semis[1], 'to');
  const final = fixtures().find((f) => f.round === 3);
  assert.deepStrictEqual([final.from_club_name, final.to_club_name], ['Club 1500', 'Club 1300']);
  await byot.settle(final, 'to');
  assert.strictEqual(db.tables.network_tournaments[0].status, 'finished');
  assert.strictEqual(db.tables.network_tournament_entries.find((e) => e.status === 'champion').club_name, 'Club 1300');
});

test('byot: two hosts pressing Advance on the same game only settle it once', async () => {
  const { createNetworkByot } = require('./network-byot.cjs');
  const db = memoryDb();
  const network = { addSubcommand() {}, addComponent() {}, isOn: () => true, postToChannel: async () => null, notifyHost: async () => {} };
  const byot = createNetworkByot({ supabase: db, network, client: () => null });
  db.tables.network_fixtures = [{ id: 'f1', status: 'accepted', tournament_id: null }];
  assert.strictEqual(await byot.settle(db.tables.network_fixtures[0], 'from'), true);
  assert.strictEqual(await byot.settle(db.tables.network_fixtures[0], 'to'), false);
  assert.strictEqual(db.tables.network_fixtures[0].winner_side, 'from');
});
