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
const G = require('./graphics.cjs');
const { activeClubs } = require('./manager-hub.cjs');
const { toInsightMatches } = require('./club-insights.cjs');
const { nextVariation } = require('./graphics-variants.cjs');
const { render1986Card } = require('./graphics-1986.cjs');
const { render1960sCard } = require('./graphics-1960s.cjs');
const { render1970sCard } = require('./graphics-1970s.cjs');
const { render1990sCard } = require('./graphics-1990s.cjs');
const { renderY2kCard } = require('./graphics-y2k.cjs');
const { render2010sCard } = require('./graphics-2010s.cjs');
const { render2020sCard } = require('./graphics-2020s.cjs');
const { finishCardSvg } = require('./card-layout.cjs');
const { cardStats } = require('./card-stats.cjs');

const NAME_RE = /graphic|media-?studio|studio/i;
const STYLES = {
  esports: { label: 'Ultra Esports', emoji: '⚡', desc: 'Neon, smoke, grunge — matchday hype' },
  modern: { label: 'Modern Broadcast', emoji: '✨', desc: 'Clean TV-graphic look' },
  vintage: { label: 'Vintage Heritage', emoji: '📜', desc: '90s trading card, film grain' },
  retro1986: { label: '1986 Club Classic', emoji: '⚾', desc: 'Bold club masthead, white frame, position badge', cardOnly: true },
  retro1960s: { label: '1960s Club Heritage', emoji: '🎞️', desc: 'Oval portraits, pennants, colourful print borders', cardOnly: true },
  retro1970s: { label: '1970s Club Archive', emoji: '🌟', desc: 'Arched club lettering, double borders, ribbon frames', cardOnly: true },
  retro1990s: { label: '1990s Club Collection', emoji: '💿', desc: 'Colour-pop borders, clean action frames, vertical club type', cardOnly: true },
  y2k: { label: 'Y2K Club Chrome', emoji: '💎', desc: 'Refractor foil, circular club type, metallic nameplates', cardOnly: true },
  retro2010s: { label: '2010s Club Signature', emoji: '🌊', desc: 'Chrome outlines, sweeping ribbons, textured foil frames', cardOnly: true },
  retro2020s: { label: '2020s Club Prism', emoji: '🔮', desc: 'Angular prism, mosaic foil, sculpted chrome emblems', cardOnly: true },
  obsidian: { label: 'Obsidian & Gold', emoji: '🛡️', desc: 'Black and gold, elite' },
};
const HEAD = 'Oswald';
const BODY = 'Inter';
const COLOR_WORDS = {
  pink: 0xf472b6, black: 0x111111, white: 0xffffff, red: 0xdc2626, blue: 0x2563eb, navy: 0x1e3a8a, green: 0x16a34a,
  yellow: 0xfacc15, gold: 0xd4af37, orange: 0xf97316, purple: 0x7c3aed, sky: 0x38bdf8, maroon: 0x7f1d1d, grey: 0x9ca3af, gray: 0x9ca3af,
};
const BUSY = new Set();
const DRAFTS = new Map(); // token -> pending graphic waiting on its edit form

function colorNum(v, fallback) {
  const s = String(v || '').trim().toLowerCase();
  if (/^#?[0-9a-f]{6}$/.test(s)) return parseInt(s.replace('#', ''), 16);
  return COLOR_WORDS[s] ?? fallback;
}
const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;
const esc = G.esc;
const clip = (s, n) => (String(s || '').length > n ? `${String(s).slice(0, n - 1)}…` : String(s || ''));
const fit = (text, w, max, ratio = 0.5, min = 14) => Math.max(min, Math.min(max, Math.floor(w / (Math.max(String(text || '').length, 1) * ratio))));
const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

function palette(style, kit) {
  const primary = colorNum(kit?.primary, 0x22c55e);
  const base = {
    esports: { ink: '#ffffff', accent: hex(primary), sub: '#e5e7eb', panel: '#000000', panelOpacity: 0.55, skew: -8 },
    modern: { ink: '#ffffff', accent: hex(primary), sub: '#cbd5e1', panel: '#0b1220', panelOpacity: 0.72, skew: 0 },
    vintage: { ink: '#f5e9cf', accent: '#c8553d', sub: '#e8d9b5', panel: '#2a1d12', panelOpacity: 0.7, skew: 0, frame: '#efe3c8' },
    retro1986: { accent: hex(primary) },
    retro1960s: { accent: hex(primary) },
    retro1970s: { accent: hex(primary) },
    retro1990s: { accent: hex(primary) },
    y2k: { accent: hex(primary) },
    retro2010s: { accent: hex(primary) },
    retro2020s: { accent: hex(primary) },
    obsidian: { ink: '#f6e7b0', accent: '#d4af37', sub: '#d6d3d1', panel: '#000000', panelOpacity: 0.7, skew: 0, frame: '#d4af37' },
  }[style] || {};
  return base;
}

function svgOpen(W, H, art) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1"><stop offset="0.45" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.92"/></linearGradient>
    <linearGradient id="top" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0.6"/><stop offset="0.18" stop-color="#000" stop-opacity="0"/></linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="#050505"/>
  ${art ? `<image href="${art}" width="${W}" height="${H}" preserveAspectRatio="xMidYMid slice"/>` : ''}
  <rect width="${W}" height="${H}" fill="url(#fade)"/><rect width="${W}" height="${H}" fill="url(#top)"/>`;
}

function frame(W, H, p) {
  if (!p.frame) return '';
  return `<rect x="18" y="18" width="${W - 36}" height="${H - 36}" fill="none" stroke="${p.frame}" stroke-width="10"/>
    <rect x="36" y="36" width="${W - 72}" height="${H - 72}" fill="none" stroke="${p.frame}" stroke-width="2" stroke-opacity="0.7"/>`;
}

function crestSvg(x, y, r, img) {
  if (!img) return '';
  return `<clipPath id="cr${x}"><circle cx="${x}" cy="${y}" r="${r}"/></clipPath>
    <image href="${img}" x="${x - r}" y="${y - r}" width="${r * 2}" height="${r * 2}" clip-path="url(#cr${x})" preserveAspectRatio="xMidYMid slice"/>`;
}

function headline(text, x, y, size, p, anchor = 'start') {
  const t = esc(String(text).toUpperCase());
  return `<g transform="translate(${x} ${y}) skewX(${p.skew || 0})">
    <text text-anchor="${anchor}" font-family="${HEAD}" font-weight="700" font-size="${size}" fill="#000" fill-opacity="0.55" transform="translate(5 6)">${t}</text>
    <text text-anchor="${anchor}" font-family="${HEAD}" font-weight="700" font-size="${size}" fill="${p.ink}">${t}</text></g>`;
}

// ---------- Compositions ----------

function playerCard(d) {
  const print = { retro1986: render1986Card, retro1960s: render1960sCard, retro1970s: render1970sCard, retro1990s: render1990sCard, y2k: renderY2kCard, retro2010s: render2010sCard, retro2020s: render2020sCard }[d.style];
  if (print) return print(d, { ...G, render: (svg) => G.render(finishCardSvg(svg, d)) }, palette(d.style, d.kit).accent);
  const W = 1024, H = 1536, p = palette(d.style, d.kit);
  const stats = (d.stats || []).slice(0, 6);
  const editorial = stats.length > 0 && d.composition === 'editorial';
  const side = stats.length > 0 && d.composition === 'side-panel';
  const x = side ? 80 : 60;
  const nameY = editorial ? 345 : side ? 1110 : stats.length ? 1200 : d.tagline ? 1360 : 1410;
  const nameWidth = side ? 620 : 900;
  const cell = (W - 120) / Math.max(stats.length, 1);
  return G.render(finishCardSvg(`${svgOpen(W, H, d.art)}${frame(W, H, p)}
    ${crestSvg(110, 120, 52, d.crest)}
    <text x="${d.crest ? 180 : 70}" y="112" font-family="${HEAD}" font-weight="700" font-size="34" fill="${p.ink}">${esc(clip(d.clubName, 26).toUpperCase())}</text>
    <text x="${d.crest ? 180 : 70}" y="148" font-family="${BODY}" font-size="20" fill="${p.sub}">${esc(d.seasonLabel || 'PRO CLUBS')}</text>
    ${d.position ? `<rect x="${W - 190}" y="72" width="120" height="70" fill="${p.accent}"/><text x="${W - 130}" y="122" text-anchor="middle" font-family="${HEAD}" font-weight="700" font-size="40" fill="#000">${esc(d.position)}</text>` : ''}
    ${d.overall ? `<text x="${W - 130}" y="215" text-anchor="middle" font-family="${HEAD}" font-weight="700" font-size="76" fill="${p.ink}">${d.overall}</text><text x="${W - 130}" y="245" text-anchor="middle" font-family="${BODY}" font-size="16" fill="${p.sub}">${esc(d.overallLabel)}</text>` : ''}
    ${side ? `<rect x="60" y="950" width="700" height="${stats.length ? 490 : 480}" fill="${p.panel}" fill-opacity="${p.panelOpacity}"/><rect x="60" y="950" width="8" height="480" fill="${p.accent}"/>` : ''}
    <rect x="${x}" y="${nameY - 110}" width="140" height="${d.style === 'modern' ? 3 : 8}" fill="${p.accent}"/>
    ${headline(clip(d.name, 30), x, nameY, fit(d.name, nameWidth, editorial ? 100 : 130, 0.48, 32), p)}
    ${d.tagline ? `<text x="${x + 4}" y="${nameY + 50}" font-family="${BODY}" font-weight="700" font-size="${fit(d.tagline, nameWidth, 24, 0.58, 16)}" fill="${p.accent}">${esc(clip(d.tagline, 60).toUpperCase())}</text>` : ''}
    ${stats.length ? `<rect x="60" y="1290" width="${W - 120}" height="150" fill="${p.panel}" fill-opacity="${p.panelOpacity}"/>
      ${stats.map(([label, value], i) => `<text x="${60 + cell * i + cell / 2}" y="1375" text-anchor="middle" font-family="${HEAD}" font-weight="700" font-size="56" fill="${p.ink}">${esc(value)}</text>
       <text x="${60 + cell * i + cell / 2}" y="1415" text-anchor="middle" font-family="${BODY}" font-weight="700" font-size="${fit(label, cell - 12, 18, 0.58, 10)}" fill="${p.sub}">${esc(label)}</text>`).join('')}` : ''}
    <text x="${W / 2}" y="1490" text-anchor="middle" font-family="${BODY}" font-size="14" fill="${p.sub}" fill-opacity="0.8">${stats.length ? 'EA MATCH DATA · ' : ''}AI ART FROM THEIR IN-GAME PRO · SPOTBOT STUDIO</text>
  </svg>`, d));
}

const RESULT_WORD = { win: 'VICTORY', draw: 'SHARE THE SPOILS', loss: 'DEFEAT' };
function matchPoster(d) {
  const W = 1024, H = 1536, p = palette(d.style, d.kit);
  const word = d.headline || RESULT_WORD[d.result] || 'FULL TIME';
  return G.render(`${svgOpen(W, H, d.art)}${frame(W, H, p)}
    <text x="70" y="110" font-family="${HEAD}" font-weight="700" font-size="30" fill="${p.ink}">${esc(clip(d.clubName, 30).toUpperCase())}</text>
    <text x="70" y="145" font-family="${BODY}" font-size="20" fill="${p.sub}">${esc(clip(`${d.competition || 'Pro Clubs'} · ${d.dateText}`, 60))}</text>
    ${headline('FULL TIME', 60, 960, 150, p)}
    <text x="66" y="1010" font-family="${HEAD}" font-weight="700" font-size="36" fill="${p.accent}">${esc(word)}</text>
    <rect x="60" y="1040" width="${W - 120}" height="190" fill="${p.panel}" fill-opacity="${p.panelOpacity}"/>
    ${crestSvg(150, 1135, 62, d.crestFor)}
    ${crestSvg(W - 150, 1135, 62, d.crestAgainst)}
    <text x="${W / 2}" y="1170" text-anchor="middle" font-family="${HEAD}" font-weight="700" font-size="120" fill="${p.ink}">${n(d.scoreFor)} – ${n(d.scoreAgainst)}</text>
    <text x="${W / 2}" y="1215" text-anchor="middle" font-family="${BODY}" font-size="22" fill="${p.sub}">vs ${esc(clip(d.opponent, 34))}</text>
    ${d.scorers ? `<text x="70" y="1290" font-family="${BODY}" font-weight="700" font-size="${fit(d.scorers, 880, 26, 0.55, 16)}" fill="${p.ink}">⚽ ${esc(clip(d.scorers, 80))}</text>`.replace('⚽ ', 'GOALS  ') : ''}
    ${d.motm ? `<rect x="60" y="1320" width="${W - 120}" height="110" fill="${p.accent}"/>
      <text x="90" y="1365" font-family="${BODY}" font-weight="700" font-size="20" fill="#000">PLAYER OF THE MATCH</text>
      <text x="90" y="1412" font-family="${HEAD}" font-weight="700" font-size="44" fill="#000">${esc(clip(d.motm.name, 22).toUpperCase())}</text>
      <text x="${W - 90}" y="1412" text-anchor="end" font-family="${HEAD}" font-weight="700" font-size="60" fill="#000">${d.motm.rating ? Number(d.motm.rating).toFixed(1) : ''}</text>` : ''}
    <text x="${W / 2}" y="1490" text-anchor="middle" font-family="${BODY}" font-size="14" fill="${p.sub}" fill-opacity="0.8">EA MATCH DATA · AI ART · SPOTBOT STUDIO</text>
  </svg>`);
}

function banner(d) {
  const W = 1536, H = 1024, p = palette(d.style, d.kit);
  const roster = d.roster.slice(0, 24);
  const perRow = Math.min(8, Math.max(roster.length, 1));
  const colW = (W - 160) / perRow;
  return G.render(`${svgOpen(W, H, d.art)}${frame(W, H, p)}
    ${crestSvg(130, 130, 70, d.crest)}
    <text x="${d.crest ? 225 : 80}" y="120" font-family="${HEAD}" font-weight="700" font-size="40" fill="${p.ink}">${esc(clip(d.clubName, 30).toUpperCase())}</text>
    <text x="${d.crest ? 225 : 80}" y="160" font-family="${BODY}" font-size="22" fill="${p.sub}">${esc(clip(d.competition, 50))}</text>
    ${d.seasonTag ? `<rect x="${W - 300}" y="80" width="220" height="64" fill="${p.accent}"/><text x="${W - 190}" y="124" text-anchor="middle" font-family="${HEAD}" font-weight="700" font-size="32" fill="#000">${esc(clip(d.seasonTag, 14).toUpperCase())}</text>` : ''}
    ${headline(clip(d.headline, 28), W / 2, 790, fit(d.headline, 1350, 120, 0.46, 54), p, 'middle')}
    <rect x="80" y="830" width="${W - 160}" height="4" fill="${p.accent}"/>
    ${roster.map((name, i) => {
      const row = Math.floor(i / perRow), col = i % perRow;
      return `<text x="${80 + colW * col + colW / 2}" y="${880 + row * 38}" text-anchor="middle" font-family="${BODY}" font-weight="700" font-size="${fit(name, colW - 10, 22, 0.58, 12)}" fill="${p.ink}">${esc(clip(name, 18))}</text>`;
    }).join('')}
  </svg>`);
}

function lineupPoster(d) {
  const W = 1024, H = 1536, p = palette(d.style, d.kit);
  const xi = (d.starters || []).slice(0, 11);
  const half = Math.ceil(xi.length / 2);
  const row = (s, x, y) => `<text x="${x}" y="${y}" font-family="${HEAD}" font-weight="700" font-size="26" fill="${p.accent}">${esc(clip(s.pos, 4))}</text>
    <text x="${x + 78}" y="${y}" font-family="${BODY}" font-weight="700" font-size="${fit(s.name, 330, 28, 0.58, 16)}" fill="${p.ink}">${esc(clip(s.name, 22))}</text>`;
  return G.render(`${svgOpen(W, H, d.art)}${frame(W, H, p)}
    ${crestSvg(130, 130, 60, d.crest)}
    <text x="${d.crest ? 210 : 70}" y="120" font-family="${HEAD}" font-weight="700" font-size="30" fill="${p.ink}">${esc(clip(d.clubName, 30).toUpperCase())}</text>
    <text x="${d.crest ? 210 : 70}" y="155" font-family="${BODY}" font-size="20" fill="${p.sub}">${esc(clip(d.subtitle, 60))}</text>
    ${headline('STARTING XI', 60, 860, 120, p)}
    <text x="66" y="910" font-family="${HEAD}" font-weight="700" font-size="${fit(d.title, 880, 40, 0.5, 22)}" fill="${p.accent}">${esc(clip(d.title, 40).toUpperCase())}</text>
    <rect x="60" y="940" width="${W - 120}" height="${70 + half * 52}" fill="${p.panel}" fill-opacity="${p.panelOpacity}"/>
    ${xi.slice(0, half).map((s, i) => row(s, 90, 995 + i * 52)).join('')}
    ${xi.slice(half).map((s, i) => row(s, 540, 995 + i * 52)).join('')}
    ${d.subs?.length ? `<text x="70" y="${1060 + half * 52}" font-family="${BODY}" font-weight="700" font-size="${fit(d.subs.join(', '), 800, 22, 0.55, 14)}" fill="${p.sub}">SUBS  ${esc(clip(d.subs.join(' · '), 90))}</text>` : ''}
    <text x="${W / 2}" y="1490" text-anchor="middle" font-family="${BODY}" font-size="14" fill="${p.sub}" fill-opacity="0.8">CLUB LINEUP · AI ART · SPOTBOT STUDIO</text>
  </svg>`);
}

// ---------- Studio ----------

function createGraphicsStudio({ supabase, supabaseUrl, secret, getGuildState, saveGuildSettings, isManager, serverPrefs }) {
  const panelIds = new Map(); // channelId -> panel message id

  async function art(body) {
    if (!secret) return { error: 'The studio needs BOT_PROXY_SECRET set on the bot.' };
    const res = await fetch(`${supabaseUrl.replace(/\/$/, '')}/functions/v1/club-art`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-bot-secret': secret },
      body: JSON.stringify(body),
    }).catch(() => null);
    const out = res ? await res.json().catch(() => ({})) : {};
    if (!res?.ok || !out.image_b64) return { error: typeof out.error === 'string' ? out.error : typeof out.message === 'string' ? out.message : 'The art studio is unavailable right now.' };
    return { image: `data:image/png;base64,${out.image_b64}`, usedPro: out.used_pro_photo };
  }

  async function studioClub(guildId, channelId, channelName) {
    const state = await getGuildState(guildId).catch(() => null);
    const clubs = activeClubs(state);
    const exact = clubs.find((c) => c.graphics_channel_id === channelId);
    if (exact) return { state, club: exact };
    if (NAME_RE.test(channelName || '') && clubs.length) return { state, club: clubs[0] };
    return { state, club: null };
  }

  async function crestFor(guildId) {
    const prefs = serverPrefs ? await serverPrefs(guildId).catch(() => ({})) : {};
    return G.fetchImage(prefs?.branding?.logo_url);
  }

  function panelMessage(club) {
    const kit = club.kit || {};
    return {
      embeds: [new EmbedBuilder()
        .setColor(colorNum(kit.primary, 0x22c55e))
        .setTitle(`🎨 ${club.name} Graphics Studio`)
        .setDescription([
          'Ask for graphics any time — everyone appears in **our kit**, drawn from their in-game pro.',
          '',
          '🎴 **Player Card** — portrait only or with club stats',
          '📰 **Match Poster** — pick any recent game',
          '📋 **Lineup** — starting XI from a lineup built for an event or tournament',
          '_You can edit names, scores and players before anything is drawn._',
          '🏆 **Banner** — managers only, for BYOT, league, cup and playoff wins',
          '',
          `Styles: ${Object.values(STYLES).map((s) => `${s.emoji} ${s.label}`).join(' · ')}`,
          `Kit: **${kit.primary || 'not set'}${kit.secondary ? ` / ${kit.secondary}` : ''}** · No pro photo yet? Post one in #pro-photos first.`,
          '_Or just type “card”, “card vintage” or “poster” here._',
        ].join('\n'))
        .setFooter({ text: '📌 This panel stays at the bottom · artwork is AI, stats are real EA data' })],
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`gs_card:${club.key}`).setLabel('Player Card').setEmoji('🎴').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`gs_poster:${club.key}`).setLabel('Match Poster').setEmoji('📰').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`gs_lineup:${club.key}`).setLabel('Lineup').setEmoji('📋').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`gs_banner:${club.key}`).setLabel('Banner').setEmoji('🏆').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`gs_kit:${club.key}`).setLabel('Club Kit').setEmoji('👕').setStyle(ButtonStyle.Secondary),
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
      .addOptions(Object.entries(STYLES).filter(([, s]) => !s.cardOnly || kind === 'card').map(([value, s]) => ({ label: s.label, value, emoji: s.emoji, description: s.desc }))));
  }

  // ----- builders (return { file, note } or { error }) -----

  // Each graphic = data step (pulled from saved games / lineups) -> optional manual edit form -> render step.

  function saveDraft(draft) {
    const token = Math.random().toString(36).slice(2, 10);
    DRAFTS.set(token, { ...draft, ts: Date.now() });
    for (const [k, v] of DRAFTS) if (Date.now() - v.ts > 30 * 60e3) DRAFTS.delete(k);
    return token;
  }
  function draftPrompt(token, kind) {
    const choices = kind === 'card'
      ? [['stats', 'With Stats'], ['portrait', 'Portrait Only']]
      : [['edit', 'Edit Before Rendering']];
    return { content: kind === 'card' ? '🎴 With stats or just your pro?' : 'Your details are ready.', components: [new ActionRowBuilder().addComponents(
      choices.map(([mode, label]) => new ButtonBuilder().setCustomId(`gs_edit:${token}:${mode}`).setLabel(label).setStyle(ButtonStyle.Primary))
    )] };
  }
  const input = (id, label, value, { para = false, max = 100, req = false } = {}) => new ActionRowBuilder().addComponents(
    new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(para ? TextInputStyle.Paragraph : TextInputStyle.Short)
      .setRequired(req).setMaxLength(max).setValue(String(value ?? '').slice(0, max)));
  const pickRow = (customId, placeholder, opts) => new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder().setCustomId(customId).setPlaceholder(placeholder).addOptions(opts.slice(0, 25)));

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
    const [{ data: statsRows }, { data: profile }, { data: photo }] = await Promise.all([
      supabase.from('player_club_stats').select('*').eq('guild_id', guildId).eq('discord_user_id', userId),
      supabase.from('profiles').select('ea_username').eq('discord_user_id', userId).maybeSingle(),
      supabase.from('pro_photos').select('position, overall').eq('discord_user_id', userId).maybeSingle(),
    ]);
    const data = cardStats((statsRows || []).map((s) => ({ ...s, primary_position: photo?.position || s.primary_position })), club);
    return {
      ...data, userId, name: profile?.ea_username || displayName, position: photo?.position || data.position,
      overall: photo?.overall || '',
    };
  }
  const cardModal = (token, d) => new ModalBuilder().setCustomId(`gs_cform:${token}`).setTitle('Check your card before it is drawn').addComponents(
    input('name', 'Name on card', d.name, { max: 30, req: true }),
    input('position', 'Position', d.position, { max: 10 }),
    input('overall', 'Overall (optional)', d.overall, { max: 3 }),
    input('stats', 'Stats (optional; blank = no stats)', d.stats.map(([l, v]) => `${l} ${v}`).join('\n'), { para: true, max: 200 }),
    input('tagline', 'Tagline', d.tagline, { max: 60 }),
  );
  function applyCardEdits(d, f) {
    const stats = f('stats').split('\n').map((line) => line.trim()).filter(Boolean).slice(0, 6).map((line) => {
      const m = line.match(/^(.*\S)\s+(\S+)$/);
      return m ? [m[1].toUpperCase(), m[2]] : [line.toUpperCase(), ''];
    });
    const changed = JSON.stringify(stats.map(([l, v]) => [l, String(v)])) !== JSON.stringify(d.stats.map(([l, v]) => [l, String(v)])) || f('tagline') !== d.tagline || f('overall') !== String(d.overall || '');
    const overall = /^\d{1,2}$/.test(f('overall')) && Number(f('overall')) > 0 ? f('overall') : '';
    return { ...d, name: f('name') || d.name, position: f('position'), overall, stats, tagline: f('tagline'), dataLabel: changed ? 'MEMBER-EDITED' : d.seasonLabel, overallLabel: changed ? 'MEMBER OVR' : 'EA OVR', seasonLabel: stats.length ? changed ? 'MEMBER-EDITED' : d.seasonLabel : 'VIRTUAL PRO' };
  }
  async function renderCard({ guildId, club, style, d }) {
    const variation = nextVariation(`${guildId}:${d.userId}:card:${style}`);
    // Print-card lettering and frames are local; artwork reuses the text-free vintage style.
    const printCard = Boolean(STYLES[style]?.cardOnly);
    const a = await art({ kind: 'card', style: printCard ? 'vintage' : style, club_name: club.name, kit: club.kit || {}, discord_user_id: d.userId, position: d.position || undefined, ...variation, has_stats: d.stats.length > 0, has_tagline: Boolean(d.tagline), ...(printCard || !d.stats.length ? { composition: 'lower-third' } : {}) });
    if (a.error) return a;
    const png = playerCard({
      art: a.image, style, kit: club.kit, clubName: club.name, crest: await crestFor(guildId), name: d.name, position: d.position || null,
      overall: d.overall || null, overallLabel: d.overallLabel || 'EA OVR', stats: d.stats, seasonLabel: d.seasonLabel, dataLabel: d.dataLabel, tagline: d.tagline, composition: variation.composition,
    });
    return { file: new AttachmentBuilder(png, { name: `card-${d.name}.png`.replace(/[^\w.-]/g, '_') }), note: a.usedPro ? null : 'No pro photo on file, so this uses a silhouette — post your pro in #pro-photos for the real thing.' };
  }
  async function buildCard({ guildId, club, userId, displayName, style, noStats = false }) {
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
      competition: /playoff/i.test(match.matchType || '') ? 'Playoff' : /friendly/i.test(match.matchType || '') ? 'Friendly' : 'League',
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
    const motmId = await idForName(d.motm?.name);
    const mood = d.result === 'win' ? 'win' : d.result === 'loss' ? 'loss' : 'draw';
    const a = await art({ kind: 'poster', style, club_name: club.name, kit: club.kit || {}, discord_user_id: motmId, mood, competition: clip(d.competition, 60), ...nextVariation(`${guildId}:poster:${style}`) });
    if (a.error) return a;
    const png = matchPoster({ art: a.image, style, kit: club.kit, clubName: club.name, crestFor: await crestFor(guildId), crestAgainst: null, ...d });
    return { file: new AttachmentBuilder(png, { name: 'full-time.png' }) };
  }
  async function buildPoster({ guildId, club, style }) {
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
    input('featured', 'Featured player for the artwork (name)', d.featured, { max: 40 }),
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
    const a = await art({ kind: 'poster', style, club_name: club.name, kit: club.kit || {}, discord_user_id: d.heroId, mood: 'neutral', competition: clip(d.subtitle, 60), ...nextVariation(`${guildId}:lineup:${style}`) });
    if (a.error) return a;
    const png = lineupPoster({ art: a.image, style, kit: club.kit, clubName: club.name, crest: await crestFor(guildId), ...d });
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
    const a = await art({ kind: 'banner', style, club_name: club.name, kit: club.kit || {}, competition, discord_user_id: heroId, ...nextVariation(`${guildId}:banner:${style}`) });
    if (a.error) return a;
    const png = banner({ art: a.image, style, kit: club.kit, clubName: club.name, crest: await crestFor(guildId), headline: title, competition, seasonTag, roster });
    return { file: new AttachmentBuilder(png, { name: 'champions-banner.png' }) };
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
      await channel.send({ content, files: [r.file], allowedMentions: { parse: [] } });
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
    const style = /\bcard\b/.test(text) && /2020|20['’]?s|twenties|prism|mosaic/i.test(text) ? 'retro2020s' : /\bcard\b/.test(text) && /2010|10['’]?s|twenty[ -]?tens/i.test(text) ? 'retro2010s' : /\bcard\b/.test(text) && /y2k|2000|chrome|refractor/i.test(text) ? 'y2k' : /\bcard\b/.test(text) && /1990|90['’]?s|nineties/i.test(text) ? 'retro1990s' : /\bcard\b/.test(text) && /1970|70['’]?s|seventies/i.test(text) ? 'retro1970s' : /\bcard\b/.test(text) && /1960|60['’]?s|sixties/i.test(text) ? 'retro1960s' : /\bcard\b/.test(text) && /1986|topps|retro1986/i.test(text) ? 'retro1986' : Object.keys(STYLES).filter((s) => !STYLES[s].cardOnly).find((s) => text.includes(s)) || (text.includes('gold') ? 'obsidian' : text.includes('retro') ? 'vintage' : text.includes('clean') ? 'modern' : 'esports');
    let build, label;
    if (/\bcard\b/.test(text)) {
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
    if (r.error) await message.reply(`❌ ${r.error}`).catch(() => {});
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
      await interaction.showModal(draft.kind === 'card' ? cardModal(a1, draft.data) : draft.kind === 'poster' ? posterModal(a1, d) : lineupModal(a1, d));
      return true;
    }
    const deferredSelect = interaction.isStringSelectMenu() && action !== 'gs_style' || interaction.isStringSelectMenu() && a1 !== 'banner';
    const deferredReply = interaction.isModalSubmit() || interaction.isButton() && ['gs_card', 'gs_poster', 'gs_lineup'].includes(action);
    if (deferredSelect) await interaction.deferUpdate();
    else if (deferredReply) await interaction.deferReply({ flags: 64 });
    const respond = (payload) => deferredReply ? interaction.editReply(payload) : interaction.reply(payload);
    const update = (payload) => deferredSelect ? interaction.editReply(payload) : interaction.update(payload);
    const state = await getGuildState(interaction.guildId).catch(() => null);
    const findClub = (key) => activeClubs(state).find((c) => c.key === key) || activeClubs(state)[0];
    const manager = async () => isManager(interaction.member, interaction.guildId);

    if (interaction.isButton() && action === 'gs_card') {
      await respond({ content: '🎴 Pick a style for your card:', components: [styleRow('card', a1)] });
      return true;
    }
    if (interaction.isButton() && action === 'gs_poster') {
      await respond({ content: '📰 Pick a style for the full-time poster:', components: [styleRow('poster', a1)] });
      return true;
    }
    if (interaction.isButton() && action === 'gs_lineup') {
      await respond({ content: '📋 Pick a style for the lineup graphic:', components: [styleRow('lineup', a1)] });
      return true;
    }
    if (interaction.isButton() && action === 'gs_banner') {
      if (!(await manager())) { await interaction.reply({ content: '🏆 Banners are for managers — they mark real trophy wins.', flags: 64 }); return true; }
      await interaction.reply({ content: '🏆 Pick a banner style:', components: [styleRow('banner', a1)], flags: 64 });
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
      await respond({ content: `👕 Kit saved: **${club.kit.primary}${club.kit.secondary ? ` / ${club.kit.secondary}` : ''}**. Every new graphic uses it.` });
      if (interaction.channel) refreshPanel(interaction.channel, club).catch(() => {});
      return true;
    }
    if (interaction.isStringSelectMenu() && action === 'gs_style') {
      const kind = a1, club = findClub(a2), style = interaction.values[0];
      if (!club) { await update({ content: 'No club set up here.', components: [] }); return true; }
      if (kind === 'banner') {
        const modal = new ModalBuilder().setCustomId(`gs_bannerform:${club.key}:${style}`).setTitle('Championship banner');
        modal.addComponents(
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('headline').setLabel('Headline').setPlaceholder('BYOT SHOWDOWN CHAMPIONS').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(40)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('competition').setLabel('Competition').setPlaceholder('VPG Cup Final · Oct 2026').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(60)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('tag').setLabel('Corner tag (optional)').setPlaceholder('SEASON 1').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(14)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('roster').setLabel('Roster (comma sep. / "lineup" / blank=3 wks)').setPlaceholder('lineup = players from the latest tournament lineup').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(600)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('hero').setLabel('Featured player (Discord user ID, optional)').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(25)),
        );
        await interaction.showModal(modal);
        return true;
      }
      if (kind === 'card') {
        // Pre-fill an editable form with the member's real data
        const d = await cardData({ guildId: interaction.guildId, club, userId: interaction.user.id, displayName: interaction.member?.displayName || interaction.user.username });
        const token = saveDraft({ kind: 'card', clubKey: club.key, clubName: club.name, style, data: d, userId: interaction.user.id });
        await update(draftPrompt(token, 'card'));
        return true;
      }
      if (kind === 'poster') {
        const opts = await matchOptions(interaction.guildId, club);
        if (!opts.length) { await update({ content: 'No synced matches yet for this club.', components: [] }); return true; }
        await update({ content: '📰 Which game? You can edit everything before it is drawn.', components: [pickRow(`gs_pmatch:${club.key}:${style}`, 'Pick a game', opts)] });
        return true;
      }
      if (kind === 'lineup') {
        const opts = await lineupOptions(interaction.guildId);
        if (!opts.length) { await update({ content: 'No saved lineups yet — build one from an event in /manager → Events.', components: [] }); return true; }
        await update({ content: '📋 Which lineup? You can edit the players before it is drawn.', components: [pickRow(`gs_lpick:${club.key}:${style}`, 'Pick a lineup', opts)] });
        return true;
      }
      return true;
    }
    if (interaction.isStringSelectMenu() && action === 'gs_pmatch') {
      const club = findClub(a1), style = STYLES[a2] ? a2 : 'esports';
      const d = await posterData({ guildId: interaction.guildId, club, matchId: interaction.values[0] });
      if (d.error) { await update({ content: `❌ ${d.error}`, components: [] }); return true; }
      const token = saveDraft({ kind: 'poster', clubKey: club.key, style, data: d, userId: interaction.user.id });
      await update(draftPrompt(token, 'poster'));
      return true;
    }
    if (interaction.isStringSelectMenu() && action === 'gs_lpick') {
      const club = findClub(a1), style = STYLES[a2] ? a2 : 'esports';
      const d = await lineupData({ guild: interaction.guild, lineupId: interaction.values[0] });
      if (d.error) { await update({ content: `❌ ${d.error}`, components: [] }); return true; }
      const token = saveDraft({ kind: 'lineup', clubKey: club.key, style, data: d, userId: interaction.user.id });
      await update(draftPrompt(token, 'lineup'));
      return true;
    }
    if (interaction.isModalSubmit() && ['gs_cform', 'gs_pform', 'gs_lform'].includes(action)) {
      const draft = DRAFTS.get(a1);
      if (!draft || draft.userId !== interaction.user.id || Date.now() - draft.ts > 30 * 60e3) { await respond({ content: 'That form expired — start again from the panel.' }); return true; }
      DRAFTS.delete(a1);
      const club = findClub(draft.clubKey), style = draft.style;
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
      } else {
        const d = await applyLineupEdits(draft.data, f);
        build = () => renderLineup({ guildId: interaction.guildId, club, style, d });
        label = `📋 **${d.title}** · ${STYLES[style].label}`;
      }
      const r = await deliver({ channel: interaction.channel, club, guild: interaction.guild, userId: interaction.user.id, label, build });
      await interaction.editReply(r.error ? `❌ ${r.error}` : '✅ Posted!').catch(() => {});
      return true;
    }
    if (interaction.isModalSubmit() && action === 'gs_bannerform') {
      const club = findClub(a1), style = STYLES[a2] ? a2 : 'esports';
      if (!club || !(await manager())) { await respond({ content: 'Banners are for managers.' }); return true; }
      await respond({ content: '🏆 Drawing the banner…' });
      const f = (k) => interaction.fields.getTextInputValue(k).trim();
      const hero = /^\d{5,25}$/.test(f('hero')) ? f('hero') : undefined;
      const r = await deliver({
        channel: interaction.channel, club, guild: interaction.guild, userId: interaction.user.id, hallOfFame: true,
        label: `🏆 **${f('headline')}** — ${f('competition')}`,
        build: () => buildBanner({ guild: interaction.guild, guildId: interaction.guildId, club, style, headline: f('headline'), competition: f('competition'), seasonTag: f('tag'), rosterText: f('roster'), heroId: hero }),
      });
      await interaction.editReply(r.error ? `❌ ${r.error}` : '✅ Banner posted here and in the Hall of Fame.').catch(() => {});
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
      const payload = { content: '❌ The studio could not complete that step. Start again from /graphics.', components: [] };
      if (interaction.deferred || interaction.replied) await interaction.editReply(payload).catch(() => {});
      else await interaction.reply({ ...payload, flags: 64 }).catch(() => {});
      return true;
    }
  }
  return { onMessage, handleInteraction: safeHandleInteraction, init, panelFor, refreshPanel };
}

module.exports = { createGraphicsStudio, STYLES, playerCard, matchPoster, banner, lineupPoster };
