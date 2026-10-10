const { test } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const { Resvg } = require('@resvg/resvg-js');
const { nextVariation } = require('./graphics-variants.cjs');
let lastSvg = '';
const fetchedLogos = [];
const testLogo = 'data:image/png;base64,' + new Resvg('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="pink"/></svg>').render().asPng().toString('base64');
const originalLoad = Module._load;
Module._load = function (request, parent, ...args) {
  if (parent?.filename.endsWith('graphics-studio.cjs') && request === './graphics.cjs') return {
    esc: (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;'),
    fetchImage: async (url) => { fetchedLogos.push(url); return testLogo; },
    render: (svg) => { lastSvg = svg; return new Resvg(svg).render().asPng(); },
  };
  if (parent?.filename.endsWith('graphics-studio.cjs') && request === './manager-hub.cjs') return { activeClubs: (s) => s?.clubs || [] };
  return originalLoad.call(this, request, parent, ...args);
};
const { createGraphicsStudio, playerCard, STYLES, recruitmentPoster, palette } = require('./graphics-studio.cjs');
Module._load = originalLoad;

function fixture(overrides = {}) {
  const calls = [], posts = [], requests = [];
  const club = { key: 'palermo', name: 'PCN Palermo', kit: { primary: 'pink', secondary: 'black' } };
  const db = { from(table) {
    assert.ok(calls.includes('deferUpdate'), 'acknowledge before loading player data');
    const result = Object.hasOwn(overrides, table) ? overrides[table] : table === 'teams' ? { id: 'palermo-team' } : table === 'team_rosters' ? [{ discord_user_id: '501557839932948490', status: 'active' }] : table === 'player_club_stats' ? [{ club_key: 'palermo', games_played: 22, goals: 9, assists: 4, wins: 10, draws: 2, losses: 10 }] : table === 'profiles' ? { ea_username: 'AirDangus23' } : table === 'pro_photo_assets' ? [{ discord_user_id: '501557839932948490', analysis: { kit_number: 23 } }] : { position: 'CAM', overall: 90 };
    let selected = result;
    const query = { select() { return this; }, eq(key, value) { if (table === 'team_rosters') assert.equal(value, 'palermo-team'); return this; }, in(key, ids) { assert.ok(ids.includes('501557839932948490')); if (table === 'pro_photos' && !Object.hasOwn(overrides, table)) selected = [{ discord_user_id: '501557839932948490' }]; return this; }, ilike(key, value) { assert.equal(value, club.name); return this; }, order() { return this; }, limit() { return this; }, maybeSingle() { return Promise.resolve({ data: selected }); }, then(resolve) { return Promise.resolve({ data: selected }).then(resolve); } };
    return query;
  } };
  const guild = { id: '1529555651762851930', channels: { fetch: async () => null } };
  const channel = { id: 'studio', client: { user: { id: 'bot' } }, messages: { fetch: async () => new Map(), delete: async () => {} }, send: async (p) => { posts.push(p); return { id: 'posted' }; } };
  const studio = createGraphicsStudio({ supabase: db, supabaseUrl: 'https://example.invalid', secret: 'test-only',
    getGuildState: async () => { assert.ok(calls.length, 'acknowledge before settings read'); return { clubs: [club] }; },
    isManager: async () => false, serverPrefs: async () => ({ branding: { logo_url: 'https://example.invalid/unrelated-badge.png' } }) });
  function interaction(customId, type, extra = {}) {
    return { customId, guildId: guild.id, guild, channel, user: { id: '501557839932948490', username: 'AirDangus23' },
      isButton: () => type === 'button', isStringSelectMenu: () => type === 'select', isModalSubmit: () => type === 'modal',
      deferUpdate: async () => { calls.push('deferUpdate'); }, deferReply: async () => { calls.push('deferReply'); },
      editReply: async (p) => { calls.push('editReply'); requests.push(p); },
      reply: async (p) => { calls.push('reply'); requests.push(p); }, update: async () => { throw Error('selection was not deferred'); },
      showModal: async (m) => { calls.push('showModal'); requests.push(m.toJSON()); }, ...extra };
  }
  return { studio, interaction, calls, posts, requests };
}

test('all styles load safely, portrait option opens a valid stat-free form and renders without stats', async () => {
  const originalFetch = global.fetch;
  global.fetch = async (_, options) => {
    assert.equal(JSON.parse(options.body).has_stats, false);
    assert.equal(JSON.parse(options.body).has_tagline, false);
    return { ok: true, json: async () => ({ image_b64: new Resvg('<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20" fill="pink"/></svg>').render().asPng().toString('base64'), used_pro_photo: true }) };
  };
  try {
    for (const style of Object.keys(STYLES)) {
      const f = fixture();
      assert.equal(await f.studio.handleInteraction(f.interaction('gs_style:card:palermo', 'select', { values: [style] })), true);
      const buttons = f.requests.at(-1).components.at(-1).toJSON().components;
      assert.equal(buttons.length, 3);
      assert.ok(buttons.some((b) => b.label === 'Back of card: On'));
      const portrait = buttons.find((b) => b.label === 'Portrait Only');
      assert.ok(portrait);
      await f.studio.handleInteraction(f.interaction(portrait.custom_id, 'button'));
      const modal = f.requests.at(-1);
      assert.ok(modal.title.length <= 45);
      const inputs = modal.components.map((r) => r.components[0]);
      assert.ok(inputs.every((i) => i.label.length <= 45));
      assert.equal(inputs.find((i) => i.custom_id === 'stats').value, '');
      assert.equal(inputs.find((i) => i.custom_id === 'overall').value, '');
      await f.studio.handleInteraction(f.interaction(modal.custom_id, 'modal', { fields: { getTextInputValue: (key) => inputs.find((i) => i.custom_id === key)?.value || '' } }));
      assert.ok(f.posts.some((p) => p.files?.[0]?.attachment?.length > 1000), 'PNG posted');
      assert.ok(f.posts.some((p) => p.files?.length === 2), 'back posted with front');
      assert.doesNotMatch(lastSvg, /EA MATCH DATA|>GAMES<|>RATING<|height="150"/);
      assert.equal(f.requests.at(-1), '✅ Posted!');
    }
  } finally { global.fetch = originalFetch; }
});

test('blank stats on a prefilled card stay blank rather than restoring stats', async () => {
  const f = fixture();
  await f.studio.handleInteraction(f.interaction('gs_style:card:palermo', 'select', { values: ['modern'] }));
  const buttons = f.requests.at(-1).components.at(-1).toJSON().components;
  await f.studio.handleInteraction(f.interaction(buttons[0].custom_id, 'button'));
  assert.match(f.requests.at(-1).components.find((r) => r.components[0].custom_id === 'stats').components[0].value, /GAMES/);
  const originalFetch = global.fetch;
  global.fetch = async () => ({ ok: true, json: async () => ({ image_b64: '', error: 'Credit limit reached; ask a workspace admin to raise it.' }) });
  try {
    await f.studio.handleInteraction(f.interaction(f.requests.at(-1).custom_id, 'modal', { fields: { getTextInputValue: (k) => k === 'name' ? 'AirDangus23' : '' } }));
    assert.match(f.requests.at(-1), /Credit limit reached/);
  } finally { global.fetch = originalFetch; }
});

test('recruiting poster uses an editable user-bound draft, logo choice and saved club kit', async () => {
  const f = fixture();
  await f.studio.handleInteraction(f.interaction('gs_recruit:palermo', 'button'));
  assert.equal(f.calls[0], 'deferReply');
  const styles = f.requests.at(-1).components[0].toJSON().components[0].options;
  assert.equal(styles.length, Object.keys(STYLES).length);
  await f.studio.handleInteraction(f.interaction('gs_style:recruit:palermo', 'select', { values: ['synthwave'] }));
  const logoMenu = f.requests.at(-1).components[0].toJSON().components[0];
  assert.equal(logoMenu.options.length, 17);
  for (const option of logoMenu.options.filter((option) => option.value !== 'auto')) {
    assert.match(option.label, /\b(?:19|20)\d{2}(?:s|–(?:\d{4}|present))?\b/, `${option.value} includes its year era`);
    assert.ok(option.label.length <= 100, 'Era labels fit Discord’s option limit');
  }
  await f.studio.handleInteraction(f.interaction(logoMenu.custom_id, 'select', { values: ['heritage'] }));
  const edit = f.requests.at(-1).components.at(-1).toJSON().components[0];
  await f.studio.handleInteraction(f.interaction(edit.custom_id, 'button', { user: { id: 'other' } }));
  assert.match(f.requests.at(-1).content, /expired/);
  await f.studio.handleInteraction(f.interaction(edit.custom_id, 'button'));
  const modal = f.requests.at(-1);
  assert.equal(modal.components.length, 5);
  assert.equal(modal.components[4].components[0].value, '');
  const originalFetch = global.fetch;
  global.fetch = async (_, options) => {
    const b = JSON.parse(options.body);
    assert.equal(b.kind, 'poster'); assert.equal(b.style, 'synthwave');
    assert.equal(b.kit.primary, 'pale pink'); assert.match(b.kit.description, /diagonal slash/); assert.equal(b.mood, 'neutral');
    assert.deepEqual(b.team_player_ids, ['501557839932948490']);
    assert.equal(b.discord_user_id, undefined);
    assert.equal(b.guild_id, '1529555651762851930');
    return { ok: true, json: async () => ({ image_b64: new Resvg('<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20" fill="pink"/></svg>').render().asPng().toString('base64') }) };
  };
  try {
    const fields = { headline: 'Become Palermo', positions: 'GK · CB · CAM', details: 'Friday 7:30 PM ET · FC27', contact: 'DM our captain', featured: '' };
    await f.studio.handleInteraction(f.interaction(modal.custom_id, 'modal', { fields: { getTextInputValue: (k) => fields[k] || '' } }));
    const post = f.posts.find((p) => p.files?.length);
    assert.equal(post.files[0].name, 'recruiting-poster.png');
    assert.deepEqual(post.allowedMentions, { parse: [] });
    assert.match(lastSvg, /BECOME PALERMO/); assert.match(lastSvg, /GK · CB · CAM/);
    assert.doesNotMatch(lastSvg, /FULL TIME|VICTORY|EA MATCH DATA/);
    assert.equal(f.requests.at(-1), '✅ Posted!');
  } finally { global.fetch = originalFetch; }
});

test('automatic club logos override unrelated server branding and render the saved crest', () => {
  // Bundled crests load as data URIs; ones not yet bundled fall back to a URL named after the file.
  const crest = (name) => require('./club-logos.cjs').assetUrl(`/crests/${name}`);
  assert.ok(fetchedLogos.includes(crest('palermo-logo-current.png')));
  assert.ok(fetchedLogos.includes(crest('palermo-logo-45.png')));
  assert.ok(fetchedLogos.every((url) => !url.includes('unrelated-badge')));
  const renderer = { esc: String, render: (svg) => svg };
  const svg = recruitmentPoster({ style: 'modern', clubName: 'PCN Palermo', headline: 'Join us', crest: testLogo }, renderer, palette('modern', {}));
  assert.ok(svg.includes(`<image href="${testLogo}" x="66" y="66"`));
});

test('recruitment groups exclude inactive and unsaved players, reject outside leads and handle an empty pool', async () => {
  const originalFetch = global.fetch;
  const bodies = [];
  global.fetch = async (_, options) => {
    bodies.push(JSON.parse(options.body));
    return { ok: true, json: async () => ({ image_b64: new Resvg('<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"/>').render().asPng().toString('base64') }) };
  };
  try {
    for (const mode of ['auto', 'explicit', 'empty']) {
      const f = fixture({
        team_rosters: [{ discord_user_id: '501557839932948490', status: 'active' }, { discord_user_id: '111111111111111111', status: 'inactive' }, { discord_user_id: '222222222222222222', status: 'active' }],
        pro_photo_assets: mode === 'empty' ? [] : [{ discord_user_id: '111111111111111111' }],
        pro_photos: mode === 'empty' ? [] : [{ discord_user_id: '501557839932948490' }],
      });
      await f.studio.handleInteraction(f.interaction('gs_style:recruit:palermo', 'select', { values: ['modern'] }));
      const menu = f.requests.at(-1).components[0].toJSON().components[0];
      await f.studio.handleInteraction(f.interaction(menu.custom_id, 'select', { values: ['auto'] }));
      const edit = f.requests.at(-1).components.at(-1).toJSON().components[0];
      await f.studio.handleInteraction(f.interaction(edit.custom_id, 'button'));
      const modal = f.requests.at(-1);
      const before = bodies.length;
      await f.studio.handleInteraction(f.interaction(modal.custom_id, 'modal', { fields: { getTextInputValue: (key) => key === 'headline' ? 'Join us' : key === 'featured' && mode === 'explicit' ? '333333333333333333' : '' } }));
      if (mode === 'empty') {
        assert.equal(bodies.length, before);
        assert.match(f.requests.at(-1), /No active club players have saved pro photos/);
        assert.equal(f.posts.some((p) => p.files?.length), false);
      } else {
        assert.deepEqual(bodies.at(-1).team_player_ids, ['501557839932948490']);
        assert.equal(bodies.at(-1).discord_user_id, undefined);
        assert.ok(f.posts.some((p) => p.files?.length));
      }
    }
  } finally { global.fetch = originalFetch; }
});

test('recruitment rotates a bounded group of distinct saved active players and keeps an eligible lead', async () => {
  const lead = '501557839932948490';
  const ids = [lead, ...Array.from({ length: 6 }, (_, i) => String(700000000000000000n + BigInt(i)))];
  const f = fixture({
    team_rosters: ids.map((discord_user_id) => ({ discord_user_id, status: 'active' })),
    pro_photo_assets: ids.map((discord_user_id) => ({ discord_user_id })),
    pro_photos: [],
  });
  const originalFetch = global.fetch;
  let body;
  global.fetch = async (_, options) => {
    body = JSON.parse(options.body);
    return { ok: true, json: async () => ({ image_b64: new Resvg('<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"/>').render().asPng().toString('base64') }) };
  };
  try {
    await f.studio.handleInteraction(f.interaction('gs_style:recruit:palermo', 'select', { values: ['modern'] }));
    const menu = f.requests.at(-1).components[0].toJSON().components[0];
    await f.studio.handleInteraction(f.interaction(menu.custom_id, 'select', { values: ['auto'] }));
    const edit = f.requests.at(-1).components.at(-1).toJSON().components[0];
    await f.studio.handleInteraction(f.interaction(edit.custom_id, 'button'));
    await f.studio.handleInteraction(f.interaction(f.requests.at(-1).custom_id, 'modal', { fields: { getTextInputValue: (key) => key === 'headline' ? 'Join our squad' : key === 'featured' ? lead : '' } }));
    assert.equal(body.team_player_ids.length, 5);
    assert.equal(new Set(body.team_player_ids).size, 5);
    assert.equal(body.team_player_ids[0], lead);
    assert.ok(body.team_player_ids.every((id) => ids.includes(id)));
    assert.equal(body.discord_user_id, undefined);
  } finally { global.fetch = originalFetch; }
});

test('recruiting styles render bounded text without fabricated trial claims or stats', () => {
  for (const style of Object.keys(STYLES)) {
    const png = recruitmentPoster({ style, clubName: 'PCN Palermo', headline: 'Join our club', positions: '', details: '', contact: '' },
      { esc: (s) => String(s), render: (svg) => { lastSvg = svg; return new Resvg(svg).render().asPng(); } },
      { ...palette('modern', { primary: 'pink' }), ...palette(style, { primary: 'pink' }) });
    assert.equal(png.readUInt32BE(16), 1024); assert.equal(png.readUInt32BE(20), 1536);
    assert.doesNotMatch(lastSvg, /NaN|undefined|Friday|CHAMPIONS|EA MATCH DATA/);
  }
  const { logoFor, logosFor } = require('./club-logos.cjs');
  assert.equal(logoFor({ name: 'PCN Palermo' }, 'vintage').key, 'h1947');
  assert.equal(logoFor({ name: 'PCN Palermo' }, 'retro1986').key, 'h1979');
  assert.equal(logoFor({ name: 'Other FC' }, 'vintage'), null);
  assert.equal(logoFor({ name: 'PCN Palermo' }, 'modern').key, 'current');
  assert.equal(logoFor({ name: 'PCN Palermo' }, 'synthwave').key, 'current');
  assert.equal(logoFor({ name: 'PCN Palermo' }, 'modern', 'shield').key, 'shield');
  assert.deepEqual(logosFor({ name: 'Another club' }), []);
});

test('recruiting frames contain the whole group and keep decoration and lettering outside the art', () => {
  for (const style of Object.keys(STYLES)) {
    for (const composition of ['editorial', 'side-panel', 'lower-third']) {
      recruitmentPoster({ style, composition, art: testLogo, clubName: 'PCN Palermo', headline: 'Become Palermo', positions: 'CB, DM, Vibe Captain', details: 'Join our club', contact: '' },
        { esc: (s) => String(s), render: (svg) => { lastSvg = svg; return new Resvg(svg).render().asPng(); } }, palette(style, { primary: 'pink' }));
      const image = lastSvg.match(/<image[^>]*x="(\d+)" y="(\d+)" width="(\d+)" height="(\d+)"[^>]*>/)?.[0];
      assert.ok(image, `${style}/${composition} has artwork`);
      assert.match(image, /preserveAspectRatio="xMidYMid meet"/);
      assert.doesNotMatch(lastSvg, /\bslice\b/);
      const artIndex = lastSvg.indexOf(image);
      // Decorative family frames are rendered behind, never over the players.
      assert.doesNotMatch(lastSvg.slice(artIndex), /<polygon|stroke-dasharray/);
      if (composition === 'editorial') assert.match(image, /y="460"[^>]*height="580"/);
    }
  }
});

test('consecutive editions never repeat pose or layout; all compositions render', () => {
  let previous, before;
  const seen = new Set();
  for (let i = 0; i < 60; i++) {
    const current = nextVariation('test-player-modern', i % 2 ? 'vintage' : 'cyber');
    seen.add(current.pose);
    if (before) assert.notEqual(current.pose, before.pose);
    before = previous;
    if (previous) { assert.notEqual(current.pose, previous.pose); assert.notEqual(current.composition, previous.composition); assert.notEqual(current.variation, previous.variation); }
    previous = current;
  }
  assert.ok(seen.size >= 5, 'poses should rotate widely');
  for (const composition of ['editorial', 'side-panel', 'lower-third']) {
    const png = playerCard({ style: 'modern', kit: { primary: 'pink' }, name: 'AirDangus23', clubName: 'PCN Palermo', tagline: 'Palermo', stats: [], composition });
    assert.equal(png.subarray(1, 4).toString(), 'PNG');
  }
});

test('1986 Club Classic keeps a fixed print frame, club colours and optional real stats', () => {
  const base = { style: 'retro1986', kit: { primary: 'pink' }, name: 'AirDangus23', clubName: 'PCN Palermo', position: 'CAM', tagline: 'Palermo', stats: [] };
  const png = playerCard(base);
  assert.equal(png.subarray(1, 4).toString(), 'PNG');
  assert.equal(png.readUInt32BE(16), 1024);
  assert.equal(png.readUInt32BE(20), 1360);
  assert.match(lastSvg, /PCN PALERMO/);
  assert.match(lastSvg, /AIRDANGUS23/);
  assert.match(lastSvg, /circle cx="126"/);
  assert.match(lastSvg, /fill="#f472b6"/);
  assert.doesNotMatch(lastSvg, /EA MATCH DATA|>GAMES<|Topps/);
  playerCard({ ...base, stats: [['GAMES', '22'], ['GOALS', '9']] });
  assert.match(lastSvg, />GAMES</);
  assert.match(lastSvg, />22</);
  playerCard({ ...base, name: 'A very long player name with forty letters', clubName: 'A very long football club name for testing' });
  assert.doesNotMatch(lastSvg, /NaN|undefined/);
});

test('1960s Club Heritage renders three distinct print frames with optional stats', () => {
  const base = { style: 'retro1960s', kit: { primary: 'pink' }, name: 'AirDangus23', clubName: 'PCN Palermo', position: 'CAM', stats: [] };
  const frames = [];
  for (const composition of ['editorial', 'side-panel', 'lower-third']) {
    const png = playerCard({ ...base, composition });
    assert.equal(png.subarray(1, 4).toString(), 'PNG');
    assert.equal(png.readUInt32BE(16), 1024);
    assert.equal(png.readUInt32BE(20), 1380);
    assert.match(lastSvg, /AIRDANGUS23/);
    assert.match(lastSvg, /PCN PALERMO/);
    assert.doesNotMatch(lastSvg, /EA MATCH DATA|>GAMES<|signature|Topps/);
    frames.push(lastSvg);
  }
  assert.equal(new Set(frames).size, 3);
  assert.match(frames[0], /ellipse/);
  assert.match(frames[1], /fill="#f472b6"/);
  playerCard({ ...base, stats: [['GAMES', '22'], ['GOALS', '9']] });
  assert.match(lastSvg, />GAMES</);
  assert.match(lastSvg, />22</);
});

test('1970s Club Archive renders arched and ribbon editions with optional stats', () => {
  const base = { style: 'retro1970s', kit: { primary: 'pink' }, name: 'AirDangus23', clubName: 'PCN Palermo', position: 'CAM', stats: [] };
  const frames = [];
  for (const composition of ['lower-third', 'editorial', 'side-panel']) {
    const png = playerCard({ ...base, composition });
    assert.equal(png.subarray(1, 4).toString(), 'PNG');
    assert.equal(png.readUInt32BE(16), 1024);
    assert.equal(png.readUInt32BE(20), 1380);
    assert.match(lastSvg, /AIRDANGUS23/);
    assert.match(lastSvg, /CAM/);
    assert.match(lastSvg, /fill="#f472b6"/);
    assert.doesNotMatch(lastSvg, /NaN|undefined|EA MATCH DATA|>GAMES<|Topps/);
    frames.push(lastSvg);
  }
  assert.equal(new Set(frames).size, 3);
  assert.match(frames[0], /rotate\(/);
  assert.match(frames[2], />PCN<\/text>/); assert.match(frames[2], />PALERMO<\/text>/); assert.doesNotMatch(frames[2], /PCN PALERMO/);
  playerCard({ ...base, stats: [['GAMES', '22'], ['GOALS', '9']] });
  assert.match(lastSvg, />GAMES</);
  assert.match(lastSvg, />22</);
});

test('1990s Club Collection renders three distinct editions with accurate labels and optional stats', () => {
  const base = { style: 'retro1990s', kit: { primary: 'pink' }, name: 'AirDangus23', clubName: 'PCN Palermo', position: 'CAM', stats: [] };
  const frames = [];
  for (const composition of ['lower-third', 'editorial', 'side-panel']) {
    const png = playerCard({ ...base, composition });
    assert.equal(png.subarray(1, 4).toString(), 'PNG');
    assert.equal(png.readUInt32BE(16), 1024);
    assert.equal(png.readUInt32BE(20), 1380);
    assert.match(lastSvg, /AIRDANGUS23/);
    assert.match(lastSvg, /CAM/);
    assert.doesNotMatch(lastSvg, /NaN|undefined|EA MATCH DATA|>GAMES<|Topps|Donruss|Leaf|DEBUT/);
    frames.push(lastSvg);
  }
  assert.equal(new Set(frames).size, 3);
  assert.match(frames[0], /url\(#speckle90\)/);
  assert.match(frames[1], /CLUB COLLECTION/);
  assert.match(frames[2], /x="128"/);
  playerCard({ ...base, stats: [['GAMES', '22'], ['GOALS', '9']] });
  assert.match(lastSvg, />GAMES</);
  assert.match(lastSvg, />22</);
  playerCard({ ...base, composition: 'side-panel', name: 'A very long player name with forty letters', clubName: 'A very long football club name for testing' });
  assert.doesNotMatch(lastSvg, /NaN|undefined/);
});

test('Y2K Club Chrome renders foil, circular and brushed editions without invented honours', () => {
  const base = { style: 'y2k', kit: { primary: 'pink' }, name: 'AirDangus23', clubName: 'PCN Palermo', position: 'CAM', stats: [] };
  const frames = [];
  for (const composition of ['lower-third', 'editorial', 'side-panel']) {
    const png = playerCard({ ...base, composition });
    assert.equal(png.subarray(1, 4).toString(), 'PNG');
    assert.equal(png.readUInt32BE(16), 1024);
    assert.equal(png.readUInt32BE(20), 1380);
    assert.match(lastSvg, /AIRDANGUS23/);
    assert.match(lastSvg, /CAM/);
    assert.doesNotMatch(lastSvg, /NaN|undefined|EA MATCH DATA|>GAMES<|Topps|Bowman|ROOKIE|GEM MINT|signature/);
    frames.push(lastSvg);
  }
  assert.equal(new Set(frames).size, 3);
  assert.match(frames[0], /fill="url\(#refractorY2k\)"/);
  assert.match(frames[1], /<circle cx=/);
  assert.match(frames[2], /fill="url\(#brushY2k\)"/);
  playerCard({ ...base, stats: [['GAMES', '22'], ['GOALS', '9']] });
  assert.match(lastSvg, />GAMES</);
  assert.match(lastSvg, />22</);
});

test('2010s Club Signature renders chrome, sweep and foil with optional accurate stats', () => {
  const base = { style: 'retro2010s', kit: { primary: 'pink' }, name: 'AirDangus23', clubName: 'PCN Palermo', position: 'CAM', stats: [] };
  const frames = [];
  for (const composition of ['lower-third', 'editorial', 'side-panel']) {
    const png = playerCard({ ...base, composition });
    assert.equal(png.subarray(1, 4).toString(), 'PNG');
    assert.equal(png.readUInt32BE(16), 1024);
    assert.equal(png.readUInt32BE(20), 1380);
    assert.match(lastSvg, /AIRDANGUS23/);
    assert.match(lastSvg, /PCN PALERMO/);
    assert.match(lastSvg, /CAM/);
    assert.doesNotMatch(lastSvg, /NaN|undefined|EA MATCH DATA|>GAMES<|Topps|ROOKIE|GEM MINT|signature/);
    frames.push(lastSvg);
  }
  assert.equal(new Set(frames).size, 3);
  assert.match(frames[0], /rx="98"/);
  assert.match(frames[1], /fill="url\(#clubSweep10\)"/);
  assert.match(frames[2], /fill="url\(#foilGrain10\)"/);
  playerCard({ ...base, stats: [['GAMES', '22'], ['GOALS', '9']] });
  assert.match(lastSvg, />GAMES</);
  assert.match(lastSvg, />22</);
  playerCard({ ...base, name: 'A very long player name with forty letters', clubName: 'A very long football club name for testing' });
  assert.doesNotMatch(lastSvg, /NaN|undefined/);
});

test('2020s Club Prism renders angular, mosaic and sculpted editions with optional stats', () => {
  const base = { style: 'retro2020s', kit: { primary: 'pink' }, name: 'AirDangus23', clubName: 'PCN Palermo', position: 'CAM', stats: [] };
  const frames = [];
  for (const composition of ['lower-third', 'editorial', 'side-panel']) {
    const png = playerCard({ ...base, composition });
    assert.equal(png.subarray(1, 4).toString(), 'PNG');
    assert.equal(png.readUInt32BE(16), 1024);
    assert.equal(png.readUInt32BE(20), 1380);
    assert.match(lastSvg, /AIRDANGUS23/);
    assert.match(lastSvg, /PCN PALERMO/);
    assert.match(lastSvg, /CAM/);
    assert.doesNotMatch(lastSvg, /NaN|undefined|EA MATCH DATA|>GAMES<|Topps|Panini|Bowman|AUTOGRAPH|ROOKIE|GEM MINT/);
    frames.push(lastSvg);
  }
  assert.equal(new Set(frames).size, 3);
  assert.match(frames[0], /fill="url\(#clubStreak20\)"/);
  assert.match(frames[1], /fill="url\(#mosaic20\)"/);
  assert.match(frames[2], /M40 350 Q512 10/);
  playerCard({ ...base, stats: [['GAMES', '22'], ['GOALS', '9']] });
  assert.match(lastSvg, />GAMES</);
  assert.match(lastSvg, />22</);
  playerCard({ ...base, name: 'A very long player name with forty letters', clubName: 'A very long football club name for testing' });
  assert.doesNotMatch(lastSvg, /NaN|undefined/);
});
test('Palermo kits auto-pair by era and stay scoped to Palermo', () => {
  const { kitFor, kitsFor } = require('./club-kits.cjs');
  const pal = { name: 'PCN Palermo', kit: { primary: 'pink' } };
  assert.equal(kitFor(pal, 'retro1970s').key, 'retro1979');
  assert.equal(kitFor(pal, 'retro1986').key, 'retro1986');
  assert.equal(kitFor(pal, 'y2k').key, 'retro2000s');
  assert.equal(kitFor(pal, 'synthwave').key, 'home');
  assert.equal(kitFor(pal, 'retro1970s', 'third').key, 'third');
  assert.ok(kitsFor(pal).every((k) => k.description.length <= 200));
  assert.deepEqual(kitFor({ name: 'Other FC', kit: { primary: 'red' } }, 'y2k'), { primary: 'red' });
});
