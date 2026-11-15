const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Resvg } = require('@resvg/resvg-js');
const { createEaTeamKit, eaColour, kitFromEa, crestColours, colourWord, parseSearch, rankCandidates, autoPick } = require('./ea-team-kit.cjs');

const png = (svg) => `data:image/png;base64,${new Resvg(svg).render().asPng().toString('base64')}`;

test('EA kit colours read as decimal RGB or hex, and a kit needs a main colour', () => {
  assert.equal(eaColour('16777215'), '#ffffff');
  assert.equal(eaColour(13369344), '#cc0000');
  assert.equal(eaColour('#1E3A8A'), '#1e3a8a');
  assert.equal(eaColour('0x00ff00'), '#00ff00');
  assert.equal(eaColour('99999999'), null);
  assert.equal(eaColour(''), null);
  assert.deepEqual(kitFromEa({ customKit: { kitColor1: '13369344', kitColor2: '13369345', kitColor3: '16777215' } }), { primary: '#cc0000', secondary: '#ffffff' }, 'a near-identical second colour is skipped');
  assert.deepEqual(kitFromEa({ customKit: { kitColor1: '0', crestColor: '16766720' } }), { primary: '#000000', secondary: '#ffd700' });
  assert.equal(kitFromEa({ customKit: { crestAssetId: '1' } }), null);
  assert.equal(colourWord('#1f3b8c'), 'navy');
  assert.equal(colourWord('#fefefe'), 'white');
});

test('crest colours: the two strongest visibly different colours, ignoring the transparent background', () => {
  const crest = png('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><circle cx="32" cy="32" r="30" fill="#c8102e"/><rect x="24" y="10" width="16" height="44" fill="#ffffff"/></svg>');
  const c = crestColours(crest);
  assert.equal(c.primary, '#c8102e');
  assert.equal(c.secondary, '#ffffff');
  assert.equal(crestColours('https://not-a-data-url'), null);
  assert.equal(crestColours(png('<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"/>')), null, 'an empty image has no colours');
});

test('search rows parse on both EA shapes, exact names rank first and only a sure match is picked for you', () => {
  const rows = parseSearch({ 0: [{ clubId: 7, clubInfo: { name: 'Rivals FC', customKit: { crestAssetId: '99', kitColor1: '255' } }, gamesPlayed: '10' }, { clubInfo: { clubId: 'x' } }] }, 'nx');
  assert.deepEqual(rows, [{ clubId: '7', platform: 'nx', name: 'Rivals FC', crestId: '99', games: 10, skill: 0, eaKit: { primary: '#0000ff', secondary: null } }]);
  const list = [
    { clubId: '1', platform: 'common-gen5', name: 'Rivals FC B', games: 500 },
    { clubId: '2', platform: 'common-gen5', name: 'rivals  fc', games: 3 },
    { clubId: '2', platform: 'common-gen5', name: 'rivals  fc', games: 3 },
  ];
  const ranked = rankCandidates(list, 'Rivals FC');
  assert.deepEqual(ranked.map((c) => c.clubId), ['2', '1'], 'exact name first, duplicates dropped');
  assert.equal(autoPick(ranked, 'Rivals FC').clubId, '2');
  assert.equal(autoPick([list[0], { ...list[0], clubId: '9' }], 'Rivals'), null, 'several loose matches: the player picks');
  assert.equal(autoPick([list[0]], 'Rivals').clubId, '1', 'a single result is used');
});

test('a club kit comes from a saved uniform first, then EA kit colours, then the crest', async () => {
  const crestPng = png('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="#006400"/><rect x="0" y="0" width="32" height="12" fill="#ffd700"/></svg>');
  const gets = [];
  const http = { get: async (url, { params }) => {
    gets.push([url.split('/fc/')[1], params]);
    if (url.endsWith('allTimeLeaderboard/search')) return { status: 200, data: params.platform === 'nx' ? [] : [{ clubId: '42', clubInfo: { name: 'Green Lions', customKit: { crestAssetId: '1234' } }, gamesPlayed: 5 }] };
    if (url.endsWith('clubs/info')) return { status: 200, data: { 42: { name: 'Green Lions', customKit: {} } } };
    return { status: 404, data: null };
  } };
  let saved = null;
  const lookup = createEaTeamKit({ http, fetchImage: async () => crestPng, findSavedKit: async (g, q) => { assert.equal(q.clubId, '42'); return saved; }, log: { warn() {} } });
  const [club] = await lookup.search('Green Lions');
  assert.equal(club.name, 'Green Lions');
  assert.deepEqual(gets.filter(([p]) => p === 'allTimeLeaderboard/search').map(([, p]) => p.platform).sort(), ['common-gen5', 'nx']);

  // No saved uniform and EA has no kit colours: the crest's colours
  const fromCrest = await lookup.resolve('g1', club);
  assert.equal(fromCrest.kitFrom, 'crest');
  assert.equal(fromCrest.kit.primary, '#006400');
  assert.equal(fromCrest.kit.secondary, '#ffd700');
  assert.match(fromCrest.kit.description, /^Green Lions kit: dark green shirt with yellow collar/);
  assert.match(fromCrest.crest, /l1234\.png$/);

  // EA kit colours beat the crest
  const withEaKit = { ...club, eaKit: { primary: '#ffffff', secondary: '#000000' } };
  assert.equal((await lookup.resolve('g1', withEaKit)).kitFrom, 'ea');

  // A saved uniform beats both, description kept
  saved = { primary: '#7f1d1d', secondary: '#60a5fa', description: 'claret shirt with sky blue sleeves' };
  const fromSaved = await lookup.resolve('g1', withEaKit);
  assert.equal(fromSaved.kitFrom, 'saved');
  assert.equal(fromSaved.kit.description, 'claret shirt with sky blue sleeves');
  saved = { primary: '#111111', learned: true };
  assert.equal((await lookup.resolve('g1', withEaKit)).kitFrom, 'learned');
});

test('EA being down is reported, not mistaken for "no club"', async () => {
  const lookup = createEaTeamKit({ http: { get: async () => ({ status: 503 }) } });
  await assert.rejects(lookup.search('Anyone'), (e) => e.eaUnavailable === true);
  const empty = createEaTeamKit({ http: { get: async () => ({ status: 200, data: [] }) } });
  assert.deepEqual(await empty.search('Anyone'), []);
  assert.deepEqual(await empty.search('A'), [], 'one letter is not searched');
});
