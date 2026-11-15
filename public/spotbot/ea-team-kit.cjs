// Photo Studio "Team name" → a real EA Pro Clubs club: a player types their club's name, the bot finds it
// on EA (both platforms), and the card is built from that club: its exact name, its EA crest and a kit.
// The kit comes from the first of these that exists:
//   1. a uniform a manager saved for that club on GafferBot (matched by EA club id, then by name)
//   2. a uniform players have already picked for that team (learned, kit_popularity)
//   3. the kit colours EA returns for the club (clubInfo.customKit.kitColor1/2)
//   4. the two strongest colours in the club's EA crest
// The player can still pick a different EA club, drop the match, or wear their own uniform instead.

const axios = require('axios');
const { Resvg } = require('@resvg/resvg-js');
const { FC_PLATFORMS, normalizeClubName } = require('./ea-fc27.cjs');
const { eaCrestUrl } = require('./graphics.cjs');

const EA_HEADERS = {
  accept: 'application/json',
  'accept-language': 'en-US,en;q=0.9',
  origin: 'https://www.ea.com',
  referer: 'https://www.ea.com/',
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36',
};
const PLATFORM_LABEL = { 'common-gen5': 'PS5 / Xbox / PC', nx: 'Switch' };
const CACHE_MS = 10 * 60 * 1000;
const MAX_CANDIDATES = 10;

// EA sends kit colours as decimal RGB ("16777215"); accept hex too. Anything else -> null.
function eaColour(value) {
  if (value === null || value === undefined || value === '') return null;
  const s = String(value).trim();
  if (/^#[0-9a-f]{6}$/i.test(s)) return s.toLowerCase();
  if (/^\d{1,8}$/.test(s)) {
    const n = Number(s);
    return n >= 0 && n <= 0xffffff ? `#${n.toString(16).padStart(6, '0')}` : null;
  }
  if (/^(0x)?[0-9a-f]{6}$/i.test(s)) return `#${s.replace(/^0x/i, '').toLowerCase()}`;
  return null;
}

const rgbOf = (hex) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const dist = (a, b) => { const [r1, g1, b1] = rgbOf(a), [r2, g2, b2] = rgbOf(b); return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2); };

// Words the artwork prompt can use for a hex colour
const COLOUR_WORDS = [
  ['white', '#ffffff'], ['black', '#111111'], ['charcoal grey', '#374151'], ['grey', '#9ca3af'], ['silver', '#cbd5e1'],
  ['red', '#dc2626'], ['crimson', '#9f1239'], ['claret', '#7f1d3a'], ['maroon', '#7f1d1d'], ['pink', '#ec4899'], ['pale pink', '#f9c5d9'],
  ['orange', '#f97316'], ['amber', '#f59e0b'], ['yellow', '#facc15'], ['gold', '#d4af37'], ['cream', '#f5f0e1'], ['brown', '#78350f'],
  ['lime green', '#a3e635'], ['green', '#16a34a'], ['dark green', '#14532d'], ['teal', '#0d9488'], ['sky blue', '#38bdf8'],
  ['light blue', '#93c5fd'], ['blue', '#2563eb'], ['royal blue', '#1d4ed8'], ['navy', '#1e3a8a'], ['purple', '#7c3aed'], ['violet', '#a78bfa'],
];
function colourWord(hex) {
  if (!/^#[0-9a-f]{6}$/i.test(String(hex || ''))) return String(hex || '');
  return COLOUR_WORDS.reduce((best, [w, h]) => (dist(hex, h) < best.d ? { w, d: dist(hex, h) } : best), { w: hex, d: Infinity }).w;
}

// The kit EA has on file for a club, or null when EA sent no usable colours
function kitFromEa(info) {
  const ck = info?.customKit || {};
  const primary = eaColour(ck.kitColor1);
  if (!primary) return null;
  let secondary = [ck.kitColor2, ck.kitColor3, ck.kitColor4].map(eaColour).find((c) => c && dist(c, primary) > 40) || null;
  if (!secondary) secondary = eaColour(ck.crestColor);
  if (secondary && dist(secondary, primary) <= 40) secondary = null;
  return { primary, secondary };
}

// The two strongest colours in a crest image (data URL), drawn small with resvg and bucketed.
// Mostly transparent pixels are ignored; the second colour must differ visibly from the first.
function crestColours(dataUrl, render = (svg) => new Resvg(svg, { fitTo: { mode: 'original' } }).render()) {
  if (!/^data:image\//.test(String(dataUrl || ''))) return null;
  let img;
  try {
    img = render(`<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><image href="${dataUrl}" width="40" height="40" preserveAspectRatio="xMidYMid meet"/></svg>`);
  } catch { return null; }
  const px = img?.pixels;
  if (!px || !px.length) return null;
  const buckets = new Map();
  for (let i = 0; i + 3 < px.length; i += 4) {
    if (px[i + 3] < 160) continue;
    const key = ((px[i] >> 4) << 8) | ((px[i + 1] >> 4) << 4) | (px[i + 2] >> 4);
    const b = buckets.get(key) || { n: 0, r: 0, g: 0, b: 0 };
    b.n += 1; b.r += px[i]; b.g += px[i + 1]; b.b += px[i + 2];
    buckets.set(key, b);
  }
  const hex = (b) => `#${[b.r / b.n, b.g / b.n, b.b / b.n].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
  const ranked = [...buckets.values()].sort((a, b) => b.n - a.n).map(hex);
  if (!ranked.length) return null;
  const primary = ranked[0];
  const secondary = ranked.find((c) => dist(c, primary) > 90) || null;
  return { primary, secondary };
}

function describeKit(team, kit) {
  const main = colourWord(kit.primary);
  const trim = kit.secondary ? colourWord(kit.secondary) : null;
  return `${team} kit: ${main} shirt${trim && trim !== main ? ` with ${trim} collar, cuffs and trim` : ''}, ${main} shorts`;
}

// Search rows from EA's allTimeLeaderboard/search -> candidates
function parseSearch(data, platform) {
  let rows = data;
  if (rows && typeof rows === 'object' && !Array.isArray(rows) && rows['0']) rows = rows['0'];
  rows = Array.isArray(rows) ? rows : rows && typeof rows === 'object' ? Object.values(rows) : [];
  return rows.map((row) => {
    const info = row?.clubInfo || row?.clubinfo || row;
    const clubId = String(row?.clubId ?? info?.clubId ?? '');
    if (!/^\d{1,15}$/.test(clubId)) return null;
    return {
      clubId,
      platform,
      name: String(info?.name || row?.clubName || clubId).slice(0, 40),
      crestId: String(info?.customKit?.crestAssetId ?? info?.crestAssetId ?? '').replace(/\D/g, '') || null,
      games: Number(row?.gamesPlayed) || 0,
      skill: Number(row?.skillRating) || 0,
      eaKit: kitFromEa(info),
    };
  }).filter(Boolean);
}

// Exact name first, then the most games played
function rankCandidates(list, typed) {
  const target = normalizeClubName(typed);
  const seen = new Set();
  return list
    .filter((c) => !seen.has(`${c.platform}:${c.clubId}`) && seen.add(`${c.platform}:${c.clubId}`))
    .sort((a, b) => (normalizeClubName(b.name) === target) - (normalizeClubName(a.name) === target) || b.games - a.games || b.skill - a.skill)
    .slice(0, MAX_CANDIDATES);
}

// The club to use without asking: an exact name match, or the only result
function autoPick(candidates, typed) {
  const target = normalizeClubName(typed);
  const exact = candidates.filter((c) => normalizeClubName(c.name) === target);
  if (exact.length) return exact[0];
  return candidates.length === 1 ? candidates[0] : null;
}

const platformLabel = (p) => PLATFORM_LABEL[p] || p;

function createEaTeamKit({ http = axios, fetchImage, findSavedKit = async () => null, log = console } = {}) {
  const cache = new Map();
  const remember = (key, value) => { cache.set(key, { at: Date.now(), value }); if (cache.size > 300) cache.delete(cache.keys().next().value); return value; };
  const cached = (key) => { const hit = cache.get(key); return hit && Date.now() - hit.at < CACHE_MS ? hit.value : undefined; };

  async function eaGet(path, params) {
    const res = await http.get(`https://proclubs.ea.com/api/fc/${path}`, { params, headers: EA_HEADERS, timeout: 8000, validateStatus: () => true });
    if (res.status === 403 || res.status === 429 || res.status >= 500) {
      const err = new Error(`EA answered ${res.status}`);
      err.eaUnavailable = true;
      throw err;
    }
    return res.status === 200 ? res.data : null;
  }

  // Up to 10 EA clubs for a typed name, best first. Throws { eaUnavailable } when EA is down.
  async function search(name) {
    const q = String(name || '').trim().slice(0, 40);
    if (q.length < 2) return [];
    const key = `s:${q.toLowerCase()}`;
    const hit = cached(key);
    if (hit) return hit;
    let down = null;
    const lists = await Promise.all(FC_PLATFORMS.map((platform) => eaGet('allTimeLeaderboard/search', { platform, clubName: q })
      .then((d) => parseSearch(d, platform))
      .catch((e) => { if (e.eaUnavailable) down = e; return []; })));
    const out = rankCandidates(lists.flat(), q);
    if (!out.length && down) throw down;
    return remember(key, out);
  }

  // EA's kit for one club when the search row had none
  async function eaKit(c) {
    if (c.eaKit) return c.eaKit;
    const key = `k:${c.platform}:${c.clubId}`;
    const hit = cached(key);
    if (hit !== undefined) return hit;
    const data = await eaGet('clubs/info', { platform: c.platform, clubIds: c.clubId }).catch(() => null);
    const info = Array.isArray(data) ? data[0] : data?.[c.clubId];
    return remember(key, kitFromEa(info));
  }

  // The team a card is built from: { clubId, platform, name, crest, kit: { primary, secondary, description }, kitFrom }
  async function resolve(guildId, c) {
    const crest = c.crestId ? eaCrestUrl(c.crestId) : null;
    let kit = null, kitFrom = null;
    const saved = await findSavedKit(guildId, { clubId: c.clubId, platform: c.platform, name: c.name }).catch((e) => { log.warn?.(`[ea-team] saved kit lookup failed: ${e.message}`); return null; });
    if (saved && (saved.primary || saved.secondary)) {
      kit = { primary: saved.primary || null, secondary: saved.secondary || null, description: saved.description || null };
      kitFrom = saved.learned ? 'learned' : 'saved';
    }
    if (!kit) {
      const fromEa = await eaKit(c).catch(() => null);
      if (fromEa) { kit = fromEa; kitFrom = 'ea'; }
    }
    if (!kit && crest && fetchImage) {
      const image = await fetchImage(crest).catch(() => null);
      const fromCrest = image && crestColours(image);
      if (fromCrest) { kit = fromCrest; kitFrom = 'crest'; }
    }
    if (kit && !kit.description) kit = { ...kit, description: describeKit(c.name, kit) };
    return { clubId: c.clubId, platform: c.platform, name: c.name, crest, kit, kitFrom };
  }

  return { search, resolve, eaKit };
}

const KIT_FROM_LABEL = {
  saved: 'the uniform saved for this club on GafferBot',
  learned: 'the uniform players picked for this team',
  ea: "the club's kit colours on EA",
  crest: "the colours in the club's crest",
};

module.exports = { createEaTeamKit, eaColour, kitFromEa, crestColours, colourWord, describeKit, parseSearch, rankCandidates, autoPick, platformLabel, KIT_FROM_LABEL };
