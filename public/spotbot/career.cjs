// Careers and badges: running per-player totals for each club, kept up to date as EA matches sync, and the
// badges they unlock. Each badge is earned once; the first time a club is seen its whole match history is
// read quietly (no announcements), after that every new badge gets one short line and a medal image in the
// club's recap channel. The website's badge wall, career timeline and "milestones in reach" read the same
// tables (player_career, player_badges).
//   per match    first goal, brace, hat-trick, four+, three assists, perfect 10, keeper goal, super sub,
//                clean sheet runs, 3 AM games, every line played, appearance/goal/assist/MOTM milestones
//   per session  10+ game marathon, the winner in the last game of the night (autopilot session hook)
//   per month    played in every session of the month (1st of the month)
// Switch off with /manager → Club Life → Settings (club.autopilot.off has 'badges').

const { AttachmentBuilder } = require('discord.js');
const { activeClubs } = require('./manager-hub.cjs');
const { toInsightMatches, playerKey } = require('./club-insights.cjs');
const { lineOf, num, LEAVER_RATING } = require('./player-season.cjs');
const { toSessions } = require('./coach.cjs');
const { clubAccent } = require('./club-colors.cjs');
const T = require('./event-time.cjs');

const BADGES = {
  first_goal: { name: 'Off the Mark', glyph: '1G', tier: 'common', help: 'Scored a first goal for the club' },
  brace: { name: 'Brace', glyph: '2G', tier: 'common', help: 'Two goals in one game' },
  hat_trick: { name: 'Hat-trick Hero', glyph: '3G', tier: 'rare', help: 'Three goals in one game' },
  four_timer: { name: 'Haul of Four', glyph: '4G+', tier: 'epic', help: 'Four or more goals in one game' },
  provider: { name: 'The Provider', glyph: '3A', tier: 'rare', help: 'Three or more assists in one game' },
  shut_out: { name: 'Shut Out', glyph: 'CS', tier: 'common', help: 'A first clean sheet as a keeper or defender' },
  iron_curtain: { name: 'Iron Curtain', glyph: 'CS3', tier: 'rare', help: 'Three clean sheets in a row as a keeper or defender' },
  super_sub: { name: 'Super Sub', glyph: 'SUB', tier: 'rare', help: 'Joined a game late and still scored' },
  last_orders: { name: 'Last Orders', glyph: 'LO', tier: 'rare', help: 'Scored in a one-goal win in the last game of the night' },
  night_owl: { name: '3 AM Survivor', glyph: '3AM', tier: 'common', help: 'Played a game that kicked off between 2:30 and 5 AM' },
  marathon: { name: 'Marathon Night', glyph: '10+', tier: 'rare', help: 'Played 10 or more games in one session' },
  utility: { name: 'Swiss Army Knife', glyph: 'ALL', tier: 'epic', help: 'Played in goal, defence, midfield and attack' },
  ever_present: { name: 'Ever Present', glyph: 'EP', tier: 'rare', help: 'Played in every session of a month (4 or more sessions)' },
  apps50: { name: '50 Club', glyph: '50', tier: 'common', help: '50 appearances' },
  apps100: { name: 'Centurion', glyph: '100', tier: 'rare', help: '100 appearances' },
  apps250: { name: 'Club Servant', glyph: '250', tier: 'epic', help: '250 appearances' },
  apps500: { name: 'One-Club Legend', glyph: '500', tier: 'legendary', help: '500 appearances' },
  goals50: { name: 'Half-Century', glyph: '50G', tier: 'rare', help: '50 goals' },
  goals100: { name: 'Goal Machine', glyph: '100G', tier: 'epic', help: '100 goals' },
  assists50: { name: 'Creator in Chief', glyph: '50A', tier: 'rare', help: '50 assists' },
  motm10: { name: 'Main Character', glyph: 'MOTM', tier: 'rare', help: '10 Man of the Match awards' },
  perfect_ten: { name: 'Perfect 10', glyph: '10', tier: 'legendary', help: 'A 10.0 match rating' },
  keeper_goal: { name: 'Keeper Scores', glyph: 'GK!', tier: 'legendary', help: 'Scored while playing in goal' },
};
const TIER_ORDER = ['common', 'rare', 'epic', 'legendary'];
const TIER_EMOJI = { common: '🥉', rare: '🔷', epic: '🟣', legendary: '🌟' };
// Badges good enough to be worn as a frame on the player's Studio cards
const FRAME_TIERS = new Set(['rare', 'epic', 'legendary']);
const MILESTONES = [
  { stat: 'apps', at: 50, badge: 'apps50' },
  { stat: 'apps', at: 100, badge: 'apps100' },
  { stat: 'apps', at: 250, badge: 'apps250' },
  { stat: 'apps', at: 500, badge: 'apps500' },
  { stat: 'goals', at: 50, badge: 'goals50' },
  { stat: 'goals', at: 100, badge: 'goals100' },
  { stat: 'assists', at: 50, badge: 'assists50' },
  { stat: 'motm', at: 10, badge: 'motm10' },
];
const STAT_LABEL = { apps: 'appearances', goals: 'goals', assists: 'assists', motm: 'Man of the Match awards' };
const ANNOUNCE_MAX_AGE_MS = 3 * 60 * 60 * 1000;
const PAGE = 200;
const PAGES_PER_RUN = 10;
const SWEEP_EVERY_MS = 10 * 60 * 1000;
const SUPER_SUB_SHARE = 0.7;
const EVER_PRESENT_MIN_SESSIONS = 4;
const ANNOUNCE_MAX = 6;
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function emptyCareer(name) {
  return { player_name: name, apps: 0, wins: 0, goals: 0, assists: 0, motm: 0, clean_sheets: 0, braces: 0, hat_tricks: 0, cs_streak: 0, lines: {}, best_rating: null, best_match_id: null, best_match_at: null, first_match_at: null, last_match_at: null };
}

// The timezone club life uses for "3 AM" and calendar months: the server's, or US Central when unset
function clubTimezone(prefs) {
  return prefs?.timezone && prefs.timezone !== 'UTC' ? prefs.timezone : 'America/Chicago';
}

// Pure: add one match (InsightMatch) to the careers Map(key -> career) and return the badges it unlocked.
// have: Map(key -> Set(badge)) of badges already held, updated in place. tz: for the 3 AM badge.
function applyMatch(careers, have, match, tz = 'America/Chicago') {
  const earned = [];
  const players = (match.players || []).filter((p) => playerKey(p));
  const maxSeconds = Math.max(0, ...players.map((p) => num(p.seconds_played)));
  const at = match.playedAt instanceof Date ? match.playedAt : new Date(match.playedAt);
  const local = T.localParts(at, tz);
  const minutes = local.hour * 60 + local.minute;
  const lateNight = minutes >= 150 && minutes < 300;
  for (const p of players) {
    const key = playerKey(p);
    const name = String(p.ea_username).trim();
    if (!careers.has(key)) careers.set(key, emptyCareer(name));
    if (!have.has(key)) have.set(key, new Set());
    const c = careers.get(key);
    const mine = have.get(key);
    const award = (badge, detail) => {
      if (mine.has(badge)) return;
      mine.add(badge);
      earned.push({ key, name, badge, match_id: String(match.id), at: at.toISOString(), detail: detail || null });
    };
    const goals = num(p.goals);
    const assists = num(p.assists);
    const rating = num(p.rating);
    const line = lineOf(p.position);
    c.player_name = name;
    c.apps++;
    if (match.result === 'win') c.wins++;
    c.goals += goals;
    c.assists += assists;
    if (p.motm) c.motm++;
    if (line) c.lines = { ...c.lines, [line]: (c.lines?.[line] || 0) + 1 };
    if (!c.first_match_at || at < new Date(c.first_match_at)) c.first_match_at = at.toISOString();
    if (!c.last_match_at || at > new Date(c.last_match_at)) c.last_match_at = at.toISOString();
    if (rating > LEAVER_RATING && (c.best_rating == null || rating > Number(c.best_rating))) {
      c.best_rating = rating;
      c.best_match_id = String(match.id);
      c.best_match_at = at.toISOString();
    }
    const vs = `vs ${match.opponent} (${match.scoreFor}-${match.scoreAgainst})`;
    if (goals >= 2) c.braces++;
    if (goals >= 3) c.hat_tricks++;
    if (goals >= 1) award('first_goal', vs);
    if (goals === 2) award('brace', vs);
    if (goals === 3) award('hat_trick', vs);
    if (goals >= 4) award('four_timer', `${goals} goals ${vs}`);
    if (assists >= 3) award('provider', `${assists} assists ${vs}`);
    if (rating >= 10) award('perfect_ten', vs);
    if (line === 'GK' && goals > 0) award('keeper_goal', vs);
    const secs = num(p.seconds_played);
    if (goals > 0 && rating > LEAVER_RATING && secs > 0 && maxSeconds > 0 && secs < maxSeconds * SUPER_SUB_SHARE) award('super_sub', vs);
    if (line === 'GK' || line === 'DEF') {
      if (match.scoreAgainst === 0) {
        c.clean_sheets++;
        c.cs_streak++;
        award('shut_out', vs);
        if (c.cs_streak >= 3) award('iron_curtain', `${c.cs_streak} in a row`);
      } else c.cs_streak = 0;
    }
    if (lateNight) award('night_owl', `${String(local.hour).padStart(2, '0')}:${String(local.minute).padStart(2, '0')} kick-off ${vs}`);
    if (['GK', 'DEF', 'MID', 'FWD'].every((l) => c.lines?.[l] > 0)) award('utility');
    for (const m of MILESTONES) if (c[m.stat] >= m.at) award(m.badge, `${m.at} ${STAT_LABEL[m.stat]}`);
  }
  return earned;
}

// Pure: badges for one voice session (matches oldest or newest first)
function sessionBadges(session, have) {
  const earned = [];
  const games = [...session].sort((a, b) => a.playedAt - b.playedAt);
  if (!games.length) return earned;
  const award = (key, name, badge, match, detail) => {
    if (!have.has(key)) have.set(key, new Set());
    if (have.get(key).has(badge)) return;
    have.get(key).add(badge);
    earned.push({ key, name, badge, match_id: match ? String(match.id) : null, at: (match?.playedAt || new Date()).toISOString?.() || new Date().toISOString(), detail });
  };
  const counts = new Map();
  for (const m of games) for (const p of m.players || []) {
    const key = playerKey(p);
    if (key) counts.set(key, { name: String(p.ea_username).trim(), n: (counts.get(key)?.n || 0) + 1 });
  }
  const last = games[games.length - 1];
  for (const [key, { name, n }] of counts) if (n >= 10) award(key, name, 'marathon', last, `${n} games in one night`);
  if (last.result === 'win' && last.scoreFor - last.scoreAgainst === 1) {
    for (const p of last.players || []) if (num(p.goals) > 0 && playerKey(p)) award(playerKey(p), String(p.ea_username).trim(), 'last_orders', last, `${last.scoreFor}-${last.scoreAgainst} vs ${last.opponent}`);
  }
  return earned;
}

// Pure: players in every session of a set of matches (one month), when there were enough sessions
function everPresent(matches) {
  const sessions = toSessions(matches);
  if (sessions.length < EVER_PRESENT_MIN_SESSIONS) return [];
  let common = null;
  const names = new Map();
  for (const s of sessions) {
    const keys = new Set();
    for (const m of s) for (const p of m.players || []) {
      const key = playerKey(p);
      if (key) {
        keys.add(key);
        names.set(key, String(p.ea_username).trim());
      }
    }
    common = common ? new Set([...common].filter((k) => keys.has(k))) : keys;
  }
  return [...(common || [])].map((key) => ({ key, name: names.get(key), sessions: sessions.length }));
}

// Pure: the next milestone each player is close to, closest first
function milestonesInReach(careers, { maxGap = 3 } = {}) {
  const out = [];
  for (const [key, c] of careers instanceof Map ? careers : new Map(careers.map((r) => [r.player_key, r]))) {
    // One line per player: the closest milestone they have not reached
    let best = null;
    for (const m of MILESTONES) {
      const gap = m.at - num(c[m.stat]);
      const limit = m.stat === 'apps' ? maxGap : m.stat === 'motm' ? 1 : 2;
      if (gap > 0 && gap <= limit && (!best || gap < best.gap)) best = { m, gap };
    }
    if (best) {
      const { m, gap } = best;
      const label = gap === 1 ? STAT_LABEL[m.stat].replace(/ awards$/, ' award').replace(/s$/, '') : STAT_LABEL[m.stat];
      out.push({ key, name: c.player_name, stat: m.stat, at: m.at, gap, badge: m.badge, text: `**${c.player_name}** is ${gap} ${label} from ${m.at} (${BADGES[m.badge].name})` });
    }
  }
  return out.sort((a, b) => a.gap - b.gap || b.at - a.at);
}

function rarityText(holders, players) {
  if (!players) return null;
  return `${holders} of ${players} player${players === 1 ? '' : 's'}`;
}

// Rows from club_matches as toInsightMatches needs them, without pulling the whole EA match payload
function slimRow(r) {
  return { ...r, match_data: { timestamp: r.ts ?? null, _tag: r.tag ?? null, _matchCategory: r.cat ?? null } };
}

// gamertag (lowercase) -> Discord user id, for linked players
async function linkedIds(supabase, names) {
  const out = new Map();
  const spelled = [...new Set(names.filter(Boolean))];
  if (!spelled.length) return out;
  const { data } = await supabase.from('profiles').select('discord_user_id, ea_username').in('ea_username', spelled);
  for (const p of data || []) if (p.ea_username && /^\d{5,25}$/.test(String(p.discord_user_id))) out.set(p.ea_username.toLowerCase(), p.discord_user_id);
  // Mixed-case spellings (EA vs what they typed) come through ilike one by one
  const missing = spelled.filter((n) => !out.has(n.toLowerCase())).slice(0, 25);
  for (const n of missing) {
    const { data: row } = await supabase.from('profiles').select('discord_user_id').ilike('ea_username', n.replace(/[%_]/g, (c) => `\\${c}`)).limit(1).maybeSingle();
    if (row && /^\d{5,25}$/.test(String(row.discord_user_id))) out.set(n.toLowerCase(), row.discord_user_id);
  }
  return out;
}

function createCareer({ supabase, autopilot, events, getGuildState, client }) {
  const running = new Set();
  let lastSweep = 0;
  const announceHooks = [];

  async function loadState(guildId, clubKey) {
    const [{ data: rows }, { data: badges }] = await Promise.all([
      supabase.from('player_career').select('*').eq('guild_id', guildId).eq('club_key', clubKey).limit(2000),
      supabase.from('player_badges').select('player_key, badge').eq('guild_id', guildId).eq('club_key', clubKey).limit(10000),
    ]);
    const careers = new Map((rows || []).map((r) => [r.player_key, r]));
    const have = new Map();
    for (const b of badges || []) {
      if (!have.has(b.player_key)) have.set(b.player_key, new Set());
      have.get(b.player_key).add(b.badge);
    }
    return { careers, have };
  }

  const careerFields = (c) => ({
    player_name: c.player_name, apps: c.apps, wins: c.wins, goals: c.goals, assists: c.assists, motm: c.motm,
    clean_sheets: c.clean_sheets, braces: c.braces, hat_tricks: c.hat_tricks, cs_streak: c.cs_streak, lines: c.lines || {},
    best_rating: c.best_rating, best_match_id: c.best_match_id, best_match_at: c.best_match_at,
    first_match_at: c.first_match_at, last_match_at: c.last_match_at,
  });

  async function saveCareers(guildId, clubKey, careers, keys) {
    if (!keys.size) return;
    const ids = await linkedIds(supabase, [...keys].map((k) => careers.get(k)?.player_name));
    const rows = [...keys].map((k) => ({ guild_id: guildId, club_key: clubKey, player_key: k, discord_user_id: ids.get(k) || careers.get(k).discord_user_id || null, ...careerFields(careers.get(k)), updated_at: new Date().toISOString() }));
    for (let i = 0; i < rows.length; i += 200) {
      const { error } = await supabase.from('player_career').upsert(rows.slice(i, i + 200), { onConflict: 'guild_id,club_key,player_key' });
      if (error) throw new Error(`career save: ${error.message}`);
    }
  }

  async function saveBadges(guildId, clubKey, earned) {
    if (!earned.length) return [];
    const ids = await linkedIds(supabase, earned.map((e) => e.name));
    const rows = earned.map((e) => ({ guild_id: guildId, club_key: clubKey, player_key: e.key, player_name: e.name, discord_user_id: ids.get(e.key) || null, badge: e.badge, tier: BADGES[e.badge].tier, earned_at: e.at, match_id: e.match_id, detail: e.detail }));
    for (let i = 0; i < rows.length; i += 200) {
      const { error } = await supabase.from('player_badges').upsert(rows.slice(i, i + 200), { onConflict: 'guild_id,club_key,player_key,badge', ignoreDuplicates: true });
      if (error) throw new Error(`badge save: ${error.message}`);
    }
    return rows;
  }

  // One short line per badge and the medals image, in the club's recap channel
  async function announce(guildId, club, earned) {
    if (!earned.length || !autopilot.isOn(club, 'badges')) return;
    const { count: players } = await supabase.from('player_career').select('player_key', { count: 'exact', head: true }).eq('guild_id', guildId).eq('club_key', club.key);
    const { data: holders } = await supabase.from('player_badges').select('badge').eq('guild_id', guildId).eq('club_key', club.key).in('badge', [...new Set(earned.map((e) => e.badge))]);
    const held = new Map();
    for (const h of holders || []) held.set(h.badge, (held.get(h.badge) || 0) + 1);
    const ids = await linkedIds(supabase, earned.map((e) => e.name));
    const sorted = [...earned].sort((a, b) => TIER_ORDER.indexOf(BADGES[b.badge].tier) - TIER_ORDER.indexOf(BADGES[a.badge].tier));
    const shown = sorted.slice(0, ANNOUNCE_MAX);
    const lines = shown.map((e) => {
      const b = BADGES[e.badge];
      const who = ids.get(e.key) ? `<@${ids.get(e.key)}>` : `**${e.name}**`;
      return `${TIER_EMOJI[b.tier]} ${who} unlocked **${b.name}** · ${b.tier}, ${rarityText(held.get(e.badge) || 1, players || 0) || 'first in the club'}${e.detail ? ` · ${e.detail}` : ''}`;
    });
    if (sorted.length > shown.length) lines.push(`…and ${sorted.length - shown.length} more on the website's badge walls.`);
    const channel = await autopilot.postChannel(guildId, club);
    if (!channel) return;
    let files = [];
    try {
      const prefs = await events.serverPrefs(guildId);
      const png = require('./graphics-club-life.cjs').badgeStrip({
        entries: shown.map((e) => ({ playerName: e.name, name: BADGES[e.badge].name, glyph: BADGES[e.badge].glyph, tier: BADGES[e.badge].tier, rarity: rarityText(held.get(e.badge) || 1, players || 0) })),
        clubName: club.name,
        accent: clubAccent(club, prefs.branding, undefined),
      });
      files = [new AttachmentBuilder(png, { name: 'badges.png' })];
    } catch (err) {
      console.warn(`[career] badge image failed: ${err.message}`);
    }
    await channel.send({ content: lines.join('\n').slice(0, 2000), files, allowedMentions: { parse: [] } }).catch((err) => console.warn(`[career] badge post failed: ${err.message}`));
    for (const hook of announceHooks) await hook(guildId, club, shown).catch(() => {});
  }

  // Read every match synced since the club's career cursor. The first run reads the club's whole history
  // without announcing anything; later runs announce badges from games played in the last few hours.
  async function processClub(guildId, clubKey) {
    const lock = `${guildId}|${clubKey}`;
    if (running.has(lock)) return;
    running.add(lock);
    try {
      const state = await getGuildState(guildId);
      const club = state?.clubs?.find((c) => c.key === clubKey);
      if (!club?.ea_club_id) return;
      const cursor = club.autopilot?.career_cursor || null;
      const backfill = !cursor;
      const prefs = await events.serverPrefs(guildId).catch(() => ({}));
      const tz = clubTimezone(prefs);
      const { careers, have } = await loadState(guildId, clubKey);
      const touched = new Set();
      const earned = [];
      let last = cursor;
      for (let page = 0; page < PAGES_PER_RUN; page++) {
        let q = supabase
          .from('club_matches')
          .select('id, created_at, result, score_for, score_against, match_type, opponent_club_name, player_stats, ts:match_data->timestamp, tag:match_data->_tag, cat:match_data->_matchCategory')
          .eq('guild_id', guildId)
          .eq('club_key', clubKey)
          .order('created_at', { ascending: true })
          .limit(PAGE);
        if (last) q = q.gt('created_at', last);
        const { data, error } = await q;
        if (error) throw new Error(error.message);
        if (!data?.length) break;
        const matches = toInsightMatches(data.map(slimRow)).reverse();
        for (const m of matches) {
          for (const p of m.players) if (playerKey(p)) touched.add(playerKey(p));
          earned.push(...applyMatch(careers, have, m, tz));
        }
        last = data[data.length - 1].created_at;
        if (data.length < PAGE) break;
      }
      if (last === cursor) return;
      await saveCareers(guildId, clubKey, careers, touched);
      await saveBadges(guildId, clubKey, earned);
      await autopilot.updateClub(guildId, clubKey, (ap) => {
        ap.career_cursor = last;
      });
      if (!backfill) {
        const fresh = earned.filter((e) => Date.now() - new Date(e.at).getTime() < ANNOUNCE_MAX_AGE_MS);
        await announce(guildId, club, fresh);
      }
    } finally {
      running.delete(lock);
    }
  }

  // Session badges: from the autopilot session hook (adds nothing to the recap itself)
  async function onSessionEnd({ guildId, club, matches }) {
    if (!club.autopilot?.career_cursor) return null;
    const { have } = await loadState(guildId, club.key);
    const earned = sessionBadges(matches, have);
    const saved = await saveBadges(guildId, club.key, earned);
    if (saved.length) await announce(guildId, club, earned);
    return null;
  }

  // 1st of the month: Ever Present for last month's sessions
  async function monthly(guildId, club, now, tz, loadMatches) {
    const local = T.localParts(now, tz);
    if (local.day !== 1 || local.hour < 12) return;
    const monthKey = `${local.year}-${String(local.month).padStart(2, '0')}`;
    if (club.autopilot?.ever_present_month === monthKey || !club.autopilot?.career_cursor) return;
    await autopilot.updateClub(guildId, club.key, (ap) => {
      ap.ever_present_month = monthKey;
    });
    const end = T.zonedToUtc(local.year, local.month, 1, 0, 0, tz);
    const prevMonth = local.month === 1 ? 12 : local.month - 1;
    const prevYear = local.month === 1 ? local.year - 1 : local.year;
    const start = T.zonedToUtc(prevYear, prevMonth, 1, 0, 0, tz);
    const all = await loadMatches(guildId, club.key).catch(() => []);
    const month = all.filter((m) => m.playedAt >= start && m.playedAt < end);
    const { have } = await loadState(guildId, club.key);
    const earned = [];
    for (const p of everPresent(month)) {
      if (have.get(p.key)?.has('ever_present')) continue;
      earned.push({ key: p.key, name: p.name, badge: 'ever_present', match_id: null, at: now.toISOString(), detail: `all ${p.sessions} sessions in ${MONTH_NAMES[prevMonth - 1]}` });
    }
    const saved = await saveBadges(guildId, club.key, earned);
    if (saved.length) await announce(guildId, club, earned);
  }

  async function sweep(now, loadMatches) {
    if (now.getTime() - lastSweep < SWEEP_EVERY_MS) return;
    lastSweep = now.getTime();
    for (const guild of client()?.guilds.cache.values() || []) {
      const state = await getGuildState(guild.id);
      const prefs = await events.serverPrefs(guild.id).catch(() => ({}));
      for (const club of activeClubs(state).filter((c) => c.ea_club_id)) {
        await processClub(guild.id, club.key).catch((err) => console.warn(`[career] ${guild.id}/${club.key} failed: ${err.message}`));
        if (loadMatches) await monthly(guild.id, club, now, clubTimezone(prefs), loadMatches).catch((err) => console.warn(`[career] monthly ${club.key} failed: ${err.message}`));
      }
    }
  }

  // ---------- Reads for panels, the programme and Wrapped ----------

  async function careersFor(guildId, clubKey) {
    const { data } = await supabase.from('player_career').select('*').eq('guild_id', guildId).eq('club_key', clubKey).limit(2000);
    return data || [];
  }

  async function badgesOf(guildId, { clubKey, playerKey: key, discordUserId } = {}) {
    let q = supabase.from('player_badges').select('*').eq('guild_id', guildId).order('earned_at', { ascending: false }).limit(500);
    if (clubKey) q = q.eq('club_key', clubKey);
    if (key) q = q.eq('player_key', key);
    if (discordUserId) q = q.eq('discord_user_id', discordUserId);
    const { data } = await q;
    return data || [];
  }

  // The badge a player wears as their Studio card frame (null when none)
  async function featuredFor(guildId, discordUserId) {
    if (!discordUserId) return null;
    const { data } = await supabase.from('player_badges').select('badge, tier').eq('guild_id', guildId).eq('discord_user_id', discordUserId).eq('featured', true).limit(1).maybeSingle();
    return data && BADGES[data.badge] ? { badge: data.badge, tier: data.tier, ...BADGES[data.badge] } : null;
  }

  async function setFeatured(guildId, discordUserId, badge) {
    await supabase.from('player_badges').update({ featured: false }).eq('guild_id', guildId).eq('discord_user_id', discordUserId).eq('featured', true);
    if (!badge) return true;
    const { data } = await supabase.from('player_badges').update({ featured: true }).eq('guild_id', guildId).eq('discord_user_id', discordUserId).eq('badge', badge).select('id');
    return !!data?.length;
  }

  autopilot.onNewMatches((guildId, club) => processClub(guildId, club.key));
  autopilot.onSessionEnd((ctx) => onSessionEnd(ctx).catch((err) => console.warn(`[career] session badges failed: ${err.message}`)));

  return {
    processClub,
    sweep,
    careersFor,
    badgesOf,
    featuredFor,
    setFeatured,
    linkedIds: (names) => linkedIds(supabase, names),
    // fn(guildId, club, earned) after badges are announced (the Chronicle's "Around the club" uses them)
    onAnnounce: (fn) => announceHooks.push(fn),
  };
}

module.exports = { createCareer, applyMatch, sessionBadges, everPresent, milestonesInReach, rarityText, clubTimezone, linkedIds, BADGES, TIER_ORDER, TIER_EMOJI, FRAME_TIERS, MILESTONES };
