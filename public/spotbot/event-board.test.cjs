const test = require('node:test');
const assert = require('node:assert');
const { Collection } = require('discord.js');
const B = require('./event-board.cjs');
const { createEvents } = require('./events.cjs');

// ---------- Pure helpers ----------

test('positions merge tiers first, then roster, preferences and roles', () => {
  assert.deepStrictEqual(B.mergePositions({ primary: 'st', secondary: 'CAM, cm' }), { primary: 'ST', secondary: ['CAM', 'CM'], emergency: [] });
  assert.deepStrictEqual(B.mergePositions(null, { primary: 'CB', secondary: ['RB'] }, { primary: 'GK' }), { primary: 'CB', secondary: ['RB', 'GK'], emergency: [] });
  assert.deepStrictEqual(B.mergePositions({ primary: null, secondary: 'LW' }), { primary: 'LW', secondary: [], emergency: [] });
  assert.strictEqual(B.mergePositions(null, undefined), null);
  // Position tiers (player_positions) shape, with the roster's older copy behind it
  assert.deepStrictEqual(
    B.mergePositions({ primary: 'CDM', secondary: ['CM', 'CB'], emergency: ['RB', 'CM'] }, { primary: 'CM', secondary: 'CDM' }),
    { primary: 'CDM', secondary: ['CM', 'CB'], emergency: ['RB'] }
  );
  assert.deepStrictEqual(B.rolePositions(['Signed Players', 'ST • Striker', 'Admin']), ['ST']);
  // Quiet "(2nd)" roles never outrank the main comp role, whatever their order
  assert.deepStrictEqual(B.rolePositions(['CM (2nd)', 'ST', 'LW (2nd)']), ['ST', 'CM', 'LW']);
});

test('positions read primary bold, then secondary, and a different sign-up pick', () => {
  const entry = { primary: 'ST', secondary: ['CAM', 'CM'] };
  assert.strictEqual(B.formatPositions(entry), '**ST** · CAM/CM');
  assert.strictEqual(B.formatPositions(entry, 'ST'), '**ST** · CAM/CM');
  assert.strictEqual(B.formatPositions(entry, 'CB,RB'), '**ST** · CAM/CM · 🎯 CB/RB');
  assert.strictEqual(B.formatPositions(null), '');
});

test('sections list only people who answered, numbered for Available', () => {
  const responses = [
    { discord_user_id: '1', response: 'yes' },
    { discord_user_id: '2', response: 'yes', note: 'late' },
    { discord_user_id: '3', response: 'maybe' },
    { discord_user_id: '4', response: 'no' },
  ];
  const positions = new Map([['1', { primary: 'GK', secondary: [], emergency: ['CB'] }]]);
  const text = B.availabilitySections(responses, { positions });
  assert.match(text, /### ✅ AVAILABLE · 2\n1\. <@1> — \*\*GK\*\*\n2\. <@2> 📝/);
  assert.match(text, /### ❓ MAYBE · 1\n• <@3>/);
  assert.match(text, /### ❌ UNAVAILABLE · 1\n• <@4>/);
  assert.strictEqual(B.availabilitySections([]).match(/Nobody yet/g).length, 3);
});

test('long lists are capped with a pointer to View Players', () => {
  const responses = Array.from({ length: 40 }, (_, i) => ({ discord_user_id: String(i), response: 'yes' }));
  const text = B.availabilitySections(responses);
  assert.match(text, /AVAILABLE · 40/);
  assert.match(text, /\+10 more · tap 👥 View Players/);
  assert.ok(!text.includes('<@35>'));
});

test('signed-players role: picked role wins, else found by name', () => {
  const roles = new Collection([
    ['10', { id: '10', name: 'Signed Players' }],
    ['11', { id: '11', name: 'First XI' }],
  ]);
  assert.strictEqual(B.findSignedRole(roles, {}).id, '10');
  assert.strictEqual(B.findSignedRole(roles, { signed_role_id: '11' }).id, '11');
  assert.strictEqual(B.findSignedRole(roles, { signed_role_id: 'gone' }).id, '10');
  assert.strictEqual(B.findSignedRole(new Collection([['12', { id: '12', name: 'signed-players' }]]), null).id, '12');
  assert.strictEqual(B.findSignedRole(new Collection(), {}), null);
});

test('ping rules: league -> signed role, everything else -> @everyone, overrides win', () => {
  assert.deepStrictEqual(B.choosePing({ league: true, signedRoleId: '10' }), { kind: 'role', roleId: '10', signed: true });
  assert.deepStrictEqual(B.choosePing({ league: true }), { kind: 'everyone', missingSigned: true });
  assert.deepStrictEqual(B.choosePing({ league: false, signedRoleId: '10' }), { kind: 'everyone' });
  assert.deepStrictEqual(B.choosePing({ pingRoleId: '7', league: true, signedRoleId: '10' }), { kind: 'role', roleId: '7' });
  assert.deepStrictEqual(B.choosePing({ notify: 'none', league: true, signedRoleId: '10' }), { kind: 'none' });
  assert.deepStrictEqual(B.choosePing({ notify: 'everyone', league: true, signedRoleId: '10' }), { kind: 'everyone' });
  assert.deepStrictEqual(B.choosePing({ notify: 'signed', signedRoleId: '10' }), { kind: 'role', roleId: '10', signed: true });

  const role = B.pingMessage({ kind: 'role', roleId: '10' });
  assert.strictEqual(role.content, '<@&10>');
  assert.deepStrictEqual(role.allowedMentions.roles, ['10']);
  assert.deepStrictEqual(role.allowedMentions.parse, []);
  assert.deepStrictEqual(B.pingMessage({ kind: 'everyone' }).allowedMentions.parse, ['everyone']);
  const none = B.pingMessage({ kind: 'none' });
  assert.strictEqual(none.content, undefined);
  assert.deepStrictEqual(none.allowedMentions.parse, []);
});

// ---------- Board and post, with a fake database and server ----------

// Just enough of the Supabase query builder for events.cjs: select/eq/in/order/limit and
// maybeSingle/single, insert, update, upsert.
function fakeDb(tables) {
  const ids = { n: 0 };
  return {
    from(name) {
      const rows = (tables[name] = tables[name] || []);
      let filters = [];
      let op = 'select';
      let payload = null;
      const q = {
        select: () => q,
        eq: (k, v) => ((filters.push((r) => r[k] === v)), q),
        in: (k, vs) => ((filters.push((r) => vs.includes(r[k]))), q),
        not: () => q,
        gte: () => q,
        lte: () => q,
        gt: () => q,
        ilike: () => q,
        order: () => q,
        limit: () => q,
        insert: (p) => ((op = 'insert'), (payload = p), q),
        update: (p) => ((op = 'update'), (payload = p), q),
        upsert: (p) => ((op = 'upsert'), (payload = p), q),
        delete: () => ((op = 'delete'), q),
        run() {
          if (op === 'insert') {
            const row = { id: `00000000-0000-0000-0000-${String(++ids.n).padStart(12, '0')}`, created_at: new Date().toISOString(), closed: false, cancelled: false, ...payload };
            rows.push(row);
            return [row];
          }
          const hit = rows.filter((r) => filters.every((f) => f(r)));
          if (op === 'update') hit.forEach((r) => Object.assign(r, payload));
          return hit;
        },
        maybeSingle: async () => ({ data: q.run()[0] || null, error: null }),
        single: async () => ({ data: q.run()[0] || null, error: null }),
        then: (res, rej) => Promise.resolve({ data: q.run(), error: null }).then(res, rej),
      };
      return q;
    },
  };
}

const GUILD = '111111111111111111';

function setup({ roles = [], members = [] } = {}) {
  const tables = {
    guild_settings: [{ guild_id: GUILD, timezone: 'Europe/London', branding: {} }],
    team_rosters: [
      { team_id: 'team-1', discord_user_id: 'u1', primary_position: 'ST', secondary_position: 'CAM' },
      { team_id: 'team-1', discord_user_id: 'u5', primary_position: 'GK', secondary_position: null },
    ],
    position_preferences: [{ guild_id: GUILD, user_id: 'u2', preferences: ['CB', 'RB'] }],
    player_positions: [{ guild_id: GUILD, discord_user_id: 'u6', primary_position: 'CDM', secondary_positions: ['CM'], emergency_positions: ['CB'] }],
    player_availability: [],
    availability_events: [],
  };
  const sent = [];
  const roleCache = new Collection(roles.map((r) => [r.id, r]));
  const memberCache = new Collection(members.map((m) => [m.id, m]));
  const guild = { id: GUILD, roles: { cache: roleCache }, members: { cache: memberCache, fetch: async () => memberCache } };
  const client = { guilds: { cache: new Collection([[GUILD, guild]]) } };
  const state = { clubs: [{ key: 'main', name: 'Palermo FC', team_id: 'team-1' }] };
  const events = createEvents({
    supabase: fakeDb(tables),
    getGuildState: async () => state,
    saveGuildSettings: async () => {},
    isManager: () => true,
  });
  events.start(client);
  const channel = { id: 'chan', send: async (opts) => (sent.push(opts), { id: 'msg-1' }) };
  return { events, tables, sent, channel, state };
}

const later = (h) => new Date(Date.now() + h * 3600000).toISOString();

test('board shows responders with positions and never lists non-responders', async () => {
  const { events, tables } = setup({ members: [{ id: 'u3', roles: { cache: new Collection([['r', { name: 'LW', position: 3 }]]) } }] });
  const event = { id: '00000000-0000-0000-0000-0000000000aa', guild_id: GUILD, club_key: 'main', title: 'League night', event_type: 'league', scheduled_at: later(5), deadline_at: later(4) };
  tables.availability_events.push(event);
  tables.player_availability.push(
    { event_id: event.id, discord_user_id: 'u1', response: 'yes', responded_at: new Date().toISOString() },
    { event_id: event.id, discord_user_id: 'u2', response: 'maybe', responded_at: new Date().toISOString() },
    { event_id: event.id, discord_user_id: 'u3', response: 'no', responded_at: new Date().toISOString() },
    { event_id: event.id, discord_user_id: 'u9', response: 'no_response' }
  );
  const board = await events.buildBoard(event);
  const text = board.embeds[0].data.description;
  assert.match(text, /Availability open/);
  assert.match(text, /1\. <@u1> — \*\*ST\*\* · CAM/);
  assert.match(text, /• <@u2> — \*\*CB\*\* · RB/);
  assert.match(text, /• <@u3> — \*\*LW\*\*/);
  assert.ok(!text.includes('u9'), 'people who never answered are not listed');
  assert.ok(!text.includes('u5'), 'roster players who never answered are not listed');
  assert.ok(!board.embeds[0].data.fields?.length, 'no "still to answer" field');
  assert.deepStrictEqual(board.allowedMentions, { parse: [] });
  const labels = board.components.flatMap((row) => row.components.map((c) => c.data.label));
  assert.deepStrictEqual(labels.slice(0, 5), ['Available', 'Maybe', 'Unavailable', 'Add / Update Note', 'View Players']);
  assert.ok(labels.includes('Build Lineup'));
});

test('league post pings the signed-players role; a friendly pings @everyone', async () => {
  const { events, sent, channel } = setup({ roles: [{ id: '777', name: 'Signed Players' }] });
  const base = { guild_id: GUILD, club_key: 'main', scheduled_at: later(5), deadline_at: later(4), channel_id: 'chan' };
  const league = await events.postEvent({ ...base, title: 'Palermo League', event_type: 'league' }, channel);
  assert.strictEqual(sent[0].content, '<@&777>');
  assert.deepStrictEqual(sent[0].allowedMentions.roles, ['777']);
  assert.deepStrictEqual(sent[0].allowedMentions.parse, []);
  assert.strictEqual(league.pingPlan.signed, true);

  await events.postEvent({ ...base, title: 'Practice — Friendlies or byot', event_type: 'match' }, channel);
  assert.strictEqual(sent[1].content, '@everyone');
  assert.deepStrictEqual(sent[1].allowedMentions.parse, ['everyone']);

  await events.postEvent({ ...base, title: 'Palermo League', event_type: 'league' }, channel, { notify: 'none' });
  assert.strictEqual(sent[2].content, undefined);
  assert.deepStrictEqual(sent[2].allowedMentions.parse, []);
});

test('league post without a signed-players role falls back to @everyone', async () => {
  const { events, sent, channel } = setup();
  const event = await events.postEvent({ guild_id: GUILD, club_key: 'main', title: 'League', event_type: 'league', scheduled_at: later(5), channel_id: 'chan' }, channel);
  assert.strictEqual(sent[0].content, '@everyone');
  assert.strictEqual(event.pingPlan.missingSigned, true);
});

test('playerPositions feeds the lineup builder the same positions as the board', async () => {
  const { events } = setup();
  const map = await events.playerPositions({ guild_id: GUILD, club_key: 'main' }, ['u1', 'u2', 'u404']);
  const map2 = await events.playerPositions({ guild_id: GUILD, club_key: 'main' }, ['u6']);
  assert.deepStrictEqual(map2.get('u6'), { primary: 'CDM', secondary: ['CM'], emergency: ['CB'] });
  assert.deepStrictEqual(map.get('u1'), { primary: 'ST', secondary: ['CAM'], emergency: [] });
  assert.deepStrictEqual(map.get('u2'), { primary: 'CB', secondary: ['RB'], emergency: [] });
  assert.strictEqual(map.has('u404'), false);
});
