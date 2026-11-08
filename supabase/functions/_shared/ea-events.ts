// EA hides extra per-player stats in match_event_aggregate_0..3 as "eventId:count" pairs.
// Event meanings come from the community research at
// https://github.com/Interactive-63/eafc-pro-clubs-api-research (FC27, checked against 51k player rows).
// Only mappings it lists as confirmed are used. Each stat is the sum of its event counts.
//
// Keep in sync with public/spotbot/ea-events.cjs and the SQL in backfill_advanced_player_stats();
// ea-events.test.ts fails if the bot copy drifts.
export const EA_EVENT_STATS: Record<string, number[]> = {
  interceptions: [6],
  secondAssists: [115],
  throughBalls: [152],
  dribbles: [174], // dribbles completed
  progressiveCarries: [97], // dribbles carried
  possessionGains: [108, 109, 110], // possession won in defensive, middle, attacking third
  possessionsLost: [105, 106, 107],
  shotsOnTarget: [217],
  shotsOffTarget: [218],
  passesCompleted: [215], // excludes offside passes
  forwardPasses: [30], // completed forward passes
  tacklesWon: [0],
  aerialsWon: [265, 266],
  foulsCommitted: [2, 3],
  foulsWon: [4],
  yellowCards: [95, 213],
}

// "6:2,215:30" (x4 strings) -> { 6: 2, 215: 30 }
export function eaEventCounts(p: Record<string, unknown> | null | undefined): Record<number, number> {
  const counts: Record<number, number> = {}
  for (let i = 0; i < 4; i++) {
    for (const pair of String(p?.[`match_event_aggregate_${i}`] ?? '').split(',')) {
      const [k, v] = pair.split(':')
      if (!/^\d+$/.test(k || '') || !/^\d+$/.test(v || '')) continue
      counts[Number(k)] = (counts[Number(k)] || 0) + Number(v)
    }
  }
  return counts
}

// Named stats from a player's EA match row
export function eaEventStats(p: Record<string, unknown> | null | undefined): Record<string, number> {
  const c = eaEventCounts(p)
  const out: Record<string, number> = {}
  for (const [name, ids] of Object.entries(EA_EVENT_STATS)) {
    out[name] = ids.reduce((sum, id) => sum + (c[id] || 0), 0)
  }
  return out
}
