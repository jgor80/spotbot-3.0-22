const test = require('node:test');
const assert = require('node:assert');
const { createKitCatalog, CLASSIC, PALERMO, clubKit, search, swatchSheet } = require('./kit-catalog.cjs');

test('the catalogue starts with original classics and Palermo, no real brands', () => {
  assert.ok(CLASSIC.length >= 20);
  assert.ok(PALERMO.length >= 5);
  for (const k of CLASSIC) assert.match(k.key, /^classic:/);
});

test('club kits need colours, and search matches every word', () => {
  assert.equal(clubKit('g', { key: 'club1', name: 'X' }), null);
  assert.equal(clubKit('g', { key: 'club1', name: 'Night Owls', colors: { primary: '#112233' } }).key, 'club:g:club1');
  const found = search(CLASSIC, 'red stripes');
  assert.deepEqual(found.map((k) => k.label), ['Red & Black Stripes']);
});

test('swatch sheets render', () => {
  assert.equal(swatchSheet(CLASSIC.slice(0, 25), 'POPULAR').subarray(1, 4).toString(), 'PNG');
});

function world(hubOn = true) {
  const profiles = new Map();
  const bumps = [];
  const from = (t) => {
    const f = {};
    const api = {
      select: () => api,
      eq: (k, v) => ((f[k] = v), api),
      is: () => api,
      in: () => api,
      order: () => api,
      limit: async () => ({ data: t === 'kit_popularity' ? bumps.map((b) => ({ kit_key: b.p_key, kit: b.p_kit, picks: 1 })) : [] }),
      maybeSingle: async () => ({ data: profiles.get(f.discord_user_id) || null }),
      update: (v) => ({ eq: async (k, id) => (profiles.set(id, { ...profiles.get(id), ...v }), { error: null }) }),
      insert: async (row) => (profiles.set(row.discord_user_id, row), { error: null }),
    };
    return api;
  };
  const kits = createKitCatalog({
    supabase: { from, rpc: async (name, args) => (bumps.push(args), { error: null }) },
    getGuildState: async () => ({ clubs: [{ key: 'club1', name: 'Night Owls', enabled: true, colors: { primary: '#123456', secondary: '#ffffff' } }] }),
    hubOf: async () => ({ on: hubOn }),
  });
  return { kits, profiles, bumps };
}

test('a picked kit is saved, counted, shown first and used for cards on hub servers only', async () => {
  const w = world();
  const owls = (await w.kits.catalogue('g')).find((k) => k.label === 'Night Owls');
  assert.ok(owls);
  assert.equal(await w.kits.choose('u1', owls), null);
  assert.equal(w.profiles.get('u1').studio_kit.label, 'Night Owls');
  assert.equal(w.bumps[0].p_key, 'club:g:club1');
  assert.equal((await w.kits.popularKits())[0].key, 'club:g:club1');
  assert.equal((await w.kits.personalKit('g', 'u1')).primary, '#123456');
  const off = world(false);
  await off.kits.choose('u1', owls);
  assert.equal(await off.kits.personalKit('g', 'u1'), null);
});

test('the picker shows two menus of popular kits without pings', async () => {
  const w = world();
  const view = await w.kits.picker('u1');
  assert.equal(view.files.length, 2);
  assert.equal(view.components.length, 3);
  assert.deepEqual(view.allowedMentions, { parse: [] });
});
