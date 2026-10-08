const { test } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const { Resvg } = require('@resvg/resvg-js');
const { nextVariation } = require('./graphics-variants.cjs');
let lastSvg = '';
const originalLoad = Module._load;
Module._load = function (request, parent, ...args) {
  if (parent?.filename.endsWith('graphics-studio.cjs') && request === './graphics.cjs') return {
    esc: (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;'),
    fetchImage: async () => null,
    render: (svg) => { lastSvg = svg; return new Resvg(svg).render().asPng(); },
  };
  if (parent?.filename.endsWith('graphics-studio.cjs') && request === './manager-hub.cjs') return { activeClubs: (s) => s?.clubs || [] };
  return originalLoad.call(this, request, parent, ...args);
};
const { createGraphicsStudio, playerCard, STYLES } = require('./graphics-studio.cjs');
Module._load = originalLoad;

function fixture() {
  const calls = [], posts = [], requests = [];
  const club = { key: 'palermo', name: 'PCN Palermo', kit: { primary: 'pink', secondary: 'black' } };
  const db = { from(table) {
    assert.ok(calls.includes('deferUpdate'), 'acknowledge before loading player data');
    const result = table === 'player_club_stats' ? [] : table === 'profiles' ? { ea_username: 'AirDangus23' } : { position: 'CAM', overall: 90 };
    const query = { select() { return this; }, eq() { return this; }, maybeSingle() { return Promise.resolve({ data: result }); }, then(resolve) { return Promise.resolve({ data: result }).then(resolve); } };
    return query;
  } };
  const guild = { id: '1529555651762851930', channels: { fetch: async () => null } };
  const channel = { id: 'studio', client: { user: { id: 'bot' } }, messages: { fetch: async () => new Map(), delete: async () => {} }, send: async (p) => { posts.push(p); return { id: 'posted' }; } };
  const studio = createGraphicsStudio({ supabase: db, supabaseUrl: 'https://example.invalid', secret: 'test-only',
    getGuildState: async () => { assert.ok(calls.length, 'acknowledge before settings read'); return { clubs: [club] }; },
    isManager: async () => false });
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
  global.fetch = async () => ({ ok: true, json: async () => ({ image_b64: new Resvg('<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20" fill="pink"/></svg>').render().asPng().toString('base64'), used_pro_photo: true }) });
  try {
    for (const style of Object.keys(STYLES)) {
      const f = fixture();
      assert.equal(await f.studio.handleInteraction(f.interaction('gs_style:card:palermo', 'select', { values: [style] })), true);
      const buttons = f.requests.at(-1).components[0].toJSON().components;
      assert.equal(buttons.length, 2);
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
      assert.doesNotMatch(lastSvg, /EA MATCH DATA|>GAMES<|>RATING<|height="150"/);
      assert.equal(f.requests.at(-1), '✅ Posted!');
    }
  } finally { global.fetch = originalFetch; }
});

test('blank stats on a prefilled card stay blank rather than restoring stats', async () => {
  const f = fixture();
  await f.studio.handleInteraction(f.interaction('gs_style:card:palermo', 'select', { values: ['modern'] }));
  const buttons = f.requests.at(-1).components[0].toJSON().components;
  await f.studio.handleInteraction(f.interaction(buttons[0].custom_id, 'button'));
  assert.match(f.requests.at(-1).components.find((r) => r.components[0].custom_id === 'stats').components[0].value, /GAMES/);
  const originalFetch = global.fetch;
  global.fetch = async () => ({ ok: true, json: async () => ({ image_b64: '', error: 'Credit limit reached; ask a workspace admin to raise it.' }) });
  try {
    await f.studio.handleInteraction(f.interaction(f.requests.at(-1).custom_id, 'modal', { fields: { getTextInputValue: (k) => k === 'name' ? 'AirDangus23' : '' } }));
    assert.match(f.requests.at(-1), /Credit limit reached/);
  } finally { global.fetch = originalFetch; }
});

test('consecutive editions never repeat pose or layout; all compositions render', () => {
  let previous;
  for (let i = 0; i < 30; i++) {
    const current = nextVariation('test-player-modern');
    if (previous) { assert.notEqual(current.pose, previous.pose); assert.notEqual(current.composition, previous.composition); assert.notEqual(current.variation, previous.variation); }
    previous = current;
  }
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
  assert.equal(png.readUInt32BE(20), 1434);
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
    assert.equal(png.readUInt32BE(20), 1434);
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
    assert.equal(png.readUInt32BE(20), 1434);
    assert.match(lastSvg, /AIRDANGUS23/);
    assert.match(lastSvg, /CAM/);
    assert.match(lastSvg, /fill="#f472b6"/);
    assert.doesNotMatch(lastSvg, /NaN|undefined|EA MATCH DATA|>GAMES<|Topps/);
    frames.push(lastSvg);
  }
  assert.equal(new Set(frames).size, 3);
  assert.match(frames[0], /rotate\(/);
  assert.match(frames[2], /PCN PALERMO/);
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
    assert.equal(png.readUInt32BE(20), 1434);
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
    assert.equal(png.readUInt32BE(20), 1434);
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