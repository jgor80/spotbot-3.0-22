// Club crest archive. Every crest carries the years it was used, so each card style picks the
// crest from its own era. Palermo ships with a built-in history; any other club gets the same
// depth from branding.crests (imported by /brand crest_history from a crest-history page).
// Crests are scoped: a club only ever sees its own built-in or saved history.
const asset = (f) => require(`./assets/${f}.asset.json`).url;

const PALERMO_HISTORY = [
  ['1907-1921', 'Palermo F.B.C. blue & white shield', 1907, 1921],
  ['1921-1924', 'Palermo F.B.C. pink & black shield', 1921, 1924],
  ['1924-1935', 'Palermo FC compass football', 1924, 1935],
  ['1935-1940', 'Gold eagle pink & black shield', 1935, 1940],
  ['1940-1947', 'U.S. Palermo eagle shield', 1940, 1947],
  ['1947-1968', 'Unione Sportiva Palermo eagle', 1947, 1968],
  ['1979-1987', 'Green diamond eagle', 1979, 1987],
  ['1987-1991', 'U.S. Palermo diagonal eagle', 1987, 1991],
  ['1991-1994', 'U.S. Palermo flying eagle', 1991, 1994],
  ['1994-2000', 'U.S. Palermo striped eagle', 1994, 2000],
  ['2000-2019', 'U.S. Città di Palermo gold eagle', 2000, 2019],
  ['2019-Present', 'Palermo FC eagle head', 2019, 9999],
].map(([file, name, from, to]) => ({
  key: `h${from}`, from, to, url: asset(`crest-palermo-${file}.png`),
  label: `${name} (${from}–${to === 9999 ? 'present' : to})`,
}));
const PALERMO_EXTRAS = [
  ['current', 'Current Palermo logo (2019–present)', 'palermo-logo-current', 2019, 9999],
  ['eagle', 'Palermo eagle lettering (2019–present)', 'palermo-logo-43', 2019, 9999],
  ['shield', 'Pink and black shield (2010s-inspired custom)', 'palermo-logo-44', 2010, 2019],
  ['heritage', 'Vintage gold shield (2000–2019-inspired custom)', 'palermo-logo-45', 2000, 2019],
].map(([key, label, file, from, to]) => ({ key, label, from, to, url: asset(`${file}.png`), custom: true }));

// The year each card style "lives" in, used to pick the crest in use at that time.
const STYLE_YEAR = {
  vintage: 1955, retro1960s: 1962, sicilia: 1974, retro1970s: 1977, sunday: 1982, retro1986: 1986,
  retro1990s: 1993, y2k: 2001, retro2010s: 2014, retro2020s: 2024,
};
const NOW = 2100;

function validCrest(c) {
  return c && /^https?:\/\//i.test(c.url || '') || (c && String(c.url || '').startsWith('/'));
}
// All crests for this club, oldest first. branding = guild_settings.branding (optional).
function logosFor(club, branding) {
  const saved = (Array.isArray(branding?.crests) ? branding.crests : [])
    .filter((c) => validCrest(c) && (!c.club || !club?.name || c.club.toLowerCase() === String(club.name).toLowerCase()));
  const builtIn = /palermo/i.test(club?.name || '') ? [...PALERMO_HISTORY, ...PALERMO_EXTRAS] : [];
  const keys = new Set();
  return [...saved, ...builtIn].filter((c) => !keys.has(c.key) && keys.add(c.key))
    .sort((a, b) => (a.from || 0) - (b.from || 0)).slice(0, 24);
}
// Crest in use in a given year: the one whose range covers it, else the nearest earlier one,
// preferring real historical crests over era-inspired custom designs.
function crestForYear(logos, year) {
  const real = logos.filter((l) => !l.custom && l.from);
  const pool = real.length ? real : logos.filter((l) => l.from);
  const covering = pool.filter((l) => l.from <= year && year <= (l.to || NOW));
  if (covering.length) return covering[covering.length - 1];
  const earlier = pool.filter((l) => l.from <= year);
  return earlier[earlier.length - 1] || pool[0] || null;
}
function logoFor(club, style, key, branding) {
  const logos = logosFor(club, branding);
  if (!logos.length) return null;
  const preferred = key && logos.find((l) => l.key === key);
  if (preferred) return preferred;
  const year = STYLE_YEAR[style];
  if (year) return crestForYear(logos, year) || logos[logos.length - 1];
  return logos.find((l) => l.key === 'current') || crestForYear(logos, NOW) || logos[logos.length - 1];
}
function assetUrl(url) {
  return url.startsWith('/') ? `https://spotbot3.lovable.app${url}` : url;
}

// Parse a crest-history page (worldsoccerpins.com, footballkitarchive.com, or any page whose
// crest images carry year ranges like "1947-1968" / "2019-Present") into crest entries.
function parseCrestHistory(html, pageUrl) {
  const base = new URL(pageUrl);
  const out = [];
  const seen = new Set();
  for (const tag of String(html).match(/<img\b[^>]*>/gi) || []) {
    const attr = (n) => (tag.match(new RegExp(`${n}="([^"]+)"`, 'i')) || [])[1];
    const src = attr('data-original-src') || attr('data-src') || attr('src');
    if (!src) continue;
    const text = decodeURIComponent(`${src} ${attr('alt') || ''} ${attr('title') || ''}`).replace(/\+/g, ' ');
    const m = text.match(/((?:18|19|20)\d{2})\s*[-–]\s*((?:18|19|20)\d{2}|present|today|now)/i);
    if (!m) continue;
    const from = Number(m[1]);
    const to = /\d/.test(m[2]) ? Number(m[2]) : 9999;
    if (seen.has(from)) continue;
    seen.add(from);
    out.push({ key: `h${from}`, from, to, url: new URL(src, base).href,
      label: `Crest ${from}–${to === 9999 ? 'present' : to}` });
  }
  return out.sort((a, b) => a.from - b.from).slice(0, 24);
}

module.exports = { logosFor, logoFor, crestForYear, parseCrestHistory, assetUrl, STYLE_YEAR, PALERMO_HISTORY };
