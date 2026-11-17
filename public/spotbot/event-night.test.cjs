// Game nights: 2 to 4 games on one night (event-night.cjs + events.cjs). One ping for the night,
// "for all" answers, one reminder DM per player, and later boards never ping.
const test = require('node:test');
const assert = require('node:assert');
const { Collection } = require('discord.js');
const N = require('./event-night.cjs');
const { createEvents } = require('./events.cjs');

const TZ = 'Europe/London';
const at = (iso) => new Date(iso);
const hhmm = (d) => new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }).format(d);

test('back to back: first kick-off, games and gap', () => {
  const { kickoffs } = N.planKickoffs({ first: at('2026-11-19T21:00:00Z'), games: '3', gapMinutes: '30', tz: TZ });
  assert.deepStrictEqual(kickoffs.map(hhmm), ['21:00', '21:30', '22:00']);
  assert.deepStrictEqual(N.durations(kickoffs), [30, 30, 60]);
  // Defaults: 3 games, 30 minutes apart
  assert.strictEqual(N.planKickoffs({ first: at('2026-11-19T21:00:00Z'), tz: TZ }).kickoffs.length, 3);
});

test('set times: clock times, +minutes and past midnight', () => {
  const first = at('2026-11-19T22:30:00Z');
  assert.deepStrictEqual(N.planKickoffs({ first, times: '23:15, 0:05', tz: TZ }).kickoffs.map((d) => d.toISOString()), [
    '2026-11-19T22:30:00.000Z',
    '2026-11-19T23:15:00.000Z',
    '2026-11-20T00:05:00.000Z',
  ]);
  assert.deepStrictEqual(N.planKickoffs({ first, times: '+40 +40', tz: TZ }).kickoffs.map(hhmm), ['22:30', '23:10', '23:50']);
  assert.deepStrictEqual(N.planKickoffs({ first: at('2026-11-19T21:00:00Z'), times: '9:45pm and 10:30pm', tz: TZ }).kickoffs.map(hhmm), ['21:00', '21:45', '22:30']);
  // Times override games/gap
  assert.strictEqual(N.planKickoffs({ first, games: '4', gapMinutes: '60', times: '23:00', tz: TZ }).kickoffs.length, 2);
});

test('bad nights are refused with a reason', () => {
  const first = at('2026-11-19T21:00:00Z');
  assert.match(N.planKickoffs({ first, games: '5', tz: TZ }).error, /2 to 4/);
  assert.match(N.planKickoffs({ first, times: '21:05', tz: TZ }).error, /15 minutes/);
  assert.match(N.planKickoffs({ first, times: 'later', tz: TZ }).error, /couldn't read/);
  assert.match(N.planKickoffs({ first, times: '21:30, 22:00, 22:30, 23:00', tz: TZ }).error, /up to 4/);
});

test('titles and the running order', () => {
  assert.strictEqual(N.gameTitle('Palermo League night', 1, 3), 'Palermo League night · Game 2 of 3');
  assert.ok(N.gameTitle('x'.repeat(120), 0, 3).length <= 100);
  const games = [{ id: 'a', scheduled_at: '2026-11-19T21:00:00Z' }, { id: 'b', scheduled_at: '2026-11-19T21:30:00Z', cancelled: true }];
  assert.strictEqual(N.scheduleLine(games, 'a'), `**1️⃣ <t:${Date.parse(games[0].scheduled_at) / 1000}:t>** · 2️⃣ <t:${Date.parse(games[1].scheduled_at) / 1000}:t> ~~cancelled~~`);
  const by = N.waitingByPlayer([{ game: games[0], waiting: ['u1', 'u2'] }, { game: games[1], waiting: ['u1'] }]);
  assert.deepStrictEqual([...by.entries()].map(([id, g]) => [id, g.map((x) => x.id)]), [['u1', ['a', 'b']], ['u2', ['a']]]);
});

// ---------- With a fake database and server ----------

function fakeDb(tables) {
  let n = 0;
  return {
    from(name) {
      const rows = (tables[name] = tables[name] || []);
      const filters = [];
      let op = 'select';
      let payload = null;
      let conflict = null;
      let orderKey = null;
      const q = {
        select: () => q,
        eq: (k, v) => (filters.push((r) => r[k] === v), q),
        neq: (k, v) => (filters.push((r) => r[k] !== v), q),
        in: (k, vs) => (filters.push((r) => vs.includes(r[k])), q),
        not: () => q, gte: () => q, lte: () => q, gt: () => q, ilike: () => q, limit: () => q,
        order: (k) => ((orderKey = k), q),
        insert: (p) => ((op = 'insert'), (payload = p), q),
        update: (p) => ((op = 'update'), (payload = p), q),
        upsert: (p, o) => ((op = 'upsert'), (payload = p), (conflict = o?.onConflict), q),
        delete: () => ((op = 'delete'), q),
        run() {
          if (op === 'insert') {
            return [].concat(payload).map((p) => {
              const row = { id: `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`, created_at: new Date(Date.now() - 6 * 3600000).toISOString(), closed: false, cancelled: false, deadline_reminder_sent: false, ...p };
              rows.push(row);
              return row;
            });
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
          let hit = rows.filter((r) => filters.every((f) => f(r)));
          if (op === 'update') hit.forEach((r) => Object.assign(r, payload));
          if (op === 'delete') { for (const r of hit) rows.splice(rows.indexOf(r), 1); return []; }
          if (orderKey) hit = [...hit].sort((a, b) => String(a[orderKey]).localeCompare(String(b[orderKey])));
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

function setup() {
  const tables = {
    guild_settings: [{ guild_id: GUILD, timezone: TZ, branding: {} }],
    team_rosters: [
      { team_id: 'team-1', discord_user_id: 'u1', primary_position: 'ST' },
      { team_id: 'team-1', discord_user_id: 'u5', primary_position: 'GK' },
    ],
    player_availability: [],
    availability_events: [],
  };
  const sent = [];
  const dms = [];
  const role = { id: '777', name: 'Signed Players', mentionable: true };
  const members = new Collection([
    ['u1', { id: 'u1', roles: { cache: new Collection([['777', role]]) } }],
    ['u5', { id: 'u5', roles: { cache: new Collection([['777', role]]) } }],
  ]);
  const guild = { id: GUILD, roles: { cache: new Collection([['777', role]]) }, members: { cache: members, fetch: async () => members, me: { id: 'bot' } } };
  let msgN = 0;
  const messages = new Map();
  const channel = {
    id: '222222222222222222',
    guild,
    send: async (opts) => {
      sent.push(opts);
      const msg = { id: `m${++msgN}`, edit: async () => {}, reply: async (o) => (sent.push({ reply: true, ...o }), {}), delete: async () => {} };
      messages.set(msg.id, msg);
      return msg;
    },
    messages: { fetch: async (id) => messages.get(id) || null },
    permissionsFor: () => ({ has: () => true }),
  };
  const client = {
    guilds: { cache: new Collection([[GUILD, guild]]) },
    channels: { fetch: async () => channel },
    users: { fetch: async (id) => ({ id, send: async (o) => (dms.push({ id, ...o }), {}) }) },
  };
  const state = { clubs: [{ key: 'main', name: 'Palermo FC', team_id: 'team-1', signed_role_id: '777' }] };
  const events = createEvents({ supabase: fakeDb(tables), getGuildState: async () => state, saveGuildSettings: async () => {}, isManager: () => true });
  events.start(client);
  return { events, tables, sent, dms, guild, channel };
}

function command(guild, channel, opts, user = 'lead') {
  const replies = [];
  return {
    replies,
    guildId: GUILD,
    guild,
    channel,
    member: { id: user, roles: { cache: new Collection() } },
    user: { id: user },
    commandName: 'event',
    isModalSubmit: () => false,
    isAutocomplete: () => false,
    isChatInputCommand: () => true,
    options: {
      getSubcommandGroup: () => null,
      getSubcommand: () => 'night',
      getString: (k) => opts[k] ?? null,
      getRole: () => null,
      getChannel: () => null,
      getBoolean: () => null,
    },
    reply: async (o) => replies.push(o),
    deferReply: async () => {},
    editReply: async (o) => replies.push(o),
  };
}

function button(guild, customId, user) {
  const replies = [];
  return {
    replies,
    customId,
    guildId: GUILD,
    guild,
    member: { id: user, roles: { cache: new Collection([['777', {}]]) } },
    user: { id: user },
    message: { id: 'elsewhere' },
    isModalSubmit: () => false,
    isAutocomplete: () => false,
    isChatInputCommand: () => false,
    isButton: () => true,
    isStringSelectMenu: () => false,
    reply: async (o) => replies.push(o),
    deferReply: async () => {},
    deferUpdate: async () => {},
    editReply: async (o) => replies.push(o),
    followUp: async (o) => replies.push(o),
  };
}

const inHours = (h) => {
  const d = new Date(Date.now() + h * 3600000);
  return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')} ${hhmm(d)}`;
};

test('a league night posts three linked games and pings the signed role once', async () => {
  const { events, tables, sent, guild, channel } = setup();
  const i = command(guild, channel, { when: inHours(5), games: '3', gap: '30', type: 'league' });
  await events.handleInteraction(i);
  const games = tables.availability_events;
  assert.strictEqual(games.length, 3, JSON.stringify(i.replies));
  assert.strictEqual(new Set(games.map((g) => g.night_id)).size, 1);
  assert.deepStrictEqual(games.map((g) => g.night_game), [1, 2, 3]);
  assert.match(games[1].title, /· Game 2 of 3$/);
  assert.strictEqual(new Set(games.map((g) => g.deadline_at)).size, 1, 'one deadline for the night');
  assert.strictEqual((Date.parse(games[2].scheduled_at) - Date.parse(games[0].scheduled_at)) / 60000, 60);

  assert.strictEqual(sent.length, 3);
  assert.match(sent[0].content, /^<@&777> 🌙 \*\*3 games tonight\*\*/);
  assert.deepStrictEqual(sent[0].allowedMentions.roles, ['777']);
  for (const later of sent.slice(1)) {
    assert.strictEqual(later.content, undefined, 'later boards never ping');
    assert.deepStrictEqual(later.allowedMentions, { parse: [], users: [], roles: [], repliedUser: false });
  }
  const labels = sent[1].components.flatMap((r) => r.components.map((c) => c.data.label));
  assert.ok(labels.includes('Available for all 3'));
  assert.match(sent[1].embeds[0].data.description, /🌙 Game 2 of 3 tonight/);
  assert.match(i.replies.at(-1).content, /Posted \*\*3 games\*\*/);
});

test('"Available for all" answers every game; reminders DM each player once for the night', async () => {
  const { events, tables, dms, guild, channel } = setup();
  await events.handleInteraction(command(guild, channel, { when: inHours(2), games: '3', gap: '30', type: 'friendly' }));
  const games = tables.availability_events;
  const nightId = games[0].night_id;

  const tap = button(guild, `ev_all:yes:${nightId}`, 'u1');
  await events.handleInteraction(tap);
  const u1 = tables.player_availability.filter((r) => r.discord_user_id === 'u1');
  assert.deepStrictEqual(u1.map((r) => r.response), ['yes', 'yes', 'yes']);
  assert.match(tap.replies.at(-1).content, /all 3 games/);

  // u1 changes their mind for game 3 only; u5 hasn't answered anything
  tables.player_availability.find((r) => r.discord_user_id === 'u1' && r.event_id === games[2].id).response = 'no_response';
  await events.runScheduler();
  assert.deepStrictEqual(dms.map((d) => d.id).sort(), ['u1', 'u5'], 'one DM per player, not one per game');
  assert.match(dms.find((d) => d.id === 'u5').content, /any of the 3 games/);
  assert.match(dms.find((d) => d.id === 'u1').content, /Game 3/);
  assert.ok(games.every((g) => g.deadline_reminder_sent));
  await events.runScheduler();
  assert.strictEqual(dms.length, 2, 'no second round');
});

// ---------- Lineups across the night (event-lineup.cjs) ----------

test('copying a lineup to the other games: quiet posts, Unavailable players swapped out, one DM per player', async () => {
  const { createEventLineup } = require('./event-lineup.cjs');
  const nightId = '99999999-9999-4999-8999-999999999999';
  const games = [1, 2, 3].map((k) => ({
    id: `0000000${k}-0000-4000-8000-000000000000`, guild_id: GUILD, club_key: 'main', night_id: nightId, night_game: k,
    title: `Palermo night · Game ${k} of 3`, scheduled_at: new Date(Date.now() + (2 + k / 2) * 3600000).toISOString(), channel_id: 'chan', closed: false, cancelled: false,
  }));
  const tables = {
    availability_events: games,
    lineups: [{ id: 'src', event_id: games[0].id, formation: '4-3-3 FLAT', message_id: 'posted', created_at: new Date().toISOString() }],
    lineup_slots: [
      { lineup_id: 'src', discord_user_id: 'u1', position: 'ST', slot_index: 9, is_substitute: false },
      { lineup_id: 'src', discord_user_id: 'u5', position: 'GK', slot_index: 0, is_substitute: false },
    ],
    player_availability: [
      { event_id: games[2].id, discord_user_id: 'u5', response: 'no' },
      { event_id: games[2].id, discord_user_id: 'u7', response: 'yes' },
    ],
  };
  const db = fakeDb(tables);
  const realFrom = db.from;
  db.from = (name) => {
    const q = realFrom(name);
    const origNot = q.not;
    q.not = (k, op, v) => (op === 'is' && v === null ? q.neq(k, null) && q.neq(k, undefined) : origNot());
    return q;
  };
  const posts = [];
  const dms = [];
  const channel = { id: 'chan', send: async (o) => (posts.push(o), { id: `p${posts.length}` }) };
  const client = { channels: { fetch: async () => channel }, users: { fetch: async (id) => ({ id, send: async (o) => (dms.push({ id, ...o }), {}) }) } };
  let handler;
  const events = {
    nightGames: async () => games,
    nightTitle: (e) => e.title.replace(/ · Game \d+ of \d+$/, ''),
    loadEvent: async (id) => games.find((g) => g.id === id),
    loadResponses: async (id) => tables.player_availability.filter((r) => r.event_id === id),
    playerPositions: async () => new Map([['u7', { primary: 'GK', secondary: [], emergency: [] }]]),
    getClient: () => client,
    pingFor: async (_e, text) => ({ content: `<@&777> ${text}`, allowedMentions: { parse: [], users: [], roles: ['777'], repliedUser: false } }),
    setNightLineupHandler: (fn) => { handler = fn; },
    onTick: () => {},
  };
  createEventLineup({ supabase: db, events, isManager: () => true, getGuildState: async () => ({}) });
  const result = await handler({ event: games[0], mode: 'copy', userId: 'lead' });
  assert.match(result.message, /Lineups published for Game 2, Game 3/, result.message);
  assert.match(result.message, /<@u5> said Unavailable/);

  const copies = tables.lineups.filter((l) => l.id !== 'src');
  assert.strictEqual(copies.length, 2);
  const slotsOf = (l) => tables.lineup_slots.filter((s) => s.lineup_id === l.id && !s.is_substitute).map((s) => `${s.position}:${s.discord_user_id}`).sort();
  assert.deepStrictEqual(slotsOf(copies[0]), ['GK:u5', 'ST:u1']);
  assert.deepStrictEqual(slotsOf(copies[1]), ['GK:u7', 'ST:u1'], 'u5 is out of game 3, u7 fills in');

  assert.strictEqual(posts.length, 2);
  for (const p of posts) assert.deepStrictEqual(p.allowedMentions.roles, [], 'game 1 already pinged for its lineup');

  assert.deepStrictEqual(dms.map((d) => d.id).sort(), ['u1', 'u5', 'u7']);
  const u1 = dms.find((d) => d.id === 'u1');
  assert.match(u1.content, /Your lineups for \*\*Palermo night\*\*/);
  assert.match(u1.content, /2️⃣ .* starting at \*\*ST\*\*\n3️⃣ .* starting at \*\*ST\*\*/);
  assert.strictEqual(u1.components[0].components[0].data.custom_id, `evl_okall:${nightId}`);
});
