// One house style for every embed the bot sends.
//
// Commands and panels were written over time with a dozen ad-hoc colours and no common footer.
// Rather than touch every EmbedBuilder, this hooks EmbedBuilder#toJSON (discord.js calls it when it
// serialises a message) and, at send time:
//   - maps the legacy colours onto one palette (accent, success, warning, danger, gold, neutral);
//   - paints "accent" embeds in the server's /brand colour when it has one, GafferBot green otherwise;
//   - adds the server's /brand footer (or "GafferBot") to embeds that have no footer.
// Platform colours (Twitch, Xbox) and event-type colours are left alone.
// The server is known from the interaction being handled (AsyncLocalStorage), so scheduled posts
// that set their own colour and footer keep them.

const { AsyncLocalStorage } = require('node:async_hooks');
const { EmbedBuilder } = require('discord.js');

const PALETTE = {
  accent: 0x22c55e,
  success: 0x22c55e,
  info: 0x3b82f6,
  warning: 0xf59e0b,
  danger: 0xef4444,
  gold: 0xf5b301,
  neutral: 0x64748b,
};

// Legacy literal -> palette role. Anything not listed is kept as written.
const LEGACY = new Map([
  // Discord blurple and assorted blues/teals/oranges used as a generic panel colour
  [0x5865f2, 'accent'],
  [0x3498db, 'accent'],
  [0x0ea5e9, 'accent'],
  [0x0099ff, 'accent'],
  [0x00d4aa, 'accent'],
  [0x00ae86, 'accent'],
  [0xff6b35, 'accent'],
  [0x22c55e, 'accent'],
  // "it worked"
  [0x00ff00, 'success'],
  [0x57f287, 'success'],
  [0x2ecc71, 'success'],
  // heads-up
  [0xffcc00, 'warning'],
  [0xffaa00, 'warning'],
  [0xf59e0b, 'warning'],
  [0xfee75c, 'warning'],
  [0xe67e22, 'warning'],
  [0xf1c40f, 'warning'],
  // failures
  [0xff0000, 'danger'],
  [0xed4245, 'danger'],
  [0xef4444, 'danger'],
  [0xe74c3c, 'danger'],
  // trophies, premium
  [0xffd700, 'gold'],
  [0xf5b301, 'gold'],
  // finished / cancelled
  [0x99aab5, 'neutral'],
  [0x888888, 'neutral'],
  [0x95a5a6, 'neutral'],
]);

const BRANDING_TTL_MS = 5 * 60 * 1000;
const context = new AsyncLocalStorage();
const brandingCache = new Map();
let loadBranding = null;
let footerIconURL = null;
let installed = false;

function brandColor(branding) {
  const c = Number(branding?.color);
  return Number.isInteger(c) && c >= 0 && c <= 0xffffff ? c : null;
}

// Pure styling step, exported for tests.
function styleEmbedJSON(json, branding) {
  const out = { ...json };
  const role = out.color === undefined || out.color === null ? 'accent' : LEGACY.get(out.color);
  if (role === 'accent') out.color = brandColor(branding) ?? PALETTE.accent;
  else if (role) out.color = PALETTE[role];

  if (!out.footer?.text) {
    const text = (branding?.footer || 'GafferBot').slice(0, 2048);
    out.footer = footerIconURL ? { text, icon_url: footerIconURL } : { text };
  }
  return out;
}

function currentBranding() {
  const guildId = context.getStore()?.guildId;
  if (!guildId) return null;
  return brandingCache.get(guildId)?.value ?? null;
}

const WARM_WAIT_MS = 400;
const loading = new Map();

// Loads the guild's branding, but never holds an interaction up for more than WARM_WAIT_MS:
// a stale cache entry is used while it refreshes, and a slow first load finishes in the background.
async function warm(guildId) {
  if (!guildId || !loadBranding) return;
  const cached = brandingCache.get(guildId);
  if (cached && Date.now() - cached.at < BRANDING_TTL_MS) return;
  let pending = loading.get(guildId);
  if (!pending) {
    pending = Promise.resolve()
      .then(() => loadBranding(guildId))
      .then((value) => brandingCache.set(guildId, { at: Date.now(), value: value || {} }))
      .catch(() => brandingCache.set(guildId, { at: Date.now(), value: cached?.value || {} }))
      .finally(() => loading.delete(guildId));
    loading.set(guildId, pending);
  }
  if (cached) return;
  await Promise.race([pending, new Promise((r) => setTimeout(r, WARM_WAIT_MS).unref?.())]);
}

// Runs fn with the guild's branding available to every embed it sends.
async function runForGuild(guildId, fn) {
  await warm(guildId);
  return context.run({ guildId }, fn);
}

function forget(guildId) {
  brandingCache.delete(guildId);
}

function install(opts = {}) {
  if (opts.loadBranding) loadBranding = opts.loadBranding;
  if (installed) return;
  installed = true;
  const original = EmbedBuilder.prototype.toJSON;
  EmbedBuilder.prototype.toJSON = function styledToJSON(...args) {
    return styleEmbedJSON(original.apply(this, args), currentBranding());
  };
}

function setFooterIcon(url) {
  footerIconURL = url || null;
}

module.exports = { PALETTE, install, runForGuild, forget, setFooterIcon, styleEmbedJSON };
