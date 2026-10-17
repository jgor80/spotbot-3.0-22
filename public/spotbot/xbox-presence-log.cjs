// Records the Xbox status text of linked players who are in a voice channel, so we can see
// what EA FC puts there during a Pro Clubs match (score? minute?) before building live updates.
// Every online status is kept (not just ones naming FC), since we don't yet know EA's wording.
// One OpenXBL call per poll covers everyone; a row is saved only when a player's text changes.
// XBOX_PRESENCE_LOG=off disables it; XBOX_PRESENCE_LOG_SECONDS sets the poll (default 60,
// since OpenXBL's free plan allows about 150 calls an hour and the XUID backfill also uses some).
const MIN_SECONDS = 30;

// The status lines worth keeping from one OpenXBL person: the top-level text plus each title's
// own rich presence line (that is where a game puts mode, score and so on)
function presenceLines(person) {
  const details = Array.isArray(person?.presenceDetails) ? person.presenceDetails : [];
  return {
    state: person?.presenceState || null,
    text: person?.presenceText || null,
    details: details.map((d) => ({
      title_id: d.TitleId ?? d.titleId ?? null,
      text: d.PresenceText ?? d.presenceText ?? null,
      device: d.Device ?? d.device ?? null,
      primary: d.IsPrimary ?? d.isPrimary ?? null,
    })),
  };
}

function createPresenceLog({ client, supabase, apiKey = process.env.OPENXBL_API_KEY, fetchFn = globalThis.fetch }) {
  const lastText = new Map(); // xuid -> last saved signature

  // Discord user -> guild id, for everyone sitting in a voice channel right now
  function voiceMembers() {
    const out = new Map();
    for (const guild of client.guilds.cache.values()) {
      for (const vs of guild.voiceStates.cache.values()) {
        if (vs.channelId && !vs.member?.user?.bot) out.set(vs.id, guild.id);
      }
    }
    return out;
  }

  async function poll() {
    if (!apiKey) return { saved: 0 };
    const inVoice = voiceMembers();
    if (!inVoice.size) return { saved: 0 };
    const { data: profiles } = await supabase.from('profiles')
      .select('discord_user_id, xbox_xuid, xbox_gamertag')
      .in('discord_user_id', [...inVoice.keys()])
      .not('xbox_xuid', 'is', null);
    if (!profiles?.length) return { saved: 0 };

    const res = await fetchFn(`https://xbl.io/api/v2/account/${profiles.map((p) => p.xbox_xuid).join(',')}`, {
      headers: { 'X-Authorization': apiKey, Accept: 'application/json' },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`OpenXBL ${res.status}`);
    const people = (await res.json())?.people || [];

    const rows = [];
    for (const person of people) {
      const profile = profiles.find((p) => String(p.xbox_xuid) === String(person.xuid));
      if (!profile) continue;
      const lines = presenceLines(person);
      if (lines.state !== 'Online') { lastText.delete(String(person.xuid)); continue; }
      const sig = JSON.stringify([lines.text, lines.details.map((d) => d.text)]);
      if (lastText.get(String(person.xuid)) === sig) continue;
      lastText.set(String(person.xuid), sig);
      rows.push({
        discord_user_id: profile.discord_user_id,
        guild_id: inVoice.get(profile.discord_user_id),
        xbox_xuid: String(person.xuid),
        gamertag: person.gamertag || profile.xbox_gamertag,
        presence_state: lines.state,
        presence_text: lines.text,
        presence_details: lines.details,
      });
      console.log(`[xbox-presence] ${person.gamertag}: ${lines.text}${lines.details.map((d) => ` | ${d.text}`).join('')}`);
    }
    if (rows.length) {
      const { error } = await supabase.from('xbox_presence_log').insert(rows);
      if (error) console.error('[xbox-presence] save failed:', error.message);
    }
    return { saved: rows.length };
  }

  function start() {
    if (process.env.XBOX_PRESENCE_LOG === 'off' || !apiKey) return;
    const seconds = Math.max(MIN_SECONDS, Number(process.env.XBOX_PRESENCE_LOG_SECONDS) || 60);
    setInterval(() => poll().catch((e) => console.error('[xbox-presence]', e.message)), seconds * 1000);
    console.log(`[xbox-presence] logging Xbox status of players in voice every ${seconds}s`);
  }

  return { poll, start };
}

module.exports = { createPresenceLog, presenceLines };
