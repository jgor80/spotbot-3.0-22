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

test('ping rules: league -> signed role only, everything else -> @everyone, overrides win', () => {
  assert.deepStrictEqual(B.choosePing({ league: true, signedRoleId: '10' }), { kind: 'role', roleId: '10', signed: true });
  assert.deepStrictEqual(B.choosePing({ league: true }), { kind: 'everyone', missingSigned: true });
  assert.deepStrictEqual(B.choosePing({ league: false, signedRoleId: '10' }), { kind: 'everyone' });
  // League games with a signed role never ping anyone else
  assert.deepStrictEqual(B.choosePing({ pingRoleId: '7', league: true, signedRoleId: '10' }), { kind: 'role', roleId: '10', signed: true });
  assert.deepStrictEqual(B.choosePing({ pingRoleId: '7', league: true }), { kind: 'role', roleId: '7' });
  assert.deepStrictEqual(B.choosePing({ pingRoleId: '7', league: false, signedRoleId: '10' }), { kind: 'role', roleId: '7' });
  assert.deepStrictEqual(B.choosePing({ notify: 'none', league: true, signedRoleId: '10' }), { kind: 'none' });
  assert.deepStrictEqual(B.choosePing({ notify: 'everyone', league: true, signedRoleId: '10' }), { kind: 'role', roleId: '10', signed: true });
  assert.deepStrictEqual(B.choosePing({ notify: 'everyone', league: false, signedRoleId: '10' }), { kind: 'everyone' });
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
      let conflict = null;
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
        upsert: (p, opts) => ((op = 'upsert'), (payload = p), (conflict = opts?.onConflict), q),
        delete: () => ((op = 'delete'), q),
        run() {
          if (op === 'insert') {
            const row = { id: `00000000-0000-0000-0000-${String(++ids.n).padStart(12, '0')}`, created_at: new Date().toISOString(), closed: false, cancelled: false, ...payload };
            rows.push(row);
            return [row];
          }
          if (op === 'upsert') {
            const keys = String(conflict || 'id').split(',');
            return [].concat(payload).map((p) => {
              const row = rows.find((r) => keys.every((k) => r[k] === p[k]));
              if (row) return Object.assign(row, p);
              rows.push({ ...p });
              return p;
            });
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

// ---------- League games: signed players only ----------

const SIGNED = { id: '777', name: 'Signed Players' };
const withRoles = (id, ...roleIds) => ({ id, user: { id, bot: false }, roles: { cache: new Collection(roleIds.map((r) => [r, { id: r, name: r }])) } });

// A button press (or modal submit) as handleInteraction sees it
function press(customId, userId, member, { modal = null } = {}) {
  const calls = [];
  const record = (kind) => async (opts) => (calls.push({ kind, opts }), undefined);
  return {
    calls,
    customId,
    user: { id: userId },
    member,
    guildId: GUILD,
    message: { id: 'other-msg' },
    isModalSubmit: () => !!modal,
    isAutocomplete: () => false,
    isChatInputCommand: () => false,
    isButton: () => !modal,
    isStringSelectMenu: () => false,
    fields: { getTextInputValue: () => modal },
    reply: record('reply'),
    update: record('update'),
    deferReply: record('deferReply'),
    deferUpdate: record('deferUpdate'),
    editReply: record('editReply'),
    followUp: record('followUp'),
    showModal: record('showModal'),
  };
}

function leagueSetup() {
  const signed = withRoles('u1', '777');
  const unsigned = withRoles('u5');
  const ctx = setup({ roles: [SIGNED], members: [signed, unsigned] });
  const league = { id: '00000000-0000-0000-0000-0000000000b1', guild_id: GUILD, club_key: 'main', title: 'Palermo League', event_type: 'league', scheduled_at: later(5), channel_id: 'chan', closed: false };
  const friendly = { id: '00000000-0000-0000-0000-0000000000b2', guild_id: GUILD, club_key: 'main', title: 'Friendlies', event_type: 'match', scheduled_at: later(5), channel_id: 'chan', closed: false };
  ctx.tables.availability_events.push(league, friendly);
  return { ...ctx, signed, unsigned, league, friendly };
}

const answers = (tables, eventId) => tables.player_availability.filter((r) => r.event_id === eventId).map((r) => `${r.discord_user_id}:${r.response}`);

test('league games: players without the signed role cannot sign up; friendlies stay open', async () => {
  const { events, tables, signed, unsigned, league, friendly } = leagueSetup();

  const blocked = press(`ev_r:yes:${league.id}`, 'u5', unsigned);
  await events.handleInteraction(blocked);
  assert.strictEqual(blocked.calls[0].kind, 'reply');
  assert.match(blocked.calls[0].opts.content, /league game, so only players with the <@&777> role can sign up/);
  assert.strictEqual(blocked.calls[0].opts.flags, 64);
  assert.deepStrictEqual(answers(tables, league.id), []);

  // Maybe / Unavailable are blocked too, and so are notes (which would add a Maybe)
  await events.handleInteraction(press(`ev_r:no:${league.id}`, 'u5', unsigned));
  const note = press(`ev_notem:${league.id}`, 'u5', unsigned, { modal: 'late' });
  await events.handleInteraction(note);
  assert.match(note.calls[0].opts.content, /only players with the <@&777> role/);
  assert.deepStrictEqual(answers(tables, league.id), []);

  await events.handleInteraction(press(`ev_r:yes:${league.id}`, 'u1', signed));
  assert.deepStrictEqual(answers(tables, league.id), ['u1:yes']);

  // A tap from a DM has no member: the signed role is checked on the server member
  await events.handleInteraction(press(`ev_r:maybe:${league.id}`, 'u5', null));
  assert.deepStrictEqual(answers(tables, league.id), ['u1:yes']);

  await events.handleInteraction(press(`ev_r:yes:${friendly.id}`, 'u5', unsigned));
  assert.deepStrictEqual(answers(tables, friendly.id), ['u5:yes']);
});

test('league games: position sign-up buttons are blocked for players without the signed role', async () => {
  const { events, tables, unsigned, league } = leagueSetup();
  const pick = press(`ev_posok:${league.id}:ST`, 'u5', unsigned);
  await events.handleInteraction(pick);
  assert.strictEqual(pick.calls[0].kind, 'update');
  assert.match(pick.calls[0].opts.content, /only players with the <@&777> role/);
  assert.deepStrictEqual(pick.calls[0].opts.components, []);
  assert.deepStrictEqual(answers(tables, league.id), []);
});

test('raw interaction members (role id arrays) count as signed', async () => {
  assert.strictEqual(B.memberHasRole({ roles: ['777'] }, '777'), true);
  assert.strictEqual(B.memberHasRole({ roles: [] }, '777'), false);
  assert.strictEqual(B.memberHasRole(null, '777'), false);
  const { events, tables, league } = leagueSetup();
  await events.handleInteraction(press(`ev_r:yes:${league.id}`, 'u1', { roles: ['777'] }));
  assert.deepStrictEqual(answers(tables, league.id), ['u1:yes']);
});

test('league games: reminders and alerts only go to signed players', async () => {
  const { events, league, friendly } = leagueSetup();
  // Roster is u1 (signed) and u5 (not signed)
  assert.deepStrictEqual((await events.expectedPlayers(league)).expected, ['u1']);
  assert.deepStrictEqual((await events.expectedPlayers(friendly)).expected, ['u1', 'u5']);
  assert.deepStrictEqual(await events.onlySigned(league, ['u1', 'u5', 'u404']), ['u1']);
  assert.deepStrictEqual(await events.onlySigned(friendly, ['u1', 'u5']), ['u1', 'u5']);
});

test('league games without a signed-players role stay open to everyone', async () => {
  const ctx = setup({ members: [withRoles('u5')] });
  const league = { id: '00000000-0000-0000-0000-0000000000b3', guild_id: GUILD, club_key: 'main', title: 'League', event_type: 'league', scheduled_at: later(5), closed: false };
  ctx.tables.availability_events.push(league);
  await ctx.events.handleInteraction(press(`ev_r:yes:${league.id}`, 'u5', withRoles('u5')));
  assert.deepStrictEqual(answers(ctx.tables, league.id), ['u5:yes']);
  assert.deepStrictEqual((await ctx.events.expectedPlayers(league)).expected, ['u1', 'u5']);
});

test('league post pings only the signed role, even when another ping role is picked', async () => {
  const { events, sent, channel } = setup({ roles: [SIGNED, { id: '888', name: 'Everyone Else' }] });
  await events.postEvent({ guild_id: GUILD, club_key: 'main', title: 'Palermo League', event_type: 'league', scheduled_at: later(5), channel_id: 'chan', ping_role_id: '888' }, channel, { notify: 'everyone' });
  assert.strictEqual(sent[0].content, '<@&777>');
  assert.deepStrictEqual(sent[0].allowedMentions, { parse: [], users: [], roles: ['777'], repliedUser: false });
});
