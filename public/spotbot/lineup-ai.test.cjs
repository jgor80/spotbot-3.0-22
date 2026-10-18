const test = require('node:test');
const assert = require('node:assert');
const { pickLineup, tierFit, FORMATION_SLOTS } = require('./lineup-autofill.cjs');
const { createLineupAi, applyChanges } = require('./lineup-ai.cjs');

const SLOTS = FORMATION_SLOTS['4-4-2 FLAT'];
const id = (n) => `1000000000000000${String(n).padStart(2, '0')}`;
const player = (n, tiers, extra = {}) => ({ discord_user_id: id(n), overall_rating: 70, preferences: [], tiers, ...extra });

test('tiers decide the fit: comp before plays well before emergency', () => {
  assert.equal(tierFit({ primary: 'ST', secondary: ['CAM'], emergency: ['CB'] }, 'ST'), 'primary');
  assert.equal(tierFit({ primary: 'ST', secondary: ['CAM'], emergency: ['CB'] }, 'CAM'), 'secondary');
  assert.equal(tierFit({ primary: 'ST', secondary: ['CAM'], emergency: ['CB'] }, 'CB'), 'emergency');
  assert.equal(tierFit({ primary: 'ST' }, 'GK'), 'none');
  assert.equal(tierFit({ primary: 'LWB' }, 'LB'), 'primary'); // older positions read as their button
  assert.equal(tierFit(null, 'ST'), null);

  // Two strikers' spots, a comp striker and a player who only covers ST in an emergency
  const { starters } = pickLineup(['ST', 'CB'], [player(1, { primary: 'CB', emergency: ['ST'] }), player(2, { primary: 'ST' })]);
  assert.equal(starters.get(0), id(2));
  assert.equal(starters.get(1), id(1));
});

test('a Yes beats an equally good Maybe, and the Maybe waits on the bench', () => {
  const { starters, bench } = pickLineup(['GK'], [player(1, { primary: 'GK' }, { maybe: true }), player(2, { primary: 'GK' })]);
  assert.equal(starters.get(0), id(2));
  assert.deepEqual(bench, [id(1)]);
  // ...but a Maybe still fills a gap no Yes can cover
  const gap = pickLineup(['GK', 'ST'], [player(1, { primary: 'GK' }, { maybe: true }), player(2, { primary: 'ST' })]);
  assert.equal(gap.starters.get(0), id(1));
});

test('changes move a player onto a spot and bench whoever was there', () => {
  const plan = {
    formation: '4-4-2 FLAT',
    slots: SLOTS,
    tiers: new Map([[id(3), { primary: 'ST' }]]),
    rows: [
      { slot_index: 0, position: 'GK', discord_user_id: id(1), is_substitute: false },
      { slot_index: 9, position: 'ST', discord_user_id: id(2), is_substitute: false },
      { slot_index: SLOTS.length, position: 'ST', discord_user_id: id(3), is_substitute: true },
    ],
  };
  const next = applyChanges(plan, [{ slot: 9, player_id: id(3) }]);
  const starter = next.rows.find((r) => r.slot_index === 9);
  assert.equal(starter.discord_user_id, id(3));
  assert.deepEqual(next.rows.filter((r) => r.is_substitute).map((r) => r.discord_user_id), [id(2)]);
  assert.throws(() => applyChanges(plan, [{ slot: 40, player_id: id(3) }]), /isn't a spot/);
  assert.throws(() => applyChanges(plan, [{ slot: 1, player_id: 'striker' }]), /Discord user ID/);
});

// Bot-side bridge with stand-ins for events, autopilot and Discord
function setup({ leader = true, answers } = {}) {
  const guildId = '222222222222222222';
  const event = { id: '3f1c2b4a-1111-4222-8333-444455556666', guild_id: guildId, club_key: 'main', channel_id: '555555555555555555', title: 'League night' };
  const members = new Map([[id(1), { displayName: 'Keeper' }], [id(9), { displayName: 'Captain' }]]);
  const guild = { members: { cache: members, fetch: async (u) => members.get(u) || null } };
  const posted = [];
  const saved = [];
  const responses = answers || [{ discord_user_id: id(1), response: 'yes' }, { discord_user_id: id(2), response: 'no' }];
  const ai = createLineupAi({
    getClient: () => ({ guilds: { cache: new Map([[guildId, guild]]) } }),
    events: { loadEvent: async (e) => (e === event.id ? event : null), clubFor: async () => ({ key: 'main', name: 'Palermo' }), loadResponses: async () => responses },
    autopilot: {
      formations: () => ['4-4-2 FLAT'],
      draft: async (_e, _c, pool, formation) => ({
        formation: formation || '4-4-2 FLAT',
        slots: SLOTS,
        rows: pool.map((u, i) => ({ slot_index: i, position: SLOTS[i], discord_user_id: u, is_substitute: false })),
        fits: new Map(pool.map((u) => [u, 'primary'])),
        answers: new Map(responses.map((r) => [r.discord_user_id, r.response])),
        pairs: [],
      }),
      saveDraft: async (...args) => { saved.push(args); return 'lineup-1'; },
    },
    canManageClub: async () => leader,
    callEdgeFunction: async (name, body) => { posted.push({ name, body }); return { data: { success: true } }; },
    supabase: { from: () => ({ select: () => ({ eq: () => ({ order: () => ({ limit: () => ({ maybeSingle: async () => ({ data: null }) }) }) }) }) }) },
  });
  return { ai, guildId, event, posted, saved };
}

test('suggest picks from Available answers and names who is out, posting nothing', async () => {
  const { ai, guildId, event, posted } = setup();
  const s = await ai.handle('suggest', { guildId, userId: id(9), eventId: event.id });
  assert.equal(s.starting_xi[0].player, 'Keeper');
  assert.equal(s.starting_xi[0].fit, 'comp position');
  assert.equal(s.open_spots.length, SLOTS.length - 1);
  assert.deepEqual(s.not_available, [id(2)]);
  assert.equal(posted.length, 0);
});

test('publish previews without saving, then saves and posts for leaders only', async () => {
  const { ai, guildId, event, posted, saved } = setup();
  const preview = await ai.handle('publish', { guildId, userId: id(9), eventId: event.id });
  assert.equal(preview.replaces_existing_team_sheet, false);
  assert.equal(saved.length + posted.length, 0);
  const done = await ai.handle('publish', { guildId, userId: id(9), eventId: event.id, confirm: true });
  assert.equal(done.published, true);
  assert.equal(posted[0].name, 'announce-lineup');
  assert.equal(posted[0].body.channel_id, event.channel_id);

  const player = setup({ leader: false });
  await assert.rejects(player.ai.handle('publish', { guildId, userId: id(9), eventId: event.id, confirm: true }), /leaders/);
  assert.equal(player.posted.length, 0);
});

test('no answers, wrong server or unknown formation give a clear error', async () => {
  const empty = setup({ answers: [] });
  await assert.rejects(empty.ai.handle('suggest', { guildId: empty.guildId, userId: id(9), eventId: empty.event.id }), /Nobody has answered/);
  const { ai, guildId, event } = setup();
  await assert.rejects(ai.handle('suggest', { guildId: '333333333333333333', userId: id(9), eventId: event.id }), /not found/);
  await assert.rejects(ai.handle('suggest', { guildId, userId: id(9), eventId: event.id, formation: '9-0-1' }), /Unknown formation/);
});
