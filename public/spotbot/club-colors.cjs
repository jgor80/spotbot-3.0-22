// Team colours and crest, picked per club in /setup → Team colours & crest (also on the web via the
// Control Room's Setup Wizard) and stored on the club in guild_settings:
//   club.colors    = { primary: '#c8102e', secondary: '#ffffff' }
//   club.crest_url = 'https://…'   (uploaded crest in storage, or an https link)
// Every output reads them through these helpers, so a club that never picked keeps today's look:
// colours fall back to the kit colours, then the server's /brand colour, then GafferBot green;
// the crest falls back to the server's /brand logo.

const { kitColor } = require('./studio-preview.cjs');

const DEFAULT_PRIMARY = '#22c55e';

// '#abc', 'abc', '#aabbcc' or a kit colour word ('sky blue') -> '#aabbcc'; anything else -> null
function toHex(value) {
  const s = String(value ?? '').trim().toLowerCase();
  if (!s) return null;
  const short = s.match(/^#?([0-9a-f]{3})$/);
  if (short) return `#${short[1].split('').map((c) => c + c).join('')}`;
  const named = kitColor(s, null);
  return named && /^#[0-9a-f]{6}$/.test(named) ? named : null;
}
const toInt = (hex) => parseInt(hex.slice(1), 16);
const intToHex = (n) => `#${Number(n).toString(16).padStart(6, '0')}`;

// Black or white text on a background colour
function inkOn(hex) {
  const n = toInt(hex);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return 0.299 * r + 0.587 * g + 0.114 * b > 160 ? '#111111' : '#ffffff';
}

function brandHex(branding) {
  const c = Number(branding?.color);
  return Number.isInteger(c) && c >= 0 && c <= 0xffffff ? intToHex(c) : null;
}

// The club's colours with fallbacks. picked = the club chose them in setup.
function teamColors(club, branding) {
  const saved = club?.colors || {};
  const kit = club?.kit || {};
  const pickedPrimary = toHex(saved.primary);
  const primary = pickedPrimary || toHex(kit.primary) || brandHex(branding) || DEFAULT_PRIMARY;
  let secondary = toHex(saved.secondary) || toHex(kit.secondary);
  if (!secondary || secondary === primary) secondary = inkOn(primary);
  return { primary, secondary, primaryInt: toInt(primary), secondaryInt: toInt(secondary), ink: inkOn(primary), picked: Boolean(pickedPrimary) };
}

// Embed colour for a club's posts: its picked colour, else the server's /brand colour, else fallback,
// so clubs that never picked keep the colours they had before.
function clubAccent(club, branding, fallback) {
  const c = teamColors(club, branding);
  if (c.picked) return c.primaryInt;
  const brand = brandHex(branding);
  return brand ? toInt(brand) : fallback;
}

// The kit graphics draw, with missing kit colours filled from the team colours and the team colours
// as the accent for frames, panels and lettering.
function kitOf(club, kit = club?.kit) {
  const base = { ...(kit || {}) };
  const saved = club?.colors || {};
  const primary = toHex(saved.primary);
  const secondary = toHex(saved.secondary);
  if (!base.primary && primary) base.primary = primary;
  if (!base.secondary && secondary) base.secondary = secondary;
  if (primary) base.accent = primary;
  if (secondary) base.accent2 = secondary;
  return base;
}

const httpsUrl = (u) => (typeof u === 'string' && /^https:\/\/\S+$/i.test(u.trim()) ? u.trim() : null);

// The club's crest link: its own upload or link, else the server's /brand logo.
function crestUrl(club, branding) {
  return httpsUrl(club?.crest_url) || httpsUrl(branding?.logo_url);
}

module.exports = { toHex, teamColors, clubAccent, kitOf, crestUrl, inkOn, DEFAULT_PRIMARY };
