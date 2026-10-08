// Graphics Studio: a club's own media channel where anyone can ask for graphics.
//   Player Card    the member's in-game pro, redrawn in the club kit, with their real club stats
//   Match Poster   vertical full-time poster for the latest synced match
//   Banner         managers only: championship banner (BYOT, league, cup, playoff wins)
// Artwork comes from the club-art function (AI, no text). Every word and number on top is drawn
// here from saved data, so stats are never invented. Four styles: esports, modern, vintage, obsidian.
// The studio is any channel named like #graphics / #media-studio, or a club's graphics_channel_id.
// The panel stays the last message in the channel.

const {
  EmbedBuilder, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle,
} = require('discord.js');
const G = require('./graphics.cjs');
const { activeClubs } = require('./manager-hub.cjs');
const { toInsightMatches } = require('./club-insights.cjs');

const NAME_RE = /graphic|media-?studio|studio/i;
const STYLES = {
  esports: { label: 'Ultra Esports', emoji: '⚡', desc: 'Neon, smoke, grunge — matchday hype' },
  modern: { label: 'Modern Broadcast', emoji: '✨', desc: 'Clean TV-graphic look' },
  vintage: { label: 'Vintage Heritage', emoji: '📜', desc: '90s trading card, film grain' },
  obsidian: { label: 'Obsidian & Gold', emoji: '🛡️', desc: 'Black and gold, elite' },
};
const HEAD = 'Oswald';
const BODY = 'Inter';
const COLOR_WORDS = {
  pink: 0xf472b6, black: 0x111111, white: 0xffffff, red: 0xdc2626, blue: 0x2563eb, navy: 0x1e3a8a, green: 0x16a34a,
  yellow: 0xfacc15, gold: 0xd4af37, orange: 0xf97316, purple: 0x7c3aed, sky: 0x38bdf8, maroon: 0x7f1d1d, grey: 0x9ca3af, gray: 0x9ca3af,
};
const BUSY = new Set();

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
  const W = 1024, H = 1536, p = palette(d.style, d.kit);
  const stats = d.stats.slice(0, 6);
  const cell = (W - 120) / Math.max(stats.length, 1);
  return G.render(`${svgOpen(W, H, d.art)}${frame(W, H, p)}
    ${crestSvg(110, 120, 52, d.crest)}
    <text x="${d.crest ? 180 : 70}" y="112" font-family="${HEAD}" font-weight="700" font-size="34" fill="${p.ink}">${esc(clip(d.clubName, 26).toUpperCase())}</text>
    <text x="${d.crest ? 180 : 70}" y="148" font-family="${BODY}" font-size="20" fill="${p.sub}">${esc(d.seasonLabel || 'PRO CLUBS')}</text>
    ${d.position ? `<rect x="${W - 190}" y="72" width="120" height="70" fill="${p.accent}"/><text x="${W - 130}" y="122" text-anchor="middle" font-family="${HEAD}" font-weight="700" font-size="40" fill="#000">${esc(d.position)}</text>` : ''}
    ${d.overall ? `<text x="${W - 130}" y="215" text-anchor="middle" font-family="${HEAD}" font-weight="700" font-size="76" fill="${p.ink}">${d.overall}</text><text x="${W - 130}" y="245" text-anchor="middle" font-family="${BODY}" font-size="16" fill="${p.sub}">${esc(d.overallLabel)}</text>` : ''}
    <rect x="60" y="1090" width="140" height="8" fill="${p.accent}"/>
    ${headline(clip(d.name, 18), 60, 1200, fit(d.name, 900, 130, 0.48, 60), p)}
    <text x="64" y="1250" font-family="${BODY}" font-weight="700" font-size="24" fill="${p.accent}">${esc(clip(d.tagline, 60).toUpperCase())}</text>
    <rect x="60" y="1290" width="${W - 120}" height="150" fill="${p.panel}" fill-opacity="${p.panelOpacity}"/>
    ${stats.map(([label, value], i) => `<text x="${60 + cell * i + cell / 2}" y="1375" text-anchor="middle" font-family="${HEAD}" font-weight="700" font-size="56" fill="${p.ink}">${esc(value)}</text>
      <text x="${60 + cell * i + cell / 2}" y="1415" text-anchor="middle" font-family="${BODY}" font-weight="700" font-size="18" fill="${p.sub}">${esc(label)}</text>`).join('')}
    <text x="${W / 2}" y="1490" text-anchor="middle" font-family="${BODY}" font-size="14" fill="${p.sub}" fill-opacity="0.8">EA MATCH DATA · AI ART FROM THEIR IN-GAME PRO · SPOTBOT STUDIO</text>
  </svg>`);
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
    if (!res?.ok || !out.image_b64) return { error: typeof out.error === 'string' ? out.error : 'The art studio is unavailable right now.' };
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
          '🎴 **Player Card** — your pro, your real club stats',
          '📰 **Match Poster** — the latest full-time result',
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
      .addOptions(Object.entries(STYLES).map(([value, s]) => ({ label: s.label, value, emoji: s.emoji, description: s.desc }))));
  }

  // ----- builders (return { file, note } or { error }) -----

  async function buildCard({ guildId, club, userId, displayName, style }) {
    const [{ data: statsRows }, { data: profile }, { data: photo }] = await Promise.all([
      supabase.from('player_club_stats').select('*').eq('guild_id', guildId).eq('discord_user_id', userId),
      supabase.from('profiles').select('ea_username').eq('discord_user_id', userId).maybeSingle(),
      supabase.from('pro_photos').select('position, overall').eq('discord_user_id', userId).maybeSingle(),
    ]);
    const rows = (statsRows || []).sort((a, b) => (a.club_key === club.key ? -1 : 0) - (b.club_key === club.key ? -1 : 0) || n(b.games_played) - n(a.games_played));
    const s = rows[0] || {};
    const position = photo?.position || s.primary_position || null;
    const gk = /GK/i.test(position || '');
    const pass = n(s.pass_attempts) ? `${Math.round((n(s.passes_made) / n(s.pass_attempts)) * 100)}%` : '—';
    const stats = gk
      ? [['GAMES', n(s.games_played)], ['SAVES', n(s.saves)], ['CLEAN SH.', n(s.clean_sheets)], ['PASS', pass], ['MOTM', n(s.man_of_match)], ['RATING', s.avg_match_rating ? Number(s.avg_match_rating).toFixed(1) : '—']]
      : [['GAMES', n(s.games_played)], ['GOALS', n(s.goals)], ['ASSISTS', n(s.assists)], ['PASS', pass], ['TACKLES', n(s.tackles)], ['RATING', s.avg_match_rating ? Number(s.avg_match_rating).toFixed(1) : '—']];
    const a = await art({ kind: 'card', style, club_name: club.name, kit: club.kit || {}, discord_user_id: userId, position: position || undefined });
    if (a.error) return a;
    const name = profile?.ea_username || displayName;
    const png = playerCard({
      art: a.image, style, kit: club.kit, clubName: club.name, crest: await crestFor(guildId), name, position,
      overall: photo?.overall || null, overallLabel: 'EA OVR', stats,
      seasonLabel: s.baseline_synced ? 'EA CLUB TOTALS' : 'TRACKED MATCHES',
      tagline: n(s.games_played) ? `${n(s.wins)}W ${n(s.draws)}D ${n(s.losses)}L with ${club.name}` : 'New signing',
    });
    return { file: new AttachmentBuilder(png, { name: `card-${name}.png`.replace(/[^\w.-]/g, '_') }), note: a.usedPro ? null : 'No pro photo on file, so this uses a silhouette — post your pro in #pro-photos for the real thing.' };
  }

  async function buildPoster({ guildId, club, style }) {
    let q = supabase.from('club_matches').select('id, result, score_for, score_against, match_type, created_at, opponent_club_name, player_stats, match_data').eq('guild_id', guildId).order('created_at', { ascending: false }).limit(5);
    if (club.key) q = q.eq('club_key', club.key);
    const { data } = await q;
    const match = toInsightMatches(data || [])[0];
    if (!match) return { error: 'No synced matches yet for this club.' };
    const players = match.players.map((p) => ({ name: p.ea_username, rating: n(p.rating), goals: n(p.goals), motm: !!p.motm })).filter((p) => p.name);
    const motm = players.find((p) => p.motm) || [...players].sort((x, y) => y.rating - x.rating)[0] || null;
    let motmId;
    if (motm) {
      const { data: prof } = await supabase.from('profiles').select('discord_user_id').ilike('ea_username', motm.name).maybeSingle();
      motmId = prof?.discord_user_id && /^\d+$/.test(prof.discord_user_id) ? prof.discord_user_id : undefined;
    }
    const mood = match.result === 'win' ? 'win' : match.result === 'loss' ? 'loss' : 'draw';
    const a = await art({ kind: 'poster', style, club_name: club.name, kit: club.kit || {}, discord_user_id: motmId, mood });
    if (a.error) return a;
    const scorers = players.filter((p) => p.goals).map((p) => (p.goals > 1 ? `${p.name} ×${p.goals}` : p.name)).join(', ');
    const png = matchPoster({
      art: a.image, style, kit: club.kit, clubName: club.name, crestFor: await crestFor(guildId), crestAgainst: null,
      opponent: match.opponent, scoreFor: match.scoreFor, scoreAgainst: match.scoreAgainst, result: match.result,
      competition: /playoff/i.test(match.matchType || '') ? 'Playoff' : /friendly/i.test(match.matchType || '') ? 'Friendly' : 'League',
      dateText: match.playedAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      scorers, motm,
    });
    return { file: new AttachmentBuilder(png, { name: 'full-time.png' }) };
  }

  async function buildBanner({ guildId, club, style, headline: title, competition, seasonTag, rosterText, heroId }) {
    let roster = String(rosterText || '').split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
    if (!roster.length) {
      const since = new Date(Date.now() - 21 * 864e5).toISOString();
      let q = supabase.from('club_matches').select('player_stats').eq('guild_id', guildId).gte('created_at', since).limit(60);
      if (club.key) q = q.eq('club_key', club.key);
      const { data } = await q;
      const seen = new Map();
      for (const r of data || []) for (const p of r.player_stats || []) if (p?.ea_username) seen.set(p.ea_username.toLowerCase(), p.ea_username);
      roster = [...seen.values()];
    }
    const a = await art({ kind: 'banner', style, club_name: club.name, kit: club.kit || {}, competition, discord_user_id: heroId });
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
    const style = Object.keys(STYLES).find((s) => text.includes(s)) || (text.includes('gold') ? 'obsidian' : text.includes('retro') ? 'vintage' : text.includes('clean') ? 'modern' : 'esports');
    let build, label;
    if (/\bcard\b/.test(text)) {
      const target = message.mentions.users.find((u) => !u.bot) || message.author;
      const member = await message.guild.members.fetch(target.id).catch(() => null);
      build = () => buildCard({ guildId: message.guild.id, club, userId: target.id, displayName: member?.displayName || target.username, style });
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
    const state = await getGuildState(interaction.guildId).catch(() => null);
    const findClub = (key) => activeClubs(state).find((c) => c.key === key) || activeClubs(state)[0];
    const manager = async () => isManager(interaction.member, interaction.guildId);

    if (interaction.isButton() && action === 'gs_card') {
      await interaction.reply({ content: '🎴 Pick a style for your card:', components: [styleRow('card', a1)], flags: 64 });
      return true;
    }
    if (interaction.isButton() && action === 'gs_poster') {
      await interaction.reply({ content: '📰 Pick a style for the full-time poster:', components: [styleRow('poster', a1)], flags: 64 });
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
      if (!club || !(await manager())) { await interaction.reply({ content: 'Only managers can change the club kit.', flags: 64 }); return true; }
      club.kit = {
        primary: interaction.fields.getTextInputValue('primary').trim(),
        secondary: interaction.fields.getTextInputValue('secondary').trim() || undefined,
        description: interaction.fields.getTextInputValue('description').trim() || undefined,
      };
      await saveGuildSettings(interaction.guildId, state);
      await interaction.reply({ content: `👕 Kit saved: **${club.kit.primary}${club.kit.secondary ? ` / ${club.kit.secondary}` : ''}**. Every new graphic uses it.`, flags: 64 });
      if (interaction.channel) refreshPanel(interaction.channel, club).catch(() => {});
      return true;
    }
    if (interaction.isStringSelectMenu() && action === 'gs_style') {
      const kind = a1, club = findClub(a2), style = interaction.values[0];
      if (!club) { await interaction.update({ content: 'No club set up here.', components: [] }); return true; }
      if (kind === 'banner') {
        const modal = new ModalBuilder().setCustomId(`gs_bannerform:${club.key}:${style}`).setTitle('Championship banner');
        modal.addComponents(
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('headline').setLabel('Headline').setPlaceholder('BYOT SHOWDOWN CHAMPIONS').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(40)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('competition').setLabel('Competition').setPlaceholder('VPG Cup Final · Oct 2026').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(60)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('tag').setLabel('Corner tag (optional)').setPlaceholder('SEASON 1').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(14)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('roster').setLabel('Roster (comma separated, blank = last 3 weeks)').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(600)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('hero').setLabel('Featured player (Discord user ID, optional)').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(25)),
        );
        await interaction.showModal(modal);
        return true;
      }
      await interaction.update({ content: `🎨 Drawing your ${kind === 'card' ? 'card' : 'poster'} in **${STYLES[style].label}** — about a minute…`, components: [] });
      const build = kind === 'card'
        ? () => buildCard({ guildId: interaction.guildId, club, userId: interaction.user.id, displayName: interaction.member?.displayName || interaction.user.username, style })
        : () => buildPoster({ guildId: interaction.guildId, club, style });
      const label = kind === 'card' ? `🎴 **${interaction.member?.displayName || interaction.user.username}** · ${STYLES[style].label}` : `📰 Full time · ${STYLES[style].label}`;
      const r = await deliver({ channel: interaction.channel, club, guild: interaction.guild, userId: interaction.user.id, label, build });
      await interaction.editReply(r.error ? `❌ ${r.error}` : '✅ Posted!').catch(() => {});
      return true;
    }
    if (interaction.isModalSubmit() && action === 'gs_bannerform') {
      const club = findClub(a1), style = STYLES[a2] ? a2 : 'esports';
      if (!club || !(await manager())) { await interaction.reply({ content: 'Banners are for managers.', flags: 64 }); return true; }
      await interaction.reply({ content: '🏆 Drawing the banner — about a minute…', flags: 64 });
      const f = (k) => interaction.fields.getTextInputValue(k).trim();
      const hero = /^\d{5,25}$/.test(f('hero')) ? f('hero') : undefined;
      const r = await deliver({
        channel: interaction.channel, club, guild: interaction.guild, userId: interaction.user.id, hallOfFame: true,
        label: `🏆 **${f('headline')}** — ${f('competition')}`,
        build: () => buildBanner({ guildId: interaction.guildId, club, style, headline: f('headline'), competition: f('competition'), seasonTag: f('tag'), rosterText: f('roster'), heroId: hero }),
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

  return { onMessage, handleInteraction, init };
}

module.exports = { createGraphicsStudio, STYLES, playerCard, matchPoster, banner };
