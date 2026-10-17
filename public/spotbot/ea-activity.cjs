// Which clubs are playing right now, so EA is polled often only while a club is in session.
// A club counts as playing while 2+ people are in its linked voice channel (any voice channel in
// the server when it has none linked), while someone holds one of its spots, or while one of its
// availability events is on; it stays active for QUIET_MS after that stops, to catch the last game.
// Everything else is swept once an hour by the scheduler (see scheduler.cjs).

const QUIET_MS = 30 * 60 * 1000;
const MIN_IN_VOICE = 2;
const EVENT_LEAD_MS = 30 * 60 * 1000;
const SWEEP_MS = 60 * 1000;

const keyOf = (guildId, clubKey) => `${guildId}:${clubKey}`;

function humansIn(channel) {
  return channel?.members ? [...channel.members.values()].filter((m) => !m.user?.bot).length : 0;
}

function syncedClubs(state) {
  return (state?.clubs || []).filter((c) => c?.ea_club_id && c?.ea_platform && c?.monitoring_enabled);
}

// Clubs of one guild that look like they're playing now, from Discord's cached voice states
function clubsInSession(guild, state, liveEventClubs = new Set()) {
  const clubs = syncedClubs(state);
  if (!clubs.length) return [];
  const channels = guild?.channels?.cache;
  const busyVoice = channels ? [...channels.values()].some((ch) => ch?.isVoiceBased?.() && humansIn(ch) >= MIN_IN_VOICE) : false;
  return clubs.filter((club) => {
    if (liveEventClubs.has(club.key)) return true;
    const slots = state.boardState?.[club.key]?.slots || [];
    if (slots.some((s) => s && !s.open && s.takenBy && s.takenBy !== '__NOT_IN_VC__')) return true;
    const vcId = state.clubVcLinks?.[club.key];
    if (vcId) return humansIn(channels?.get(vcId)) >= MIN_IN_VOICE;
    return busyVoice;
  }).map((club) => club.key);
}

function createEaActivity({ client, getGuildState, supabase, now = () => Date.now() }) {
  const lastSeen = new Map();

  // Clubs per guild with an open availability event from 30 min before kick-off until it ends
  async function liveEventClubs() {
    const at = now();
    const { data } = await supabase
      .from('availability_events')
      .select('guild_id, club_key, scheduled_at, duration_minutes')
      .eq('closed', false)
      .eq('cancelled', false)
      .not('club_key', 'is', null)
      .gte('scheduled_at', new Date(at - 4 * 60 * 60 * 1000).toISOString())
      .lte('scheduled_at', new Date(at + EVENT_LEAD_MS).toISOString());
    const byGuild = new Map();
    for (const e of data || []) {
      const start = new Date(e.scheduled_at).getTime();
      if (at < start - EVENT_LEAD_MS || at > start + (e.duration_minutes || 90) * 60000) continue;
      if (!byGuild.has(e.guild_id)) byGuild.set(e.guild_id, new Set());
      byGuild.get(e.guild_id).add(e.club_key);
    }
    return byGuild;
  }

  async function checkGuild(guild, eventClubs) {
    const state = await getGuildState(guild.id);
    for (const clubKey of clubsInSession(guild, state, eventClubs)) lastSeen.set(keyOf(guild.id, clubKey), now());
  }

  async function sweep() {
    const guilds = client()?.guilds?.cache;
    if (!guilds) return;
    const events = await liveEventClubs().catch((err) => {
      console.warn('[ea-activity] event lookup failed:', err.message);
      return new Map();
    });
    for (const guild of guilds.values()) await checkGuild(guild, events.get(guild.id)).catch(() => {});
  }

  function isActive(guildId, clubKey) {
    const seen = lastSeen.get(keyOf(guildId, clubKey));
    return seen !== undefined && now() - seen < QUIET_MS;
  }

  // "guild_id:club_key" for every active club, for sync-ea-stats' `active` list
  function activeKeys() {
    const at = now();
    for (const [key, seen] of lastSeen) if (at - seen >= QUIET_MS) lastSeen.delete(key);
    return [...lastSeen.keys()];
  }

  // A voice join marks the club active at once instead of waiting for the next sweep
  function onVoiceStateUpdate(oldState, newState) {
    const guild = newState?.guild || oldState?.guild;
    if (!guild || !newState?.channelId || oldState?.channelId === newState.channelId) return;
    checkGuild(guild).catch(() => {});
  }

  function start() {
    setInterval(() => sweep().catch((err) => console.warn('[ea-activity] sweep failed:', err.message)), SWEEP_MS).unref?.();
    setTimeout(() => sweep().catch(() => {}), 20 * 1000).unref?.();
  }

  return { sweep, isActive, activeKeys, onVoiceStateUpdate, start };
}

module.exports = { createEaActivity, clubsInSession, keyOf, QUIET_MS, MIN_IN_VOICE };
