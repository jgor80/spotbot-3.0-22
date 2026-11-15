// Transfer news in Discord: the Monday digest names who joined and who left the club in the past week,
// as EA's own member lists show it (moves are spotted by the EA sync and public club lookups; see
// src/lib/transfers.ts). The full feed is public at gafferbot.app/transfers.
const { clubTransferNews } = require('./club-insights.cjs');

const WEEK_MS = 7 * 86400000;

function truncate(text, max = 1024) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

// moves: transfer_moves rows touching this club
function transferDigestFields(moves, clubId) {
  if (!clubId) return [];
  const { joined, left } = clubTransferNews(moves || [], String(clubId));
  if (!joined.length && !left.length) return [];
  const lines = [
    ...joined.slice(0, 6).map((m) => `➡️ **${m.ea_username}** joined from ${m.from_club_name || 'another club'}`),
    ...left.slice(0, 6).map((m) => `⬅️ **${m.ea_username}** left for ${m.to_club_name || 'another club'}`),
  ];
  return [{ name: '🔁 Transfer news', value: truncate(`${lines.join('\n')}\n-# From EA's member lists · every move: https://gafferbot.app/transfers`) }];
}

function createTransferNews({ autopilot, supabase }) {
  async function movesFor(clubId, now = Date.now()) {
    const since = new Date(now - WEEK_MS).toISOString();
    const id = String(clubId);
    const { data, error } = await supabase
      .from('transfer_moves')
      .select('ea_username, platform, from_club_id, from_club_name, to_club_id, to_club_name, detected_at')
      .or(`from_club_id.eq.${id},to_club_id.eq.${id}`)
      .gte('detected_at', since)
      .order('detected_at', { ascending: false })
      .limit(30);
    if (error) throw error;
    return data || [];
  }
  if (autopilot?.onDigest && supabase) {
    autopilot.onDigest(async (guildId, club) => {
      if (!/^\d+$/.test(String(club?.ea_club_id || ''))) return [];
      return transferDigestFields(await movesFor(club.ea_club_id).catch(() => []), club.ea_club_id);
    });
  }
  return { movesFor, transferDigestFields };
}

module.exports = { createTransferNews, transferDigestFields };
