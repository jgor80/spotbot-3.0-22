const test = require('node:test');
const assert = require('node:assert');
const { Collection } = require('discord.js');
const { createHubOnboarding, cleanGamertag, cleanTwitch, stepsOf, REGIONS, regionRoleName } = require('./hub-onboarding.cjs');

test('gamertags and Twitch names are cleaned or refused', () => {
  assert.equal(cleanGamertag('  Air Dangus_23 '), 'Air Dangus_23');
  assert.equal(cleanGamertag('<@123>'), null);
  assert.equal(cleanGamertag('ab'), null);
  assert.equal(cleanTwitch('https://www.twitch.tv/SomeStreamer/videos'), 'somestreamer');
  assert.equal(cleanTwitch('@cool_one'), 'cool_one');
  assert.equal(cleanTwitch('not a name'), null);
});

test('steps count only the required ones as missing', () => {
  const steps = stepsOf({ platform: 'ps5', region: REGIONS[0], gamertag: 'X', positions: ['ST'], twitch: null, pings: false });
  assert.ok(steps.filter((s) => !s.optional).every((s) => s.done));
  assert.ok(steps.some((s) => s.optional && !s.done));
});

// A fake server, profile table and member
function world(profile = null) {
  const profiles = new Map(profile ? [['u1', { discord_user_id: 'u1', ...profile }]] : []);
  const roleCache = new Collection();
  const memberRoles = new Collection();
  let n = 0;
  const member = {
    id: 'u1',
    roles: {
      cache: memberRoles,
      add: async (r) => memberRoles.set(r.id, r),
      remove: async (r) => memberRoles.delete(r.id),
    },
  };
  const guild = {
    id: 'g1',
    name: 'The Spot',
    roles: { cache: roleCache, create: async (o) => { const r = { id: `r${++n}`, ...o }; roleCache.set(r.id, r); return r; } },
    members: { me: { permissions: { has: () => true } }, fetch: async () => member },
  };
  const table = () => {
    const f = {};
    const api = {
      select: () => api,
      eq: (k, v) => ((f[k] = v), api),
      ilike: (k, v) => ((f.ilike = [k, v]), api),
      neq: (k, v) => ((f.neq = v), api),
      limit: () => api,
      maybeSingle: async () => {
        if (f.ilike) return { data: [...profiles.values()].find((p) => String(p[f.ilike[0]] || '').toLowerCase() === f.ilike[1].toLowerCase() && p.discord_user_id !== f.neq) || null };
        return { data: profiles.get(f.discord_user_id) || null };
      },
      update: (fields) => ({ eq: async (k, v) => (profiles.set(v, { ...profiles.get(v), ...fields }), { error: null }) }),
      insert: async (row) => (profiles.set(row.discord_user_id, row), { error: null }),
    };
    return api;
  };
  const linked = [];
  const badges = [];
  const ob = createHubOnboarding({
    supabase: { from: () => table() },
    hubOf: async () => ({ on: true, board_channel_id: 'board', start_channel_id: 'start' }),
    autoLink: { link: async (id, tag, platform) => { linked.push([id, tag, platform]); profiles.set(id, { ...profiles.get(id), discord_user_id: id, ea_username: tag }); return { ok: true }; } },
    getUserPrefs: async () => ['ST'],
    xp: () => ({ record: async (g, m) => badges.push(...m.get('u1').badges) }),
  });
  const replies = [];
  const ix = (customId, extra = {}) => ({
    guildId: 'g1',
    guild,
    customId,
    user: { id: 'u1' },
    isButton: () => !extra.values && !extra.fields,
    isStringSelectMenu: () => !!extra.values,
    isModalSubmit: () => !!extra.fields,
    isFromMessage: () => true,
    deferUpdate: async () => {},
    deferReply: async () => {},
    editReply: async (m) => replies.push(m),
    showModal: async (m) => replies.push(m),
    ...extra,
  });
  return { ob, profiles, member, guild, ix, replies, linked, badges };
}

test('the setup card walks through platform, region, gamertag and Twitch', async () => {
  const w = world();
  assert.equal(await w.ob.handleInteraction(w.ix('ob_start')), true);
  assert.match(w.replies.at(-1).embeds[0].toJSON().title, /Get set up · 1\/4/); // positions come from the tiers
  await w.ob.handleInteraction(w.ix('ob_plat', { values: ['xbox-series-xs'] }));
  assert.equal(w.profiles.get('u1').ea_platform, 'xbox-series-xs');
  await w.ob.handleInteraction(w.ix('ob_region', { values: ['eu'] }));
  assert.ok(w.member.roles.cache.some((r) => r.name === regionRoleName(REGIONS[1])));
  await w.ob.handleInteraction(w.ix('ob_region', { values: ['uki'] }));
  assert.deepEqual(w.member.roles.cache.map((r) => r.name), [regionRoleName(REGIONS[0])], 'one region at a time');
  const values = { gamertag: 'Pro Nine', twitch: 'twitch.tv/ProNine' };
  await w.ob.handleInteraction(w.ix('ob_links_m', { fields: { getTextInputValue: (k) => values[k] } }));
  assert.deepEqual(w.linked, [['u1', 'Pro Nine', 'xbox-series-xs']]);
  assert.equal(w.profiles.get('u1').twitch_username, 'pronine');
  const card = w.replies.at(-1);
  assert.match(card.embeds[0].toJSON().title, /all set/);
  assert.deepEqual(card.allowedMentions, { parse: [] });
  await w.ob.handleInteraction(w.ix('ob_done'));
  assert.deepEqual(w.badges, ['kitted_out']);
});

test('a Twitch channel someone else has is refused, and Finish without the basics gives no badge', async () => {
  const w = world();
  w.profiles.set('u2', { discord_user_id: 'u2', twitch_username: 'taken' });
  await w.ob.handleInteraction(w.ix('ob_links_m', { fields: { getTextInputValue: (k) => (k === 'twitch' ? 'taken' : '') } }));
  assert.match(w.replies.at(-1).embeds[0].toJSON().description, /already linked/);
  await w.ob.handleInteraction(w.ix('ob_done'));
  assert.deepEqual(w.badges, []);
});

test('game pings toggle the Up for a Game role', async () => {
  const w = world();
  await w.ob.handleInteraction(w.ix('ob_ping'));
  assert.ok(w.member.roles.cache.some((r) => r.name === 'Up for a Game'));
  await w.ob.handleInteraction(w.ix('ob_ping'));
  assert.equal(w.member.roles.cache.size, 0);
});

test('other buttons are left alone', async () => {
  const w = world();
  assert.equal(await w.ob.handleInteraction(w.ix('sh_play')), false);
});
