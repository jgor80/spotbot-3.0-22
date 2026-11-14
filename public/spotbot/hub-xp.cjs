// Hub XP: the Social Hub's game layer, for players rather than teams. XP counts across every lobby and
// team club on the server, so it works the same whether you drop in or play for a side:
//   time in a voice channel of any club with at least one other player, every game (EA matches, or
//   Next game in a lobby with no EA club), wins, goals and assists, calling a game, unlocked badges
//   and the weekly challenges.
// Levels climb a curve, and the tier roles (Rookie, Regular, Starter, Veteran, Legend) follow the
// level. Three challenges a week (same for everyone, reset Monday UTC), social badges, and a weekly
// winner posted in the hub feed. Nothing here pings a player. Stored in hub_players; the website's
// Hub page (src/lib/hubXp.ts must match the badges, tiers and challenges here) reads the same rows.

const { EmbedBuilder, PermissionsBitField } = require('discord.js');

const F = PermissionsBitField.Flags;
const GOLD = 0xf1c40f;
const NO_PINGS = { parse: [] };
const TICK_MS = 5 * 60 * 1000;
const MAX_MATES = 300;

const XP = { voiceTick: 1, game: 20, win: 10, goal: 5, assist: 3, call: 15, challenge: 150, allChallenges: 200, referral: 100 };
const BADGE_XP = { common: 50, rare: 100, epic: 250, legendary: 500 };

const TIERS = [
  { level: 1, key: 'rookie', name: 'Rookie', emoji: '🌱' },
  { level: 5, key: 'regular', name: 'Regular', emoji: '⚽' },
  { level: 10, key: 'starter', name: 'Starter', emoji: '⭐' },
  { level: 20, key: 'veteran', name: 'Veteran', emoji: '🎖️' },
  { level: 35, key: 'legend', name: 'Legend', emoji: '👑' },
];

const HUB_BADGES = {
  regular: { name: 'Drop-in Regular', tier: 'common', help: 'Played 25 games in the hub' },
  hub_veteran: { name: 'Hub Veteran', tier: 'rare', help: 'Played 100 games in the hub' },
  hub_legend: { name: 'Hub Legend', tier: 'epic', help: 'Played 500 games in the hub' },
  connector: { name: 'Connector', tier: 'rare', help: 'Played with 25 different people' },
  social_butterfly: { name: 'Social Butterfly', tier: 'epic', help: 'Played with 100 different people' },
  lobby_hopper: { name: 'Lobby Hopper', tier: 'rare', help: 'Played in every lobby (3 or more)' },
  streak3: { name: 'On a Roll', tier: 'common', help: 'Played 3 days in a row' },
  streak7: { name: 'Week Warrior', tier: 'rare', help: 'Played 7 days in a row' },
  streak30: { name: 'Ever-present', tier: 'legendary', help: 'Played 30 days in a row' },
  caller: { name: 'Caller', tier: 'common', help: 'Started 5 games' },
  full_week: { name: 'Clean Sweep', tier: 'rare', help: 'Finished all three weekly challenges' },
  weekly_winner: { name: 'Player of the Week', tier: 'epic', help: 'Most XP in the hub in a week' },
  kitted_out: { name: 'Kitted Out', tier: 'common', help: 'Finished the welcome setup' },
  recruiter: { name: 'Recruiter', tier: 'rare', help: 'Brought a friend who played a game' },
  talent_scout: { name: 'Talent Scout', tier: 'epic', help: 'Brought 5 friends who played' },
};

const CHALLENGES = {
  games: { target: 5, text: 'Play 5 games' },
  wins: { target: 3, text: 'Win 3 games' },
  goals: { target: 3, text: 'Score 3 goals' },
  assists: { target: 3, text: 'Get 3 assists' },
  mates: { target: 10, text: 'Play with 10 different people' },
  positions: { target: 3, text: 'Play 3 different positions' },
  days: { target: 3, text: 'Play on 3 different days' },
  minutes: { target: 180, text: 'Spend 3 hours in the lobbies' },
  lobbies: { target: 2, text: 'Play in 2 different lobbies' },
};
// One challenge anyone can finish without an EA link, one about games, and one from the rest
const SOCIAL_CHALLENGES = ['mates', 'positions', 'days', 'minutes', 'lobbies'];
const GAME_CHALLENGES = ['games', 'wins'];

// ---------- Pure ----------

const xpForLevel = (n) => 50 * n * (n - 1);
function levelFor(xp) {
  let n = 1;
  while (xpForLevel(n + 1) <= (xp || 0)) n++;
  return n;
}
function tierFor(level) {
  let t = TIERS[0];
  for (const x of TIERS) if (level >= x.level) t = x;
  return t;
}

// Monday (UTC) of the week a date falls in, as YYYY-MM-DD
function weekKeyOf(date = new Date()) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}
const dayKeyOf = (date = new Date()) => date.toISOString().slice(0, 10);
const prevDay = (day) => dayKeyOf(new Date(new Date(`${day}T00:00:00Z`).getTime() - 86400000));

function hash(s) {
  let h = 2166136261;
  for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  return h;
}

// This week's three challenges, the same for everyone
function challengesFor(weekKey) {
  const h = hash(weekKey);
  const social = SOCIAL_CHALLENGES[h % SOCIAL_CHALLENGES.length];
  const game = GAME_CHALLENGES[(h >>> 4) % GAME_CHALLENGES.length];
  const rest = Object.keys(CHALLENGES).filter((k) => k !== social && k !== game);
  return [social, game, rest[(h >>> 8) % rest.length]];
}

const sizeOf = (v) => (Array.isArray(v) ? v.length : Number(v) || 0);
const progressOf = (week, key) => Math.min(CHALLENGES[key].target, sizeOf(week?.[key]));

function blankRow(guildId, userId) {
  return { guild_id: guildId, discord_user_id: userId, xp: 0, level: 1, games: 0, wins: 0, goals: 0, assists: 0, voice_minutes: 0, calls: 0, referrals: 0, mates: [], lobbies: [], badges: [], streak: 0, best_streak: 0, last_day: null, week_key: null, week_xp: 0, week: {} };
}

const addAll = (list, items, max = Infinity) => {
  const set = new Set(list || []);
  for (const x of items || []) if (x) set.add(x);
  return [...set].slice(-max);
};

// Apply one burst of activity to a player's row. Returns the new row and what happened, for the feed.
// activity: { minutes, voiceTicks, games, wins, goals, assists, calls, mates[], positions[], lobby }
// ctx: { now, lobbyKeys[] }
function applyActivity(row, activity, ctx = {}) {
  const now = ctx.now || new Date();
  const r = { ...row, mates: [...(row.mates || [])], lobbies: [...(row.lobbies || [])], badges: [...(row.badges || [])] };
  const a = activity || {};
  const week = weekKeyOf(now);
  if (r.week_key !== week) {
    r.week_key = week;
    r.week_xp = 0;
    r.week = {};
  }
  const w = { ...(r.week || {}) };
  let gained = 0;

  const games = a.games || 0;
  const played = games > 0 || (a.minutes || 0) > 0;
  r.games += games;
  r.wins += a.wins || 0;
  r.goals += a.goals || 0;
  r.assists += a.assists || 0;
  r.voice_minutes += a.minutes || 0;
  r.calls += a.calls || 0;
  r.referrals = (r.referrals || 0) + (a.referrals || 0);
  gained += (a.voiceTicks || 0) * XP.voiceTick + games * XP.game + (a.wins || 0) * XP.win + (a.goals || 0) * XP.goal + (a.assists || 0) * XP.assist + (a.calls || 0) * XP.call + (a.referrals || 0) * XP.referral;
  r.mates = addAll(r.mates, a.mates, MAX_MATES);
  if (a.lobby) r.lobbies = addAll(r.lobbies, [a.lobby]);

  // Day streak: consecutive UTC days with play
  const day = dayKeyOf(now);
  if (played && r.last_day !== day) {
    r.streak = r.last_day === prevDay(day) ? (r.streak || 0) + 1 : 1;
    r.best_streak = Math.max(r.best_streak || 0, r.streak);
    r.last_day = day;
  }

  // This week's counters
  for (const k of ['games', 'wins', 'goals', 'assists', 'minutes']) w[k] = (w[k] || 0) + (a[k] || 0);
  w.mates = addAll(w.mates, a.mates, 50);
  w.positions = addAll(w.positions, a.positions, 20);
  if (played) w.days = addAll(w.days, [day], 7);
  if (a.lobby) w.lobbies = addAll(w.lobbies, [a.lobby], 20);
  const done = new Set(w.done || []);
  const challengesDone = [];
  for (const key of challengesFor(week)) {
    if (!done.has(key) && progressOf(w, key) >= CHALLENGES[key].target) {
      done.add(key);
      challengesDone.push(key);
      gained += XP.challenge;
    }
  }
  w.done = [...done];
  if (challengesDone.length && done.size === 3) gained += XP.allChallenges;

  // Badges
  const have = new Set(r.badges);
  const earn = (key, ok) => {
    if (ok && !have.has(key)) {
      have.add(key);
      newBadges.push(key);
      gained += BADGE_XP[HUB_BADGES[key].tier];
    }
  };
  const newBadges = [];
  earn('regular', r.games >= 25);
  earn('hub_veteran', r.games >= 100);
  earn('hub_legend', r.games >= 500);
  earn('connector', r.mates.length >= 25);
  earn('social_butterfly', r.mates.length >= 100);
  const lobbyKeys = ctx.lobbyKeys || [];
  earn('lobby_hopper', lobbyKeys.length >= 3 && lobbyKeys.every((k) => r.lobbies.includes(k)));
  earn('streak3', r.streak >= 3);
  earn('streak7', r.streak >= 7);
  earn('streak30', r.streak >= 30);
  earn('caller', r.calls >= 5);
  earn('full_week', done.size === 3);
  earn('recruiter', r.referrals >= 1);
  earn('talent_scout', r.referrals >= 5);
  for (const key of a.badges || []) earn(key, true);
  r.badges = [...have];

  const before = r.level || levelFor(r.xp);
  r.xp += gained;
  r.week_xp = (r.week_xp || 0) + gained;
  r.week = w;
  r.level = levelFor(r.xp);
  return { row: r, gained, newBadges, challengesDone, levelUp: r.level > before ? r.level : null, tierUp: tierFor(r.level).key !== tierFor(before).key ? tierFor(r.level) : null };
}

function bar(value, max, width = 12) {
  const n = Math.max(0, Math.min(width, Math.round((value / Math.max(1, max)) * width)));
  return '█'.repeat(n) + '░'.repeat(width - n);
}

function createHubXp(deps) {
  const { supabase, hubOf, saveHub, getGuildState, linkedIds } = deps;
  const client = () => deps.client();
  const chemistry = () => deps.chemistry?.();
  const onFirstGame = (...a) => deps.onFirstGame?.(...a);
  const locks = new Map();

  // One write at a time per server, so a tick and a match never overwrite each other
  function locked(guildId, fn) {
    const prev = locks.get(guildId) || Promise.resolve();
    const next = prev.then(fn, fn);
    locks.set(guildId, next.catch(() => {}));
    return next;
  }

  async function loadRows(guildId, ids) {
    const { data, error } = await supabase.from('hub_players').select('*').eq('guild_id', guildId).in('discord_user_id', ids);
    if (error) throw new Error(error.message);
    return new Map((data || []).map((r) => [r.discord_user_id, r]));
  }

  // Apply activity for several players, save, and tell the feed what they unlocked
  function record(guildId, perUser) {
    if (!perUser.size) return Promise.resolve([]);
    return locked(guildId, async () => {
      const hub = await hubOf(guildId);
      if (!hub.on) return [];
      const ids = [...perUser.keys()];
      const rows = await loadRows(guildId, ids);
      const now = new Date();
      const results = [];
      for (const id of ids) {
        const res = applyActivity(rows.get(id) || blankRow(guildId, id), perUser.get(id), { now, lobbyKeys: hub.lobbies || [] });
        res.row.updated_at = now.toISOString();
        const before = rows.get(id);
        results.push({ id, isNew: !before, firstGame: !(before?.games > 0) && res.row.games > 0, ...res });
      }
      const { error } = await supabase.from('hub_players').upsert(results.map((r) => r.row), { onConflict: 'guild_id,discord_user_id' });
      if (error) throw new Error(error.message);
      await announce(guildId, hub, results).catch((err) => console.warn(`[hub-xp] announce failed: ${err.message}`));
      // After the lock: a referral reward records XP for the inviter, which takes the lock again
      const first = results.filter((r) => r.firstGame).map((r) => r.id);
      if (first.length) setImmediate(() => Promise.resolve(onFirstGame(guildId, first)).catch((err) => console.warn(`[hub-xp] first game hook failed: ${err.message}`)));
      return results;
    });
  }

  // ---------- Feed and roles ----------

  async function feedChannel(guild, hub) {
    if (!hub.feed_channel_id) return null;
    const ch = await guild.channels.fetch(hub.feed_channel_id).catch(() => null);
    return ch?.send ? ch : null;
  }

  async function tierRole(guild, tier) {
    const name = `${tier.emoji} ${tier.name}`;
    let role = guild.roles.cache.find((r) => r.name === name);
    if (!role && guild.members.me?.permissions?.has(F.ManageRoles)) {
      role = await guild.roles.create({ name, hoist: tier.level >= 10, reason: 'GafferBot Social Hub level tier' }).catch(() => null);
    }
    return role;
  }

  // A member holds only the role for their current tier
  async function syncTierRole(guild, userId, level) {
    if (!guild.members.me?.permissions?.has(F.ManageRoles)) return;
    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member?.roles) return;
    const tier = tierFor(level);
    for (const t of TIERS) {
      const role = t.key === tier.key ? await tierRole(guild, t) : guild.roles.cache.find((r) => r.name === `${t.emoji} ${t.name}`);
      if (!role) continue;
      const has = member.roles.cache.has(role.id);
      if (t.key === tier.key && !has) await member.roles.add(role).catch(() => {});
      if (t.key !== tier.key && has) await member.roles.remove(role).catch(() => {});
    }
  }

  async function announce(guildId, hub, results) {
    const guild = client()?.guilds.cache.get(guildId);
    if (!guild) return;
    const lines = [];
    for (const r of results) {
      // New players get the Rookie role; after that the role only changes with the tier
      if (r.tierUp || r.isNew) await syncTierRole(guild, r.id, r.row.level);
      if (r.tierUp) lines.push(`${r.tierUp.emoji} <@${r.id}> is now a **${r.tierUp.name}** (level ${r.row.level})!`);
      else if (r.levelUp) lines.push(`⬆️ <@${r.id}> reached **level ${r.levelUp}**`);
      for (const b of r.newBadges) lines.push(`🏅 <@${r.id}> unlocked **${HUB_BADGES[b].name}**: ${HUB_BADGES[b].help.toLowerCase()}`);
      for (const c of r.challengesDone) lines.push(`✅ <@${r.id}> finished this week's challenge: **${CHALLENGES[c].text}**`);
    }
    if (!lines.length) return;
    const ch = await feedChannel(guild, hub);
    if (ch) await ch.send({ content: lines.join('\n').slice(0, 2000), allowedMentions: NO_PINGS }).catch(() => {});
  }

  // ---------- Activity sources ----------

  // Every 5 minutes: anyone in a club voice channel with at least one other player earns voice XP
  async function voiceTick() {
    const c = client();
    if (!c?.guilds) return;
    for (const guild of c.guilds.cache.values()) {
      const hub = await hubOf(guild.id).catch(() => ({}));
      if (!hub.on) continue;
      const state = await getGuildState(guild.id);
      const perUser = new Map();
      const groups = [];
      for (const club of (state?.clubs || []).filter((x) => x.enabled)) {
        const vc = guild.channels.cache.get(state.clubVcLinks?.[club.key]);
        const ids = vc?.members ? [...vc.members.values()].filter((m) => !m.user?.bot && !m.voice?.selfDeaf).map((m) => m.id) : [];
        if (ids.length < 2) continue;
        groups.push({ ids, minutes: 5 });
        const slots = state.boardState?.[club.key]?.slots || [];
        for (const id of ids) {
          const pos = slots.find((s) => s.takenBy === id)?.label;
          perUser.set(id, { minutes: 5, voiceTicks: 1, mates: ids.filter((x) => x !== id), positions: pos ? [pos] : [], lobby: club.key });
        }
      }
      await record(guild.id, perUser).catch((err) => console.warn(`[hub-xp] voice tick failed for ${guild.id}: ${err.message}`));
      await chemistry()?.record(guild.id, groups).catch((err) => console.warn(`[hub-xp] chemistry tick failed: ${err.message}`));
      await weeklyWinner(guild, hub).catch((err) => console.warn(`[hub-xp] weekly post failed: ${err.message}`));
    }
  }

  // New EA games for any club on a hub server
  async function onNewMatches(guildId, club, recent) {
    const hub = await hubOf(guildId);
    if (!hub.on || !recent?.length || !linkedIds) return;
    const names = recent.flatMap((m) => (m.players || []).map((p) => p.ea_username)).filter(Boolean);
    const ids = await linkedIds(names);
    const perUser = new Map();
    const groups = [];
    for (const m of recent) {
      const inGame = (m.players || []).map((p) => ({ p, id: ids.get(String(p.ea_username || '').toLowerCase()) })).filter((x) => x.id);
      groups.push({ ids: inGame.map((x) => x.id), games: 1, result: m.result });
      for (const { p, id } of inGame) {
        const a = perUser.get(id) || { games: 0, wins: 0, goals: 0, assists: 0, mates: [], positions: [], lobby: club.key };
        a.games += 1;
        a.wins += m.result === 'win' ? 1 : 0;
        a.goals += Number(p.goals) || 0;
        a.assists += Number(p.assists) || 0;
        a.mates = addAll(a.mates, inGame.map((x) => x.id).filter((x) => x !== id));
        if (p.position) a.positions = addAll(a.positions, [String(p.position).toUpperCase()]);
        perUser.set(id, a);
      }
    }
    await record(guildId, perUser);
    await chemistry()?.record(guildId, groups);
  }

  // Next game in a lobby with no EA club: everyone who was on the board played one
  async function onGame(guildId, club, ids) {
    if (club.ea_club_id) return; // the EA sync counts it instead
    const perUser = new Map(ids.map((id) => [id, { games: 1, mates: ids.filter((x) => x !== id), lobby: club.key }]));
    await record(guildId, perUser);
    await chemistry()?.record(guildId, [{ ids, games: 1 }]);
  }

  async function onCall(guildId, userId) {
    if (userId) await record(guildId, new Map([[userId, { calls: 1 }]]));
  }

  // Monday: last week's top three in the feed, and Player of the Week for the winner
  async function weeklyWinner(guild, hub) {
    const last = weekKeyOf(new Date(Date.now() - 7 * 86400000));
    if (hub.week_posted === last) return;
    const { data } = await supabase.from('hub_players').select('discord_user_id, week_xp').eq('guild_id', guild.id).eq('week_key', last).gt('week_xp', 0).order('week_xp', { ascending: false }).limit(3);
    await saveHub(guild.id, { ...hub, week_posted: last });
    if (!data?.length) return;
    await record(guild.id, new Map([[data[0].discord_user_id, { badges: ['weekly_winner'] }]]));
    const ch = await feedChannel(guild, hub);
    const medals = ['🥇', '🥈', '🥉'];
    if (ch) {
      await ch.send({
        embeds: [new EmbedBuilder().setTitle('🏆 Last week in the hub').setColor(GOLD).setDescription(data.map((r, i) => `${medals[i]} <@${r.discord_user_id}>: **${r.week_xp} XP**`).join('\n') + `\n\n<@${data[0].discord_user_id}> is **Player of the Week**. New challenges are up: press **My XP** on the board.`)],
        allowedMentions: NO_PINGS,
      }).catch(() => {});
    }
  }

  // ---------- Views ----------

  async function meCard(guildId, userId) {
    const { data: row } = await supabase.from('hub_players').select('*').eq('guild_id', guildId).eq('discord_user_id', userId).maybeSingle();
    const r = row || blankRow(guildId, userId);
    const level = levelFor(r.xp);
    const tier = tierFor(level);
    const into = r.xp - xpForLevel(level);
    const span = xpForLevel(level + 1) - xpForLevel(level);
    const week = weekKeyOf();
    const w = r.week_key === week ? r.week || {} : {};
    const done = new Set(w.done || []);
    const challenges = challengesFor(week).map((k) => `${done.has(k) ? '✅' : '▫️'} ${CHALLENGES[k].text} (${progressOf(w, k)}/${CHALLENGES[k].target})`);
    const next = TIERS.find((t) => t.level > level);
    return new EmbedBuilder()
      .setTitle(`${tier.emoji} Level ${level} ${tier.name}`)
      .setColor(GOLD)
      .setDescription(`<@${userId}> · **${r.xp} XP**\n\`${bar(into, span)}\` ${into}/${span} to level ${level + 1}${next ? ` · ${next.emoji} ${next.name} at level ${next.level}` : ''}`)
      .addFields(
        { name: `This week (${r.week_key === week ? r.week_xp : 0} XP)`, value: challenges.join('\n') + '\nAll three: +200 XP bonus' },
        { name: 'Hub career', value: `${r.games} games · ${r.wins} wins · ${r.goals}G ${r.assists}A\n${Math.round(r.voice_minutes / 60)}h in lobbies · played with ${r.mates.length} people · ${r.streak || 0}-day streak (best ${r.best_streak || 0})` },
        { name: `Badges (${r.badges.length}/${Object.keys(HUB_BADGES).length})`, value: r.badges.length ? r.badges.map((b) => `🏅 ${HUB_BADGES[b]?.name || b}`).join(' · ').slice(0, 1024) : 'None yet: play a few games!' }
      )
      .setFooter({ text: 'XP: 1 per 5 min in voice with others · 20 per game · +10 win · +5 goal · +3 assist · +15 for starting a game' });
  }

  async function leaderboard(guildId, period = 'week', limit = 10) {
    let q = supabase.from('hub_players').select('discord_user_id, xp, week_xp, level').eq('guild_id', guildId);
    q = period === 'week' ? q.eq('week_key', weekKeyOf()).gt('week_xp', 0).order('week_xp', { ascending: false }) : q.gt('xp', 0).order('xp', { ascending: false });
    const { data } = await q.limit(limit);
    return data || [];
  }

  async function leaderboardEmbed(guildId) {
    const [week, all] = await Promise.all([leaderboard(guildId, 'week'), leaderboard(guildId, 'all')]);
    const fmt = (rows, field) => rows.map((r, i) => `${i < 3 ? ['🥇', '🥈', '🥉'][i] : `${i + 1}.`} <@${r.discord_user_id}> · ${r[field]} XP · ${tierFor(levelFor(r.xp)).emoji} L${levelFor(r.xp)}`).join('\n') || 'Nobody yet';
    return new EmbedBuilder()
      .setTitle('🏆 Hub leaderboard')
      .setColor(GOLD)
      .addFields({ name: 'This week', value: fmt(week, 'week_xp'), inline: true }, { name: 'All time', value: fmt(all, 'xp'), inline: true })
      .setFooter({ text: 'Most XP this week becomes Player of the Week on Monday' });
  }

  // A short line for the hub board
  async function boardLine(guildId) {
    const top = await leaderboard(guildId, 'week', 3).catch(() => []);
    return top.length ? `🏆 This week: ${top.map((r, i) => `${['🥇', '🥈', '🥉'][i]} <@${r.discord_user_id}> ${r.week_xp}`).join(' · ')}` : null;
  }

  const timer = setInterval(() => voiceTick().catch((err) => console.warn(`[hub-xp] tick failed: ${err.message}`)), TICK_MS);
  timer.unref?.();

  return { record, voiceTick, onNewMatches, onGame, onCall, meCard, leaderboard, leaderboardEmbed, boardLine, syncTierRole, weeklyWinner };
}

module.exports = { createHubXp, applyActivity, blankRow, levelFor, xpForLevel, tierFor, weekKeyOf, challengesFor, HUB_BADGES, CHALLENGES, TIERS, XP };
