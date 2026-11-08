// EA hides extra per-player stats in match_event_aggregate_0..3 as "eventId:count" pairs.
// Event meanings come from the community research at
// https://github.com/Interactive-63/eafc-pro-clubs-api-research (FC27, checked against 51k player rows;
// scripts/ea-research-check.mjs reruns those checks). Only mappings it lists as confirmed are used.
// Each stat is the sum of its event counts.
//
// One source for the web app, the bot (public/spotbot/ea-events.cjs, built by npm run build:bot-lib)
// and the backend functions (supabase/functions/_shared/ea-events.ts re-exports this file).
// No imports here: Deno loads this file directly.
export const EA_EVENT_STATS: Record<string, number[]> = {
  // Core
  goals: [214],
  assists: [11],
  secondAssists: [115],
  interceptions: [6],
  tacklesWon: [0],
  tacklesLost: [1],
  dribbles: [174], // dribbles completed
  progressiveCarries: [97], // dribbles carried
  throughBalls: [152],

  // Passing
  passesCompleted: [215], // excludes offside passes
  passesFailed: [216],
  shortPassesMade: [24],
  shortPassesFailed: [25],
  mediumPassesMade: [26],
  mediumPassesFailed: [27],
  longPassesMade: [28],
  longPassesFailed: [29],
  crossesMade: [36],
  crossesFailed: [37], // open play only
  forwardPasses: [30], // completed
  forwardPassesFailed: [31],
  backwardPasses: [32],
  backwardPassesFailed: [33],
  sidewaysPasses: [34],
  sidewaysPassesFailed: [35],
  firstTimePasses: [143],
  switchesOfPlay: [144],
  flairPasses: [147],
  offsidePasses: [153],

  // Shooting
  shotsOnTarget: [217],
  shotsOffTarget: [218],
  shotsOnTargetInBox: [13],
  shotsOnTargetOutsideBox: [18],
  shotsOffTargetInBox: [14],
  shotsOffTargetOutsideBox: [19],
  weakFootGoals: [131],
  firstTimeGoals: [128],
  postGoals: [136],
  throughBallAssists: [118],

  // Dribbling
  beats: [112], // includes skill-move beats
  skillMoveBeats: [38],

  // Defending
  standingTacklesWon: [229],
  slidingTacklesWon: [230],
  dangerousTackles: [163],
  cleanTackles: [164],
  dispossessed: [158],
  crossesBlocked: [156],
  aerialsWon: [265, 266],
  aerialsWonAttacking: [265],
  aerialsWonDefending: [266],

  // Where the ball is won and lost
  possessionGains: [108, 109, 110],
  wonDefensiveThird: [108],
  wonMiddleThird: [109],
  wonAttackingThird: [110],
  possessionsLost: [105, 106, 107],
  lostDefensiveThird: [105],
  lostMiddleThird: [106],
  lostAttackingThird: [107],

  // Discipline and set pieces
  yellowCards: [95, 213],
  foulsCommitted: [2, 3],
  foulsWon: [4],
  penaltiesConceded: [94],
  cornersTaken: [145],
  cornersConceded: [10],

  // Positioning: EA's in-game "out of position" warnings (severity 1-5) and "good positioning" praise
  outOfPosition: [219],
  outOfPositionSevere: [102, 103],
  inPosition: [111],

  // Decisions: EA's in-game feedback popups after each action
  bestOption: [177],
  goodOption: [176],
  noGoodOption: [175],
  shouldHavePassedElsewhere: [182],
  useTheBall: [212],
  choseToPass: [183],

  // Keepers
  goodDirectionSaves: [267],
}

export type EaEventStats = Record<string, number>

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

// Named stats from event counts
export function statsFromCounts(c: Record<number, number> | null | undefined): EaEventStats {
  const out: EaEventStats = {}
  for (const [name, ids] of Object.entries(EA_EVENT_STATS)) {
    out[name] = ids.reduce((sum, id) => sum + ((c && c[id]) || 0), 0)
  }
  return out
}

// Named stats from a player's EA match row
export function eaEventStats(p: Record<string, unknown> | null | undefined): EaEventStats {
  return statsFromCounts(eaEventCounts(p))
}

// True when the row carries any event data at all (older games and some platforms send none)
export function hasEventData(p: Record<string, unknown> | null | undefined): boolean {
  return Object.keys(eaEventCounts(p)).length > 0
}
