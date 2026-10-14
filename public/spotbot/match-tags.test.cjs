const test = require('node:test');
const assert = require('node:assert');
const { createMatchTags, tagForEvent, eventForMatch } = require('./match-tags.cjs');
const { matchCompetition, toInsightMatches, computeCompetitionRecords } = require('./club-insights.cjs');

const PLAYED = Date.parse('2026-10-13T20:30:00Z');
const row = (over = {}) => ({
  id: 'm1',
  guild_id: 'g1',
  club_key: 'c1',
  result: 'win',
  score_for: 3,
  score_against: 1,
  created_at: new Date(PLAYED + 60000).toISOString(),
  opponent_club_name: 'Rivals FC',
  player_stats: [{ ea_username: 'Ace', goals: 2 }],
  match_type: 'friendly',
  match_data: { timestamp: PLAYED / 1000, _matchCategory: 'friendly' },
  ...over,
});

// Just enough of supabase-js for these modules: chainable filters, awaitable results
function fakeDb(tables) {
  const updates = [];
  const from = (table) => {
    const filters = [];
    let patch = null;
    const q = {
      select: () => q,
      eq: (k, v) => (filters.push((r) => r[k] === v), q),
      gte: () => q,
      lte: () => q,
      in: (k, vals) => (filters.push((r) => vals.includes(r[k])), q),
      order: () => q,
      limit: () => q,
      update: (p) => ((patch = p), q),
      rows: () => (tables[table] || []).filter((r) => filters.every((f) => f(r))),
      maybeSingle: async () => ({ data: q.rows()[0] || null }),
      then: (resolve) => {
        if (patch) {
          for (const r of q.rows()) {
            Object.assign(r, patch);
            updates.push({ table, id: r.id, patch });
          }
          return resolve({ error: null });
        }
        return resolve({ data: q.rows(), error: null });
      },
    };
    return q;
  };
  return { from, updates };
}

const club = { key: 'c1', name: 'Palermo Pros', enabled: true };
const getGuildState = async () => ({ clubs: [club] });

function fakeInteraction(customId, { values, manager = true, kind = 'button' } = {}) {
  const calls = [];
  return {
    calls,
    guildId: 'g1',
    customId,
    values,
    user: { id: 'u1' },
    member: { manager },
    isButton: () => kind === 'button',
    isStringSelectMenu: () => kind === 'select',
    isChatInputCommand: () => false,
    reply: async (o) => calls.push(['reply', o]),
    update: async (o) => calls.push(['update', o]),
    deferUpdate: async () => calls.push(['deferUpdate']),
    deferReply: async () => calls.push(['deferReply']),
    editReply: async (o) => calls.push(['editReply', o]),
    followUp: async (o) => calls.push(['followUp', o]),
  };
}

test('event titles and types map to match tags', () => {
  assert.strictEqual(tagForEvent({ title: 'BYOT night', event_type: 'tournament' }), 'byot');
  assert.strictEqual(tagForEvent({ title: 'VPG cup round 2', event_type: 'match' }), 'tournament');
  assert.strictEqual(tagForEvent({ title: 'Thursday', event_type: 'tournament' }), 'tournament');
  assert.strictEqual(tagForEvent({ title: 'League night', event_type: 'match' }), 'league');
  assert.strictEqual(tagForEvent({ title: 'Training before the league', event_type: 'training' }), null);
  assert.strictEqual(tagForEvent({ title: 'Friendly', event_type: 'friendly' }), null);
});

test('a game belongs to the event it was played in, for its own club only', () => {
  const events = [{ id: 'e1', scheduled_at: new Date(PLAYED - 60 * 60 * 1000).toISOString(), club_key: 'c1' }];
  assert.strictEqual(eventForMatch(events, 'c1', new Date(PLAYED))?.id, 'e1');
  assert.strictEqual(eventForMatch(events, 'c2', new Date(PLAYED)), null);
  assert.strictEqual(eventForMatch(events, 'c1', new Date(PLAYED + 5 * 60 * 60 * 1000)), null);
  assert.strictEqual(eventForMatch([{ ...events[0], cancelled: true }], 'c1', new Date(PLAYED)), null);
});

test('the tag wins over EA type in competition and records', () => {
  assert.strictEqual(matchCompetition(row()), 'friendly');
  assert.strictEqual(matchCompetition(row({ match_type: 'division', match_data: {} })), 'league');
  assert.strictEqual(matchCompetition(row({ match_type: 'competition', match_data: {} })), 'cup');
  assert.strictEqual(matchCompetition(row({ match_data: { _tag: 'byot' } })), 'byot');
  assert.strictEqual(matchCompetition(row({ match_data: { _tag: 'nonsense' } })), 'friendly');
  const matches = toInsightMatches([row({ id: 'a', match_data: { _tag: 'byot' } }), row({ id: 'b', result: 'loss' }), row({ id: 'c', match_data: { _tag: 'byot' } })]);
  assert.deepStrictEqual(matches.map((m) => m.tag).filter(Boolean), ['byot', 'byot']);
  const recs = computeCompetitionRecords(matches);
  assert.deepStrictEqual(recs.map((r) => [r.competition, r.record.games]), [['byot', 2], ['friendly', 1]]);
});

test('new friendlies played during a BYOT event are tagged before the recap', async () => {
  const m = row();
  const db = fakeDb({
    club_matches: [m],
    availability_events: [{ id: 'e1', guild_id: 'g1', title: 'BYOT Tuesday', event_type: 'tournament', scheduled_at: new Date(PLAYED - 30 * 60 * 1000).toISOString(), club_key: null }],
  });
  const tags = createMatchTags({ supabase: db, getGuildState, canManageClub: async () => true });
  const recent = toInsightMatches([m]);
  await tags.autoTag('g1', club, recent, [m]);
  assert.strictEqual(m.match_data._tag, 'byot');
  assert.strictEqual(m.match_data._tag_source, 'event:e1');
  assert.strictEqual(m.match_data._matchCategory, 'friendly');
  assert.strictEqual(recent[0].competition, 'byot');

  // EA league games are never retagged
  const league = row({ id: 'm2', match_type: 'division', match_data: { timestamp: PLAYED / 1000, _matchCategory: 'division' } });
  db.updates.length = 0;
  await tags.autoTag('g1', club, toInsightMatches([league]), [league]);
  assert.strictEqual(db.updates.length, 0);
});

test('managers tag a game from the panel; others are turned away', async () => {
  const m = row();
  const db = fakeDb({ club_matches: [m] });
  const tags = createMatchTags({ supabase: db, getGuildState, canManageClub: async (member) => member.manager });

  const pick = fakeInteraction('mtag_pick:c1:0', { kind: 'select', values: ['m1'] });
  assert.strictEqual(await tags.handleInteraction(pick), true);
  const detail = pick.calls.find((c) => c[0] === 'update')[1];
  const ids = detail.components.flatMap((r) => r.components.map((c) => c.data.custom_id));
  assert.ok(ids.includes('mtag_set:m1:byot:0'));

  const set = fakeInteraction('mtag_set:m1:tournament:0');
  assert.strictEqual(await tags.handleInteraction(set), true);
  assert.strictEqual(m.match_data._tag, 'tournament');
  assert.strictEqual(m.match_data._tagged_by, 'u1');
  const after = set.calls.find((c) => c[0] === 'editReply')[1];
  assert.match(after.content, /Tournament/);

  const clear = fakeInteraction('mtag_set:m1:none:0');
  await tags.handleInteraction(clear);
  assert.strictEqual(m.match_data._tag, undefined);
  assert.strictEqual(m.match_data._matchCategory, 'friendly');

  const outsider = fakeInteraction('mtag_set:m1:byot:0', { manager: false });
  await tags.handleInteraction(outsider);
  assert.strictEqual(m.match_data._tag, undefined);
  assert.match(outsider.calls[0][1].content, /leaders/);

  // A game from another server can't be tagged
  const other = fakeInteraction('mtag_set:m1:byot:0');
  other.guildId = 'g2';
  await tags.handleInteraction(other);
  assert.strictEqual(m.match_data._tag, undefined);
});

test('tagging moves the game\'s player stats out of the regular stats and back', async () => {
  const m = row({ ea_match_id: 'ea1' });
  const ps = [
    { id: 'p1', guild_id: 'g1', ea_match_id: 'ea1', discord_user_id: 'u1', match_type: 'club' },
    { id: 'p2', guild_id: 'g1', ea_match_id: 'ea1', discord_user_id: 'u2', match_type: 'club' },
    { id: 'p3', guild_id: 'g1', ea_match_id: 'ea1', discord_user_id: 'u1', match_type: 'draft' },
    { id: 'p4', guild_id: 'g1', ea_match_id: 'ea2', discord_user_id: 'u1', match_type: 'club' },
  ];
  const db = fakeDb({ club_matches: [m], player_stats: ps });
  const recalcs = [];
  const tags = createMatchTags({ supabase: db, getGuildState, canManageClub: async () => true, callEdgeFunction: async (fn, body) => recalcs.push([fn, body.discord_user_id]) });

  await tags.saveTag(m, 'byot', 'manual', 'u9');
  assert.deepStrictEqual(ps.map((p) => p.match_type), ['byot', 'byot', 'draft', 'club']);
  assert.strictEqual(m.match_data._ps_type, 'club');
  assert.deepStrictEqual(recalcs.map((r) => r[1]).sort(), ['u1', 'u2']);

  await tags.saveTag(m, 'tournament', 'manual', 'u9');
  assert.deepStrictEqual(ps.map((p) => p.match_type), ['tournament', 'tournament', 'draft', 'club']);
  assert.strictEqual(m.match_data._ps_type, 'club');

  await tags.saveTag(m, null, 'manual', 'u9');
  assert.deepStrictEqual(ps.map((p) => p.match_type), ['club', 'club', 'draft', 'club']);
  assert.strictEqual(m.match_data._ps_type, undefined);
});
