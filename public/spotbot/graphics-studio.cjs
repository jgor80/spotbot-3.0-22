// Graphics Studio: a club's own media channel where anyone can ask for graphics.
//   Player Card    the member's in-game pro, redrawn in the club kit, with their real club stats
//   Match Poster   vertical full-time poster for the latest synced match
//   Banner         managers only: championship banner (BYOT, league, cup, playoff wins)
// Artwork comes from the club-art function (AI, no text). Every word and number on top is drawn
// here from saved data, so stats are never invented. Includes a player-only 1986 print-card style.
// The studio is any channel named like #graphics / #media-studio, or a club's graphics_channel_id.
// The panel stays the last message in the channel.

const {
  EmbedBuilder, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle,
} = require('discord.js');
const axios = require('axios');
const G = require('./graphics.cjs');
const { seamlessLogo } = require('./logo-cleanup.cjs');
const { toFcPlatform } = require('./ea-fc27.cjs');
const { activeClubs } = require('./manager-hub.cjs');
const { toInsightMatches, competitionLabel } = require('./club-insights.cjs');
const { nextVariation } = require('./graphics-variants.cjs');
const { stillInGuild, recentGames, activePool, pickGroup } = require('./art-players.cjs');
const { UPLOAD_ID: PHOTO_UPLOAD_ID } = require('./pro-photos.cjs');
const { render1986Card } = require('./graphics-1986.cjs');
const { render1960sCard } = require('./graphics-1960s.cjs');
const { render1970sCard } = require('./graphics-1970s.cjs');
const { render1990sCard } = require('./graphics-1990s.cjs');
const { renderY2kCard } = require('./graphics-y2k.cjs');
const { render2010sCard } = require('./graphics-2010s.cjs');
const { render2020sCard } = require('./graphics-2020s.cjs');
const { renderYearbookCard } = require('./graphics-yearbook.cjs');
const { renderSignatureCard, SIGNATURE_STYLES } = require('./graphics-signature.cjs');
const { renderSiciliaCard, renderSiciliaBack } = require('./graphics-sicilia.cjs');
const { renderCardBack } = require('./graphics-card-back.cjs');
const { finishCardSvg } = require('./card-layout.cjs');
const { cardStats } = require('./card-stats.cjs');
const { kitsFor, kitFor, withKit } = require('./club-kits.cjs');
const { kitOf, teamColors, crestUrl } = require('./club-colors.cjs');
const { logosFor, logoFor, assetUrl } = require('./club-logos.cjs');
const { pickSheet, crestSheet, styleSheet, thumbSvg, kitColor } = require('./studio-preview.cjs');
const fs = require('fs');
const path = require('path');
const { recruitmentPoster } = require('./graphics-recruitment.cjs');
const { theme, themeOpen } = require('./graphics-themes.cjs');

const NAME_RE = /graphic|media-?studio|studio/i;
const STYLES = {
  esports: { label: 'Ultra Esports', emoji: '⚡', desc: 'Neon, smoke, grunge — matchday hype' },
  modern: { label: 'Modern Broadcast', emoji: '📺', desc: 'Live TV lower-third, live bug, telemetry rail' },
  vintage: { label: 'Vintage Heritage', emoji: '📜', desc: '1950s trade card: halftone, arched banner, oval crest' },
  cyber: { label: 'Cyber Glitch', emoji: '🟨', desc: 'Neon duotone, glitch slices, warning tape, crosshairs' },
  chrome: { label: 'Liquid Chrome', emoji: '🪩', desc: 'Iridescent glass, chrome bevels, frosted plaques' },
  mvp: { label: 'Tournament MVP', emoji: '🏆', desc: 'Carbon fibre, brushed gold slashes, elite tier tags' },
  synthwave: { label: 'Synthwave Chill', emoji: '🌅', desc: 'Sunset grid, neon outlines, chillwave haze' },
  sunday: { label: 'Mud & Tears 1982', emoji: '🌧️', desc: 'Sunday-league satire: rain, mud, dented frame, honest stats' },
  sicilia: { label: '1974 Palermo Sicilia', emoji: '🍋', desc: 'Calciatori sticker meets Topps: tiles, skyline, card back', cardOnly: true },
  retro1986: { label: '1986 Club Classic', emoji: '⚾', desc: 'Bold club masthead, white frame, position badge', cardOnly: true },
  retro1960s: { label: '1960s Club Heritage', emoji: '🎞️', desc: 'Oval portraits, pennants, colourful print borders', cardOnly: true },
  retro1970s: { label: '1970s Club Archive', emoji: '🌟', desc: 'Arched club lettering, double borders, ribbon frames', cardOnly: true },
  retro1990s: { label: '1990s Club Collection', emoji: '💿', desc: 'Colour-pop borders, clean action frames, vertical club type', cardOnly: true },
  y2k: { label: 'Y2K Club Chrome', emoji: '💎', desc: 'Refractor foil, circular club type, metallic nameplates', cardOnly: true },
  retro2010s: { label: '2010s Club Signature', emoji: '🌊', desc: 'Chrome outlines, sweeping ribbons, textured foil frames', cardOnly: true },
  retro2020s: { label: '2020s Club Prism', emoji: '🔮', desc: 'Angular prism, mosaic foil, sculpted chrome emblems', cardOnly: true },
  yearbook: { label: "'90s Yearbook Headshot", emoji: '📸', desc: 'Tight school-portrait headshot, laser backdrop, photo corners', cardOnly: true, playerOnly: true },
  obsidian: { label: 'Obsidian & Gold', emoji: '🛡️', desc: 'Black and gold, elite' },
};
const HEAD = 'Oswald';
const BODY = 'Inter';
const COLOR_WORDS = {
  pink: 0xf472b6, black: 0x111111, white: 0xffffff, red: 0xdc2626, blue: 0x2563eb, navy: 0x1e3a8a, green: 0x16a34a,
  yellow: 0xfacc15, gold: 0xd4af37, orange: 0xf97316, purple: 0x7c3aed, sky: 0x38bdf8, maroon: 0x7f1d1d, grey: 0x9ca3af, gray: 0x9ca3af,
};
const BUSY = new Set();
const NO_GROUP = 'No recently active club players still in this server have an uploaded pro photo yet.';
const DRAFTS = new Map(); // token -> pending graphic waiting on its edit form

function colorNum(v, fallback) {
  const s = String(v || '').trim().toLowerCase();
  if (/^#?[0-9a-f]{6}$/.test(s)) return parseInt(s.replace('#', ''), 16);
  if (COLOR_WORDS[s] !== undefined) return COLOR_WORDS[s];
  // Multi-word kit colours ("pale pink", "anthracite black") resolve like the kit previews.
  const named = kitColor(s, null);
  return named ? parseInt(named.slice(1), 16) : fallback;
}
const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;
const esc = G.esc;
const clip = (s, n) => (String(s || '').length > n ? `${String(s).slice(0, n - 1)}…` : String(s || ''));
const fit = (text, w, max, ratio = 0.5, min = 14) => Math.max(min, Math.min(max, Math.floor(w / (Math.max(String(text || '').length, 1) * ratio))));
const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

function palette(style, kit) {
  // Team colours (kit.accent from club-colors) lead frames and lettering; else the kit's main colour
  const primary = colorNum(kit?.accent || kit?.primary, 0x22c55e);
  const base = {
    esports: { ink: '#ffffff', accent: hex(primary), sub: '#e5e7eb', panel: '#000000', panelOpacity: 0.55, skew: -8 },
    modern: { ink: '#ffffff', accent: hex(primary), sub: '#cbd5e1', panel: '#0b1220', panelOpacity: 0.72, skew: 0 },
    vintage: { ink: '#f5e9cf', accent: '#c8553d', sub: '#e8d9b5', panel: '#2a1d12', panelOpacity: 0.7, skew: 0, frame: '#efe3c8' },
    sicilia: { accent: '#e98bb5' },
    retro1986: { accent: hex(primary) },
    retro1960s: { accent: hex(primary) },
    retro1970s: { accent: hex(primary) },
    retro1990s: { accent: hex(primary) },
    y2k: { accent: hex(primary) },
    retro2010s: { accent: hex(primary) },
    retro2020s: { accent: hex(primary) },
    yearbook: { accent: hex(primary) },
    cyber: { ink: '#f4f4f5', accent: '#e8ff3a', sub: '#ff2bd6', panel: '#050507', panelOpacity: 0.7, skew: -6, frame: '#e8ff3a' },
    chrome: { ink: '#ffffff', accent: '#9fe8ff', sub: '#f4b8ff', panel: '#0b0f17', panelOpacity: 0.55, skew: 0, frame: '#c8d2e0' },
    mvp: { ink: '#f7e7b4', accent: '#d8b25a', sub: '#bfb59a', panel: '#0a0a0a', panelOpacity: 0.75, skew: -4, frame: '#d8b25a' },
    synthwave: { ink: '#fff6fb', accent: '#ff4fb8', sub: '#3ef0ff', panel: '#140b2e', panelOpacity: 0.6, skew: -6, frame: '#ff4fb8' },
    sunday: { ink: '#f2ead8', accent: '#8a6a3b', sub: '#c9bfa8', panel: '#2b2a26', panelOpacity: 0.7, skew: -3, frame: '#5b4a33' },
    obsidian: { ink: '#f6e7b0', accent: '#d4af37', sub: '#d6d3d1', panel: '#000000', panelOpacity: 0.7, skew: 0, frame: '#d4af37' },
  }[style] || {};
  return base;
}

// Crest as drawn on full-bleed graphics: the whole logo, never cropped to a circle.
function crestSvg(x, y, r, img) {
  if (!img) return '';
  return `<image href="${img}" x="${x - r}" y="${y - r}" width="${r * 2}" height="${r * 2}" preserveAspectRatio="xMidYMid meet"/>`;
}

// ---------- Compositions ----------

// Club name and line beside the crest, top left of full-bleed graphics.
function masthead(th, crest, clubName, line, { x = 70, y = 70, r = 46, max = 30 } = {}) {
  const tx = crest ? x + r * 2 + 18 : x;
  return `${crestSvg(x + r, y + r, r, crest)}
    <text x="${tx}" y="${y + r - 2}" font-family="${HEAD}" font-weight="700" font-size="32" fill="${th.ink}" stroke="#000" stroke-opacity="0.35" stroke-width="2" paint-order="stroke">${esc(clip(clubName, max).toUpperCase())}</text>
    ${line ? `<text x="${tx}" y="${y + r + 30}" font-family="${BODY}" font-weight="700" font-size="19" letter-spacing="1" fill="${th.sub}" stroke="#000" stroke-opacity="0.35" stroke-width="2" paint-order="stroke">${esc(clip(line, 60))}</text>` : ''}`;
}

function playerCard(d) {
  const print = { retro1986: render1986Card, retro1960s: render1960sCard, retro1970s: render1970sCard, retro1990s: render1990sCard, y2k: renderY2kCard, retro2010s: render2010sCard, retro2020s: render2020sCard, yearbook: renderYearbookCard }[d.style];
  if (d.style === 'sicilia') return renderSiciliaCard(d, { ...G, render: (svg) => G.render(finishCardSvg(svg, d), d.renderWidth) });
  if (SIGNATURE_STYLES.includes(d.style)) return renderSignatureCard(d, { ...G, render: (svg) => G.render(finishCardSvg(svg, d), d.renderWidth) }, hex(colorNum(d.kit?.accent || d.kit?.primary, 0x22c55e)));
  if (print) return print(d, { ...G, render: (svg) => G.render(finishCardSvg(svg, d), d.renderWidth) }, palette(d.style, d.kit).accent);
  // Ultra Esports and Obsidian & Gold: full-bleed art with their own grade, frame and lettering.
  const W = 1024, H = 1536, th = theme(d.style, palette(d.style, d.kit).accent || '#22c55e');
  const centred = th.key === 'obsidian';
  const stats = (d.stats || []).slice(0, 6);
  const editorial = !centred && stats.length > 0 && d.composition === 'editorial';
  const x = centred ? W / 2 : 70, anchor = centred ? 'middle' : 'start';
  const nameY = editorial ? 330 : stats.length ? 1235 : d.tagline ? 1370 : 1420;
  const name = clip(d.name, 30), size = fit(d.name, 880, editorial ? 100 : 128, 0.48, 32);
  const cell = (W - 140) / Math.max(stats.length, 1);
  const badgeX = W - 200;
  return G.render(finishCardSvg(`${themeOpen(th, W, H, d.art, { fadeFrom: editorial ? 0.7 : 0.6 })}
    ${masthead(th, d.crest, d.clubName, d.seasonLabel || 'PRO CLUBS', { y: 72 })}
    ${d.position ? `<rect x="${badgeX}" y="${centred ? 82 : 72}" width="130" height="66" fill="${th.accent}"/><text x="${badgeX + 65}" y="${centred ? 128 : 118}" text-anchor="middle" font-family="${HEAD}" font-weight="700" font-size="38" fill="${th.accentInk}">${esc(d.position)}</text>` : ''}
    ${d.overall ? `<text x="${badgeX + 65}" y="225" text-anchor="middle" font-family="${HEAD}" font-weight="700" font-size="76" fill="${th.ink}" stroke="#000" stroke-opacity="0.4" stroke-width="3" paint-order="stroke">${d.overall}</text><text x="${badgeX + 65}" y="252" text-anchor="middle" font-family="${BODY}" font-size="16" fill="${th.sub}">${esc(d.overallLabel)}</text>` : ''}
    ${centred ? '' : th.slash(x, nameY - size * 0.82, Math.min(860, name.length * size * 0.5), size * 0.9, th.accent)}
    ${th.head(esc(name.toUpperCase()), x, nameY, size, anchor, th)}
    ${d.tagline ? `<text x="${centred ? x : x + 4}" y="${nameY + 48}" text-anchor="${anchor}" font-family="${BODY}" font-weight="700" font-size="${fit(d.tagline, 880, 24, 0.58, 16)}" fill="${th.accent}">${esc(clip(d.tagline, 60).toUpperCase())}</text>` : ''}
    ${stats.length ? `${th.plate(70, 1300, W - 140, 140, th)}
      ${stats.map(([label, value], i) => `<text x="${70 + cell * i + cell / 2}" y="1382" text-anchor="middle" font-family="${HEAD}" font-weight="700" font-size="54" fill="${th.plateInk}">${esc(value)}</text>
       <text x="${70 + cell * i + cell / 2}" y="1418" text-anchor="middle" font-family="${BODY}" font-weight="700" font-size="${fit(label, cell - 12, 17, 0.58, 10)}" fill="${th.plateSub}">${esc(label)}</text>`).join('')}` : ''}
    <text x="${W / 2}" y="1484" text-anchor="middle" font-family="${BODY}" font-size="14" fill="${th.sub}" fill-opacity="0.85">${stats.length ? 'EA MATCH DATA · ' : ''}AI ART FROM THEIR IN-GAME PRO · GAFFERBOT STUDIO</text>
  </svg>`, d), d.renderWidth);
}

const RESULT_WORD = { win: 'VICTORY', draw: 'SHARE THE SPOILS', loss: 'DEFEAT' };
function matchPoster(d) {
  const W = 1024, H = 1536, th = theme(d.style, palette(d.style, d.kit).accent || '#22c55e');
  const word = d.headline || RESULT_WORD[d.result] || 'FULL TIME';
  return G.render(`${themeOpen(th, W, H, d.art)}
    ${masthead(th, d.crestFor, d.clubName, `${d.competition || 'Pro Clubs'} · ${d.dateText}`)}
    ${th.slash(70, 940, 640, 130, th.accent)}
    ${th.head('FULL TIME', 70, 1060, 150, 'start', th)}
    <text x="76" y="1112" font-family="${HEAD}" font-weight="700" font-size="36" letter-spacing="2" fill="${th.wordInk}" stroke="#000" stroke-opacity="0.4" stroke-width="2" paint-order="stroke">${esc(word)}</text>
    ${th.plate(70, 1140, W - 140, 156, th)}
    ${crestSvg(160, 1218, 54, d.crestFor)}
    ${crestSvg(W - 160, 1218, 54, d.crestAgainst)}
    <text x="${W / 2}" y="1240" text-anchor="middle" font-family="${HEAD}" font-weight="700" font-size="112" fill="${th.plateInk}">${n(d.scoreFor)} – ${n(d.scoreAgainst)}</text>
    <text x="${W / 2}" y="1280" text-anchor="middle" font-family="${BODY}" font-size="22" fill="${th.plateSub}">vs ${esc(clip(d.opponent, 34))}</text>
    ${d.scorers ? `<text x="76" y="1336" font-family="${BODY}" font-weight="700" font-size="${fit(d.scorers, 860, 25, 0.55, 15)}" fill="${th.ink}" stroke="#000" stroke-opacity="0.45" stroke-width="3" paint-order="stroke">GOALS  ${esc(clip(d.scorers, 80))}</text>` : ''}
    ${d.motm ? `<rect x="70" y="1358" width="${W - 140}" height="92" fill="${th.accent}"/>
      <text x="96" y="1394" font-family="${BODY}" font-weight="700" font-size="18" letter-spacing="2" fill="${th.accentInk}">PLAYER OF THE MATCH</text>
      <text x="96" y="1436" font-family="${HEAD}" font-weight="700" font-size="40" fill="${th.accentInk}">${esc(clip(d.motm.name, 22).toUpperCase())}</text>
      <text x="${W - 96}" y="1436" text-anchor="end" font-family="${HEAD}" font-weight="700" font-size="56" fill="${th.accentInk}">${d.motm.rating ? Number(d.motm.rating).toFixed(1) : ''}</text>` : ''}
    <text x="${W / 2}" y="1484" text-anchor="middle" font-family="${BODY}" font-size="14" fill="${th.sub}" fill-opacity="0.85">EA MATCH DATA · AI ART · GAFFERBOT STUDIO</text>
  </svg>`, d.renderWidth);
}

function banner(d) {
  const W = 1536, H = 1024, th = theme(d.style, palette(d.style, d.kit).accent || '#22c55e');
  const roster = d.roster.slice(0, 24);
  const perRow = Math.min(8, Math.max(roster.length, 1));
  const colW = (W - 200) / perRow;
  const size = fit(d.headline, 1180, 112, 0.5, 50);
  return G.render(`${themeOpen(th, W, H, d.art, { fadeFrom: 0.5 })}
    ${masthead(th, d.crest, d.clubName, d.competition, { x: 80, y: 70, r: 56 })}
    ${d.seasonTag ? `<rect x="${W - 320}" y="80" width="220" height="62" fill="${th.accent}"/><text x="${W - 210}" y="123" text-anchor="middle" font-family="${HEAD}" font-weight="700" font-size="30" fill="${th.accentInk}">${esc(clip(d.seasonTag, 14).toUpperCase())}</text>` : ''}
    ${th.slash(W / 2 - Math.min(1300, d.headline.length * size * 0.5) / 2, 790 - size * 0.82, Math.min(1300, d.headline.length * size * 0.5), size * 0.9, th.accent)}
    ${th.head(esc(clip(d.headline, 28).toUpperCase()), W / 2, 790, size, 'middle', th)}
    ${roster.length ? `${th.plate(100, 826, W - 200, 34 + Math.ceil(roster.length / perRow) * 38, th)}
    ${roster.map((name, i) => {
      const row = Math.floor(i / perRow), col = i % perRow;
      return `<text x="${100 + colW * col + colW / 2}" y="${866 + row * 38}" text-anchor="middle" font-family="${BODY}" font-weight="700" font-size="${fit(name, colW - 10, 22, 0.58, 12)}" fill="${th.plateInk}">${esc(clip(name, 18))}</text>`;
    }).join('')}` : ''}
  </svg>`, d.renderWidth);
}

function lineupPoster(d) {
  const W = 1024, H = 1536, th = theme(d.style, palette(d.style, d.kit).accent || '#22c55e');
  const xi = (d.starters || []).slice(0, 11);
  const half = Math.ceil(xi.length / 2);
  const top = 1010, rowH = 50;
  const row = (s, x, y) => `<text x="${x}" y="${y}" font-family="${HEAD}" font-weight="700" font-size="25" fill="${th.accent}">${esc(clip(s.pos, 4))}</text>
    <text x="${x + 76}" y="${y}" font-family="${BODY}" font-weight="700" font-size="${fit(s.name, 300, 27, 0.58, 16)}" fill="${th.plateInk}">${esc(clip(s.name, 22))}</text>`;
  return G.render(`${themeOpen(th, W, H, d.art, { fadeFrom: 0.5 })}
    ${masthead(th, d.crest, d.clubName, d.subtitle)}
    ${th.slash(70, 830, 560, 110, th.accent)}
    ${th.head('STARTING XI', 70, 930, 118, 'start', th)}
    <text x="76" y="978" font-family="${HEAD}" font-weight="700" font-size="${fit(d.title, 860, 38, 0.5, 22)}" fill="${th.wordInk}" stroke="#000" stroke-opacity="0.4" stroke-width="2" paint-order="stroke">${esc(clip(d.title, 40).toUpperCase())}</text>
    ${th.plate(70, top, W - 140, 44 + half * rowH + (d.subs?.length ? 44 : 0), th)}
    ${xi.slice(0, half).map((s, i) => row(s, 100, top + 52 + i * rowH)).join('')}
    ${xi.slice(half).map((s, i) => row(s, 545, top + 52 + i * rowH)).join('')}
    ${d.subs?.length ? `<text x="100" y="${top + 44 + half * rowH + 20}" font-family="${BODY}" font-weight="700" font-size="${fit(d.subs.join(', '), 800, 21, 0.55, 14)}" fill="${th.plateSub}">SUBS  ${esc(clip(d.subs.join(' · '), 90))}</text>` : ''}
    <text x="${W / 2}" y="1484" text-anchor="middle" font-family="${BODY}" font-size="14" fill="${th.sub}" fill-opacity="0.85">CLUB LINEUP · AI ART · GAFFERBOT STUDIO</text>
  </svg>`, d.renderWidth);
}

// Styles offered for each graphic, in menu order (print-card styles are cards and recruiting only).
function stylesFor(kind) {
  return Object.entries(STYLES).filter(([, s]) => !s.cardOnly || kind === 'card' || (kind === 'recruit' && !s.playerOnly));
}

// ---------- Studio ----------

// Circle badges fit about four letters: long position words become standard abbreviations.
const POS_SHORT = { GOALKEEPER: 'GK', KEEPER: 'GK', DEFENDER: 'DEF', DEFENCE: 'DEF', DEFENSE: 'DEF', MIDFIELDER: 'MID', MIDFIELD: 'MID', FORWARD: 'FWD', ATTACKER: 'ATT', STRIKER: 'ST', WINGER: 'WNG', 'CENTRE BACK': 'CB', 'CENTER BACK': 'CB', 'FULL BACK': 'FB', 'WING BACK': 'WB' };
function shortPosition(pos) {
  const p = String(pos || '').trim().toUpperCase();
  if (!p) return '';
  return POS_SHORT[p] || (p.length > 4 ? p.replace(/[^A-Z]/g, '').slice(0, 3) : p);
}

function createGraphicsStudio({ supabase, supabaseUrl, secret, getGuildState, saveGuildSettings, isManager, serverPrefs, getClient, getPremium = () => null }) {
  const panelIds = new Map(); // channelId -> panel message id
  const guildOf = (guildId) => getClient?.()?.guilds?.cache?.get(guildId) || null;

  async function art(body) {
    if (!secret) return { error: 'The studio needs BOT_PROXY_SECRET set on the bot.' };
    const res = await fetch(`${supabaseUrl.replace(/\/$/, '')}/functions/v1/club-art`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-bot-secret': secret },
      body: JSON.stringify(body),
    }).catch(() => null);
    const out = res ? await res.json().catch(() => ({})) : {};
    if (!res?.ok || !out.image_b64) return { error: typeof out.error === 'string' ? out.error : typeof out.message === 'string' ? out.message : 'The art studio is unavailable right now.', outOfImages: out.out_of_images === true };
    return { image: `data:image/png;base64,${out.image_b64}`, usedPro: out.used_pro_photo, kitNumber: Number.isInteger(out.kit_number) ? out.kit_number : null };
  }

  // A failed graphic's reply; when the server is out of AI images it carries the buy buttons
  async function failure(r, guildId, userId) {
    const premium = getPremium();
    if (!r.outOfImages || !premium) return `❌ ${r.error}`;
    const status = await premium.imageStatus(guildId);
    return { content: `❌ ${r.error}`, components: premium.buyRows(guildId, userId, status.error ? null : status) };
  }

  // Saved-card collection (player-cards function): save / list / get / delete, always scoped to the owner.
  async function cardsApi(body) {
    if (!secret) return { error: 'The studio needs BOT_PROXY_SECRET set on the bot.' };
    const res = await fetch(`${supabaseUrl.replace(/\/$/, '')}/functions/v1/player-cards`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-bot-secret': secret }, body: JSON.stringify(body),
    }).catch(() => null);
    const out = res ? await res.json().catch(() => ({})) : {};
    return res?.ok ? out : { error: out.error || 'Your card collection is unavailable right now.' };
  }

  async function studioClub(guildId, channelId, channelName) {
    const state = await getGuildState(guildId).catch(() => null);
    const clubs = activeClubs(state);
    const exact = clubs.find((c) => c.graphics_channel_id === channelId);
    if (exact) return { state, club: exact };
    if (NAME_RE.test(channelName || '') && clubs.length) return { state, club: clubs[0] };
    return { state, club: null };
  }

  // Club crest for graphics: an era crest from the club's history wins, then the crest picked in
  // /setup (or the server's branding logo), then the club's real
  // EA badge (from its crestAssetId), then nothing (renderers fall back to initials).
  const CREST_CACHE = new Map(); // ea:<clubId> -> data url | null
  async function crestFor(guildId, club, style, logoKey) {
    const prefs = serverPrefs ? await serverPrefs(guildId).catch(() => ({})) : {};
    const selected = logoFor(club, style, logoKey, prefs?.branding);
    // Uploaded club identities take precedence even for Automatic; server branding may be an unrelated EA badge.
    const url = selected ? assetUrl(selected.url) : crestUrl(club, prefs?.branding);
    if (url) {
      const cached = CREST_CACHE.get(url);
      if (cached) return cached;
      const fetched = await G.fetchImage(url);
      // Knock out flat logo backdrops (e.g. a white square) so the crest blends into every style.
      const image = fetched && seamlessLogo(fetched);
      if (image) { CREST_CACHE.set(url, image); return image; }
      // Never silently substitute another team's badge when a saved logo fails to load.
      if (selected) throw new Error('The selected club logo could not be loaded. Please try again.');
    }
    const id = club?.ea_club_id;
    if (!id) return null;
    const key = `ea:${id}`;
    if (CREST_CACHE.has(key)) return CREST_CACHE.get(key);
    let crest = null;
    try {
      const res = await axios.get('https://proclubs.ea.com/api/fc/clubs/info', {
        params: { platform: toFcPlatform(club.ea_platform), clubIds: id },
        headers: {
          accept: 'application/json',
          origin: 'https://www.ea.com',
          referer: 'https://www.ea.com/',
          'user-agent': 'Mozilla/5.0',
        },
        timeout: 8000,
        validateStatus: () => true,
      });
      const info = Array.isArray(res.data) ? res.data[0] : res.data?.[id];
      const crestId = info?.customKit?.crestAssetId || info?.crestAssetId;
      const url = G.eaCrestUrl(crestId);
      if (url) { const raw = await G.fetchImage(url); crest = raw && seamlessLogo(raw); }
    } catch { /* leave crest null */ }
    CREST_CACHE.set(key, crest);
    return crest;
  }

  function panelMessage(club) {
    const kit = club.kit || {};
    return {
      embeds: [new EmbedBuilder()
        .setColor(teamColors(club).primaryInt)
        .setTitle(`🎨 ${club.name} Graphics Studio`)
        .setDescription([
          'Ask for graphics any time — everyone appears in **our kit**, drawn from their in-game pro.',
          '',
          '🎴 **Player Card** — portrait only or with club stats',
          '📰 **Match Poster** — pick any recent game',
          '📋 **Lineup** — starting XI from a lineup built for an event or tournament',
          '📣 **Recruiting Poster** — positions, trial details and contact info',
          '_You can edit names, scores and players before anything is drawn._',
          '🏆 **Banner** — managers only, for BYOT, league, cup and playoff wins',
          '📸 **Upload Photos** — your headshot and goal celebrations, shot on your phone or as screenshots (no AI renders)',
          '',
          `Styles: ${Object.values(STYLES).map((s) => `${s.emoji} ${s.label}`).join(' · ')}`,
          `Kit: **${kit.primary || 'not set'}${kit.secondary ? ` / ${kit.secondary}` : ''}** · No pro photo yet? Tap **Upload Photos** first.`,
          '_Or just type “card”, “card vintage” or “poster” here._',
        ].join('\n'))
        .setFooter({ text: '📌 This panel stays at the bottom · artwork is AI, stats are real EA data' })],
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`gs_card:${club.key}`).setLabel('Player Card').setEmoji('🎴').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`gs_poster:${club.key}`).setLabel('Match Poster').setEmoji('📰').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`gs_lineup:${club.key}`).setLabel('Lineup').setEmoji('📋').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`gs_banner:${club.key}`).setLabel('Banner').setEmoji('🏆').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`gs_kit:${club.key}`).setLabel('Club Kit').setEmoji('👕').setStyle(ButtonStyle.Secondary),
      ), new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`gs_recruit:${club.key}`).setLabel('Recruiting Poster').setEmoji('📣').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`gs_mycards:${club.key}`).setLabel('My Cards').setEmoji('🗂️').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(PHOTO_UPLOAD_ID).setLabel('Upload Photos').setEmoji('📸').setStyle(ButtonStyle.Success),
        ...(getPremium()?.IMAGE_LIMITS ? [new ButtonBuilder().setCustomId(`gs_images:${club.key}`).setLabel('AI Images').setEmoji('🖼️').setStyle(ButtonStyle.Secondary)] : []),
      )],
      allowedMentions: { parse: [] },
    };
  }

  async function refreshPanel(channel, club) {
    const old = panelIds.get(channel.id);
    if (old) await channel.messages.delete(old).catch(() => {});
    else {
      const recent = await channel.messages.fetch({ limit: 30 }).catch(() => null);
      for (const m of recent?.values() || []) {
        if (m.author?.id === channel.client.user.id && m.embeds?.[0]?.title?.includes('Graphics Studio')) await m.delete().catch(() => {});
      }
    }
    const sent = await channel.send(panelMessage(club)).catch(() => null);
    if (sent) panelIds.set(channel.id, sent.id);
  }

  function styleRow(kind, clubKey, extra = '') {
    return new ActionRowBuilder().addComponents(new StringSelectMenuBuilder()
      .setCustomId(`gs_style:${kind}:${clubKey}${extra ? `:${extra}` : ''}`)
      .setPlaceholder('Pick a style')
      .addOptions(stylesFor(kind).map(([value, s], i) => ({ label: `${i + 1}. ${s.label}`, value, emoji: s.emoji, description: s.desc }))));
  }

  // ----- builders (return { file, note } or { error }) -----

  // Each graphic = data step (pulled from saved games / lineups) -> optional manual edit form -> render step.

  function saveDraft(draft) {
    const token = Math.random().toString(36).slice(2, 10);
    DRAFTS.set(token, { ...draft, ts: Date.now() });
    for (const [k, v] of DRAFTS) if (Date.now() - v.ts > 30 * 60e3) DRAFTS.delete(k);
    return token;
  }
  function draftPrompt(token, kind, club) {
    const choices = kind === 'card'
      ? [['stats', 'With Stats'], ['portrait', 'Portrait Only']]
      : [['edit', 'Edit Before Rendering']];
    const draft = DRAFTS.get(token);
    const kits = kitsFor(club);
    const chosen = draft?.data?.kitKey;
    const auto = kitFor(club, draft?.style);
    const kitRow = kits.length ? [new ActionRowBuilder().addComponents(new StringSelectMenuBuilder()
      .setCustomId(`gs_dkit:${token}`).setPlaceholder(`Kit: ${chosen ? kits.find((k) => k.key === chosen)?.label : `Automatic (${auto.label})`}`)
      .addOptions([{ label: `Automatic — ${auto.label}`.slice(0, 100), value: 'auto' }, ...kits.map((k) => ({ label: k.label, value: k.key, default: k.key === chosen }))]))] : [];
    const photos = kind === 'card' ? draft?.data?.photos || [] : [];
    const photoRow = photos.length ? [new ActionRowBuilder().addComponents(new StringSelectMenuBuilder()
      .setCustomId(`gs_dphoto:${token}`).setPlaceholder(`Photo: ${photos.find((p) => p.id === draft.data.photoId)?.label || 'Automatic (best match)'}`)
      .addOptions([{ label: 'Automatic — best match for the pose', value: 'auto' }, ...photos.map((p) => ({ label: p.label, value: p.id, description: p.description || undefined, default: p.id === draft.data.photoId }))]))] : [];
    return { content: kind === 'card' ? `🎴 Pick a kit and ${photos.length ? 'which of your uploaded photos to base it on' : 'style'} (optional), then with stats or just your pro?` : 'Your details are ready. Pick a kit if you like.', components: [...kitRow, ...photoRow, new ActionRowBuilder().addComponents(
      ...choices.map(([mode, label]) => new ButtonBuilder().setCustomId(`gs_edit:${token}:${mode}`).setLabel(label).setStyle(ButtonStyle.Primary)),
      ...(kind === 'card' ? [new ButtonBuilder().setCustomId(`gs_dback:${token}`).setLabel(draft?.data?.noBack ? 'Back of card: Off' : 'Back of card: On').setEmoji('🔄').setStyle(draft?.data?.noBack ? ButtonStyle.Secondary : ButtonStyle.Success)] : []),
    )] };
  }
  const input = (id, label, value, { para = false, max = 100, req = false } = {}) => new ActionRowBuilder().addComponents(
    new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(para ? TextInputStyle.Paragraph : TextInputStyle.Short)
      .setRequired(req).setMaxLength(max).setValue(String(value ?? '').slice(0, max)));
  const pickRow = (customId, placeholder, opts) => new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder().setCustomId(customId).setPlaceholder(placeholder).addOptions(opts.slice(0, 25)));

  // ----- pick previews: kits, crests and photos drawn locally from saved assets (no AI calls) -----

  const THUMBS = new Map(); // image url -> small PNG data url
  async function thumb(url, w, h = w, fit = 'slice') {
    if (!url) return null;
    const key = `${w}x${h}:${fit}:${url}`;
    if (THUMBS.has(key)) return THUMBS.get(key);
    const raw = await G.fetchImage(url).catch(() => null);
    if (!raw) return null; // not cached: a signed URL or EA may only be briefly unavailable
    let out = null;
    try { out = `data:image/png;base64,${Buffer.from(G.render(thumbSvg(raw, w, h, fit))).toString('base64')}`; } catch { out = null; }
    if (THUMBS.size >= 200) THUMBS.delete(THUMBS.keys().next().value);
    THUMBS.set(key, out);
    return out;
  }
  async function photoThumb(p) {
    const viaUrl = p.url && (await thumb(p.url, 160, 200));
    if (viaUrl || !p.path || !supabase?.storage) return viaUrl || null;
    const signed = await supabase.storage.from('pro-photos').createSignedUrl(p.path, 600).catch(() => null);
    return signed?.data?.signedUrl ? thumb(signed.data.signedUrl, 160, 200) : null;
  }
  const previewFile = (png) => new AttachmentBuilder(png, { name: 'studio-preview.png' });
  const previewEmbed = (title, color) => new EmbedBuilder().setColor(color).setTitle(title).setImage('attachment://studio-preview.png')
    .setFooter({ text: 'Preview of your picks · kit colours are a guide, the artwork follows the full kit description' });

  // The kit, crest and (for cards) photos this draft will use, highlighted, as one small image.
  async function draftPreview(token, kind, club, guildId) {
    const draft = DRAFTS.get(token);
    if (!draft || !club) return null;
    const kits = kitsFor(club);
    const auto = kitFor(club, draft.style);
    const kitTiles = kits.length
      ? kits.map((k) => ({ ...k, picked: (draft.data?.kitKey || auto.key) === k.key, auto: !draft.data?.kitKey }))
      : [{ ...kitOf(club), label: 'Club kit', picked: true }];
    const prefs = serverPrefs ? await serverPrefs(guildId).catch(() => ({})) : {};
    const logo = logoFor(club, draft.style, draft.data?.logoKey, prefs?.branding);
    const crestImage = await crestFor(guildId, club, draft.style, draft.data?.logoKey).catch(() => null);
    const crest = { image: crestImage && (await thumb(crestImage, 240, 240, 'meet')), label: logo?.label || (crestImage ? 'Club crest' : 'No crest saved') };
    const all = kind === 'card' ? draft.data?.photos || [] : [];
    const MAX = 6;
    let shown = all.slice(0, MAX);
    const picked = all.find((p) => p.id === draft.data?.photoId);
    if (picked && !shown.includes(picked)) shown = [...shown.slice(0, MAX - 1), picked];
    const photos = await Promise.all(shown.map(async (p) => ({ label: p.label, picked: p.id === draft.data?.photoId, image: await photoThumb(p).catch(() => null) })));
    const png = G.render(pickSheet({ kits: kitTiles, crest, photos, photoAuto: !picked, morePhotos: all.length - shown.length }));
    return { file: previewFile(png), embed: previewEmbed(kind === 'card' ? '👀 Your card picks' : '👀 Your graphic picks', teamColors(club).primaryInt) };
  }
  // Draft prompt plus its preview; a failed preview never blocks the draft itself.
  async function draftMessage(token, kind, club, guildId) {
    const base = draftPrompt(token, kind, club);
    const p = await draftPreview(token, kind, club, guildId).catch((err) => { console.warn('[studio] preview failed:', err.message); return null; });
    return p ? { ...base, embeds: [p.embed], files: [p.file], attachments: [] } : { ...base, embeds: [], files: [], attachments: [] };
  }
  // Style picker gallery: every style for this graphic drawn locally with bundled sample art (assets/samples, menus only)
  // (no AI calls), small and cached per club kit, so members see each theme before choosing.
  const STYLE_SHEETS = new Map();
  // Each sample is cropped around its player (viewBox in the 1600x912 source), so style frames show a figure, not empty stadium.
  const SAMPLE_FOCUS = { attack: '0 140 440 660', attack2: '60 0 608 912', attack3: '0 60 1200 800', defence: '230 110 420 630' };
  const SAMPLE = (file, w, h) => {
    const raw = `data:image/jpeg;base64,${fs.readFileSync(path.join(__dirname, 'assets', 'samples', `${file}.jpg`)).toString('base64')}`;
    const svg = SAMPLE_FOCUS[file]
      ? `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${SAMPLE_FOCUS[file]}" preserveAspectRatio="xMidYMid slice"><image href="${raw}" width="1600" height="912"/></svg>`
      : thumbSvg(raw, w, h);
    return `data:image/png;base64,${Buffer.from(G.render(svg)).toString('base64')}`;
  };
  // A head-and-shoulders crop of the bundled celebration art, standing in for a yearbook headshot.
  const SAMPLE_HEAD = () => {
    const raw = `data:image/jpeg;base64,${fs.readFileSync(path.join(__dirname, 'assets', 'samples', 'attack3.jpg')).toString('base64')}`;
    return `data:image/png;base64,${Buffer.from(G.render(`<svg xmlns="http://www.w3.org/2000/svg" width="512" height="768" viewBox="215 90 300 450" preserveAspectRatio="xMidYMid slice"><image href="${raw}" width="1600" height="912"/></svg>`)).toString('base64')}`;
  };
  async function styleGallery(kind, club, guildId) {
    const key = `${guildId}:${club.key}:${kind}:${club.kit?.primary || ''}:${club.kit?.secondary || ''}:${club.colors?.primary || ''}:${club.colors?.secondary || ''}`;
    if (STYLE_SHEETS.has(key)) return STYLE_SHEETS.get(key);
    const banner_ = kind === 'banner';
    const art = SAMPLE(banner_ ? 'attack3' : kind === 'lineup' ? 'defence' : kind === 'card' ? 'attack2' : 'attack', banner_ ? 768 : 512, banner_ ? 512 : 768);
    const width = banner_ ? 300 : 200;
    const items = [];
    for (const [style, s] of stylesFor(kind)) {
      const c = withKit(club, style);
      const crest = await crestFor(guildId, club, style).catch(() => null);
      const base = { art: style === 'yearbook' ? SAMPLE_HEAD() : art, style, kit: c.kit, clubName: club.name, renderWidth: width };
      let png;
      try {
        if (kind === 'card') png = playerCard({ ...base, crest, name: 'Your Name', position: 'ST', overall: '', overallLabel: 'EA OVR', stats: [['GAMES', '20'], ['GOALS', '12'], ['ASSISTS', '6']], seasonLabel: 'PRO CLUBS', dataLabel: 'SAMPLE', composition: 'lower-third', tagline: '' });
        else if (kind === 'poster') png = matchPoster({ ...base, crestFor: crest, crestAgainst: null, scoreFor: 2, scoreAgainst: 1, result: 'win', opponent: 'Rivals FC', competition: 'League', dateText: 'Matchday', scorers: '', motm: { name: 'Your Name', rating: 8.4 } });
        else if (kind === 'lineup') png = lineupPoster({ ...base, crest, title: 'Cup Final', subtitle: 'Matchday', starters: ['GK', 'LB', 'CB', 'CB', 'RB', 'CM', 'CM', 'CAM', 'LW', 'RW', 'ST'].map((pos, i) => ({ pos, name: `Player ${i + 1}` })), subs: [] });
        else if (kind === 'banner') png = banner({ ...base, crest, headline: 'Champions', competition: 'Cup Final', seasonTag: '', roster: [] });
        else png = recruitmentPoster({ ...base, crest, headline: 'Join our club', positions: 'GK · CB · ST', details: '', contact: '', composition: 'lower-third' },
          { ...G, render: (svg) => G.render(svg, width) }, { ...palette('modern', c.kit), ...palette(style, c.kit) });
      } catch (err) { console.warn(`[studio] style preview ${style} failed:`, err.message); png = null; }
      const w = banner_ ? 3 : 2, h = banner_ ? 2 : kind === 'card' ? 2.8 : 3;
      items.push({ label: s.label, image: png ? `data:image/png;base64,${Buffer.from(png).toString('base64')}` : null, w, h });
    }
    const sheet = G.render(styleSheet(items, banner_ ? 4 : 6));
    if (STYLE_SHEETS.size >= 40) STYLE_SHEETS.delete(STYLE_SHEETS.keys().next().value);
    STYLE_SHEETS.set(key, sheet);
    return sheet;
  }
  // The style menu with its gallery; the menu still works if the gallery can't be drawn.
  async function styleMessage(kind, club, guildId, content, clubKey = club?.key) {
    const payload = { content, components: [styleRow(kind, clubKey)] };
    if (!club) return payload;
    try {
      const png = await styleGallery(kind, club, guildId);
      return { ...payload, embeds: [previewEmbed('👀 Styles', teamColors(club).primaryInt).setFooter({ text: 'Numbers match the style menu · sample art, yours is drawn from your club\'s pros' })], files: [previewFile(png)] };
    } catch (err) { console.warn('[studio] style gallery failed:', err.message); return payload; }
  }

  // Every logo on the recruiting poster's logo menu, numbered to match it.
  async function logoMenuMessage(token, club, logos) {
    const crests = await Promise.all(logos.map(async (l) => ({
      label: l.label.replace(/\s*\(.*\)\s*$/, ''), years: l.from ? `${l.from}–${!l.to || l.to >= 9999 ? 'now' : l.to}` : '',
      image: await thumb(assetUrl(l.url), 200, 200, 'meet').catch(() => null),
    })));
    const payload = { content: 'Pick your club logo:', components: [pickRow(`gs_rlogo:${token}`, 'Club logo',
      [{ label: 'Automatic — match the style', value: 'auto' }, ...logos.map((l, i) => ({ label: `${i + 1}. ${l.label}`.slice(0, 100), value: l.key }))])] };
    try {
      return { ...payload, embeds: [previewEmbed('👀 Club logos', teamColors(club).primaryInt).setFooter({ text: 'Numbers match the menu below' })], files: [previewFile(G.render(crestSheet(crests)))], attachments: [] };
    } catch (err) { console.warn('[studio] logo preview failed:', err.message); return payload; }
  }

  async function nameMap(guild, ids) {
    const clean = [...new Set(ids.filter((id) => id && /^\d+$/.test(id)))];
    const map = new Map();
    if (!clean.length) return map;
    const { data } = await supabase.from('profiles').select('discord_user_id, ea_username').in('discord_user_id', clean);
    for (const p of data || []) if (p.ea_username) map.set(p.discord_user_id, p.ea_username);
    for (const id of clean) {
      if (map.has(id)) continue;
      const m = guild ? await guild.members.fetch(id).catch(() => null) : null;
      map.set(id, m?.displayName || 'Player');
    }
    return map;
  }
  async function idForName(name) {
    if (!name) return undefined;
    if (/^\d{5,25}$/.test(name)) return name;
    const { data } = await supabase.from('profiles').select('discord_user_id').ilike('ea_username', name).limit(1).maybeSingle();
    return data?.discord_user_id && /^\d+$/.test(data.discord_user_id) ? data.discord_user_id : undefined;
  }

  // ----- player card -----
  async function cardData({ guildId, club, userId, displayName }) {
    const [{ data: statsRows }, { data: profile }, { data: photo }, { data: assets }, { data: archive }, { data: seasons }] = await Promise.all([
      supabase.from('player_club_stats').select('*').eq('guild_id', guildId).eq('discord_user_id', userId),
      supabase.from('profiles').select('ea_username').eq('discord_user_id', userId).maybeSingle(),
      supabase.from('pro_photos').select('position, overall').eq('discord_user_id', userId).maybeSingle(),
      supabase.from('pro_photo_assets').select('id, pose, source_kind, analysis, created_at, image_url, storage_path').eq('discord_user_id', userId).order('created_at', { ascending: false }).limit(60),
      supabase.from('player_season_archive').select('*').eq('guild_id', guildId).eq('discord_user_id', userId),
      supabase.from('ea_seasons').select('code, label, starts_at').order('starts_at'),
    ]);
    const data = cardStats((statsRows || []).map((s) => ({ ...s, primary_position: photo?.position || s.primary_position })), club);
    const verified = (assets || []).map((a) => a.analysis?.kit_number).find((n) => Number.isInteger(n) && n >= 1 && n <= 99);
    // Card back: one row per archived season, plus the EA Member List total for this exact club.
    const short = String(club.name || '').split(/\s+/).pop().slice(0, 10).toUpperCase();
    const archiveRows = Array.isArray(archive) ? archive : [];
    const seasonRows = (Array.isArray(seasons) ? seasons : []).map((s) => ({ s, r: archiveRows.find((a) => a.season_code === s.code) })).filter(({ r }) => r && r.matches > 0)
      .map(({ s, r }) => ({ label: `'${String(s.code).replace(/\D/g, '')} ${short}`, apps: r.matches, goals: r.goals, assists: r.assists, cs: r.clean_sheets, motm: r.motm, rating: r.avg_rating }));
    const ea = (statsRows || []).find((s) => s.club_key === club.key && (!club.ea_club_id || !s.ea_club_id || String(s.ea_club_id) === String(club.ea_club_id)) && s.games_played > 0);
    const clubTotals = ea ? { apps: ea.games_played, goals: ea.goals, assists: ea.assists, cs: ea.clean_sheets, motm: ea.man_of_match, rating: ea.avg_match_rating } : null;
    return {
      ...data, userId, name: displayName || profile?.ea_username || 'Player', position: photo?.position || data.position,
      overall: photo?.overall || '', kitNumber: verified || null, seasonRows, clubTotals,
      // The member's own uploads, offered as the card's reference photo.
      photos: (assets || []).filter((a) => a.source_kind === 'upload').slice(0, 24).map((a, i) => ({
        id: a.id, label: clip(`${i + 1}. ${a.pose || 'Photo'}${a.analysis?.kit_number ? ` · #${a.analysis.kit_number}` : ''}`, 90),
        url: a.image_url || null, path: a.storage_path || null,
        description: clip(a.analysis?.description || new Date(a.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), 95),
      })),
    };
  }
  const cardModal = (token, d) => new ModalBuilder().setCustomId(`gs_cform:${token}`).setTitle('Check your card before it is drawn').addComponents(
    input('name', 'Name on card', d.name, { max: 30, req: true }),
    input('position', 'Position', d.position, { max: 10 }),
    input('overall', 'Overall (optional)', d.overall, { max: 3 }),
    input('number', `Shirt number (optional${d.kitNumber ? `; verified #${d.kitNumber}` : ''})`, d.kitNumber || '', { max: 2 }),
    input('stats', 'Stats (optional; blank = no stats)', d.stats.map(([l, v]) => `${l} ${v}`).join('\n'), { para: true, max: 200 }),
  );
  function applyCardEdits(d, f) {
    const stats = f('stats').split('\n').map((line) => line.trim()).filter(Boolean).slice(0, 6).map((line) => {
      const m = line.match(/^(.*\S)\s+(\S+)$/);
      return m ? [m[1].toUpperCase(), m[2]] : [line.toUpperCase(), ''];
    });
    const changed = JSON.stringify(stats.map(([l, v]) => [l, String(v)])) !== JSON.stringify(d.stats.map(([l, v]) => [l, String(v)])) || f('overall') !== String(d.overall || '');
    const overall = /^\d{1,2}$/.test(f('overall')) && Number(f('overall')) > 0 ? f('overall') : '';
    const numRaw = f('number').replace(/\D/g, '');
    const number = numRaw && Number(numRaw) >= 1 && Number(numRaw) <= 99 ? String(Number(numRaw)) : '';
    return { ...d, name: f('name') || d.name, position: f('position'), overall, number, stats, dataLabel: changed ? 'MEMBER-EDITED' : d.seasonLabel, overallLabel: changed ? 'MEMBER OVR' : 'EA OVR', seasonLabel: stats.length ? changed ? 'MEMBER-EDITED' : d.seasonLabel : 'VIRTUAL PRO' };
  }
  async function renderCard({ guildId, club, style, d }) {
    club = club && { ...club, kit: kitOf(club) }; // team colours fill the kit and lead the accent
    // Cards are only drawn for someone still in the server.
    if (!(await stillInGuild(guildOf(guildId), [d.userId])).length) return { error: 'That player is no longer in this server, so no card was made.' };
    const variation = nextVariation(`${guildId}:${d.userId}:card:${style}`, style);
    // Print-card lettering and frames are local; artwork reuses the text-free vintage style.
    const printCard = Boolean(STYLES[style]?.cardOnly) || SIGNATURE_STYLES.includes(style);
    const a = await art({ kind: 'card', style: style === 'sicilia' || style === 'yearbook' ? style : STYLES[style]?.cardOnly ? 'vintage' : style, club_name: club.name, kit: club.kit || {}, discord_user_id: d.userId, guild_id: guildId, position: d.position || undefined, ...(d.photoId ? { photo_asset_id: d.photoId } : {}), ...variation, ...(style === 'yearbook' ? { pose: 'headshot' } : {}), has_stats: d.stats.length > 0, has_tagline: Boolean(d.tagline), ...(d.number ? { kit_number_override: Number(d.number) } : {}), ...(printCard || !d.stats.length ? { composition: 'lower-third' } : {}) });
    if (a.error) return a;
    const number = d.number !== undefined ? d.number : (a.kitNumber || '');
    const png = playerCard({
      art: a.image, style, kit: club.kit, clubName: club.name, crest: await crestFor(guildId, club, style), name: d.name, position: shortPosition(d.position) || null,
      overall: d.overall || null, overallLabel: d.overallLabel || 'EA OVR', stats: d.stats, seasonLabel: d.seasonLabel, dataLabel: d.dataLabel, tagline: d.tagline, composition: variation.composition, number,
    });
    const backName = `card-back-${d.name}.png`.replace(/[^\w.-]/g, '_');
    const back = d.noBack ? null : style === 'sicilia'
      ? new AttachmentBuilder(renderSiciliaBack({ number, name: d.name, clubName: club.name, position: d.position, stats: d.stats, seasonLabel: d.seasonLabel, dataLabel: d.dataLabel }, G), { name: backName })
      : new AttachmentBuilder(renderCardBack({ style, accent: palette(style, club.kit).accent, number, name: d.name, clubName: club.name, position: shortPosition(d.position) || d.position, rows: d.seasonRows || [], totals: d.clubTotals || null, edited: d.dataLabel === 'MEMBER-EDITED' }, G), { name: backName });
    // Keep a copy in the member's collection (My Cards); a failed save never blocks posting.
    cardsApi({ action: 'save', guild_id: guildId, discord_user_id: d.userId, style, name: String(d.name).slice(0, 40), front_b64: Buffer.from(png).toString('base64'), ...(back ? { back_b64: Buffer.from(back.attachment).toString('base64') } : {}) })
      .then((r) => r.error && console.warn('[studio] card save failed:', r.error)).catch(() => {});
    return { extra: back ? [back] : [], file: new AttachmentBuilder(png, { name: `card-${d.name}.png`.replace(/[^\w.-]/g, '_') }), note: a.usedPro ? null : 'No pro photo on file, so this uses a silhouette — post your pro in #pro-photos for the real thing.' };
  }
  async function buildCard({ guildId, club, userId, displayName, style, noStats = false }) {
    club = club && { ...club, kit: kitOf(club) }; // team colours fill the kit and lead the accent
    const d = await cardData({ guildId, club, userId, displayName });
    return renderCard({ guildId, club, style, d: noStats ? { ...d, stats: [], overall: '', seasonLabel: 'VIRTUAL PRO', tagline: '' } : d });
  }

  // ----- match poster (from any recent game) -----
  const MATCH_COLS = 'id, result, score_for, score_against, match_type, created_at, opponent_club_name, player_stats, match_data';
  async function recentMatches(guildId, club, limit) {
    let q = supabase.from('club_matches').select(MATCH_COLS).eq('guild_id', guildId).order('created_at', { ascending: false }).limit(limit);
    if (club.key) q = q.eq('club_key', club.key);
    const { data } = await q;
    return { raw: data || [], matches: toInsightMatches(data || []) };
  }
  async function matchOptions(guildId, club) {
    const { raw } = await recentMatches(guildId, club, 20);
    const icon = { win: '🟢', draw: '🟡', loss: '🔴' };
    return raw.map((m) => ({
      value: String(m.id),
      label: clip(`${n(m.score_for)}–${n(m.score_against)} vs ${m.opponent_club_name || 'Opponent'}`, 90),
      description: clip(`${new Date(m.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · ${m.match_type || 'match'}`, 90),
      emoji: icon[m.result] || '⚽',
    }));
  }
  async function posterData({ guildId, club, matchId }) {
    let match;
    if (matchId) {
      const { data } = await supabase.from('club_matches').select(MATCH_COLS).eq('id', matchId).eq('guild_id', guildId).maybeSingle();
      match = data ? toInsightMatches([data])[0] : null;
    } else match = (await recentMatches(guildId, club, 5)).matches[0];
    if (!match) return { error: 'No synced matches yet for this club.' };
    const players = match.players.map((p) => ({ name: p.ea_username, rating: n(p.rating), goals: n(p.goals), motm: !!p.motm })).filter((p) => p.name);
    const motm = players.find((p) => p.motm) || [...players].sort((x, y) => y.rating - x.rating)[0] || null;
    return {
      opponent: match.opponent || 'Opponent', scoreFor: match.scoreFor, scoreAgainst: match.scoreAgainst, result: match.result,
      competition: match.competition === 'cup' ? 'Playoff' : competitionLabel(match.competition),
      dateText: match.playedAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      scorers: players.filter((p) => p.goals).map((p) => (p.goals > 1 ? `${p.name} ×${p.goals}` : p.name)).join(', '),
      motm: motm ? { name: motm.name, rating: motm.rating || null } : null,
      headline: '',
    };
  }
  const posterModal = (token, d) => new ModalBuilder().setCustomId(`gs_pform:${token}`).setTitle('Check the poster before it is drawn').addComponents(
    input('score', 'Score (ours-theirs)', `${n(d.scoreFor)}-${n(d.scoreAgainst)}`, { max: 7, req: true }),
    input('opponent', 'Opponent', d.opponent, { max: 40, req: true }),
    input('competition', 'Competition / headline word', [d.competition, d.headline].filter(Boolean).join(' | '), { max: 60 }),
    input('scorers', 'Goal scorers (comma separated)', d.scorers, { para: true, max: 200 }),
    input('motm', 'Player of the match (name rating)', d.motm ? `${d.motm.name}${d.motm.rating ? ` ${Number(d.motm.rating).toFixed(1)}` : ''}` : '', { max: 40 }),
  );
  function applyPosterEdits(d, f) {
    const [sf, sa] = f('score').split(/[^0-9]+/).filter(Boolean).map(Number);
    const scoreFor = Number.isFinite(sf) ? sf : d.scoreFor, scoreAgainst = Number.isFinite(sa) ? sa : d.scoreAgainst;
    const result = scoreFor > scoreAgainst ? 'win' : scoreFor < scoreAgainst ? 'loss' : 'draw';
    const [competition, headlineWord] = f('competition').split('|').map((s) => s.trim());
    const mm = f('motm').match(/^(.*?)(?:\s+(\d+(?:\.\d+)?))?$/);
    return {
      ...d, scoreFor, scoreAgainst, result, opponent: f('opponent') || d.opponent, competition: competition || d.competition,
      headline: headlineWord || '', scorers: f('scorers'), motm: mm && mm[1] ? { name: mm[1], rating: mm[2] ? Number(mm[2]) : null } : null,
    };
  }
  async function renderPoster({ guildId, club, style, d }) {
    club = club && { ...club, kit: kitOf(club) }; // team colours fill the kit and lead the accent
    const players = await teamPlayers(guildId, club, await idForName(d.motm?.name));
    if (!players.length) return { error: NO_GROUP };
    const mood = d.result === 'win' ? 'win' : d.result === 'loss' ? 'loss' : 'draw';
    const a = await art({ kind: 'poster', style, club_name: club.name, kit: club.kit || {}, guild_id: guildId, team_player_ids: players, mood, competition: clip(d.competition, 60), ...nextVariation(`${guildId}:poster:${style}`, style, mood) });
    if (a.error) return a;
    const png = matchPoster({ art: a.image, style, kit: club.kit, clubName: club.name, crestFor: await crestFor(guildId, club, style), crestAgainst: null, ...d });
    return { file: new AttachmentBuilder(png, { name: 'full-time.png' }) };
  }
  async function buildPoster({ guildId, club, style }) {
    club = club && { ...club, kit: kitOf(club) }; // team colours fill the kit and lead the accent
    const d = await posterData({ guildId, club });
    return d.error ? d : renderPoster({ guildId, club, style, d });
  }

  // ----- lineup graphic (from lineups built for events, tournaments first-class) -----
  const TOURNEY_RE = /byot|tourn|cup|playoff|final/i;
  async function lineupOptions(guildId) {
    const { data: lineups } = await supabase.from('lineups').select('id, name, formation, event_id, created_at').eq('guild_id', guildId).order('created_at', { ascending: false }).limit(20);
    const ids = (lineups || []).map((l) => l.event_id).filter(Boolean);
    const { data: events } = ids.length ? await supabase.from('availability_events').select('id, title, event_type, scheduled_at').in('id', ids) : { data: [] };
    const ev = new Map((events || []).map((e) => [e.id, e]));
    return (lineups || []).map((l) => {
      const e = ev.get(l.event_id);
      const tourney = TOURNEY_RE.test(`${e?.event_type || ''} ${e?.title || ''} ${l.name || ''}`);
      const when = new Date(e?.scheduled_at || l.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      return { value: String(l.id), label: clip(e?.title || l.name || 'Lineup', 90), description: clip(`${when}${l.formation ? ` · ${l.formation}` : ''}${e?.event_type ? ` · ${e.event_type}` : ''}`, 90), emoji: tourney ? '🏆' : '📋' };
    });
  }
  async function lineupData({ guild, lineupId }) {
    const { data: l } = await supabase.from('lineups').select('id, name, formation, event_id, created_at').eq('id', lineupId).eq('guild_id', guild.id).maybeSingle();
    if (!l) return { error: 'That lineup no longer exists.' };
    const [{ data: slots }, { data: e }] = await Promise.all([
      supabase.from('lineup_slots').select('discord_user_id, position, slot_index, is_substitute').eq('lineup_id', l.id).order('slot_index'),
      l.event_id ? supabase.from('availability_events').select('title, event_type, scheduled_at').eq('id', l.event_id).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    const names = await nameMap(guild, (slots || []).map((s) => s.discord_user_id));
    const starters = (slots || []).filter((s) => !s.is_substitute).map((s) => ({ pos: (s.position || '').toUpperCase(), name: names.get(s.discord_user_id) || 'TBD' }));
    const subs = (slots || []).filter((s) => s.is_substitute).map((s) => names.get(s.discord_user_id) || 'Sub');
    const when = new Date(e?.scheduled_at || l.created_at).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    return {
      title: e?.title || l.name || 'Starting XI', subtitle: `${e?.event_type || 'Matchday'} · ${when}`, formation: l.formation || '',
      starters, subs, featured: starters.find((s) => /ST|CF|CAM/.test(s.pos))?.name || starters[0]?.name || '',
    };
  }
  const lineupModal = (token, d) => new ModalBuilder().setCustomId(`gs_lform:${token}`).setTitle('Check the lineup before it is drawn').addComponents(
    input('title', 'Title', d.title, { max: 40, req: true }),
    input('subtitle', 'Subtitle (competition · date · formation)', [d.subtitle, d.formation].filter(Boolean).join(' · '), { max: 80 }),
    input('starters', 'Starting XI — one per line: POS Name', d.starters.map((s) => `${s.pos} ${s.name}`).join('\n'), { para: true, max: 600, req: true }),
    input('subs', 'Subs (comma separated)', d.subs.join(', '), { para: true, max: 300 }),
    input('featured', 'Lead player in the team artwork (optional)', d.featured, { max: 40 }),
  );
  async function applyLineupEdits(d, f) {
    const starters = f('starters').split('\n').map((s) => s.trim()).filter(Boolean).slice(0, 11).map((line) => {
      const m = line.match(/^([A-Za-z]{1,4})\s+(.+)$/);
      return m ? { pos: m[1].toUpperCase(), name: m[2].trim() } : { pos: '', name: line };
    });
    return {
      ...d, title: f('title') || d.title, subtitle: f('subtitle'), starters,
      subs: f('subs').split(/[,\n]/).map((s) => s.trim()).filter(Boolean).slice(0, 8), heroId: await idForName(f('featured')),
    };
  }
  async function renderLineup({ guildId, club, style, d }) {
    club = club && { ...club, kit: kitOf(club) }; // team colours fill the kit and lead the accent
    const players = await teamPlayers(guildId, club, d.heroId);
    if (!players.length) return { error: NO_GROUP };
    const a = await art({ kind: 'poster', style, club_name: club.name, kit: club.kit || {}, guild_id: guildId, team_player_ids: players, mood: 'neutral', competition: clip(d.subtitle, 60), ...nextVariation(`${guildId}:lineup:${style}`, style) });
    if (a.error) return a;
    const png = lineupPoster({ art: a.image, style, kit: club.kit, clubName: club.name, crest: await crestFor(guildId, club, style), ...d });
    return { file: new AttachmentBuilder(png, { name: 'starting-xi.png' }) };
  }

  // ----- banner -----
  async function latestTournamentRoster(guild) {
    const opts = await lineupOptions(guild.id);
    const pick = opts.find((o) => o.emoji === '🏆') || opts[0];
    if (!pick) return [];
    const d = await lineupData({ guild, lineupId: pick.value });
    return d.error ? [] : [...d.starters.map((s) => s.name), ...d.subs];
  }
  async function buildBanner({ guild, guildId, club, style, headline: title, competition, seasonTag, rosterText, heroId }) {
    club = club && { ...club, kit: kitOf(club) }; // team colours fill the kit and lead the accent
    let roster = /^lineup$/i.test(String(rosterText || '').trim()) ? await latestTournamentRoster(guild) : String(rosterText || '').split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
    if (!roster.length) {
      const since = new Date(Date.now() - 21 * 864e5).toISOString();
      let q = supabase.from('club_matches').select('player_stats').eq('guild_id', guildId).gte('created_at', since).limit(60);
      if (club.key) q = q.eq('club_key', club.key);
      const { data } = await q;
      const seen = new Map();
      for (const r of data || []) for (const p of r.player_stats || []) if (p?.ea_username) seen.set(p.ea_username.toLowerCase(), p.ea_username);
      roster = [...seen.values()];
    }
    const players = await teamPlayers(guildId, club, heroId);
    if (!players.length) return { error: NO_GROUP };
    const a = await art({ kind: 'banner', style, club_name: club.name, kit: club.kit || {}, competition, guild_id: guildId, team_player_ids: players, ...nextVariation(`${guildId}:banner:${style}`, style, 'win') });
    if (a.error) return a;
    const png = banner({ art: a.image, style, kit: club.kit, clubName: club.name, crest: await crestFor(guildId, club, style), headline: title, competition, seasonTag, roster });
    return { file: new AttachmentBuilder(png, { name: 'champions-banner.png' }) };
  }

  const recruitModal = (token, d) => new ModalBuilder().setCustomId(`gs_rform:${token}`).setTitle('Check your recruiting poster').addComponents(
    input('headline', 'Headline', d.headline, { max: 40, req: true }),
    input('positions', 'Positions needed (optional)', d.positions, { max: 60 }),
    input('details', 'Trial time / platform / requirements', d.details, { max: 150, para: true }),
    input('contact', 'Contact or invite link (optional)', d.contact, { max: 100 }),
    input('featured', 'Lead player Discord ID (optional)', d.featured, { max: 25 }),
  );
  async function teamPlayers(guildId, club, leadId) {
    let teamId = club.team_id;
    if (!teamId) {
      const { data, error } = await supabase.from('teams').select('id').eq('guild_id', guildId).ilike('name', club.name).limit(1).maybeSingle();
      if (error) throw new Error(error.message);
      teamId = data?.id;
    }
    if (!teamId) return [];
    const { data: roster, error } = await supabase.from('team_rosters').select('discord_user_id, status').eq('team_id', teamId);
    if (error) throw new Error(error.message);
    const ids = [...new Set((roster || []).filter((r) => (r.status || 'active') === 'active' && /^\d{5,25}$/.test(r.discord_user_id)).map((r) => r.discord_user_id))];
    if (!ids.length) return [];
    // Only original uploads count: club-art never uses generated art as a likeness reference.
    const results = await Promise.all([
      supabase.from('pro_photo_assets').select('discord_user_id').eq('source_kind', 'upload').in('discord_user_id', ids),
      supabase.from('pro_photos').select('discord_user_id').in('discord_user_id', ids),
    ]);
    const saved = new Set();
    for (const result of results) {
      if (result.error) throw new Error(result.error.message);
      for (const photo of result.data || []) saved.add(photo.discord_user_id);
    }
    // Never draw someone who has left the server; then keep only the most active players.
    const present = await stillInGuild(guildOf(guildId), ids.filter((id) => saved.has(id)));
    const pool = activePool(present, await recentGames(supabase, guildId, club, present));
    return pickGroup(pool, leadId);
  }
  async function renderRecruit({ guildId, club, style, d }) {
    club = club && { ...club, kit: kitOf(club) }; // team colours fill the kit and lead the accent
    const players = await teamPlayers(guildId, club, d.featured);
    if (!players.length) return { error: NO_GROUP };
    const ART_STYLE = { retro1960s: 'vintage', retro1970s: 'vintage', retro1986: 'vintage', retro1990s: 'esports', y2k: 'chrome', retro2010s: 'chrome', retro2020s: 'cyber' };
    const v = nextVariation(`${guildId}:recruit:${style}`, style);
    const a = await art({ kind: 'poster', style: ART_STYLE[style] || style,
      club_name: club.name, kit: club.kit || {}, mood: 'neutral', guild_id: guildId, team_player_ids: players, ...v });
    if (a.error) return a;
    const png = recruitmentPoster({ ...d, art: a.image, style, clubName: club.name, composition: v.composition,
      crest: await crestFor(guildId, club, style, d.logoKey) }, G, { ...palette('modern', club.kit), ...palette(style, club.kit) });
    return { file: new AttachmentBuilder(png, { name: 'recruiting-poster.png' }) };
  }

  // Run a build, post the result in the studio channel (and Hall of Fame for banners), keep the panel last
  async function deliver({ channel, club, guild, userId, label, build, hallOfFame }) {
    const key = `${guild.id}:${userId}`;
    if (BUSY.has(key)) return { error: 'You already have a graphic in the works — give it a minute.' };
    BUSY.add(key);
    try {
      const r = await build();
      if (r.error) return r;
      const content = `${label}${r.note ? `\n_${r.note}_` : ''}`;
      await channel.send({ content, files: [r.file, ...(r.extra || [])], allowedMentions: { parse: [] } });
      if (hallOfFame) {
        const hof = club.autopilot?.hof_channel_id && (await guild.channels.fetch(club.autopilot.hof_channel_id).catch(() => null));
        if (hof && hof.id !== channel.id) await hof.send({ content, files: [new AttachmentBuilder(r.file.attachment, { name: r.file.name })], allowedMentions: { parse: [] } }).catch(() => {});
      }
      await refreshPanel(channel, club);
      return { ok: true };
    } catch (err) {
      console.warn('[studio] build failed:', err.message);
      return { error: 'Something went wrong drawing that graphic.' };
    } finally {
      BUSY.delete(key);
    }
  }

  // ----- typed requests in the studio channel -----

  async function onMessage(message) {
    if (!message.guild || message.author?.bot) return;
    const text = String(message.content || '').toLowerCase();
    if (/^!studio\b/.test(text)) {
      const member = await message.guild.members.fetch(message.author.id).catch(() => null);
      if (!member || !(await isManager(member, message.guild.id))) return;
      const state = await getGuildState(message.guild.id).catch(() => null);
      const club = activeClubs(state)[0];
      if (!club) return message.reply('Set up a club first with /setup.').catch(() => {});
      club.graphics_channel_id = message.channelId;
      await saveGuildSettings(message.guild.id, state).catch(() => {});
      await message.delete().catch(() => {});
      return refreshPanel(message.channel, club);
    }
    const { club } = await studioClub(message.guild.id, message.channelId, message.channel?.name);
    if (!club) return;
    const style = /\byearbook|school photo|headshot/i.test(text) ? 'yearbook' : /mud|sunday league|tears|disaster/i.test(text) ? 'sunday' : /sicil|calciatori|1974|palermo card/i.test(text) ? 'sicilia' : /synth|chillwave|vaporwave|outrun/i.test(text) ? 'synthwave' : /glitch|cyber|neo[- ]?tokyo/i.test(text) ? 'cyber' : /liquid chrome|glass/i.test(text) ? 'chrome' : /\bmvp\b/i.test(text) ? 'mvp' : /broadcast|\btv\b/i.test(text) ? 'modern' : /heritage|1950|50['’]?s/i.test(text) ? 'vintage' : /\bcard\b/.test(text) && /2020|20['’]?s|twenties|prism|mosaic/i.test(text) ? 'retro2020s' : /\bcard\b/.test(text) && /2010|10['’]?s|twenty[ -]?tens/i.test(text) ? 'retro2010s' : /\bcard\b/.test(text) && /y2k|2000|chrome|refractor/i.test(text) ? 'y2k' : /\bcard\b/.test(text) && /1990|90['’]?s|nineties/i.test(text) ? 'retro1990s' : /\bcard\b/.test(text) && /1970|70['’]?s|seventies/i.test(text) ? 'retro1970s' : /\bcard\b/.test(text) && /1960|60['’]?s|sixties/i.test(text) ? 'retro1960s' : /\bcard\b/.test(text) && /1986|topps|retro1986/i.test(text) ? 'retro1986' : Object.keys(STYLES).filter((s) => !STYLES[s].cardOnly).find((s) => text.includes(s)) || (text.includes('gold') ? 'obsidian' : text.includes('retro') ? 'vintage' : text.includes('clean') ? 'modern' : 'esports');
    let build, label;
    if (/\b(recruit(?:ing|ment)?|trials?)\b/.test(text)) {
      return message.reply({ ...(await styleMessage('recruit', club, message.guild.id, '📣 Pick a recruiting poster style, then edit your details:')), allowedMentions: { parse: [] } }).catch(() => {});
    } else if (/\bcard\b|\byearbook\b|headshot/.test(text)) {
      const target = message.mentions.users.find((u) => !u.bot) || message.author;
      const member = await message.guild.members.fetch(target.id).catch(() => null);
      build = () => buildCard({ guildId: message.guild.id, club, userId: target.id, displayName: member?.displayName || target.username, style, noStats: /no[ -]?stats|portrait|without stats/.test(text) });
      label = `🎴 **${member?.displayName || target.username}** · ${STYLES[style].label}`;
    } else if (/\b(poster|recap|full ?time)\b/.test(text)) {
      build = () => buildPoster({ guildId: message.guild.id, club, style });
      label = `📰 Full time · ${STYLES[style].label}`;
    } else if (/\bbanner\b/.test(text)) {
      return message.reply('🏆 Banners are made from the **Banner** button on the studio panel (managers only).').catch(() => {});
    } else return;
    await message.react('🎨').catch(() => {});
    const r = await deliver({ channel: message.channel, club, guild: message.guild, userId: message.author.id, label, build });
    await message.reactions.cache.get('🎨')?.users.remove(message.client.user.id).catch(() => {});
    if (r.error) await message.reply(await failure(r, message.guildId, message.author.id)).catch(() => {});
    else await message.react('✅').catch(() => {});
  }

  // ----- buttons, menus, forms -----

  async function handleInteraction(interaction) {
    const id = interaction.customId || '';
    if (!id.startsWith('gs_')) return false;
    const [action, a1, a2, a3] = id.split(':');
    // Modal-opening buttons use prepared data: never wait on cloud reads before Discord's 3s deadline.
    if (interaction.isButton() && action === 'gs_edit') {
      const draft = DRAFTS.get(a1);
      if (!draft || draft.userId !== interaction.user.id || Date.now() - draft.ts > 30 * 60e3) {
        await interaction.reply({ content: 'That form expired — start again from the panel.', flags: 64 });
        return true;
      }
      const d = draft.data;
      if (draft.kind === 'card' && a2 === 'portrait') draft.data = { ...d, stats: [], overall: '', seasonLabel: 'VIRTUAL PRO', tagline: '' };
      await interaction.showModal(draft.kind === 'card' ? cardModal(a1, draft.data) : draft.kind === 'recruit' ? recruitModal(a1, d) : draft.kind === 'poster' ? posterModal(a1, d) : lineupModal(a1, d));
      return true;
    }
    // Banner style opens a modal, which Discord forbids after a deferral; everything else is acknowledged immediately.
    const deferredSelect = (interaction.isStringSelectMenu() && !(action === 'gs_style' && a1 === 'banner'))
      || (interaction.isButton() && ['gs_dback', 'gs_cdel'].includes(action));
    const deferredReply = interaction.isModalSubmit() || interaction.isButton() && ['gs_card', 'gs_poster', 'gs_lineup', 'gs_recruit', 'gs_mycards', 'gs_banner', 'gs_images'].includes(action);
    if (deferredSelect) await interaction.deferUpdate();
    else if (deferredReply) await interaction.deferReply({ flags: 64 });
    const respond = (payload) => deferredReply ? interaction.editReply(payload) : interaction.reply(payload);
    const update = (payload) => deferredSelect ? interaction.editReply(payload) : interaction.update(payload);
    const state = await getGuildState(interaction.guildId).catch(() => null);
    const findClub = (key) => activeClubs(state).find((c) => c.key === key) || activeClubs(state)[0];
    if (interaction.isButton() && action === 'gs_dback') {
      const draft = DRAFTS.get(a1);
      if (!draft || draft.userId !== interaction.user.id || Date.now() - draft.ts > 30 * 60e3) {
        await update({ content: 'That form expired — start again from the panel.', components: [], embeds: [], attachments: [] }); return true;
      }
      draft.data.noBack = !draft.data.noBack;
      await update(await draftMessage(a1, 'card', findClub(draft.clubKey), interaction.guildId)); return true;
    }
    const manager = async () => isManager(interaction.member, interaction.guildId);
    if (interaction.isButton() && action === 'gs_recruit') {
      await respond(await styleMessage('recruit', findClub(a1), interaction.guildId, '📣 Pick a recruiting poster style:', a1));
      return true;
    }
    if (interaction.isStringSelectMenu() && action === 'gs_dphoto') {
      const draft = DRAFTS.get(a1);
      if (!draft || draft.userId !== interaction.user.id || Date.now() - draft.ts > 30 * 60e3) {
        await update({ content: 'That form expired — start again from the panel.', components: [], embeds: [], attachments: [] }); return true;
      }
      const v = interaction.values[0];
      draft.data.photoId = (draft.data.photos || []).some((p) => p.id === v) ? v : undefined;
      await update(await draftMessage(a1, 'card', findClub(draft.clubKey), interaction.guildId)); return true;
    }
    if (interaction.isButton() && action === 'gs_images') {
      const premium = getPremium();
      const status = premium ? await premium.imageStatus(interaction.guildId) : { error: 'Billing is unavailable right now.' };
      if (status.error) { await respond({ content: `❌ ${status.error}` }); return true; }
      await respond({ content: `${premium.imagesLine(status)}\nCards use 1 image; posters, lineups and banners use 2. Anyone in the server can top it up.`, components: premium.buyRows(interaction.guildId, interaction.user.id, status) });
      return true;
    }
    if (interaction.isButton() && action === 'gs_mycards') {
      const r = await cardsApi({ action: 'list', discord_user_id: interaction.user.id });
      if (r.error) { await respond({ content: `❌ ${r.error}` }); return true; }
      if (!r.cards?.length) { await respond({ content: '🗂️ No saved cards yet — every Player Card you make is saved here automatically.' }); return true; }
      await respond({ content: `🗂️ Your saved cards (${r.cards.length}). Pick one to view or delete:`, components: [pickRow('gs_mycard', 'Open a card', r.cards.map((c) => ({
        value: c.id, label: clip(`${c.name} · ${STYLES[c.style]?.label || c.style}`, 90), description: new Date(c.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }),
      })))] });
      return true;
    }
    if (interaction.isStringSelectMenu() && action === 'gs_mycard') {
      const r = await cardsApi({ action: 'get', discord_user_id: interaction.user.id, card_id: interaction.values[0] });
      if (r.error || !r.card?.front_url) { await update({ content: `❌ ${r.error || 'Card not found.'}`, components: [], embeds: [] }); return true; }
      const c = r.card;
      const embeds = [new EmbedBuilder().setTitle(`${c.name} · ${STYLES[c.style]?.label || c.style}`).setImage(c.front_url)];
      if (c.back_url) embeds.push(new EmbedBuilder().setTitle('Back').setImage(c.back_url));
      await update({ content: '', embeds, components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`gs_cdel:${c.id}`).setLabel('Delete Card').setEmoji('🗑️').setStyle(ButtonStyle.Danger),
      )] });
      return true;
    }
    if (interaction.isButton() && action === 'gs_cdel') {
      const r = await cardsApi({ action: 'delete', discord_user_id: interaction.user.id, card_id: a1 });
      await update({ content: r.error ? `❌ ${r.error}` : '🗑️ Card deleted from your collection.', embeds: [], components: [] });
      return true;
    }
    if (interaction.isStringSelectMenu() && action === 'gs_dkit') {
      const draft = DRAFTS.get(a1);
      if (!draft || draft.userId !== interaction.user.id || Date.now() - draft.ts > 30 * 60e3) {
        await update({ content: 'That form expired — start again from the panel.', components: [], embeds: [], attachments: [] }); return true;
      }
      const club = findClub(draft.clubKey);
      const key = interaction.values[0];
      draft.data.kitKey = kitsFor(club).some((k) => k.key === key) ? key : undefined;
      await update(await draftMessage(a1, draft.kind, club, interaction.guildId)); return true;
    }
    if (interaction.isStringSelectMenu() && action === 'gs_rlogo') {
      const draft = DRAFTS.get(a1);
      if (!draft || draft.userId !== interaction.user.id || Date.now() - draft.ts > 30 * 60e3) {
        await update({ content: 'That form expired — start again from the panel.', components: [], embeds: [], attachments: [] }); return true;
      }
      draft.data.logoKey = interaction.values[0] === 'auto' ? undefined : interaction.values[0];
      await update(await draftMessage(a1, 'recruit', findClub(draft.clubKey), interaction.guildId)); return true;
    }

    if (interaction.isButton() && action === 'gs_card') {
      await respond(await styleMessage('card', findClub(a1), interaction.guildId, '🎴 Pick a style for your card:', a1));
      return true;
    }
    if (interaction.isButton() && action === 'gs_poster') {
      await respond(await styleMessage('poster', findClub(a1), interaction.guildId, '📰 Pick a style for the full-time poster:', a1));
      return true;
    }
    if (interaction.isButton() && action === 'gs_lineup') {
      await respond(await styleMessage('lineup', findClub(a1), interaction.guildId, '📋 Pick a style for the lineup graphic:', a1));
      return true;
    }
    if (interaction.isButton() && action === 'gs_banner') {
      if (!(await manager())) { await respond({ content: '🏆 Banners are for managers — they mark real trophy wins.' }); return true; }
      await respond(await styleMessage('banner', findClub(a1), interaction.guildId, '🏆 Pick a banner style:', a1));
      return true;
    }
    if (interaction.isButton() && action === 'gs_kit') {
      if (!(await manager())) { await interaction.reply({ content: 'Only managers can change the club kit.', flags: 64 }); return true; }
      const kit = findClub(a1)?.kit || {};
      const modal = new ModalBuilder().setCustomId(`gs_kitform:${a1}`).setTitle('Club kit (used on every graphic)');
      modal.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('primary').setLabel('Main colour (e.g. pink or #f472b6)').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(30).setValue(kit.primary || '')),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('secondary').setLabel('Second colour (e.g. black)').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(30).setValue(kit.secondary || '')),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('description').setLabel('Kit details (collar, stripes, trim)').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(200).setValue(kit.description || '')),
      );
      await interaction.showModal(modal);
      return true;
    }
    if (interaction.isModalSubmit() && action === 'gs_kitform') {
      const club = findClub(a1);
      if (!club || !(await manager())) { await respond({ content: 'Only managers can change the club kit.', flags: 64 }); return true; }
      club.kit = {
        primary: interaction.fields.getTextInputValue('primary').trim(),
        secondary: interaction.fields.getTextInputValue('secondary').trim() || undefined,
        description: interaction.fields.getTextInputValue('description').trim() || undefined,
      };
      await saveGuildSettings(interaction.guildId, state);
      const saved = { content: `👕 Kit saved: **${club.kit.primary}${club.kit.secondary ? ` / ${club.kit.secondary}` : ''}**. Every new graphic uses it.` };
      let kitPreview = null;
      try { kitPreview = previewFile(G.render(pickSheet({ kits: [{ ...club.kit, label: 'Club kit', picked: true }] }))); } catch { kitPreview = null; }
      await respond(kitPreview ? { ...saved, embeds: [previewEmbed('👕 Kit preview', colorNum(club.kit.primary, 0x22c55e))], files: [kitPreview] } : saved);
      if (interaction.channel) refreshPanel(interaction.channel, club).catch(() => {});
      return true;
    }
    if (interaction.isStringSelectMenu() && action === 'gs_style') {
      const kind = a1, club = findClub(a2), style = interaction.values[0];
      if (!club) { await update({ embeds: [], attachments: [], content: 'No club set up here.', components: [] }); return true; }
      if (!stylesFor(kind).some(([key]) => key === style)) {
        await update({ embeds: [], attachments: [], content: 'Pick a style from the panel.', components: [] }); return true;
      }
      if (kind === 'recruit') {
        const token = saveDraft({ kind, clubKey: club.key, style, userId: interaction.user.id,
          data: { headline: 'JOIN OUR CLUB', positions: '', details: '', contact: '', featured: '' } });
        const brandPrefs = serverPrefs ? await serverPrefs(interaction.guildId).catch(() => ({})) : {};
        const logos = logosFor(club, brandPrefs?.branding);
        await update(logos.length ? { embeds: [], attachments: [], ...(await logoMenuMessage(token, club, logos)) } : await draftMessage(token, kind, club, interaction.guildId));
        return true;
      }
      if (kind === 'banner') {
        const modal = new ModalBuilder().setCustomId(`gs_bannerform:${club.key}:${style}`).setTitle('Championship banner');
        modal.addComponents(
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('headline').setLabel('Headline').setPlaceholder('BYOT SHOWDOWN CHAMPIONS').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(40)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('competition').setLabel('Competition').setPlaceholder('VPG Cup Final · Oct 2026').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(60)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('tag').setLabel('Corner tag (optional)').setPlaceholder('SEASON 1').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(14)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('roster').setLabel('Roster (comma sep. / "lineup" / blank=3 wks)').setPlaceholder('lineup = players from the latest tournament lineup').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(600)),
           new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('hero').setLabel('Lead player (Discord user ID, optional)').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(25)),
        );
        await interaction.showModal(modal);
        return true;
      }
      if (kind === 'card') {
        // Pre-fill an editable form with the member's real data
        const d = await cardData({ guildId: interaction.guildId, club, userId: interaction.user.id, displayName: interaction.member?.displayName || interaction.user.username });
        const token = saveDraft({ kind: 'card', clubKey: club.key, clubName: club.name, style, data: d, userId: interaction.user.id });
        await update(await draftMessage(token, 'card', club, interaction.guildId));
        return true;
      }
      if (kind === 'poster') {
        const opts = await matchOptions(interaction.guildId, club);
        if (!opts.length) { await update({ embeds: [], attachments: [], content: 'No synced matches yet for this club.', components: [] }); return true; }
        await update({ embeds: [], attachments: [], content: '📰 Which game? You can edit everything before it is drawn.', components: [pickRow(`gs_pmatch:${club.key}:${style}`, 'Pick a game', opts)] });
        return true;
      }
      if (kind === 'lineup') {
        const opts = await lineupOptions(interaction.guildId);
        if (!opts.length) { await update({ embeds: [], attachments: [], content: 'No saved lineups yet — build one from an event in /manager → Events.', components: [] }); return true; }
        await update({ embeds: [], attachments: [], content: '📋 Which lineup? You can edit the players before it is drawn.', components: [pickRow(`gs_lpick:${club.key}:${style}`, 'Pick a lineup', opts)] });
        return true;
      }
      return true;
    }
    if (interaction.isStringSelectMenu() && action === 'gs_pmatch') {
      const club = findClub(a1), style = STYLES[a2] ? a2 : 'esports';
      const d = await posterData({ guildId: interaction.guildId, club, matchId: interaction.values[0] });
      if (d.error) { await update({ content: `❌ ${d.error}`, components: [] }); return true; }
      const token = saveDraft({ kind: 'poster', clubKey: club.key, style, data: d, userId: interaction.user.id });
      await update(await draftMessage(token, 'poster', club, interaction.guildId));
      return true;
    }
    if (interaction.isStringSelectMenu() && action === 'gs_lpick') {
      const club = findClub(a1), style = STYLES[a2] ? a2 : 'esports';
      const d = await lineupData({ guild: interaction.guild, lineupId: interaction.values[0] });
      if (d.error) { await update({ content: `❌ ${d.error}`, components: [] }); return true; }
      const token = saveDraft({ kind: 'lineup', clubKey: club.key, style, data: d, userId: interaction.user.id });
      await update(await draftMessage(token, 'lineup', club, interaction.guildId));
      return true;
    }
    if (interaction.isModalSubmit() && ['gs_cform', 'gs_pform', 'gs_lform', 'gs_rform'].includes(action)) {
      const draft = DRAFTS.get(a1);
      if (!draft || draft.userId !== interaction.user.id || Date.now() - draft.ts > 30 * 60e3) { await respond({ content: 'That form expired — start again from the panel.' }); return true; }
      DRAFTS.delete(a1);
      const style = draft.style, club = withKit(findClub(draft.clubKey), style, draft.data?.kitKey);
      const f = (k) => { try { return interaction.fields.getTextInputValue(k).trim(); } catch { return ''; } };
      if (!club) { await respond({ content: 'No club set up here.' }); return true; }
      await respond({ content: `🎨 Drawing it in **${STYLES[style].label}**…` });
      let build, label;
      if (action === 'gs_cform') {
        const d = applyCardEdits(draft.data, f);
        build = () => renderCard({ guildId: interaction.guildId, club, style, d });
        label = `🎴 **${d.name}** · ${STYLES[style].label}`;
      } else if (action === 'gs_pform') {
        const d = applyPosterEdits(draft.data, f);
        build = () => renderPoster({ guildId: interaction.guildId, club, style, d });
        label = `📰 Full time vs ${d.opponent} · ${STYLES[style].label}`;
      } else if (action === 'gs_rform') {
        if (f('featured') && !/^\d{5,25}$/.test(f('featured'))) {
          await respond({ content: 'Use a Discord player ID for the featured player, or leave it blank.' }); return true;
        }
        const d = { ...draft.data, headline: f('headline').slice(0, 40) || draft.data.headline,
          positions: f('positions').slice(0, 60), details: f('details').slice(0, 150), contact: f('contact').slice(0, 100), featured: f('featured') };
        build = () => renderRecruit({ guildId: interaction.guildId, club, style, d });
        label = `📣 **${club.name}** recruiting · ${STYLES[style].label}`;
      } else {
        const d = await applyLineupEdits(draft.data, f);
        build = () => renderLineup({ guildId: interaction.guildId, club, style, d });
        label = `📋 **${d.title}** · ${STYLES[style].label}`;
      }
      const r = await deliver({ channel: interaction.channel, club, guild: interaction.guild, userId: interaction.user.id, label, build });
      await interaction.editReply(r.error ? await failure(r, interaction.guildId, interaction.user.id) : '✅ Posted!').catch(() => {});
      return true;
    }
    if (interaction.isModalSubmit() && action === 'gs_bannerform') {
      const style = STYLES[a2] ? a2 : 'esports', club = withKit(findClub(a1), style);
      if (!club || !(await manager())) { await respond({ content: 'Banners are for managers.' }); return true; }
      await respond({ content: '🏆 Drawing the banner…' });
      const f = (k) => interaction.fields.getTextInputValue(k).trim();
      const hero = /^\d{5,25}$/.test(f('hero')) ? f('hero') : undefined;
      const r = await deliver({
        channel: interaction.channel, club, guild: interaction.guild, userId: interaction.user.id, hallOfFame: true,
        label: `🏆 **${f('headline')}** — ${f('competition')}`,
        build: () => buildBanner({ guild: interaction.guild, guildId: interaction.guildId, club, style, headline: f('headline'), competition: f('competition'), seasonTag: f('tag'), rosterText: f('roster'), heroId: hero }),
      });
      await interaction.editReply(r.error ? await failure(r, interaction.guildId, interaction.user.id) : '✅ Banner posted here and in the Hall of Fame.').catch(() => {});
      return true;
    }
    return false;
  }

  // On startup, put the panel at the bottom of every configured studio channel
  async function init(client) {
    for (const guild of client.guilds.cache.values()) {
      const state = await getGuildState(guild.id).catch(() => null);
      for (const club of activeClubs(state)) {
        if (!club.graphics_channel_id) continue;
        const channel = await guild.channels.fetch(club.graphics_channel_id).catch(() => null);
        if (channel?.isTextBased?.()) await refreshPanel(channel, club).catch(() => {});
      }
    }
  }

  // /graphics slash command: post the studio panel in whatever channel it was called from
  async function panelFor(guildId) {
    const state = await getGuildState(guildId).catch(() => null);
    const clubs = activeClubs(state);
    if (!clubs.length) return null;
    return panelMessage(clubs[0]);
  }

  async function safeHandleInteraction(interaction) {
    try { return await handleInteraction(interaction); }
    catch (err) {
      if (!interaction.customId?.startsWith('gs_')) throw err;
      console.warn('[studio] interaction failed:', err.message);
      const payload = { content: '❌ The studio could not complete that step. Start again from /graphics.', components: [], embeds: [], attachments: [] };
      if (interaction.deferred || interaction.replied) await interaction.editReply(payload).catch(() => {});
      else await interaction.reply({ ...payload, flags: 64 }).catch(() => {});
      return true;
    }
  }
  return { onMessage, handleInteraction: safeHandleInteraction, init, panelFor, refreshPanel };
}

module.exports = { createGraphicsStudio, STYLES, playerCard, matchPoster, banner, lineupPoster, recruitmentPoster, palette };
