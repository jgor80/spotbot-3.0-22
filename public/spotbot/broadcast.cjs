// Premium: broadcast-grade visuals.
//   recap image   added to every autopilot match recap (autopilot.setRecapImage)
//   /cards        FUT-style cards for the squad from synced matches; posted on the 1st of each month
//   /totw         Team of the Week across every club in the server; posted Sunday from 20:00 local
// Numbers on cards come from EA match stats we already sync. OVR is EA's own pro overall when the
// members endpoint returns one, otherwise it is derived from average match rating (and says so).

const { EmbedBuilder, AttachmentBuilder } = require('discord.js');
const { activeClubs, resolveClub } = require('./manager-hub.cjs');
const { toInsightMatches } = require('./club-insights.cjs');
const { seasonTotals, lineOf, leaders, num } = require('./player-season.cjs');
const G = require('./graphics.cjs');
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
    await Promise.all(
      (data || []).map(async (p) => {
        if (!p.ea_username || String(p.discord_user_id).startsWith('ea_')) return;
        const member = guild ? await guild.members.fetch(p.discord_user_id).catch(() => null) : null;
        const url = member?.displayAvatarURL({ extension: 'png', size: 256, forceStatic: true });
        const img = url ? await G.fetchImage(url) : null;
        if (img) out.set(p.ea_username.toLowerCase(), img);
      }),
    );
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
    return (await G.fetchImage(prefs.branding?.logo_url)) || null;
  }

  // ---------- Recap image ----------

  async function recapImage({ row, club, match, history, prefs, talkingPoint }) {
    if (!(await premium.isPremium(row.guild_id))) return null;
    const md = row.match_data || {};
    const clubs = md.clubs || {};
    const ourId = String(club.ea_club_id || '');
    const theirId = Object.keys(clubs).find((id) => id !== ourId);
    const ourCrest = (await G.fetchImage(prefs.branding?.logo_url)) || (await G.fetchImage(G.eaCrestUrl(clubs[ourId]?.details?.customKit?.crestAssetId)));
    const theirCrest = theirId ? await G.fetchImage(G.eaCrestUrl(clubs[theirId]?.details?.customKit?.crestAssetId)) : null;
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
        motm: !!p.motm,
        red: !!p.red_cards,
      }))
      .filter((p) => p.name)
      .sort((a, b) => b.rating - a.rating);
    const motmLine = players.find((p) => p.motm) || players[0] || null;
    const avatars = motmLine ? await avatarsFor(row.guild_id, [motmLine.name]) : new Map();
    const form = history
      .slice(0, 5)
      .reverse()
      .map((m) => m.result[0].toUpperCase())
      .join(' ');

    return G.recapGraphic({
      clubName: club.name,
      opponentName: match.opponent,
      scoreFor: match.scoreFor,
      scoreAgainst: match.scoreAgainst,
      result: match.result,
      crestFor: ourCrest,
      crestAgainst: theirCrest,
      players,
      motm: motmLine && { ...motmLine, avatar: avatars.get(motmLine.name.toLowerCase()) || null },
      accent: Number.isInteger(prefs.branding?.color) ? prefs.branding.color : undefined,
      competition: MATCH_TYPES[md._matchCategory] || MATCH_TYPES[row.match_type] || null,
      dateText: dateText(match.playedAt, prefs.timezone),
      details: [
        `${MATCH_TYPES[md._matchCategory] || MATCH_TYPES[row.match_type] || 'EA'} match`,
        theirCount ? `${ourCount} vs ${theirCount} players` : `${ourCount} players`,
        form ? `Form: ${form}` : null,
      ],
      talkingPoint: talkingPoint ? talkingPoint.replace(/\*\*/g, '').replace(/^\S+\s/, '') : null,
      footer: prefs.branding?.footer || '',
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
        stats: cardStats(t),
        badges: badgesFor(t, totals),
        inForm: t.ratings.length >= 5 && t.recentAvg(5) > IN_FORM_RATING,
      };
    });

    const label = { week: 'Last 7 days', month: 'Last 30 days', season: 'All synced matches' }[period] || 'Last 30 days';
    const accent = Number.isInteger(prefs.branding?.color) ? prefs.branding.color : undefined;
    const files = [];
    for (let i = 0; i < cards.length; i += CARDS_PER_IMAGE) {
      const png = G.cardSheet({
        cards: cards.slice(i, i + CARDS_PER_IMAGE),
        title: `${club.name} squad cards`,
        subtitle: `${label} · ${matches.length} matches${derived ? ' · OVR from match ratings where EA gives none' : ''}`,
        accent,
        footer: prefs.branding?.footer || 'GafferBot',
      });
      files.push(new AttachmentBuilder(png, { name: `cards-${i / CARDS_PER_IMAGE + 1}.png` }));
    }
    return { content: `🃏 **${club.name}** squad cards · ${label.toLowerCase()}`, files };
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
    const local = T.localParts(new Date(), prefs.timezone);
    const png = G.totwPoster({
      players: picked.map(({ t, line }) => ({ name: t.name, line, rating: t.avgRating, club: t.club, avatar: avatars.get(t.key) || null })),
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
    if (!club) return interaction.editReply({ content: '❌ No club is set up yet. Run `/setclub` first.' });
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
  events.onTick((now) => tick(now).catch((err) => console.warn(`[broadcast] tick failed: ${err.message}`)));

  return { handleInteraction, buildCards, buildTotw, recapImage };
}

module.exports = { createBroadcast, BROADCAST_SUBCOMMANDS, derivedOverall, badgesFor };
