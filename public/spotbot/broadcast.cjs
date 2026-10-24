// Premium: broadcast-grade visuals.
//   recap image   added to every autopilot match recap (autopilot.setRecapImage)
//   /cards        FUT-style cards for the squad from synced matches; posted on the 1st of each month
//   /totw         Team of the Week across every club in the server; posted Sunday from 20:00 local
// Numbers on cards come from EA match stats we already sync. OVR is EA's own pro overall when the
// members endpoint returns one, otherwise it is derived from average match rating (and says so).

const { EmbedBuilder, AttachmentBuilder } = require('discord.js');
const { activeClubs, resolveClub } = require('./manager-hub.cjs');
const { toInsightMatches, matchTag, competitionLabel } = require('./club-insights.cjs');
const { seasonTotals, lineOf, leaders, num } = require('./player-season.cjs');
const G = require('./graphics.cjs');
const { identityOf } = require('./club-identity.cjs');
const { clubAccent, crestUrl } = require('./club-colors.cjs');
const { stillInGuild } = require('./art-players.cjs');
const T = require('./event-time.cjs');

const DAY = 24 * 60 * 60 * 1000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const PERIODS = { week: 7, month: 30, season: 3650 };
const CARDS_PER_IMAGE = 8;
const MAX_CARDS = 16;
const MIN_CARD_GAMES = 2;
const MIN_TOTW_GAMES = 2;
const TOTW_HOUR = 20;
const CARDS_HOUR = 18;
const IN_FORM_RATING = 8.5;
const LINE_LABEL = { GK: 'GK', DEF: 'DEF', MID: 'MID', FWD: 'ATT' };
const MATCH_TYPES = {
  leagueMatch: 'League',
  playoffMatch: 'Playoff',
  friendlyMatch: 'Friendly',
  division: 'League',
  league: 'League',
  playoff: 'Playoff',
  friendly: 'Friendly',
};

// Subcommands of /premium (the bot is near Discord's 100-command limit, so no new top-level commands)
const BROADCAST_SUBCOMMANDS = [
  {
    type: 1,
    name: 'cards',
    description: 'FUT-style player cards for your squad from synced EA matches.',
    options: [
      {
        name: 'period',
        description: 'Which matches count (default: last 30 days).',
        type: 3,
        required: false,
        choices: [
          { name: 'Last 7 days', value: 'week' },
          { name: 'Last 30 days', value: 'month' },
          { name: 'All synced matches', value: 'season' },
        ],
      },
      { name: 'player', description: 'Just one player (EA gamertag).', type: 3, required: false, max_length: 32 },
      { name: 'club', description: 'Club name (if the server has more than one).', type: 3, required: false },
      { name: 'post', description: 'Post it in this channel for everyone (default: only you see it).', type: 5, required: false },
    ],
  },
  {
    type: 1,
    name: 'totw',
    description: 'Team of the Week poster from the last 7 days of matches in this server.',
    options: [{ name: 'post', description: 'Post it in this channel for everyone (default: only you see it).', type: 5, required: false }],
  },
];

function pickClub(state, interaction) {
  const wanted = (interaction.options.getString('club') || '').trim().toLowerCase();
  if (wanted) {
    const hit = activeClubs(state).find((c) => c.key === wanted || (c.name || '').toLowerCase() === wanted);
    if (hit) return hit;
  }
  return resolveClub(state, interaction.member);
}

function dateText(d, timezone) {
  try {
    return d.toLocaleString('en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: timezone || 'UTC',
    });
  } catch {
    return d.toUTCString();
  }
}

// Badges a player has earned in the period; all are plain thresholds on synced stats
function badgesFor(t, all) {
  const out = [];
  const perGame = (v) => v / Math.max(t.games, 1);
  const topScorer = leaders(all, (x) => x.goals).includes(t);
  const topCreator = leaders(all, (x) => x.assists).includes(t);
  if (t.goals >= 3 && (topScorer || (perGame(t.goals) >= 0.8 && t.shots && t.goals / t.shots >= 0.3))) out.push('Sniper');
  if (t.assists >= 3 && (topCreator || perGame(t.assists) >= 0.5)) out.push('Playmaker');
  if (t.line === 'DEF' && (perGame(t.tackles) >= 3 || t.cleanSheets / t.games >= 0.4)) out.push('Wall');
  if (t.line === 'GK' && t.saves + t.conceded >= 10 && t.saves / (t.saves + t.conceded) >= 0.7) out.push('Safe Hands');
  if (t.passPct != null && t.passPct >= 88 && perGame(t.passAttempts) >= 15) out.push('Metronome');
  if (t.motm >= 3) out.push('Star Man');
  return out;
}

function cardStats(t) {
  const pct = (v) => (v == null ? '-' : `${Math.round(v)}%`);
  if (t.line === 'GK') {
    const savePct = t.saves + t.conceded ? (100 * t.saves) / (t.saves + t.conceded) : null;
    return [
      ['SAV', t.saves],
      ['SV%', pct(savePct)],
      ['RTG', t.avgRating.toFixed(1)],
      ['CS', t.cleanSheets],
      ['GP', t.games],
      ['MOM', t.motm],
    ];
  }
  if (t.line === 'DEF')
    return [
      ['TKL', t.tackles],
      ['CS', t.cleanSheets],
      ['RTG', t.avgRating.toFixed(1)],
      ['PAS', pct(t.passPct)],
      ['GLS', t.goals],
      ['MOM', t.motm],
    ];
  return [
    ['GLS', t.goals],
    ['AST', t.assists],
    ['RTG', t.avgRating.toFixed(1)],
    ['PAS', pct(t.passPct)],
    ['SHT', t.shots],
    ['MOM', t.motm],
  ];
}

// EA's 1-10 match ratings mapped onto a card OVR: 6.0 -> 66, 7.0 -> 74, 8.0 -> 82, 9.0 -> 90
function derivedOverall(avgRating) {
  return Math.max(40, Math.min(99, Math.round(18 + avgRating * 8)));
}

function createBroadcast(deps) {
  const { supabase, premium, events, autopilot, getGuildState, canManageClub, fetchClubMembers } = deps;
  // Self-hosted bots have no BOT_PROXY_SECRET; their in-process functions accept the local placeholder
  const functionSecret = deps.functionSecret || process.env.BOT_PROXY_SECRET;
  const client = () => events.getClient();

  // ---------- Lookups ----------

  async function loadClubMatches(guildId, clubKey, sinceMs) {
    let q = supabase
      .from('club_matches')
      .select('id, result, score_for, score_against, match_type, created_at, opponent_club_name, player_stats, match_data')
      .eq('guild_id', guildId)
      .order('created_at', { ascending: false })
      .limit(400);
    if (clubKey) q = q.eq('club_key', clubKey);
    if (sinceMs) q = q.gte('created_at', new Date(sinceMs - DAY).toISOString());
    const { data } = await q;
    return toInsightMatches(data || []).filter((m) => !sinceMs || m.playedAt.getTime() >= sinceMs);
  }

  // EA gamertag (lowercase) -> Discord avatar data URI, for linked players in this server
  async function avatarsFor(guildId, names) {
    const out = new Map();
    if (!names.length) return out;
    const { data } = await supabase.from('profiles').select('discord_user_id, ea_username').in('ea_username', names);
    const guild = client()?.guilds.cache.get(guildId);
    // In-game pro photos come first, Discord avatars fill the gaps
    const ids = (data || []).map((p) => p.discord_user_id).filter((id) => !String(id).startsWith('ea_'));
    const { data: photos } = ids.length ? await supabase.from('pro_photos').select('discord_user_id, image_url').in('discord_user_id', ids) : { data: [] };
    const photoBy = new Map((photos || []).map((r) => [r.discord_user_id, r.image_url]));
    await Promise.all(
      (data || []).map(async (p) => {
        if (!p.ea_username || String(p.discord_user_id).startsWith('ea_')) return;
        const member = guild ? await guild.members.fetch(p.discord_user_id).catch(() => null) : null;
        // Nobody who has left the server is pictured
        if (guild && !member) return;
        const pro = photoBy.get(p.discord_user_id);
        const proImg = pro ? await G.fetchImage(pro) : null;
        if (proImg) return out.set(p.ea_username.toLowerCase(), proImg);
        const url = member?.displayAvatarURL({ extension: 'png', size: 256, forceStatic: true });
        const img = url ? await G.fetchImage(url) : null;
        if (img) out.set(p.ea_username.toLowerCase(), img);
      }),
    );
    return out;
  }

  // Each player's pro-photo assets of one kind (newest first), keyed by lowercase gamertag.
  //   'upload'     their own original photos (falls back to the latest-photo compatibility record)
  //   'generated'  the rendered art the Studio made for their player cards from those photos
  //   guildId      when given, players who have left that server are skipped
  async function assetsFor(names, kind, guildId) {
    const out = new Map();
    if (!names.length) return out;
    const { data: profiles } = await supabase.from('profiles').select('discord_user_id, ea_username').in('ea_username', names);
    const byId = new Map((profiles || []).filter((p) => p.ea_username && /^\d{5,25}$/.test(p.discord_user_id)).map((p) => [p.discord_user_id, p.ea_username.toLowerCase()]));
    const ids = guildId ? await stillInGuild(client()?.guilds.cache.get(guildId), [...byId.keys()]) : [...byId.keys()];
    if (!ids.length) return out;
    const [{ data: assets }, { data: latest }] = await Promise.all([
      supabase.from('pro_photo_assets').select('discord_user_id, image_url').in('discord_user_id', ids).eq('source_kind', kind).order('created_at', { ascending: false }).limit(300),
      kind === 'upload' ? supabase.from('pro_photos').select('discord_user_id, image_url').in('discord_user_id', ids) : { data: [] },
    ]);
    for (const [id, name] of byId) {
      const mine = (assets || []).filter((u) => u.discord_user_id === id && u.image_url).map((u) => u.image_url);
      const legacy = (latest || []).find((p) => p.discord_user_id === id)?.image_url;
      const urls = mine.length ? mine : legacy ? [legacy] : [];
      if (urls.length) out.set(name, urls);
    }
    return out;
  }
  const uploadsFor = (names, guildId) => assetsFor(names, 'upload', guildId);

  // First of a player's uploads that loads, rotated by seed so back-to-back posts vary
  async function photoOf(urls, seed = '') {
    let h = 0;
    for (const c of String(seed)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    const k = h % urls.length;
    for (const url of [...urls.slice(k), ...urls.slice(0, k)]) {
      const img = await G.fetchImage(url);
      if (img) return img;
    }
    return null;
  }

  // Recap backdrop: an original upload from someone in this match, Man of the Match first
  async function backgroundFor(names, seed = '', guildId) {
    const uploads = await uploadsFor(names, guildId);
    for (const n of names) {
      const urls = uploads.get(n.toLowerCase());
      const img = urls ? await photoOf(urls, seed) : null;
      if (img) return img;
    }
    return null;
  }

  // Chronicle front page: each cover player appears as their rendered player-card art (made from
  // their own reference photos), falling back to an original upload when they have no render yet
  async function editionImage({ guildId, club, cover, prefs = {} }) {
    if (!(await premium.isPremium(guildId))) return null;
    const names = cover.coverStars.map((s) => s.name);
    const [renders, uploads] = await Promise.all([assetsFor(names, 'generated', guildId).catch(() => new Map()), uploadsFor(names, guildId).catch(() => new Map())]);
    const players = await Promise.all(cover.coverStars.map(async (s) => {
      const key = s.name.toLowerCase();
      const seed = `${cover.seed}${s.name}`;
      const bits = [s.goals && `${s.goals}G`, s.assists && `${s.assists}A`, s.avg && `${s.avg.toFixed(1)} avg`, s.saves && `${s.saves} saves`].filter(Boolean);
      const photo = (renders.has(key) ? await photoOf(renders.get(key), seed) : null) || (uploads.has(key) ? await photoOf(uploads.get(key), seed) : null);
      return { name: s.name, caption: bits.join(' · '), photo };
    }));
    return G.frontPage({
      clubName: club.name,
      paperName: identityOf(club).paper,
      editionLabel: cover.ed.label,
      dateText: cover.dateText,
      headline: cover.headline,
      record: cover.record,
      storyline: cover.storyline,
      run: cover.run,
      players,
      accent: clubAccent(club, prefs.branding, undefined),
    });
  }

  async function cardsFor(guildId, names) {
    const out = new Map();
    const secret = functionSecret;
    const url = process.env.SUPABASE_URL;
    if (!secret || !url || !names.length) return out;
    try {
      const { data: profiles } = await supabase.from('profiles').select('discord_user_id, ea_username').in('ea_username', names);
      const ids = await stillInGuild(client()?.guilds.cache.get(guildId), [...new Set((profiles || []).map(p => p.discord_user_id).filter(id => /^\d{5,25}$/.test(id)))]);
      if (!ids.length) return out;
      const response = await fetch(`${url.replace(/\/$/, '')}/functions/v1/player-cards`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-bot-secret': secret },
        body: JSON.stringify({ action: 'latest', guild_id: guildId, discord_user_ids: ids }), signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) return out;
      const { cards } = await response.json();
      const byId = new Map((cards || []).map(card => [card.discord_user_id, card.front_url]));
      await Promise.all((profiles || []).map(async p => {
        const image = await G.fetchImage(byId.get(p.discord_user_id));
        if (image && p.ea_username) out.set(p.ea_username.toLowerCase(), image);
      }));
    } catch { /* Saved-card outages must not stop recaps. */ }
    return out;
  }

  // EA's pro overall per gamertag (lowercase), when EA returns it
  async function eaOveralls(club) {
    const out = new Map();
    if (!fetchClubMembers || !club.ea_club_id) return out;
    const members = await fetchClubMembers({ clubId: club.ea_club_id, platform: club.ea_platform }).catch(() => []);
    for (const m of members || []) {
      const name = String(m.name || m.proName || m.playerName || '')
        .trim()
        .toLowerCase();
      const ovr = num(m.proOverall);
      if (name && ovr >= 40 && ovr <= 99) out.set(name, ovr);
    }
    return out;
  }

  async function crestFor(guildId, club) {
    const prefs = await events.serverPrefs(guildId);
    return (await G.fetchImage(crestUrl(club, prefs.branding))) || null;
  }

  // ---------- Recap image ----------

  async function recapImage({ row, club, match, history, prefs, talkingPoint, headline }) {
    if (!(await premium.isPremium(row.guild_id))) return null;
    const md = row.match_data || {};
    const clubs = md.clubs || {};
    const ourId = String(club.ea_club_id || '');
    const theirId = Object.keys(clubs).find((id) => id !== ourId);
    // EA's TEAM field is the crest the club actually shows in-game (a real club's id or a custom crest id)
    const eaCrest = async (c) => {
      if (!c) return null;
      for (const id of [c.TEAM, c.details?.customKit?.crestAssetId, c.details?.teamId]) {
        const img = await G.fetchImage(G.eaCrestUrl(id));
        if (img) return img;
      }
      return null;
    };
    // A crest the club picked in /setup wins over EA's badge; the server's brand logo is the last resort
    const ownCrest = club.crest_url ? await G.fetchImage(crestUrl(club, null)) : null;
    const ourCrest = ownCrest || (await eaCrest(clubs[ourId])) || (await G.fetchImage(crestUrl(club, prefs.branding)));
    const theirCrest = theirId ? await eaCrest(clubs[theirId]) : null;
    const ourCount = Object.keys(md.players?.[ourId] || {}).length || match.players.length;
    const theirCount = theirId ? Object.keys(md.players?.[theirId] || {}).length : 0;

    const players = match.players
      .map((p) => ({
        name: String(p.ea_username || '').trim(),
        position: LINE_LABEL[lineOf(p.position)] || '',
        rating: num(p.rating),
        goals: num(p.goals),
        assists: num(p.assists),
        shots: num(p.shots),
        passesMade: num(p.passes_made),
        passAttempts: num(p.pass_attempts),
        tackles: num(p.tackles),
        tackleAttempts: num(p.tackle_attempts),
        saves: num(p.saves),
        stops: num(p.tackles) + num(p.interceptions) + num(p.clearances) + num(p.blocks),
        chances: num(p.chances_created),
        motm: !!p.motm,
        red: !!p.red_cards,
      }))
      .filter((p) => p.name)
      .sort((a, b) => b.rating - a.rating);
    const motmLine = players.find((p) => p.motm) || players[0] || null;
    const avatars = motmLine ? await avatarsFor(row.guild_id, [motmLine.name]) : new Map();
    const savedCards = motmLine ? await cardsFor(row.guild_id, [motmLine.name]) : new Map();
    const background = await backgroundFor([...new Set([motmLine?.name, ...players.map((p) => p.name)].filter(Boolean))], row.id, row.guild_id).catch(() => null);

    return G.recapGraphic({
      clubName: club.name,
      paperName: identityOf(club).paper,
      opponentName: match.opponent,
      scoreFor: match.scoreFor,
      scoreAgainst: match.scoreAgainst,
      result: match.result,
      crestFor: ourCrest,
      crestAgainst: theirCrest,
      players,
      motm: motmLine && { ...motmLine, avatar: avatars.get(motmLine.name.toLowerCase()) || null },
      savedCard: motmLine ? savedCards.get(motmLine.name.toLowerCase()) || null : null,
      background,
      accent: clubAccent(club, prefs.branding, undefined),
      // A manager's League / Tournament / BYOT tag wins over EA's own type
      competition: (matchTag(row) && competitionLabel(matchTag(row))) || MATCH_TYPES[md._matchCategory] || MATCH_TYPES[row.match_type] || null,
      dateText: dateText(match.playedAt, prefs.timezone),
      details: [
        `${(matchTag(row) && competitionLabel(matchTag(row))) || MATCH_TYPES[md._matchCategory] || MATCH_TYPES[row.match_type] || 'EA'} match`,
        theirCount ? `${ourCount} vs ${theirCount} players` : `${ourCount} players`,
      ],
      talkingPoint: talkingPoint ? talkingPoint.replace(/\*\*/g, '').replace(/^\S+\s/, '') : null,
      footer: prefs.branding?.footer || '',
      headline: headline || null,
    });
  }

  // ---------- Cards ----------

  async function buildCards(guildId, club, { period = 'month', player = null } = {}) {
    const days = PERIODS[period] || PERIODS.month;
    const matches = await loadClubMatches(guildId, club.key, Date.now() - days * DAY);
    const totals = [...seasonTotals(matches).values()];
    let chosen = totals.filter((t) => t.games >= MIN_CARD_GAMES);
    if (player) chosen = totals.filter((t) => t.key === player.trim().toLowerCase());
    chosen = chosen.sort((a, b) => b.games * b.avgRating - a.games * a.avgRating).slice(0, MAX_CARDS);
    if (!chosen.length) return null;

    const [overalls, avatars, prefs] = await Promise.all([
      eaOveralls(club),
      avatarsFor(
        guildId,
        chosen.map((t) => t.name),
      ),
      events.serverPrefs(guildId),
    ]);
    const { data: profiles } = await supabase
      .from('profiles')
      .select('ea_username, preferred_position')
      .in(
        'ea_username',
        chosen.map((t) => t.name),
      );
    const prefPos = new Map((profiles || []).filter((p) => p.ea_username).map((p) => [p.ea_username.toLowerCase(), p.preferred_position]));
    const savedCards = await cardsFor(guildId, chosen.map(t => t.name));
    let derived = false;
    const cards = chosen.map((t) => {
      const ea = overalls.get(t.key);
      if (!ea) derived = true;
      const pos = String(prefPos.get(t.key) || '').toUpperCase();
      return {
        name: t.name,
        position: /^[A-Z]{2,3}$/.test(pos) ? pos : LINE_LABEL[t.line],
        overall: ea || derivedOverall(t.avgRating),
        avatar: avatars.get(t.key) || null,
        savedCard: savedCards.get(t.key) || null,
        stats: cardStats(t),
        badges: badgesFor(t, totals),
        inForm: t.ratings.length >= 5 && t.recentAvg(5) > IN_FORM_RATING,
      };
    });

    const label = { week: 'Last 7 days', month: 'Last 30 days', season: 'All synced matches' }[period] || 'Last 30 days';
    const accent = clubAccent(club, prefs.branding, undefined);
    const files = [];
    for (let i = 0; i < cards.length; i += CARDS_PER_IMAGE) {
      const png = G.cardSheet({
        cards: cards.slice(i, i + CARDS_PER_IMAGE),
        title: `${club.name} squad cards`,
        subtitle: `${label} · ${matches.length} matches${savedCards.size ? ' · Saved cards retain collection stats' : ''}${derived ? ' · OVR from match ratings where EA gives none' : ''}`,
        accent,
        footer: prefs.branding?.footer || 'GafferBot',
      });
      files.push(new AttachmentBuilder(png, { name: `cards-${i / CARDS_PER_IMAGE + 1}.png` }));
    }
    return { content: `🃏 **${club.name}** squad cards · ${label.toLowerCase()}`, files };
  }

  // ---------- Special edition cards ----------

  // One player's card for a special edition (upgrade, Player of the Night, award winner)
  async function specialCard(guildId, club, t, edition, editionNote, overall) {
    const prefs = await events.serverPrefs(guildId);
    const avatars = await avatarsFor(guildId, [t.name]);
    const card = {
      name: t.name,
      position: LINE_LABEL[t.line],
      overall: overall || derivedOverall(t.avgRating),
      avatar: avatars.get(t.key) || null,
      stats: cardStats(t),
      badges: badgesFor(t, [t]),
      edition,
      editionNote,
    };
    return G.cardSheet({ cards: [card], title: club.name, subtitle: G.TIERS?.[edition]?.label || '', accent: clubAccent(club, prefs.branding, undefined), footer: prefs.branding?.footer || 'GafferBot' });
  }

  // After new matches: a card whose rating (last 30 days) jumps 3+ gets an upgrade card. The first time a
  // club is seen, ratings are only remembered.
  const UPGRADE_JUMP = 3;
  async function cardUpgrades(guildId, club) {
    if (!autopilot.isOn(club, 'graphics') || !(await premium.isPremium(guildId))) return;
    const matches = await loadClubMatches(guildId, club.key, Date.now() - 30 * DAY);
    const totals = [...seasonTotals(matches).values()].filter((t) => t.games >= MIN_CARD_GAMES && t.rated);
    const overalls = await eaOveralls(club).catch(() => new Map());
    const now = Object.fromEntries(totals.map((t) => [t.key, overalls.get(t.key) || derivedOverall(t.avgRating)]));
    const before = club.autopilot?.card_ovr || null;
    await autopilot.updateClub(guildId, club.key, (ap) => {
      ap.card_ovr = { ...(ap.card_ovr || {}), ...now };
    });
    if (!before) return;
    const ups = totals.filter((t) => before[t.key] && now[t.key] - before[t.key] >= UPGRADE_JUMP).slice(0, 3);
    if (!ups.length) return;
    const channel = await autopilot.postChannel(guildId, club);
    if (!channel) return;
    for (const t of ups) {
      const png = await specialCard(guildId, club, t, 'upgrade', `+${now[t.key] - before[t.key]}`, now[t.key]).catch(() => null);
      if (!png) continue;
      await channel.send({ content: `📈 **Card upgrade:** ${t.name} goes ${before[t.key]} → **${now[t.key]}** on recent form.`, files: [new AttachmentBuilder(png, { name: 'upgrade.png' })], allowedMentions: { parse: [] } }).catch(() => {});
    }
  }

  // Session recap extra: a Player of the Night card for the best average rating (2+ games)
  async function playerOfTheNight({ guildId, club, matches }) {
    if (!autopilot.isOn(club, 'graphics') || !(await premium.isPremium(guildId)) || matches.length < 2) return null;
    const best = [...seasonTotals(matches).values()].filter((t) => t.games >= 2 && t.rated).sort((a, b) => b.avgRating - a.avgRating || b.goals - a.goals)[0];
    if (!best) return null;
    const png = await specialCard(guildId, club, best, 'potn', `${best.avgRating.toFixed(1)}`).catch(() => null);
    if (!png) return null;
    return { embeds: [new EmbedBuilder().setTitle(`🌟 Player of the Night · ${best.name}`).setDescription(`${best.avgRating.toFixed(1)} average over ${best.games} games${best.goals ? `, ${best.goals} goal${best.goals === 1 ? '' : 's'}` : ''}${best.assists ? `, ${best.assists} assist${best.assists === 1 ? '' : 's'}` : ''}.`).setImage('attachment://potn.png').setColor(0xa855f7)], files: [new AttachmentBuilder(png, { name: 'potn.png' })] };
  }

  // Portraits for posters: each player's rendered Studio art, else an original upload, else nothing.
  // names -> Map(lowercase name -> data URL)
  async function portraitsFor(guildId, names, seed = '') {
    const out = new Map();
    const list = [...new Set(names.filter(Boolean))];
    if (!list.length) return out;
    const [renders, uploads] = await Promise.all([assetsFor(list, 'generated', guildId).catch(() => new Map()), uploadsFor(list, guildId).catch(() => new Map())]);
    await Promise.all(list.map(async (n) => {
      const key = n.toLowerCase();
      const img = (renders.has(key) ? await photoOf(renders.get(key), `${seed}${n}`) : null) || (uploads.has(key) ? await photoOf(uploads.get(key), `${seed}${n}`) : null);
      if (img) out.set(key, img);
    }));
    return out;
  }

  // ---------- Team of the Week ----------

  async function buildTotw(guildId) {
    const state = await getGuildState(guildId);
    const clubs = activeClubs(state);
    const since = Date.now() - 7 * DAY;
    const pool = [];
    for (const club of clubs) {
      const matches = await loadClubMatches(guildId, club.key, since);
      for (const t of seasonTotals(matches).values()) if (t.games >= MIN_TOTW_GAMES && t.rated) pool.push({ ...t, club: clubs.length > 1 ? club.name : null });
    }
    if (pool.length < 4) return null;

    // Best average rating per line (4-3-3); a short line borrows from the next-best players left
    const byRating = [...pool].sort((a, b) => b.avgRating - a.avgRating || b.games - a.games);
    const picked = [];
    const need = { GK: 1, DEF: 4, MID: 3, FWD: 3 };
    for (const line of Object.keys(need)) {
      for (const t of byRating.filter((x) => x.line === line).slice(0, need[line])) picked.push({ t, line });
    }
    for (const line of Object.keys(need)) {
      let short = need[line] - picked.filter((p) => p.line === line).length;
      for (const t of byRating) {
        if (short <= 0) break;
        if (line === 'GK' || picked.some((p) => p.t === t)) continue;
        picked.push({ t, line });
        short--;
      }
    }
    const avatars = await avatarsFor(
      guildId,
      picked.map((p) => p.t.name),
    );
    const prefs = await events.serverPrefs(guildId);
    const guild = client()?.guilds.cache.get(guildId);
    const savedCards = await cardsFor(guildId, picked.map(p => p.t.name));
    const local = T.localParts(new Date(), prefs.timezone);
    const png = G.totwPoster({
      players: picked.map(({ t, line }) => ({ name: t.name, line, rating: t.avgRating, club: t.club, avatar: avatars.get(t.key) || null, savedCard: savedCards.get(t.key) || null })),
      title: `${guild?.name || 'Your server'} · week ending ${local.day} ${MONTHS[local.month - 1]}`,
      subtitle: `Best average match rating, min ${MIN_TOTW_GAMES} games`,
      accent: Number.isInteger(prefs.branding?.color) ? prefs.branding.color : undefined,
      crestImage: await crestFor(guildId),
      footer: prefs.branding?.footer || 'GafferBot',
    });
    const star = [...picked].sort((a, b) => b.t.avgRating - a.t.avgRating)[0];
    const embed = new EmbedBuilder()
      .setTitle('🌟 Team of the Week')
      .setColor(Number.isInteger(prefs.branding?.color) ? prefs.branding.color : 0xf5b301)
      .setDescription(star ? `Player of the week: **${star.t.name}** (${star.t.avgRating.toFixed(2)} average over ${star.t.games} games).` : null)
      .setImage('attachment://totw.png');
    return { embeds: [embed], files: [new AttachmentBuilder(png, { name: 'totw.png' })] };
  }

  // ---------- Commands ----------

  async function handleCommand(interaction) {
    const post = interaction.options.getBoolean('post') === true;
    await interaction.deferReply({ flags: post ? undefined : 64 });
    const sub = interaction.options.getSubcommand();
    const feature = sub === 'cards' ? 'Squad cards' : 'Team of the Week';
    if (!(await premium.gate(interaction, feature))) return;
    if (post && !interaction.memberPermissions?.has('ManageMessages')) {
      const state = await getGuildState(interaction.guildId);
      const club = pickClub(state, interaction);
      if (!club || !(await canManageClub(interaction.member, club))) {
        return interaction.editReply({ content: '❌ Only club leaders can post these for everyone. Run it without `post` to see it yourself.' });
      }
    }
    if (sub === 'totw') {
      const msg = await buildTotw(interaction.guildId);
      return interaction.editReply(
        msg || { content: `Not enough matches this week: a Team of the Week needs players with ${MIN_TOTW_GAMES}+ synced games in the last 7 days.` },
      );
    }
    const state = await getGuildState(interaction.guildId);
    const club = pickClub(state, interaction);
    if (!club) return interaction.editReply({ content: '❌ No club is set up yet. Run **/manager → Admin → Link EA Club** first.' });
    const msg = await buildCards(interaction.guildId, club, {
      period: interaction.options.getString('period') || 'month',
      player: interaction.options.getString('player'),
    });
    return interaction.editReply(
      msg || { content: `No cards yet: players need ${MIN_CARD_GAMES}+ synced matches in that period (or that gamertag hasn't played).` },
    );
  }

  async function handleInteraction(interaction) {
    if (!interaction.isChatInputCommand() || !interaction.guildId || interaction.commandName !== 'premium') return false;
    if (!['cards', 'totw'].includes(interaction.options.getSubcommand(false))) return false;
    await handleCommand(interaction);
    return true;
  }

  // ---------- Schedule ----------

  // Sunday from 20:00: TOTW once per server; 1st of the month from 18:00: cards once per club.
  // The "done" markers live on the first club's autopilot settings (TOTW) or each club's (cards).
  async function tick(now) {
    for (const guild of client().guilds.cache.values()) {
      const clubs = activeClubs(await getGuildState(guild.id)).filter((c) => c.ea_club_id);
      if (!clubs.length || !(await premium.isPremium(guild.id))) continue;
      const { timezone } = await events.serverPrefs(guild.id);
      const local = T.localParts(now, timezone);
      const dayKey = `${local.year}-${String(local.month).padStart(2, '0')}-${String(local.day).padStart(2, '0')}`;

      const lead = clubs[0];
      if (local.weekday === 0 && local.hour >= TOTW_HOUR && autopilot.isOn(lead, 'graphics') && lead.autopilot?.totw_week !== dayKey) {
        await autopilot.updateClub(guild.id, lead.key, (ap) => {
          ap.totw_week = dayKey;
        });
        const msg = await buildTotw(guild.id).catch((err) => console.warn(`[broadcast] totw ${guild.id} failed: ${err.message}`));
        const channel = msg ? await autopilot.postChannel(guild.id, lead) : null;
        if (channel) await channel.send(msg).catch(() => {});
      }

      const monthKey = dayKey.slice(0, 7);
      if (local.day !== 1 || local.hour < CARDS_HOUR) continue;
      for (const club of clubs) {
        if (!autopilot.isOn(club, 'graphics') || club.autopilot?.cards_month === monthKey) continue;
        await autopilot.updateClub(guild.id, club.key, (ap) => {
          ap.cards_month = monthKey;
        });
        const msg = await buildCards(guild.id, club, { period: 'month' }).catch((err) => console.warn(`[broadcast] cards ${club.key} failed: ${err.message}`));
        const channel = msg ? await autopilot.postChannel(guild.id, club) : null;
        if (channel) await channel.send(msg).catch(() => {});
      }
    }
  }

  autopilot.setRecapImage(recapImage);
  autopilot.onNewMatches?.((guildId, club) => cardUpgrades(guildId, club).catch((err) => console.warn(`[broadcast] card upgrades failed: ${err.message}`)));
  autopilot.onSessionEnd?.(playerOfTheNight);
  if (autopilot.setEditionImage) autopilot.setEditionImage(editionImage);
  events.onTick((now) => tick(now).catch((err) => console.warn(`[broadcast] tick failed: ${err.message}`)));

  return { handleInteraction, buildCards, buildTotw, recapImage, backgroundFor, editionImage, portraitsFor, specialCard };
}

module.exports = { createBroadcast, BROADCAST_SUBCOMMANDS, derivedOverall, badgesFor };
