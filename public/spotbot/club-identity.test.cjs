const { test } = require('node:test');
const assert = require('node:assert/strict');
const { identityOf, aiStyle, VOICES, VOICE_KEYS } = require('./club-identity.cjs');
const { buildMatchReport, storyFacts } = require('./chronicle.cjs');
const { roastAwards } = require('./fun-zone.cjs');
const { createClubSetup } = require('./club-setup.cjs');

const game = (opponent, result = 'win', scoreFor = 5, scoreAgainst = 0) => ({
  id: 'g1', result, scoreFor, scoreAgainst, opponent, playedAt: new Date(Date.UTC(2026, 9, 10, 2)),
  players: [{ ea_username: 'Striker9', position: 'ST', goals: scoreFor, rating: 8 }],
});

test('clubs that never picked keep the Palermo defaults', () => {
  const pal = identityOf({ name: 'PCN Palermo' });
  assert.equal(pal.voice, 'italian');
  assert.equal(pal.city, 'Palermo');
  assert.equal(pal.paper, 'The PCN Palermo Chronicle');
  assert.equal(pal.nameJokes, true);
  assert.equal(pal.picked, false);
  assert.equal(identityOf({ name: 'Leeds Lads' }).city, 'Leeds Lads');
  assert.match(aiStyle({ name: 'PCN Palermo' }), /Italian sports daily.*cheeky innuendo/);
});

test('every voice is complete enough to write a report', () => {
  for (const k of VOICE_KEYS) {
    const v = VOICES[k];
    assert.ok(v.label && v.emoji && v.desc && v.style && v.kickers && v.flavor && typeof v.outlet === 'function', k);
    for (const list of Object.values(v.kickers)) assert.ok(list.every((x) => /^[\p{L}\p{P} '?!¡]+$/u.test(x)), `${k} kicker ${list}`);
  }
});

test('a chosen voice, paper name and no gags change the match report', () => {
  const club = { key: 'c', name: 'Leeds Lads', identity: { voice: 'british', paper_name: 'The Terrace Times', name_jokes: false } };
  const e = buildMatchReport({ club, match: game('Wolves Town') }).embeds[0].toJSON();
  assert.match(e.author.name, /^📰 THE TERRACE TIMES · /);
  assert.match(e.title, /^(GET IN!|SCENES!) /);
  assert.doesNotMatch(e.description, /Mamma mia|Forza/);
  assert.doesNotMatch(e.description, /lapdogs/);
  assert.match(e.description, /\*(Up the Leeds Lads!|Get in, Leeds Lads\.|Scenes\. Come on Leeds Lads!)\*$/);
  assert.doesNotMatch(storyFacts({ club, matches: [game('Wolves Town')], seasonMatches: [] }), /name gags/);
  assert.match(aiStyle(club), /British back-page/);
  assert.doesNotMatch(aiStyle(club), /innuendo/);
});

test('straight news has no kicker and no sign-off', () => {
  const club = { key: 'c', name: 'Plain FC', identity: { voice: 'plain' } };
  const e = buildMatchReport({ club, match: game('Rivals FC') }).embeds[0].toJSON();
  assert.equal(e.title, 'STRIKER9 HAT-TRICK SINKS RIVALS FC 5-0');
  assert.doesNotMatch(e.description, /\*$/);
});

test('the roast names the club hometown', () => {
  const night = [{ ...game('Rivals FC'), players: [{ ea_username: 'Ghosty', position: 'ST', goals: 0, pass_attempts: 1, shots: 0, tackle_attempts: 0, rating: 5 }] }];
  const titles = roastAwards(night, { name: 'Leeds Lads', identity: { home_city: 'Leeds' } }).map((a) => a.title);
  if (titles.some((t) => t.startsWith('👻'))) assert.ok(titles.includes('👻 Ghost of Leeds'));
});

test('setup wizard saves the voice, gags and paper name on the club', async () => {
  const state = { currentClubKey: 'c', clubs: [{ key: 'c', name: 'Leeds Lads' }] };
  let saved = 0;
  const setup = createClubSetup({ supabase: {}, getGuildState: async () => state, events: {}, saveGuildSettings: async () => { saved += 1; } });
  const replies = [];
  const base = (customId, extra = {}) => ({
    __webPanel: true, guildId: 'g', customId, member: { permissions: { has: () => true } },
    isButton: () => !extra.values && !extra.fields, isStringSelectMenu: () => !!extra.values, isModalSubmit: () => !!extra.fields,
    isChatInputCommand: () => false, isFromMessage: () => true,
    reply: async (m) => replies.push(['reply', m]), update: async (m) => replies.push(['update', m]), showModal: async (m) => replies.push(['modal', m]),
    ...extra,
  });
  assert.equal(await setup.handleInteraction(base('setupw:identity')), true);
  assert.equal(replies[0][0], 'reply');
  await setup.handleInteraction(base('setupw:voice', { values: ['spanish'] }));
  await setup.handleInteraction(base('setupw:jokes'));
  await setup.handleInteraction(base('setupw:paper'));
  assert.equal(replies.at(-1)[0], 'modal');
  const fields = { paper_name: '  El Diario  ', home_city: '' };
  await setup.handleInteraction(base('setupw:papersubmit', { fields: { getTextInputValue: (k) => fields[k] } }));
  assert.deepEqual(state.clubs[0].identity, { voice: 'spanish', name_jokes: false, paper_name: 'El Diario' });
  assert.equal(saved, 3);
  const panel = replies.at(-1)[1].embeds[0].toJSON();
  assert.match(panel.fields[0].value, /Spanish sports daily/);
  assert.equal(panel.fields[1].value, 'El Diario');
});
