const { test } = require('node:test');
const assert = require('node:assert/strict');
const zlib = require('zlib');
const { toHex, teamColors, clubAccent, kitOf, crestUrl } = require('./club-colors.cjs');
const { kitFor } = require('./club-kits.cjs');
const { boardSvg } = require('./lineup-board.cjs');
const { palette } = require('./graphics-studio.cjs');
const { createClubSetup } = require('./club-setup.cjs');

test('colours read hex, short hex and kit colour words', () => {
  assert.equal(toHex('#C8102E'), '#c8102e');
  assert.equal(toHex('f0a'), '#ff00aa');
  assert.equal(toHex('sky blue'), '#38bdf8');
  assert.equal(toHex('claret'), '#7f1d3a');
  assert.equal(toHex('not a colour'), null);
  assert.equal(toHex(''), null);
});

test('clubs that never picked keep the old look', () => {
  const club = { name: 'Old FC', kit: { primary: 'navy' } };
  assert.equal(teamColors(club).picked, false);
  assert.equal(teamColors(club).primary, '#1e3a8a');
  assert.equal(teamColors({ name: 'Bare' }).primary, '#22c55e');
  // Embeds keep the server's /brand colour, then their own colour
  assert.equal(clubAccent(club, { color: 0x123456 }, 0x5865f2), 0x123456);
  assert.equal(clubAccent(club, {}, 0x5865f2), 0x5865f2);
  assert.deepEqual(kitOf(club), { primary: 'navy' });
  assert.equal(crestUrl(club, { logo_url: 'https://x.test/logo.png' }), 'https://x.test/logo.png');
  assert.equal(crestUrl(club, {}), null);
});

test('picked colours and crest win everywhere', () => {
  const club = { name: 'Red Star', colors: { primary: '#c8102e', secondary: '#ffffff' }, crest_url: 'https://x.test/crest.png', kit: { description: 'red shirt' } };
  const c = teamColors(club, { color: 0x123456 });
  assert.equal(c.primary, '#c8102e');
  assert.equal(c.secondary, '#ffffff');
  assert.equal(c.picked, true);
  assert.equal(clubAccent(club, { color: 0x123456 }, 1), 0xc8102e);
  assert.equal(crestUrl(club, { logo_url: 'https://x.test/logo.png' }), 'https://x.test/crest.png');
  // Missing kit colours come from the team colours, which also lead the accent
  assert.deepEqual(kitOf(club), { description: 'red shirt', primary: '#c8102e', secondary: '#ffffff', accent: '#c8102e', accent2: '#ffffff' });
  assert.equal(kitFor(club, 'esports').accent, '#c8102e');
  assert.equal(palette('modern', kitOf(club)).accent, '#c8102e');
  // A same-colour secondary falls back to readable ink
  assert.equal(teamColors({ colors: { primary: '#ffffff', secondary: '#ffffff' } }).secondary, '#111111');
});

test('the lineup image carries the team colours and crest', () => {
  const svg = boardSvg({ title: 'Red Star XI', formation: '4-3-3 FLAT', kit: kitOf({ colors: { primary: '#c8102e', secondary: '#ffd700' } }), crest: 'data:image/png;base64,AAAA', starters: [], bench: [] });
  assert.match(svg, /<rect width="1080" height="10" fill="#c8102e"\/>/);
  assert.match(svg, /fill="#ffd700"/);
  assert.match(svg, /<image href="data:image\/png;base64,AAAA"/);
});

// A tiny solid PNG for the upload test
function png(w, h, rgb) {
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const sum = Buffer.alloc(4); sum.writeUInt32BE(crc(body));
    return Buffer.concat([len, body, sum]);
  };
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) raw.set(rgb, y * (w * 3 + 1) + 1 + x * 3);
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

function harness() {
  const state = { currentClubKey: 'c', clubs: [{ key: 'c', name: 'Red Star' }] };
  const db = { branding: {}, uploads: [] };
  const supabase = {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { branding: db.branding } }) }) }),
      upsert: async (row) => { db.branding = row.branding; return { error: null }; },
    }),
    storage: {
      from: (bucket) => ({
        upload: async (path, bytes, opts) => { db.uploads.push({ bucket, path, bytes, opts }); return { error: null }; },
        createSignedUrl: async (path) => ({ data: { signedUrl: `https://storage.test/${path}?token=t` } }),
      }),
    },
  };
  const events = { serverPrefs: async () => ({ branding: db.branding }), forgetPrefs: () => {} };
  let saved = 0;
  const setup = createClubSetup({ supabase, getGuildState: async () => state, events, saveGuildSettings: async () => { saved += 1; } });
  const replies = [];
  const ix = (customId, fields, web = true) => ({
    __webPanel: web, guildId: 'g', customId, member: { permissions: { has: () => true } },
    isButton: () => !fields, isModalSubmit: () => !!fields, isStringSelectMenu: () => false, isChatInputCommand: () => false,
    showModal: async (m) => replies.push(['modal', m]), reply: async (m) => replies.push(['reply', m]),
    deferReply: async () => {}, editReply: async (m) => replies.push(['edit', m]),
    fields,
  });
  return { state, db, setup, replies, ix, saved: () => saved };
}

const formFields = (text, files = []) => ({
  getTextInputValue: (k) => text[k] || '',
  getUploadedFiles: () => new Map(files.map((f, i) => [String(i), f])),
});

test('setup asks for team colours and a crest, and saves them on the club', async () => {
  const h = harness();
  assert.equal(await h.setup.handleInteraction(h.ix('setupw:colors')), true);
  const modal = h.replies[0][1].toJSON();
  assert.equal(modal.custom_id, 'setupw:colorsubmit');
  assert.deepEqual(modal.components.map((c) => c.component.custom_id), ['primary', 'secondary', 'crest', 'crest_link']);
  assert.equal(modal.components[2].component.required, false);

  const crest = { name: 'crest.png', contentType: 'image/png', size: 100, url: `data:image/png;base64,${png(8, 8, [200, 16, 46]).toString('base64')}` };
  await h.setup.handleInteraction(h.ix('setupw:colorsubmit', formFields({ primary: 'C8102E', secondary: 'white' }, [crest])));
  const club = h.state.clubs[0];
  assert.deepEqual(club.colors, { primary: '#c8102e', secondary: '#ffffff' });
  assert.match(club.crest_url, /^https:\/\/storage\.test\/club-crests\/g\/c-\d+\.png\?token=t$/);
  assert.equal(h.db.uploads[0].bucket, 'pro-photos');
  assert.equal(h.db.branding.color, 0xc8102e, 'the only club sets the server accent');
  assert.equal(h.saved(), 1);
  const reply = h.replies.at(-1)[1];
  assert.match(reply.content, /Team colours set to #c8102e and #ffffff/);
  assert.match(reply.content, /Crest saved/);
  const embed = reply.embeds[0].toJSON();
  assert.equal(embed.color, 0xc8102e);
  assert.equal(embed.thumbnail.url, club.crest_url);
});

test('a bad colour is refused and nothing is saved', async () => {
  const h = harness();
  await h.setup.handleInteraction(h.ix('setupw:colorsubmit', formFields({ primary: 'blurple-ish' })));
  assert.match(h.replies.at(-1)[1].content, /isn't a colour I know/);
  assert.equal(h.saved(), 0);
  assert.equal(h.state.clubs[0].colors, undefined);
});

test('typing remove clears the crest and blank colours go back to the default look', async () => {
  const h = harness();
  Object.assign(h.state.clubs[0], { colors: { primary: '#000000' }, crest_url: 'https://x.test/crest.png' });
  await h.setup.handleInteraction(h.ix('setupw:colorsubmit', formFields({ crest_link: 'remove' })));
  assert.equal(h.state.clubs[0].crest_url, undefined);
  assert.equal(h.state.clubs[0].colors, undefined);
  assert.match(h.replies.at(-1)[1].content, /Crest removed/);
});
