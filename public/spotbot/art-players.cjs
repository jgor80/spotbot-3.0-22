// Who may appear in player artwork.
// Group art features only the club's most active players (EA matches played recently), and no
// image is generated or reused for anyone who has left the Discord server.

const ACTIVE_DAYS = 30; // window for "recently active"
const ACTIVE_POOL = 8; // only the top players by games played are eligible for group art
const GROUP_SIZE = 5; // club-art's limit for one group render

// Discord IDs from `ids` that are still members of `guild`, in order. Without a connected
// guild (tests, offline tooling) nothing can be checked, so the list is returned unchanged.
async function stillInGuild(guild, ids) {
  if (!guild?.members?.fetch || !ids.length) return ids;
  const kept = await Promise.all(ids.map((id) => guild.members.fetch(id).then((m) => !!m, () => false)));
  return ids.filter((_, i) => kept[i]);
}

// Games each Discord ID played for this club in the last ACTIVE_DAYS, from synced EA matches.
async function recentGames(supabase, guildId, club, ids, now = Date.now()) {
  const games = new Map(ids.map((id) => [id, 0]));
  if (!ids.length) return games;
  const { data: profiles } = await supabase.from('profiles').select('discord_user_id, ea_username').in('discord_user_id', ids);
  const idByName = new Map();
  for (const p of Array.isArray(profiles) ? profiles : []) if (p?.ea_username) idByName.set(String(p.ea_username).trim().toLowerCase(), p.discord_user_id);
  if (!idByName.size) return games;
  let q = supabase.from('club_matches').select('player_stats').eq('guild_id', guildId).gte('created_at', new Date(now - ACTIVE_DAYS * 864e5).toISOString());
  if (club?.key) q = q.eq('club_key', club.key);
  const { data: matches } = await q.order('created_at', { ascending: false }).limit(300);
  for (const m of Array.isArray(matches) ? matches : []) {
    const seen = new Set();
    for (const p of Array.isArray(m?.player_stats) ? m.player_stats : []) {
      const id = idByName.get(String(p?.ea_username || '').trim().toLowerCase());
      if (id && games.has(id) && !seen.has(id)) { seen.add(id); games.set(id, games.get(id) + 1); }
    }
  }
  return games;
}

// The pool group art draws from: most games first, capped at ACTIVE_POOL. When nobody on the
// roster has a recent game (off-season, EA not linked) the whole eligible roster is the pool.
function activePool(ids, games) {
  const ranked = ids.map((id, i) => ({ id, i, n: games.get(id) || 0 })).sort((a, b) => b.n - a.n || a.i - b.i);
  const played = ranked.filter((r) => r.n > 0);
  return (played.length ? played.slice(0, ACTIVE_POOL) : ranked).map((r) => r.id);
}

// Up to GROUP_SIZE players from the pool, rotated so posts vary; a chosen lead stays in front
// only when they are in the pool themselves.
function pickGroup(pool, leadId, rng = Math.random) {
  const list = [...pool];
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  if (leadId && list.includes(leadId)) return [leadId, ...list.filter((id) => id !== leadId)].slice(0, GROUP_SIZE);
  return list.slice(0, GROUP_SIZE);
}

module.exports = { stillInGuild, recentGames, activePool, pickGroup, ACTIVE_DAYS, ACTIVE_POOL, GROUP_SIZE };
