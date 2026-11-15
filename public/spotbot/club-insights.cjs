// Generated from src/lib/clubInsights.ts by npm run build:bot-lib. Do not edit by hand.
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/lib/clubInsights.ts
var clubInsights_exports = {};
__export(clubInsights_exports, {
  AREAS: () => AREAS,
  AREA_FIX: () => AREA_FIX,
  BENCH_METRICS: () => BENCH_METRICS,
  CLEAR_EDGE: () => CLEAR_EDGE,
  COMPETITIONS: () => COMPETITIONS,
  GOAL_MODEL: () => GOAL_MODEL,
  KEEPER_METRICS: () => KEEPER_METRICS,
  MATCH_TAGS: () => MATCH_TAGS,
  MIN_ROLE_GAMES: () => MIN_ROLE_GAMES,
  PASS_STYLE_CUTOFFS: () => PASS_STYLE_CUTOFFS,
  POSITION_LINES: () => POSITION_LINES,
  ROLE_LABELS: () => ROLE_LABELS,
  ROLE_WEIGHTS: () => ROLE_WEIGHTS,
  SCORE_AREAS: () => SCORE_AREAS,
  SCORE_MAX: () => SCORE_MAX,
  SCORE_METRICS: () => SCORE_METRICS,
  SEPARATE_COMPETITIONS: () => SEPARATE_COMPETITIONS,
  SESSION_BREAK_MS: () => SESSION_BREAK_MS,
  SESSION_GAP_MS: () => SESSION_GAP_MS,
  SIGHTING_DAYS: () => SIGHTING_DAYS,
  banterRankings: () => banterRankings,
  banterWindow: () => banterWindow,
  benchRole: () => benchRole,
  benchmarkPlayer: () => benchmarkPlayer,
  betterTogether: () => betterTogether,
  betterWithout: () => betterWithout,
  carryScores: () => carryScores,
  clubTransferNews: () => clubTransferNews,
  clutchRatings: () => clutchRatings,
  competitionEmoji: () => competitionEmoji,
  competitionLabel: () => competitionLabel,
  computeAdvancedPlayers: () => computeAdvancedPlayers,
  computeCombos: () => computeCombos,
  computeCompetitionRecords: () => computeCompetitionRecords,
  computeFormTrends: () => computeFormTrends,
  computeFormations: () => computeFormations,
  computeOpponentProfiles: () => computeOpponentProfiles,
  computeOverview: () => computeOverview,
  computePartnerships: () => computePartnerships,
  computePlayerImpact: () => computePlayerImpact,
  computePressing: () => computePressing,
  computeSessionFatigue: () => computeSessionFatigue,
  computeWinLossGaps: () => computeWinLossGaps,
  decisionScore: () => decisionScore,
  defendingSummary: () => defendingSummary,
  deriveStats: () => deriveStats,
  detectMoves: () => detectMoves,
  divisionLabel: () => divisionLabel,
  eaKey: () => eaKey,
  expectedPoints: () => expectedPoints,
  fc27Percentile: () => fc27Percentile,
  filterPlayers: () => filterPlayers,
  gdPerGame: () => gdPerGame,
  generateAdvancedInsights: () => generateAdvancedInsights,
  generateInsights: () => generateInsights,
  grade: () => grade,
  groupSessions: () => groupSessions,
  headToHead: () => headToHead,
  isDivisionMatch: () => isDivisionMatch,
  isSeparateCompetition: () => isSeparateCompetition,
  lineupHints: () => lineupHints,
  matchCompetition: () => matchCompetition,
  matchDeepHighlights: () => matchDeepHighlights,
  matchPerformance: () => matchPerformance,
  matchTag: () => matchTag,
  moveLine: () => moveLine,
  outcomeOdds: () => outcomeOdds,
  parseDivision: () => parseDivision,
  passStyle: () => passStyle,
  percentileText: () => percentileText,
  playerKey: () => playerKey,
  playerLines: () => playerLines,
  playerScores: () => playerScores,
  playerStatsTypeForTag: () => playerStatsTypeForTag,
  pointsVerdict: () => pointsVerdict,
  positionalDiscipline: () => positionalDiscipline,
  powerRankings: () => powerRankings,
  quantileScore: () => quantileScore,
  roleLabel: () => roleLabel,
  roleOf: () => roleOf,
  roleScore: () => roleScore,
  scorePlayer: () => scorePlayer,
  sessionReport: () => sessionReport,
  sideTotals: () => sideTotals,
  signed: () => signed,
  summarisePerformance: () => summarisePerformance,
  summarizeDivision: () => summarizeDivision,
  superlatives: () => superlatives,
  teamEvents: () => teamEvents,
  teamMetrics: () => teamMetrics,
  teamPercentile: () => teamPercentile,
  toInsightMatches: () => toInsightMatches,
  verdictFor: () => verdictFor,
  whoGetsTheShirt: () => whoGetsTheShirt,
  winPct: () => winPct
});
module.exports = __toCommonJS(clubInsights_exports);

// src/lib/eaEvents.ts
var EA_EVENT_STATS = {
  // Core
  goals: [214],
  assists: [11],
  secondAssists: [115],
  interceptions: [6],
  tacklesWon: [0],
  tacklesLost: [1],
  dribbles: [174],
  // dribbles completed
  progressiveCarries: [97],
  // dribbles carried
  throughBalls: [152],
  // Passing
  passesCompleted: [215],
  // excludes offside passes
  passesFailed: [216],
  shortPassesMade: [24],
  shortPassesFailed: [25],
  mediumPassesMade: [26],
  mediumPassesFailed: [27],
  longPassesMade: [28],
  longPassesFailed: [29],
  crossesMade: [36],
  crossesFailed: [37],
  // open play only
  forwardPasses: [30],
  // completed
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
  beats: [112],
  // includes skill-move beats
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
  goodDirectionSaves: [267]
};
function eaEventCounts(p) {
  const counts = {};
  for (let i = 0; i < 4; i++) {
    for (const pair of String(p?.[`match_event_aggregate_${i}`] ?? "").split(",")) {
      const [k, v] = pair.split(":");
      if (!/^\d+$/.test(k || "") || !/^\d+$/.test(v || "")) continue;
      counts[Number(k)] = (counts[Number(k)] || 0) + Number(v);
    }
  }
  return counts;
}
function statsFromCounts(c) {
  const out = {};
  for (const [name, ids] of Object.entries(EA_EVENT_STATS)) {
    out[name] = ids.reduce((sum2, id) => sum2 + (c && c[id] || 0), 0);
  }
  return out;
}
function hasEventData(p) {
  return Object.keys(eaEventCounts(p)).length > 0;
}

// src/lib/fc27Benchmarks.ts
var FC27_BENCHMARKS = {
  "source": "eafc-pro-clubs-api-research FC27, 51395 player games",
  "players": {
    "MID": 1640,
    "FWD": 1575,
    "DEF": 219
  },
  "roles": {
    "MID": {
      "decisionScore": [
        22.68,
        37.93,
        41.57,
        43.82,
        45.33,
        46.88,
        48,
        48.81,
        49.64,
        50.63,
        51.47,
        52.38,
        53.44,
        54.29,
        55.48,
        56.41,
        57.51,
        59.15,
        60.82,
        63.79,
        78.05
      ],
      "positionalDiscipline": [
        11.32,
        44.41,
        52.68,
        60.23,
        63.9,
        68.39,
        71.79,
        75,
        77.78,
        80.39,
        82.76,
        85.11,
        86.92,
        88.64,
        90.38,
        92.02,
        93.72,
        95.17,
        96.62,
        98.13,
        100
      ],
      "outOfPositionPerGame": [
        0,
        0.2,
        0.6,
        1,
        1.2,
        1.5,
        1.88,
        2.14,
        2.43,
        2.75,
        3,
        3.43,
        3.89,
        4.2,
        4.61,
        5.11,
        5.71,
        6.47,
        7.44,
        9.13,
        29.38
      ],
      "passCompletion": [
        45,
        62.28,
        65.66,
        67.78,
        69.35,
        70.63,
        71.82,
        72.82,
        73.89,
        74.85,
        75.9,
        76.88,
        77.84,
        78.95,
        79.94,
        81.25,
        82.5,
        83.84,
        85.33,
        87.75,
        98.9
      ],
      "tackleSuccess": [
        0,
        14.29,
        19.23,
        22.22,
        25,
        27.59,
        30,
        32.14,
        34.15,
        36.36,
        38.46,
        41.38,
        44,
        47.06,
        50,
        53.33,
        57.14,
        62.07,
        67.39,
        76.19,
        100
      ],
      "shotAccuracy": [
        0,
        25,
        42.11,
        50,
        50,
        57.14,
        60,
        63.64,
        66.67,
        68.75,
        71.43,
        73.33,
        75,
        77.78,
        80,
        83.33,
        85.71,
        89.47,
        100,
        100,
        100
      ],
      "pressingPerGame": [
        0,
        0,
        0,
        0,
        0,
        0.08,
        0.11,
        0.14,
        0.17,
        0.2,
        0.2,
        0.23,
        0.27,
        0.3,
        0.33,
        0.38,
        0.4,
        0.45,
        0.55,
        0.67,
        2.8
      ],
      "aerialsPerGame": [
        0,
        0,
        0.1,
        0.17,
        0.2,
        0.25,
        0.33,
        0.36,
        0.4,
        0.46,
        0.5,
        0.6,
        0.67,
        0.73,
        0.83,
        1,
        1.09,
        1.2,
        1.38,
        1.75,
        4.83
      ],
      "interceptionsPerGame": [
        0,
        0.71,
        1,
        1.13,
        1.25,
        1.4,
        1.55,
        1.67,
        1.8,
        1.9,
        2,
        2.17,
        2.33,
        2.5,
        2.67,
        2.92,
        3.2,
        3.6,
        4.11,
        4.78,
        9.38
      ],
      "dribblesPerGame": [
        3.14,
        9.67,
        11,
        12,
        12.91,
        13.71,
        14.4,
        15,
        15.55,
        16.2,
        16.82,
        17.6,
        18.23,
        19,
        19.8,
        20.65,
        21.75,
        23,
        24.55,
        27.14,
        41.67
      ],
      "throughBallsPerGame": [
        0,
        0.87,
        1.38,
        1.8,
        2.14,
        2.5,
        2.83,
        3.14,
        3.43,
        3.75,
        4,
        4.42,
        4.78,
        5.13,
        5.43,
        5.83,
        6.44,
        7.13,
        7.9,
        9.29,
        16.83
      ],
      "secondAssistsPerGame": [
        0,
        0,
        0,
        0.09,
        0.13,
        0.14,
        0.17,
        0.2,
        0.21,
        0.25,
        0.29,
        0.33,
        0.33,
        0.38,
        0.4,
        0.45,
        0.5,
        0.57,
        0.67,
        0.8,
        1.88
      ]
    },
    "FWD": {
      "decisionScore": [
        22.37,
        41.07,
        45.31,
        48.39,
        50,
        51.81,
        53.13,
        54.31,
        55.36,
        56.2,
        57.33,
        58.26,
        59.49,
        60.56,
        61.54,
        62.87,
        64.1,
        65.53,
        67.66,
        70.62,
        82.61
      ],
      "positionalDiscipline": [
        5.93,
        41.87,
        62.75,
        71.51,
        78.1,
        82.42,
        85.81,
        88.54,
        90.12,
        91.67,
        93,
        94.17,
        95.09,
        96,
        96.56,
        97.1,
        97.74,
        98.36,
        98.86,
        99.45,
        100
      ],
      "outOfPositionPerGame": [
        0,
        0,
        0,
        0.17,
        0.33,
        0.43,
        0.57,
        0.71,
        0.83,
        1,
        1.18,
        1.38,
        1.6,
        1.88,
        2.29,
        2.71,
        3.38,
        4.27,
        6,
        9,
        31.75
      ],
      "passCompletion": [
        38.18,
        64,
        67.28,
        70.04,
        71.58,
        73.1,
        74.18,
        75.21,
        76.19,
        77.12,
        77.88,
        78.54,
        79.46,
        80.2,
        80.92,
        81.85,
        82.69,
        83.84,
        85.32,
        87.05,
        96.97
      ],
      "tackleSuccess": [
        0,
        8.57,
        11.76,
        14.29,
        16.67,
        20,
        21.43,
        23.53,
        25.49,
        27.5,
        29.63,
        32,
        33.33,
        37.5,
        40,
        43.33,
        47.37,
        51.35,
        58.82,
        71.43,
        100
      ],
      "shotAccuracy": [
        12.5,
        53.33,
        59.38,
        63.33,
        65.63,
        66.67,
        69.23,
        70.59,
        72.22,
        74.19,
        75,
        76.92,
        78.57,
        80,
        81.25,
        83.33,
        85,
        87.1,
        89.66,
        94.12,
        100
      ],
      "pressingPerGame": [
        0,
        0,
        0.09,
        0.14,
        0.17,
        0.2,
        0.2,
        0.25,
        0.29,
        0.31,
        0.33,
        0.38,
        0.4,
        0.44,
        0.5,
        0.53,
        0.58,
        0.64,
        0.71,
        0.83,
        1.8
      ],
      "aerialsPerGame": [
        0,
        0,
        0.08,
        0.13,
        0.17,
        0.22,
        0.3,
        0.38,
        0.43,
        0.5,
        0.6,
        0.67,
        0.8,
        0.92,
        1,
        1.2,
        1.4,
        1.71,
        2.3,
        3.44,
        8.1
      ],
      "interceptionsPerGame": [
        0,
        0.33,
        0.43,
        0.5,
        0.6,
        0.67,
        0.75,
        0.8,
        0.83,
        0.9,
        1,
        1,
        1.11,
        1.2,
        1.25,
        1.33,
        1.43,
        1.6,
        1.8,
        2,
        4.36
      ],
      "dribblesPerGame": [
        3.83,
        8,
        9.13,
        9.83,
        10.57,
        11.25,
        11.75,
        12.4,
        13,
        13.5,
        14,
        14.5,
        15,
        15.6,
        16.2,
        17,
        17.78,
        18.63,
        20,
        22.2,
        33
      ],
      "throughBallsPerGame": [
        0,
        0.8,
        1.09,
        1.33,
        1.6,
        1.83,
        2.09,
        2.27,
        2.4,
        2.6,
        2.8,
        3,
        3.2,
        3.4,
        3.6,
        3.89,
        4.3,
        4.67,
        5.29,
        6.33,
        16.22
      ],
      "secondAssistsPerGame": [
        0,
        0,
        0,
        0,
        0,
        0.07,
        0.1,
        0.13,
        0.14,
        0.17,
        0.18,
        0.2,
        0.22,
        0.27,
        0.3,
        0.33,
        0.4,
        0.43,
        0.5,
        0.63,
        1.67
      ]
    },
    "DEF": {
      "decisionScore": [
        27.59,
        33.33,
        36.59,
        39.13,
        41.94,
        43.75,
        46.55,
        47.37,
        48.45,
        50,
        51.16,
        52.78,
        54,
        55,
        56.52,
        58.14,
        59.57,
        60.38,
        62.69,
        65.85,
        70.83
      ],
      "positionalDiscipline": [
        42.2,
        73.71,
        81.82,
        87.42,
        91.18,
        92.5,
        93.53,
        94.83,
        96,
        96.58,
        96.82,
        97.22,
        97.54,
        98.16,
        98.59,
        98.98,
        99.19,
        99.4,
        99.57,
        100,
        100
      ],
      "outOfPositionPerGame": [
        0,
        0,
        0.15,
        0.2,
        0.29,
        0.33,
        0.4,
        0.5,
        0.63,
        0.83,
        0.91,
        1,
        1.19,
        1.44,
        1.8,
        1.92,
        2.2,
        2.8,
        3.67,
        5.5,
        10.5
      ],
      "passCompletion": [
        56.86,
        67.61,
        70,
        72.46,
        75,
        75.9,
        77.78,
        78.95,
        79.75,
        81.01,
        81.67,
        82.65,
        83.93,
        84.75,
        85.71,
        86.25,
        87.5,
        89.23,
        90.63,
        91.67,
        97.03
      ],
      "tackleSuccess": [
        11.11,
        25.93,
        30,
        34.78,
        37.84,
        39.29,
        42.11,
        44.44,
        45.65,
        47.5,
        50,
        51.61,
        53.33,
        56.25,
        57.89,
        60,
        63.64,
        66.67,
        72.73,
        81.82,
        100
      ],
      "shotAccuracy": [
        0,
        0,
        0,
        0,
        20,
        33.33,
        40,
        50,
        50,
        50,
        60,
        66.67,
        66.67,
        71.43,
        77.78,
        83.33,
        90,
        100,
        100,
        100,
        100
      ],
      "pressingPerGame": [
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0.08,
        0.11,
        0.13,
        0.17,
        0.2,
        0.25,
        0.4
      ],
      "aerialsPerGame": [
        0,
        0.2,
        0.4,
        0.5,
        0.64,
        0.71,
        0.8,
        0.88,
        1,
        1.07,
        1.18,
        1.25,
        1.36,
        1.43,
        1.5,
        1.64,
        1.75,
        1.92,
        2.14,
        2.38,
        4.4
      ],
      "interceptionsPerGame": [
        0.5,
        1.33,
        1.67,
        1.88,
        2,
        2.14,
        2.25,
        2.38,
        2.5,
        2.6,
        2.71,
        2.8,
        2.86,
        3,
        3.09,
        3.2,
        3.4,
        3.55,
        3.86,
        4.25,
        5.83
      ],
      "dribblesPerGame": [
        3.4,
        5.2,
        5.9,
        6.2,
        6.6,
        6.89,
        7,
        7.4,
        7.88,
        8.44,
        8.8,
        9.13,
        9.5,
        9.9,
        10.33,
        10.78,
        11.5,
        12.11,
        13.1,
        14.5,
        21
      ],
      "throughBallsPerGame": [
        0,
        0,
        0,
        0.14,
        0.2,
        0.33,
        0.4,
        0.5,
        0.6,
        0.69,
        0.78,
        0.88,
        1,
        1,
        1.33,
        1.56,
        1.8,
        2.2,
        2.67,
        3.4,
        6.6
      ],
      "secondAssistsPerGame": [
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0.08,
        0.1,
        0.13,
        0.17,
        0.2,
        0.2,
        0.3,
        0.6
      ]
    }
  },
  "team": {
    "pressingPerGame": [
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      1,
      1,
      1,
      1,
      1,
      1,
      2,
      2,
      2,
      3,
      3,
      14
    ],
    "lostOwnThirdPerGame": [
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      1,
      1,
      1,
      1,
      1,
      2,
      2,
      2,
      3,
      4,
      11
    ],
    "aerialsPerGame": [
      0,
      0,
      0,
      0,
      0,
      1,
      1,
      1,
      1,
      2,
      2,
      2,
      3,
      3,
      4,
      4,
      5,
      6,
      7,
      9,
      24
    ],
    "insideBoxShotShare": [
      0,
      40,
      50,
      57.14,
      63.64,
      66.67,
      71.43,
      75,
      76.92,
      80,
      83.33,
      84.62,
      87.5,
      90,
      93.33,
      100,
      100,
      100,
      100,
      100,
      100
    ],
    "passCompletion": [
      0,
      61.67,
      65.38,
      67.57,
      69.37,
      70.83,
      72.15,
      73.33,
      74.34,
      75.32,
      76.32,
      77.27,
      78.18,
      79.17,
      80,
      81.13,
      82.35,
      83.75,
      85.45,
      88.46,
      100
    ],
    "decisionScore": [
      0,
      33.33,
      38.46,
      41.82,
      44.19,
      46.15,
      47.62,
      49.06,
      50,
      51.61,
      52.86,
      54.05,
      55.32,
      56.67,
      57.89,
      59.26,
      60.98,
      62.96,
      65.45,
      69.12,
      100
    ],
    "modelledGoalsFor": [
      0,
      0.15,
      0.55,
      1,
      1.1,
      1.25,
      1.65,
      1.8,
      1.95,
      2.2,
      2.35,
      2.65,
      2.76,
      2.9,
      3.31,
      3.46,
      3.86,
      4.16,
      4.56,
      5.51,
      13.37
    ],
    "modelledGoalShare": [
      0,
      0.08,
      0.17,
      0.23,
      0.29,
      0.33,
      0.36,
      0.4,
      0.43,
      0.47,
      0.5,
      0.53,
      0.57,
      0.6,
      0.64,
      0.67,
      0.71,
      0.77,
      0.83,
      0.92,
      1
    ],
    "ratingEdge": [
      -4.65,
      -2.3,
      -1.82,
      -1.47,
      -1.2,
      -0.97,
      -0.75,
      -0.55,
      -0.35,
      -0.17,
      0,
      0.17,
      0.35,
      0.55,
      0.75,
      0.97,
      1.2,
      1.47,
      1.82,
      2.3,
      4.65
    ],
    "lostPerPlayer": [
      0,
      1,
      1.5,
      1.75,
      2,
      2.33,
      2.5,
      2.75,
      3,
      3.33,
      3.6,
      4,
      4.25,
      4.5,
      5,
      5.5,
      6,
      7,
      8,
      9.5,
      18.5
    ]
  },
  "playerScores": {
    "MID": {
      "goalsPerGame": [
        0,
        0,
        0,
        0,
        0,
        0.11,
        0.14,
        0.17,
        0.2,
        0.25,
        0.3,
        0.35,
        0.4,
        0.5,
        0.55,
        0.6,
        0.71,
        0.8,
        1,
        1.2,
        2.4
      ],
      "chancesCreatedPerGame": [
        0,
        0.13,
        0.2,
        0.29,
        0.35,
        0.4,
        0.5,
        0.6,
        0.64,
        0.71,
        0.8,
        0.88,
        1,
        1,
        1.17,
        1.29,
        1.43,
        1.6,
        1.86,
        2.2,
        4.25
      ],
      "shotsOnTargetPerGame": [
        0,
        0,
        0.11,
        0.18,
        0.27,
        0.33,
        0.43,
        0.5,
        0.6,
        0.71,
        0.8,
        0.87,
        1,
        1.08,
        1.2,
        1.3,
        1.45,
        1.67,
        2,
        2.38,
        4.27
      ],
      "passCompletion": [
        45,
        62.16,
        65.55,
        67.65,
        69.23,
        70.54,
        71.76,
        72.77,
        73.8,
        74.74,
        75.86,
        76.85,
        77.78,
        78.95,
        79.87,
        81.25,
        82.5,
        83.82,
        85.33,
        87.68,
        98.9
      ],
      "passesPerGame": [
        4,
        9,
        10.29,
        11.22,
        12,
        12.6,
        13.29,
        14,
        14.6,
        15.17,
        15.8,
        16.33,
        17,
        17.67,
        18.63,
        19.73,
        20.57,
        21.67,
        23.27,
        25.75,
        44
      ],
      "lostPerGame": [
        0,
        0.82,
        1.13,
        1.33,
        1.5,
        1.73,
        1.89,
        2.1,
        2.23,
        2.44,
        2.67,
        2.88,
        3.11,
        3.4,
        3.8,
        4.15,
        4.55,
        5.18,
        6,
        7.2,
        16.82
      ],
      "dribblesPerGame": [
        3.14,
        9.63,
        11,
        12,
        12.86,
        13.67,
        14.33,
        15,
        15.5,
        16.17,
        16.8,
        17.56,
        18.21,
        19,
        19.78,
        20.6,
        21.71,
        23,
        24.54,
        27.11,
        41.67
      ],
      "tacklesWonPerGame": [
        0,
        0.4,
        0.54,
        0.6,
        0.7,
        0.8,
        0.89,
        1,
        1,
        1.17,
        1.22,
        1.3,
        1.4,
        1.5,
        1.6,
        1.71,
        1.83,
        2,
        2.29,
        2.73,
        4.78
      ],
      "interceptionsPerGame": [
        0,
        0.71,
        1,
        1.13,
        1.25,
        1.4,
        1.54,
        1.67,
        1.8,
        1.89,
        2,
        2.17,
        2.33,
        2.5,
        2.67,
        2.92,
        3.2,
        3.6,
        4.13,
        4.78,
        9.38
      ],
      "gainsPerGame": [
        0,
        0.63,
        0.83,
        1,
        1,
        1.14,
        1.21,
        1.33,
        1.4,
        1.46,
        1.57,
        1.64,
        1.73,
        1.83,
        2,
        2.09,
        2.2,
        2.36,
        2.57,
        2.89,
        4.8
      ],
      "tackleSuccess": [
        0,
        14.29,
        19.15,
        22.22,
        25,
        27.45,
        30,
        32.14,
        34.38,
        36.36,
        38.46,
        41.3,
        44,
        46.94,
        50,
        53.33,
        57.14,
        61.9,
        67.39,
        76.47,
        100
      ],
      "avgRating": [
        5.04,
        6.58,
        6.77,
        6.93,
        7.03,
        7.12,
        7.23,
        7.33,
        7.42,
        7.5,
        7.58,
        7.65,
        7.73,
        7.83,
        7.94,
        8.03,
        8.13,
        8.26,
        8.43,
        8.66,
        9.69
      ]
    },
    "GK": {
      "goalsPerGame": [
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0.08,
        0.14,
        0.17,
        0.33,
        0.4,
        0.8
      ],
      "chancesCreatedPerGame": [
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0.1,
        0.17,
        0.21,
        0.33,
        0.43,
        0.6,
        1.44
      ],
      "shotsOnTargetPerGame": [
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0.07,
        0.13,
        0.17,
        0.29,
        0.57,
        0.7,
        1,
        1.75
      ],
      "passCompletion": [
        41.86,
        62.92,
        65.22,
        67.09,
        70.49,
        72.09,
        74.29,
        75.76,
        77.42,
        78.05,
        79.28,
        80.43,
        81.67,
        82.86,
        84.62,
        85.42,
        86.44,
        87.5,
        89.47,
        90.91,
        100
      ],
      "passesPerGame": [
        1.5,
        2.6,
        3,
        3.4,
        3.8,
        4.13,
        4.25,
        4.33,
        4.44,
        4.64,
        5,
        5.2,
        5.38,
        5.56,
        6,
        6.25,
        6.79,
        8.14,
        9,
        11.21,
        17.22
      ],
      "lostPerGame": [
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0.1,
        0.14,
        0.23,
        0.3,
        0.5,
        1,
        1.14,
        1.43,
        2.33,
        3.8
      ],
      "dribblesPerGame": [
        0,
        0.57,
        0.8,
        1,
        1.17,
        1.4,
        1.6,
        1.67,
        1.75,
        2.18,
        2.54,
        2.8,
        3.14,
        3.25,
        3.78,
        4.7,
        5.5,
        6.25,
        7.86,
        8.93,
        15.78
      ],
      "tacklesWonPerGame": [
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0.2,
        0.22,
        0.43,
        0.57,
        0.63,
        0.71,
        2
      ],
      "interceptionsPerGame": [
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0.09,
        0.1,
        0.11,
        0.14,
        0.2,
        0.25,
        0.31,
        0.4,
        0.56,
        0.67,
        0.83,
        1.2,
        2
      ],
      "gainsPerGame": [
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0.1,
        0.13,
        0.17,
        0.2,
        0.22,
        0.38,
        0.5,
        0.6,
        0.86,
        0.9,
        1.71
      ],
      "savesPerGame": [
        1.33,
        1.88,
        2.33,
        2.57,
        3,
        3.36,
        3.63,
        3.8,
        4.2,
        4.5,
        4.75,
        5,
        5.11,
        5.29,
        5.56,
        5.75,
        6,
        6.3,
        6.75,
        7.33,
        9.25
      ],
      "concededPerGame": [
        0,
        0.4,
        0.6,
        0.67,
        0.8,
        1,
        1.14,
        1.2,
        1.38,
        1.43,
        1.5,
        1.56,
        1.67,
        1.87,
        2.07,
        2.2,
        2.4,
        2.67,
        3,
        3.5,
        6
      ],
      "cleanSheetRate": [
        0,
        0,
        0,
        10,
        14.29,
        16.67,
        18.18,
        20,
        22.22,
        25,
        28.57,
        33.33,
        33.33,
        38.46,
        40,
        42.86,
        50,
        60,
        60,
        66.67,
        100
      ],
      "avgRating": [
        4.8,
        5.34,
        5.53,
        5.62,
        5.8,
        5.88,
        5.96,
        6.04,
        6.08,
        6.13,
        6.22,
        6.3,
        6.33,
        6.41,
        6.47,
        6.54,
        6.64,
        6.73,
        6.93,
        7.03,
        7.8
      ],
      "tackleSuccess": [
        0,
        0,
        0,
        0,
        0,
        0,
        12.5,
        16.67,
        21.05,
        23.53,
        30,
        33.33,
        38.46,
        40,
        44.44,
        50,
        54.55,
        69.23,
        80,
        100,
        100
      ]
    },
    "DEF": {
      "goalsPerGame": [
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0.06,
        0.09,
        0.11,
        0.14,
        0.17,
        0.2,
        0.29,
        0.45,
        1.38
      ],
      "chancesCreatedPerGame": [
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0.09,
        0.13,
        0.14,
        0.17,
        0.2,
        0.24,
        0.29,
        0.33,
        0.44,
        0.6,
        2.5
      ],
      "shotsOnTargetPerGame": [
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0.08,
        0.11,
        0.13,
        0.15,
        0.17,
        0.2,
        0.25,
        0.29,
        0.33,
        0.42,
        0.5,
        0.63,
        1,
        2.5
      ],
      "passCompletion": [
        56.86,
        68.12,
        70.05,
        73.42,
        75,
        76.29,
        77.78,
        78.95,
        79.73,
        80.83,
        81.67,
        82.86,
        84.21,
        84.75,
        85.71,
        86.26,
        87.5,
        89.19,
        90.6,
        91.43,
        97.03
      ],
      "passesPerGame": [
        2.75,
        5.83,
        6.89,
        7.29,
        7.69,
        8.14,
        8.38,
        8.7,
        9.17,
        9.57,
        9.86,
        10.2,
        10.64,
        11.17,
        11.75,
        12.27,
        12.78,
        13.23,
        13.75,
        15.67,
        21.75
      ],
      "lostPerGame": [
        0,
        0.17,
        0.22,
        0.29,
        0.38,
        0.44,
        0.5,
        0.57,
        0.6,
        0.67,
        0.75,
        0.8,
        0.88,
        1,
        1.11,
        1.2,
        1.4,
        1.67,
        2,
        2.5,
        7.64
      ],
      "dribblesPerGame": [
        2.25,
        5.2,
        5.9,
        6.2,
        6.5,
        6.89,
        7,
        7.4,
        7.88,
        8.44,
        8.8,
        9.13,
        9.6,
        9.93,
        10.33,
        11,
        11.5,
        12.11,
        13.1,
        14.29,
        21
      ],
      "tacklesWonPerGame": [
        0.11,
        0.4,
        0.58,
        0.67,
        0.75,
        0.88,
        1,
        1,
        1.14,
        1.23,
        1.3,
        1.38,
        1.45,
        1.5,
        1.67,
        1.8,
        1.86,
        2,
        2.17,
        2.63,
        3.2
      ],
      "interceptionsPerGame": [
        0.5,
        1.25,
        1.6,
        1.83,
        2,
        2.13,
        2.25,
        2.33,
        2.45,
        2.58,
        2.67,
        2.8,
        2.86,
        3,
        3.09,
        3.2,
        3.4,
        3.55,
        3.86,
        4.25,
        5.83
      ],
      "gainsPerGame": [
        0.2,
        0.6,
        0.75,
        0.8,
        0.88,
        1,
        1.08,
        1.17,
        1.2,
        1.29,
        1.38,
        1.42,
        1.5,
        1.56,
        1.64,
        1.75,
        1.86,
        2,
        2.17,
        2.33,
        3.33
      ],
      "tackleSuccess": [
        11.11,
        26.09,
        31.25,
        35.29,
        37.84,
        39.34,
        42.11,
        44.44,
        45.65,
        47.5,
        50,
        51.72,
        53.57,
        56.25,
        57.89,
        60,
        63.64,
        66.67,
        72.73,
        80,
        100
      ],
      "avgRating": [
        5.86,
        6.62,
        6.8,
        6.95,
        6.99,
        7.07,
        7.13,
        7.17,
        7.22,
        7.31,
        7.37,
        7.43,
        7.54,
        7.62,
        7.66,
        7.73,
        7.82,
        7.96,
        8.07,
        8.23,
        9.3
      ]
    },
    "FWD": {
      "goalsPerGame": [
        0,
        0.2,
        0.4,
        0.5,
        0.6,
        0.67,
        0.78,
        0.83,
        0.91,
        1,
        1.1,
        1.17,
        1.23,
        1.33,
        1.45,
        1.6,
        1.77,
        1.9,
        2.14,
        2.5,
        5.43
      ],
      "chancesCreatedPerGame": [
        0,
        0.17,
        0.27,
        0.33,
        0.4,
        0.5,
        0.56,
        0.62,
        0.67,
        0.75,
        0.81,
        0.88,
        1,
        1,
        1.14,
        1.2,
        1.38,
        1.5,
        1.72,
        2,
        4.22
      ],
      "shotsOnTargetPerGame": [
        0,
        0.8,
        1,
        1.25,
        1.4,
        1.57,
        1.71,
        1.83,
        2,
        2.1,
        2.25,
        2.36,
        2.5,
        2.63,
        2.83,
        3,
        3.25,
        3.5,
        3.83,
        4.4,
        7.71
      ],
      "passCompletion": [
        38.18,
        64,
        67.2,
        70,
        71.6,
        73.02,
        74.12,
        75.17,
        76.14,
        77.05,
        77.84,
        78.48,
        79.45,
        80.17,
        80.88,
        81.82,
        82.68,
        83.84,
        85.32,
        87.05,
        96.97
      ],
      "passesPerGame": [
        3.5,
        7.67,
        8.8,
        9.76,
        10.44,
        11,
        11.6,
        12.25,
        12.73,
        13.22,
        13.83,
        14.29,
        14.88,
        15.56,
        16.08,
        16.9,
        17.67,
        18.83,
        20.33,
        22.2,
        35
      ],
      "lostPerGame": [
        0.29,
        1.57,
        1.93,
        2.2,
        2.43,
        2.64,
        2.86,
        3,
        3.25,
        3.5,
        3.73,
        4,
        4.18,
        4.45,
        4.73,
        5.08,
        5.5,
        6.08,
        7,
        8.25,
        16.91
      ],
      "dribblesPerGame": [
        3,
        8,
        9.13,
        9.83,
        10.6,
        11.25,
        11.75,
        12.4,
        13,
        13.45,
        14,
        14.5,
        15,
        15.6,
        16.2,
        17,
        17.78,
        18.63,
        20,
        22.2,
        33
      ],
      "tacklesWonPerGame": [
        0,
        0.17,
        0.29,
        0.38,
        0.43,
        0.5,
        0.54,
        0.6,
        0.64,
        0.67,
        0.73,
        0.78,
        0.82,
        0.89,
        1,
        1,
        1.14,
        1.2,
        1.36,
        1.6,
        2.71
      ],
      "interceptionsPerGame": [
        0,
        0.33,
        0.43,
        0.5,
        0.6,
        0.67,
        0.75,
        0.8,
        0.83,
        0.9,
        1,
        1,
        1.12,
        1.2,
        1.25,
        1.33,
        1.44,
        1.6,
        1.8,
        2,
        4.36
      ],
      "gainsPerGame": [
        0,
        0.33,
        0.5,
        0.6,
        0.67,
        0.75,
        0.8,
        0.88,
        0.93,
        1,
        1,
        1.13,
        1.2,
        1.27,
        1.38,
        1.45,
        1.6,
        1.7,
        1.86,
        2.13,
        3.8
      ],
      "tackleSuccess": [
        0,
        8.57,
        11.76,
        14.29,
        16.67,
        19.59,
        21.43,
        23.53,
        25.49,
        27.45,
        29.63,
        32,
        33.33,
        37.14,
        40,
        43.33,
        47.62,
        51.11,
        59.26,
        71.43,
        100
      ],
      "avgRating": [
        4.44,
        6.52,
        6.72,
        6.86,
        6.95,
        7.06,
        7.16,
        7.24,
        7.34,
        7.43,
        7.54,
        7.67,
        7.76,
        7.86,
        7.98,
        8.1,
        8.24,
        8.38,
        8.58,
        8.88,
        10
      ]
    }
  }
};

// src/lib/advancedStats.ts
var ROLE_LABELS = { GK: "Goalkeeper", DEF: "Defender", MID: "Midfielder", FWD: "Forward" };
function roleOf(position) {
  const p = String(position || "").trim().toLowerCase();
  if (!p) return null;
  if (p === "goalkeeper" || p === "gk") return "GK";
  if (p === "defender" || ["cb", "lcb", "rcb", "lb", "rb", "lwb", "rwb", "sw"].includes(p)) return "DEF";
  if (p === "midfielder" || ["cdm", "ldm", "rdm", "cm", "lcm", "rcm", "cam", "lam", "ram", "lm", "rm"].includes(p)) return "MID";
  if (p === "forward" || p === "attacker" || ["st", "ls", "rs", "cf", "lf", "rf", "lw", "rw"].includes(p)) return "FWD";
  return null;
}
function pct(made, total) {
  return total > 0 ? made / total * 100 : null;
}
function perGame(total, games) {
  return games > 0 ? total / games : null;
}
function addInto(into, add) {
  for (const [k, v] of Object.entries(add)) into[k] = (into[k] || 0) + v;
}
function emptyTotals() {
  return statsFromCounts({});
}
function decisionScore(t) {
  const good = (t.bestOption || 0) + (t.goodOption || 0);
  const bad = (t.shouldHavePassedElsewhere || 0) + (t.useTheBall || 0);
  return pct(good, good + bad);
}
function positionalDiscipline(t) {
  const good = t.inPosition || 0;
  return pct(good, good + (t.outOfPosition || 0));
}
var PASS_STYLE_CUTOFFS = { progressive: 64, recycler: 43 };
function passStyle(forwardShare) {
  if (forwardShare === null) return null;
  if (forwardShare >= PASS_STYLE_CUTOFFS.progressive) return "Progressive";
  if (forwardShare <= PASS_STYLE_CUTOFFS.recycler) return "Recycler";
  return "Balanced";
}
function deriveStats(t, games) {
  const fwd = t.forwardPasses || 0;
  const forwardShare = pct(fwd, fwd + (t.backwardPasses || 0) + (t.sidewaysPasses || 0));
  const shots = (t.shotsOnTarget || 0) + (t.shotsOffTarget || 0);
  const tackles = t.tacklesWon || 0;
  return {
    passCompletion: pct(t.passesCompleted || 0, (t.passesCompleted || 0) + (t.passesFailed || 0)),
    shortPassPct: pct(t.shortPassesMade || 0, (t.shortPassesMade || 0) + (t.shortPassesFailed || 0)),
    mediumPassPct: pct(t.mediumPassesMade || 0, (t.mediumPassesMade || 0) + (t.mediumPassesFailed || 0)),
    longPassPct: pct(t.longPassesMade || 0, (t.longPassesMade || 0) + (t.longPassesFailed || 0)),
    crossPct: pct(t.crossesMade || 0, (t.crossesMade || 0) + (t.crossesFailed || 0)),
    forwardShare,
    passStyle: passStyle(forwardShare),
    shotAccuracy: pct(t.shotsOnTarget || 0, shots),
    insideBoxShotShare: pct((t.shotsOnTargetInBox || 0) + (t.shotsOffTargetInBox || 0), shots),
    tackleSuccess: pct(tackles, tackles + (t.tacklesLost || 0)),
    slidingTackleShare: pct(t.slidingTacklesWon || 0, (t.slidingTacklesWon || 0) + (t.standingTacklesWon || 0)),
    pressingPerGame: perGame(t.wonAttackingThird || 0, games),
    lostOwnThirdPerGame: perGame(t.lostDefensiveThird || 0, games),
    netPossessionPerGame: perGame((t.possessionGains || 0) - (t.possessionsLost || 0), games),
    outOfPositionPerGame: perGame(t.outOfPosition || 0, games),
    severeOutOfPositionPerGame: perGame(t.outOfPositionSevere || 0, games),
    positionalDiscipline: positionalDiscipline(t),
    decisionScore: decisionScore(t),
    aerialsPerGame: perGame(t.aerialsWon || 0, games),
    foulsPerGame: perGame(t.foulsCommitted || 0, games),
    cardsPerGame: perGame(t.yellowCards || 0, games)
  };
}
function keyOf(p) {
  const name = (p.ea_username || "").trim();
  return name ? name.toLowerCase() : null;
}
function num(v) {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}
var MIN_ROLE_GAMES = 3;
function computeAdvancedPlayers(matches, minGames = 1) {
  const acc = /* @__PURE__ */ new Map();
  for (const m of matches) {
    for (const p of m.players) {
      const key = keyOf(p);
      if (!key || !p.events) continue;
      const s = statsFromCounts(p.events);
      let a = acc.get(key);
      if (!a) acc.set(key, a = { name: (p.ea_username || "").trim(), games: 0, totals: emptyTotals(), roles: /* @__PURE__ */ new Map() });
      a.games++;
      addInto(a.totals, s);
      const role = roleOf(p.position);
      if (role) {
        let r = a.roles.get(role);
        if (!r) a.roles.set(role, r = { games: 0, totals: emptyTotals(), rating: 0, rated: 0 });
        r.games++;
        addInto(r.totals, s);
        const rating = num(p.rating);
        if (rating !== null && rating > 0) {
          r.rating += rating;
          r.rated++;
        }
      }
    }
  }
  const out = [];
  for (const [key, a] of acc) {
    if (a.games < minGames) continue;
    const roles = [...a.roles.entries()].map(([role, r]) => ({
      role,
      games: r.games,
      avgRating: r.rated ? r.rating / r.rated : null,
      positionalDiscipline: positionalDiscipline(r.totals),
      decisionScore: decisionScore(r.totals),
      outOfPositionPerGame: perGame(r.totals.outOfPosition || 0, r.games)
    })).sort((x, y) => y.games - x.games);
    const candidates = roles.filter((r) => r.role !== "GK" && r.games >= MIN_ROLE_GAMES && r.avgRating !== null);
    const bestRole = candidates.length >= 2 ? [...candidates].sort((x, y) => y.avgRating - x.avgRating || (y.positionalDiscipline ?? 0) - (x.positionalDiscipline ?? 0))[0].role : null;
    out.push({ key, name: a.name, games: a.games, totals: a.totals, derived: deriveStats(a.totals, a.games), roles, bestRole });
  }
  return out.sort((x, y) => y.games - x.games || x.name.localeCompare(y.name));
}
function teamEvents(m) {
  const totals = emptyTotals();
  let players = 0;
  for (const p of m.players) {
    if (!p.events) continue;
    addInto(totals, statsFromCounts(p.events));
    players++;
  }
  return players ? { totals, players } : null;
}
function rec() {
  return { games: 0, wins: 0, draws: 0, losses: 0 };
}
function addResult(r, m) {
  r.games++;
  if (m.result === "win") r.wins++;
  else if (m.result === "draw") r.draws++;
  else r.losses++;
}
function winRate(r) {
  return r.games ? r.wins / r.games * 100 : 0;
}
function computePartnerships(matches, minTogether = 5) {
  const perMatch = matches.map((m) => {
    const lines = /* @__PURE__ */ new Map();
    for (const p of m.players) {
      const key = keyOf(p);
      if (!key || !p.events) continue;
      const s = statsFromCounts(p.events);
      lines.set(key, { name: (p.ea_username || "").trim(), oop: s.outOfPosition || 0, lost: s.possessionsLost || 0, role: roleOf(p.position) });
    }
    return { m, lines };
  });
  const pairs = /* @__PURE__ */ new Map();
  for (const { m, lines } of perMatch) {
    const keys = [...lines.keys()].sort();
    for (let i = 0; i < keys.length; i++) {
      for (let j = i + 1; j < keys.length; j++) {
        const a = lines.get(keys[i]);
        const b = lines.get(keys[j]);
        if (!a.role || !b.role || a.role === "GK" || b.role === "GK" || a.role === "FWD" || b.role === "FWD") continue;
        const id = `${keys[i]}|${keys[j]}`;
        let pr = pairs.get(id);
        if (!pr) pairs.set(id, pr = { names: [a.name, b.name], roles: /* @__PURE__ */ new Map(), together: rec(), oop: 0, lost: 0 });
        const roleId = [a.role, b.role].sort().join(" + ");
        pr.roles.set(roleId, (pr.roles.get(roleId) || 0) + 1);
        addResult(pr.together, m);
        pr.oop += a.oop + b.oop;
        pr.lost += a.lost + b.lost;
      }
    }
  }
  const out = [];
  for (const [id, pr] of pairs) {
    if (pr.together.games < minTogether) continue;
    const [ka, kb] = id.split("|");
    const apart = (k, other) => {
      let games = 0, oop = 0, lost = 0;
      for (const { lines } of perMatch) {
        const l = lines.get(k);
        if (!l || lines.has(other)) continue;
        games++;
        oop += l.oop;
        lost += l.lost;
      }
      return games >= 2 ? { oop: oop / games, lost: lost / games } : null;
    };
    const a = apart(ka, kb);
    const b = apart(kb, ka);
    const roles = [...pr.roles.entries()].sort((x, y) => y[1] - x[1])[0][0];
    out.push({
      names: pr.names,
      roles,
      games: pr.together.games,
      winPct: winRate(pr.together),
      outOfPositionTogether: pr.oop / pr.together.games,
      outOfPositionApart: a && b ? a.oop + b.oop : null,
      lostTogether: pr.lost / pr.together.games,
      lostApart: a && b ? a.lost + b.lost : null
    });
  }
  const gain = (p) => p.outOfPositionApart === null ? -Infinity : p.outOfPositionApart - p.outOfPositionTogether;
  return out.sort((x, y) => gain(y) - gain(x) || y.games - x.games);
}
var SESSION_GAP_MS = 90 * 60 * 1e3;
function computeSessionFatigue(matches, buckets = 5) {
  const sorted = [...matches].sort((a, b) => a.playedAt.getTime() - b.playedAt.getTime());
  const acc = Array.from({ length: buckets }, () => ({ r: rec(), totals: emptyTotals(), playerGames: 0 }));
  let n = 0;
  let last = -Infinity;
  for (const m of sorted) {
    const t = m.playedAt.getTime();
    n = t - last > SESSION_GAP_MS ? 1 : n + 1;
    last = t;
    const b = acc[Math.min(n, buckets) - 1];
    addResult(b.r, m);
    const te = teamEvents(m);
    if (te) {
      addInto(b.totals, te.totals);
      b.playerGames += te.players;
    }
  }
  return acc.map((b, i) => ({
    gameNumber: i + 1,
    label: i + 1 === buckets ? `Game ${buckets}+` : `Game ${i + 1}`,
    games: b.r.games,
    winPct: winRate(b.r),
    decisionScore: decisionScore(b.totals),
    positionalDiscipline: positionalDiscipline(b.totals),
    outOfPositionPerPlayer: b.playerGames ? (b.totals.outOfPosition || 0) / b.playerGames : null
  })).filter((l) => l.games > 0);
}
function computePressing(matches) {
  const rows = matches.map((m) => ({ m, te: teamEvents(m) })).filter((x) => !!x.te).map((x) => ({ m: x.m, v: x.te.totals.wonAttackingThird || 0 })).sort((a, b) => a.v - b.v);
  if (rows.length < 9) return [];
  const cut = (i) => rows[Math.min(rows.length - 1, Math.floor(rows.length * i / 3))].v;
  const lowMax = cut(1);
  const midMax = Math.max(cut(2), lowMax + 1);
  const groups = [
    ["Low", (v) => v < lowMax, `0-${Math.max(0, lowMax - 1)}`],
    ["Medium", (v) => v >= lowMax && v < midMax, lowMax === midMax - 1 ? `${lowMax}` : `${lowMax}-${midMax - 1}`],
    ["High", (v) => v >= midMax, `${midMax}+`]
  ];
  return groups.map(([band, test, range]) => {
    const r = rec();
    let gf = 0, ga = 0;
    for (const x of rows) {
      if (!test(x.v)) continue;
      addResult(r, x.m);
      gf += x.m.scoreFor;
      ga += x.m.scoreAgainst;
    }
    return { band, range, games: r.games, winPct: winRate(r), goalsFor: r.games ? gf / r.games : 0, goalsAgainst: r.games ? ga / r.games : 0 };
  }).filter((b) => b.games > 0).map((b, i, list) => list.length === 2 ? { ...b, band: i === 0 ? "Low" : "High" } : b);
}
var r0 = (n) => `${Math.round(n)}%`;
function generateAdvancedInsights(matches) {
  const out = [];
  if (matches.filter((m) => m.players.some((p) => p.events)).length < 5) return out;
  const fatigue = computeSessionFatigue(matches);
  const early = fatigue.filter((l) => l.gameNumber <= 2);
  const late = fatigue.filter((l) => l.gameNumber >= 4);
  const avg2 = (ls, k) => {
    const g = ls.reduce((s, l) => s + (l[k] === null ? 0 : l.games), 0);
    return g ? ls.reduce((s, l) => s + (l[k] ?? 0) * l.games, 0) / g : null;
  };
  const earlyGames = early.reduce((s, l) => s + l.games, 0);
  const lateGames = late.reduce((s, l) => s + l.games, 0);
  if (earlyGames >= 5 && lateGames >= 5) {
    const dq1 = avg2(early, "decisionScore");
    const dq2 = avg2(late, "decisionScore");
    const w1 = avg2(early, "winPct");
    const w2 = avg2(late, "winPct");
    if (dq1 !== null && dq2 !== null && dq1 - dq2 >= 4) {
      out.push({ tone: "bad", text: `Decisions slip late in a session: ${r0(dq1)} good calls in games 1-2 vs ${r0(dq2)} from game 4 on (win rate ${r0(w1)} vs ${r0(w2)}).` });
    } else if (w1 - w2 >= 15) {
      out.push({ tone: "bad", text: `The club wins ${r0(w1)} of games 1-2 in a session but ${r0(w2)} from game 4 on.` });
    }
  }
  const first = fatigue.find((l) => l.gameNumber === 1);
  const rest = fatigue.filter((l) => l.gameNumber > 1);
  const restGames = rest.reduce((s, l) => s + l.games, 0);
  if (first && first.games >= 5 && restGames >= 5) {
    const wr = avg2(rest, "winPct");
    if (wr - first.winPct >= 15) out.push({ tone: "neutral", text: `Slow starter: the club wins ${r0(first.winPct)} of the first game of a session and ${r0(wr)} after that. A warm-up game may help.` });
  }
  const pressing = computePressing(matches);
  const low = pressing.find((b) => b.band === "Low");
  const high = pressing.find((b) => b.band === "High");
  if (low && high && low.games >= 5 && high.games >= 5 && Math.abs(high.winPct - low.winPct) >= 15) {
    out.push({
      tone: high.winPct > low.winPct ? "good" : "neutral",
      text: high.winPct > low.winPct ? `Pressing pays: ${r0(high.winPct)} wins when the club wins the ball in the attacking third ${high.range} times, ${r0(low.winPct)} when it's ${low.range}.` : `High pressing hasn't paid off: ${r0(high.winPct)} wins in high-press games vs ${r0(low.winPct)} in low-press ones.`
    });
  }
  const players = computeAdvancedPlayers(matches, 5);
  const byDecision = players.filter((p) => p.derived.decisionScore !== null).sort((a, b) => b.derived.decisionScore - a.derived.decisionScore);
  if (byDecision.length >= 3) {
    out.push({ tone: "good", text: `${byDecision[0].name} makes the best calls on the ball: ${r0(byDecision[0].derived.decisionScore)} of EA's decision feedback is "good option" or better.` });
  }
  const loose = players.filter((p) => p.roles[0]?.role !== "GK" && p.derived.outOfPositionPerGame !== null).sort((a, b) => b.derived.outOfPositionPerGame - a.derived.outOfPositionPerGame);
  if (loose.length >= 3 && loose[0].derived.outOfPositionPerGame >= 4) {
    out.push({ tone: "bad", text: `${loose[0].name} gets the most out-of-position warnings: ${loose[0].derived.outOfPositionPerGame.toFixed(1)} a game.` });
  }
  for (const p of players) {
    if (!p.bestRole || p.roles[0].role === p.bestRole) continue;
    const best = p.roles.find((r) => r.role === p.bestRole);
    const main = p.roles[0];
    if ((best.avgRating ?? 0) - (main.avgRating ?? 0) >= 0.5) {
      out.push({ tone: "neutral", text: `${p.name} mostly plays ${ROLE_LABELS[main.role].toLowerCase()} but rates higher as a ${ROLE_LABELS[p.bestRole].toLowerCase()} (${best.avgRating.toFixed(1)} vs ${main.avgRating.toFixed(1)} over ${best.games} games).` });
      break;
    }
  }
  const pair = computePartnerships(matches).find((p) => p.outOfPositionApart !== null && p.outOfPositionApart - p.outOfPositionTogether >= 2);
  if (pair) {
    out.push({ tone: "good", text: `${pair.names.join(" + ")} cover for each other: ${pair.outOfPositionTogether.toFixed(1)} out-of-position warnings a game together vs ${pair.outOfPositionApart.toFixed(1)} apart (${pair.games} games).` });
  }
  return out;
}
var perGameOf = (k) => (p) => p.games ? (p.totals[k] || 0) / p.games : null;
var BENCH_METRICS = [
  { key: "decisionScore", label: "Decisions", get: (p) => p.derived.decisionScore },
  { key: "positionalDiscipline", label: "Positioning", get: (p) => p.derived.positionalDiscipline },
  { key: "outOfPositionPerGame", label: "Out of position", lowerIsBetter: true, get: (p) => p.derived.outOfPositionPerGame },
  { key: "passCompletion", label: "Pass completion", get: (p) => p.derived.passCompletion },
  { key: "tackleSuccess", label: "Tackle success", get: (p) => p.derived.tackleSuccess },
  { key: "shotAccuracy", label: "Shot accuracy", get: (p) => p.derived.shotAccuracy },
  { key: "pressingPerGame", label: "Pressing", get: (p) => p.derived.pressingPerGame },
  { key: "aerialsPerGame", label: "Aerials", get: (p) => p.derived.aerialsPerGame },
  { key: "interceptionsPerGame", label: "Interceptions", get: perGameOf("interceptions") },
  { key: "dribblesPerGame", label: "Dribbles", get: perGameOf("dribbles") },
  { key: "throughBallsPerGame", label: "Through balls", get: perGameOf("throughBalls") },
  { key: "secondAssistsPerGame", label: "Second assists", get: perGameOf("secondAssists") }
];
function benchRole(p) {
  const r = p.roles[0]?.role;
  return r && FC27_BENCHMARKS.roles[r] ? r : null;
}
function fc27Percentile(role, metric, value) {
  const q = FC27_BENCHMARKS.roles[role]?.[metric];
  const m = BENCH_METRICS.find((b) => b.key === metric);
  if (!q || value === null || !m) return null;
  let pct2;
  if (value <= q[0]) pct2 = 0;
  else if (value >= q[q.length - 1]) pct2 = 100;
  else {
    let i = 0;
    while (i < q.length - 1 && q[i + 1] < value) i++;
    let j = i + 1;
    while (j < q.length - 1 && q[j + 1] === value) j++;
    const lo = q[i], hi = q[j];
    const frac = hi > lo ? (value - lo) / (hi - lo) : 0.5;
    pct2 = (i + frac * (j - i)) * (100 / (q.length - 1));
  }
  return m.lowerIsBetter ? 100 - pct2 : pct2;
}
function benchmarkPlayer(p) {
  const role = benchRole(p);
  if (!role) return [];
  const out = [];
  for (const m of BENCH_METRICS) {
    const value = m.get(p);
    const percentile = fc27Percentile(role, m.key, value);
    if (value !== null && percentile !== null) out.push({ key: m.key, label: m.label, value, percentile });
  }
  return out.sort((a, b) => b.percentile - a.percentile);
}
function percentileText(percentile, role) {
  const roleWord = ROLE_LABELS[role].toLowerCase() + "s";
  if (percentile >= 50) return `top ${Math.max(1, Math.round(100 - percentile))}% of FC27 ${roleWord}`;
  return `bottom ${Math.max(1, Math.round(percentile))}% of FC27 ${roleWord}`;
}
var diff = (a, b) => a === null || b === null ? null : a - b;
function computeFormTrends(matches, recent = 10, minEarlier = 5) {
  const sorted = [...matches].sort((a, b) => b.playedAt.getTime() - a.playedAt.getTime());
  const lines = /* @__PURE__ */ new Map();
  for (const m of sorted) {
    for (const p of m.players) {
      const key = keyOf(p);
      if (!key || !p.events) continue;
      let l = lines.get(key);
      if (!l) lines.set(key, l = { name: (p.ea_username || "").trim(), recent: emptyTotals(), earlier: emptyTotals(), r: 0, e: 0 });
      if (l.r < recent) {
        addInto(l.recent, statsFromCounts(p.events));
        l.r++;
      } else {
        addInto(l.earlier, statsFromCounts(p.events));
        l.e++;
      }
    }
  }
  const out = [];
  for (const [key, l] of lines) {
    if (l.r < Math.min(recent, 5) || l.e < minEarlier) continue;
    const r = deriveStats(l.recent, l.r);
    const e = deriveStats(l.earlier, l.e);
    const decisionChange = diff(r.decisionScore, e.decisionScore);
    const positioningChange = diff(r.positionalDiscipline, e.positionalDiscipline);
    const score = (decisionChange ?? 0) + (positioningChange ?? 0) / 2;
    out.push({
      key,
      name: l.name,
      recentGames: l.r,
      earlierGames: l.e,
      decisionChange,
      positioningChange,
      passCompletionChange: diff(r.passCompletion, e.passCompletion),
      tackleSuccessChange: diff(r.tackleSuccess, e.tackleSuccess),
      recent: r,
      earlier: e,
      trend: score >= 5 ? "Improving" : score <= -5 ? "Dipping" : "Steady"
    });
  }
  const weight = (t) => (t.decisionChange ?? 0) + (t.positioningChange ?? 0) / 2;
  return out.sort((a, b) => weight(b) - weight(a));
}
function matchDeepHighlights(m) {
  const rows = m.players.filter((p) => p.events && roleOf(p.position) !== "GK").map((p) => ({ name: (p.ea_username || "").trim(), s: statsFromCounts(p.events) }));
  if (!rows.length) return [];
  const out = [];
  const decided = rows.map((r) => {
    const good = r.s.bestOption + r.s.goodOption;
    const total = good + r.s.shouldHavePassedElsewhere + r.s.useTheBall;
    return { ...r, good, total, score: total ? good / total : 0 };
  }).filter((r) => r.total >= 6).sort((a, b) => b.score - a.score || b.good - a.good);
  if (decided[0] && decided[0].score >= 0.6) {
    out.push({ kind: "decisions", name: decided[0].name, text: `${decided[0].name} made the best calls: ${decided[0].good} of ${decided[0].total} rated a good option` });
  }
  const loose = [...rows].sort((a, b) => b.s.outOfPosition - a.s.outOfPosition)[0];
  if (loose && loose.s.outOfPosition >= 5) {
    out.push({ kind: "positioning", name: loose.name, text: `${loose.name} was caught out of position ${loose.s.outOfPosition} times` });
  }
  const presser = [...rows].sort((a, b) => b.s.wonAttackingThird - a.s.wonAttackingThird)[0];
  if (presser && presser.s.wonAttackingThird >= 2) {
    out.push({ kind: "pressing", name: presser.name, text: `${presser.name} won the ball back ${presser.s.wonAttackingThird} times in the attacking third` });
  }
  const passer = rows.filter((r) => r.s.throughBalls + r.s.secondAssists >= 2).sort((a, b) => b.s.throughBalls + b.s.secondAssists - (a.s.throughBalls + a.s.secondAssists))[0];
  if (passer) {
    out.push({ kind: "passing", name: passer.name, text: `${passer.name} unlocked them with ${passer.s.throughBalls} through balls and ${passer.s.secondAssists} second assists` });
  }
  return out;
}
function teamPercentile(metric, value) {
  const q = FC27_BENCHMARKS.team?.[metric];
  if (!q || value === null) return null;
  let i = 0;
  while (i < q.length - 1 && q[i + 1] <= value) i++;
  return i * 100 / (q.length - 1);
}
function computeOpponentProfiles(matches) {
  const acc = /* @__PURE__ */ new Map();
  for (const m of matches) {
    const opp = m.opponentPlayers || [];
    if (!opp.length) continue;
    const key = m.opponent.trim().toLowerCase();
    let a = acc.get(key);
    if (!a) acc.set(key, a = { name: m.opponent, games: 0, w: 0, d: 0, l: 0, totals: emptyTotals(), withEvents: 0, players: /* @__PURE__ */ new Map() });
    a.games++;
    if (m.result === "win") a.w++;
    else if (m.result === "draw") a.d++;
    else a.l++;
    let any = false;
    for (const p of opp) {
      if (p.events) {
        addInto(a.totals, statsFromCounts(p.events));
        any = true;
      }
      const pk = keyOf(p);
      if (!pk) continue;
      let pl = a.players.get(pk);
      if (!pl) a.players.set(pk, pl = { name: (p.ea_username || "").trim(), games: 0, goals: 0, shots: 0, rating: 0, rated: 0 });
      pl.games++;
      pl.goals += num(p.goals) ?? 0;
      pl.shots += num(p.shots) ?? 0;
      const r = num(p.rating);
      if (r !== null && r > 0) {
        pl.rating += r;
        pl.rated++;
      }
    }
    if (any) a.withEvents++;
  }
  const out = [];
  for (const a of acc.values()) {
    const g = a.withEvents;
    const d = deriveStats(a.totals, Math.max(g, 1));
    const t = a.totals;
    const perGame2 = {
      pressing: g ? t.wonAttackingThird / g : 0,
      lostOwnThird: g ? t.lostDefensiveThird / g : 0,
      aerialsWon: g ? t.aerialsWon / g : 0,
      shots: g ? (t.shotsOnTarget + t.shotsOffTarget) / g : 0
    };
    const tips = [];
    if (g) {
      const press = teamPercentile("pressingPerGame", perGame2.pressing);
      const lost = teamPercentile("lostOwnThirdPerGame", perGame2.lostOwnThird);
      const air = teamPercentile("aerialsPerGame", perGame2.aerialsWon);
      const box = teamPercentile("insideBoxShotShare", d.insideBoxShotShare);
      const comp = teamPercentile("passCompletion", d.passCompletion);
      if (press !== null && press >= 75) tips.push("They press high: move the ball quickly and avoid risky passes at the back.");
      if (lost !== null && lost >= 75) tips.push("They give the ball away in their own third: press them high.");
      if (air !== null && air <= 25) tips.push("They win few headers: crosses and long balls are worth trying.");
      if (air !== null && air >= 75) tips.push("They're strong in the air: keep crosses low and defend the back post.");
      if (box !== null && box >= 75) tips.push("Almost all their shots come from inside the box: protect the middle and block lanes.");
      if (box !== null && box <= 25) tips.push("They shoot from distance a lot: close down outside the box.");
      if (comp !== null && comp <= 25) tips.push("Their passing is loose: sit compact and pounce on mistakes.");
      if (d.passStyle === "Progressive") tips.push("They play forward fast: keep a deep line and track runners.");
      if (d.passStyle === "Recycler") tips.push("They keep the ball and recycle it: stay patient and don't get dragged out.");
    }
    const threats = [...a.players.values()].filter((p) => p.games >= 1).sort((x, y) => y.goals - x.goals || y.shots - x.shots).slice(0, 3).map((p) => ({ name: p.name, games: p.games, goals: p.goals, shots: p.shots, avgRating: p.rated ? p.rating / p.rated : null }));
    out.push({
      opponent: a.name,
      games: a.games,
      record: { wins: a.w, draws: a.d, losses: a.l },
      perGame: perGame2,
      passCompletion: g ? d.passCompletion : null,
      forwardShare: g ? d.forwardShare : null,
      passStyle: g ? d.passStyle : null,
      insideBoxShotShare: g ? d.insideBoxShotShare : null,
      decisionScore: g ? d.decisionScore : null,
      threats,
      tips: tips.slice(0, 4)
    });
  }
  return out.sort((x, y) => y.games - x.games || x.opponent.localeCompare(y.opponent));
}
function lineupHints(matches) {
  const bestRole = {};
  for (const p of computeAdvancedPlayers(matches, MIN_ROLE_GAMES)) if (p.bestRole) bestRole[p.key] = p.bestRole;
  const partners = computePartnerships(matches).filter((p) => p.outOfPositionApart !== null && p.outOfPositionApart - p.outOfPositionTogether >= 1.5).slice(0, 5).map((p) => [p.names[0].toLowerCase(), p.names[1].toLowerCase()]);
  return { bestRole, partners };
}

// src/lib/divisionProgress.ts
function parseDivision(value) {
  if (value === null || value === void 0 || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const m = String(value).match(/\d+/);
  return m ? Number(m[0]) : null;
}
function divisionLabel(division) {
  return division === null || division === void 0 ? "\u2013" : `Division ${division}`;
}
function isDivisionMatch(m) {
  return !/friendly|competition|cup|playoff|tournament|byot/i.test(String(m.matchType || ""));
}
var DAY_MS = 864e5;
function srAgo(rows, days) {
  const latest = rows[rows.length - 1];
  if (!latest || latest.skill_rating === null) return null;
  const target = Date.parse(latest.captured_on) - days * DAY_MS;
  let pick = null;
  for (const r of rows) {
    if (r === latest || r.skill_rating === null) continue;
    if (Date.parse(r.captured_on) <= target) pick = r;
  }
  if (!pick) {
    const oldest = rows.find((r) => r !== latest && r.skill_rating !== null);
    if (!oldest || Date.parse(latest.captured_on) - Date.parse(oldest.captured_on) < Math.min(days, 2) * DAY_MS) return null;
    pick = oldest;
  }
  return latest.skill_rating - pick.skill_rating;
}
function summarizeDivision(history, matches = []) {
  const rows = [...history].sort((a, b) => a.captured_on.localeCompare(b.captured_on));
  const latest = rows[rows.length - 1] || null;
  const changes = [];
  let prevDiv = null;
  let inDivisionSince = null;
  for (const r of rows) {
    if (r.current_division === null) continue;
    if (prevDiv === null) inDivisionSince = r.captured_on;
    else if (r.current_division !== prevDiv) {
      changes.push({ on: r.captured_on, from: prevDiv, to: r.current_division, kind: r.current_division < prevDiv ? "promoted" : "relegated" });
      inDivisionSince = r.captured_on;
    }
    prevDiv = r.current_division;
  }
  changes.reverse();
  const sinceMs = inDivisionSince ? Date.parse(inDivisionSince) : null;
  const sinceRecord = { wins: 0, draws: 0, losses: 0, points: 0, played: 0 };
  if (sinceMs !== null) {
    for (const m of matches) {
      if (!isDivisionMatch(m) || m.playedAt.getTime() < sinceMs) continue;
      sinceRecord.played++;
      if (m.result === "win") sinceRecord.wins++;
      else if (m.result === "draw") sinceRecord.draws++;
      else sinceRecord.losses++;
    }
    sinceRecord.points = sinceRecord.wins * 3 + sinceRecord.draws;
  }
  const ranked = rows.filter((r) => r.season_rank !== null);
  const seasonRankChange = ranked.length >= 2 && latest?.season_rank !== null && latest?.season_rank !== void 0 ? ranked[ranked.length - 2].season_rank - latest.season_rank : null;
  const hasSeasonRecord = latest && [latest.season_wins, latest.season_draws, latest.season_losses].some((v) => v !== null);
  return {
    division: latest?.current_division ?? null,
    bestDivision: latest?.best_division ?? null,
    skillRating: latest?.skill_rating ?? null,
    srChange7d: srAgo(rows, 7),
    srChange30d: srAgo(rows, 30),
    promotions: latest?.promotions ?? null,
    relegations: latest?.relegations ?? null,
    seasonPoints: latest?.season_points ?? null,
    seasonRecord: hasSeasonRecord ? { wins: latest.season_wins || 0, draws: latest.season_draws || 0, losses: latest.season_losses || 0 } : null,
    seasonRank: latest?.season_rank ?? null,
    alltimeRank: latest?.alltime_rank ?? null,
    seasonRankChange,
    leaderboardChecked: !!latest?.leaderboard_checked,
    changes,
    inDivisionSince,
    sinceRecord,
    trend: rows.map((r) => ({ date: r.captured_on, division: r.current_division, skillRating: r.skill_rating, seasonRank: r.season_rank })),
    trackedSince: rows[0]?.captured_on ?? null
  };
}
function signed(n) {
  return n > 0 ? `+${n}` : String(n);
}

// src/lib/matchPerformance.ts
var GOAL_MODEL = {
  onTargetInBox: 0.551,
  onTargetOutsideBox: 0.149,
  // Fallbacks when a side has no event data: goals per shot on target, then per shot
  perShotOnTarget: 0.491,
  perShot: 0.348
};
var SCORE_MAX = 1e3;
var AREAS = [
  { key: "attack", label: "Attack", help: "Modelled goals for: shots on target, worth more from inside the box." },
  { key: "ballSecurity", label: "Ball security", help: "Pass completion and how rarely the ball is given away (per player)." },
  { key: "defending", label: "Defending", help: "Modelled goals against: how few good chances you allow." },
  { key: "control", label: "Control", help: "Your share of the game's modelled goals." },
  { key: "ratingEdge", label: "Rating edge", help: "Your players' average EA match rating minus the opposition's." }
];
function num2(v) {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}
var mean = (xs) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
function sideTotals(players) {
  if (!players.length) return null;
  let inBox = 0, outBox = 0, sot = 0, shots = 0, made = 0, attempts = 0, lost = 0, withEvents2 = 0, sotKnown = false;
  const ratings = [];
  for (const p of players) {
    const r = num2(p.rating);
    if (r !== null && r > 0) ratings.push(r);
    if (p.events) {
      const s = statsFromCounts(p.events);
      withEvents2++;
      inBox += s.shotsOnTargetInBox || 0;
      outBox += s.shotsOnTargetOutsideBox || 0;
      sot += s.shotsOnTarget || 0;
      shots += (s.shotsOnTarget || 0) + (s.shotsOffTarget || 0);
      made += s.passesCompleted || 0;
      attempts += (s.passesCompleted || 0) + (s.passesFailed || 0);
      lost += s.possessionsLost || 0;
      sotKnown = true;
    } else {
      shots += num2(p.shots) ?? 0;
      const o = num2(p.shots_on_target);
      if (o !== null) {
        sot += o;
        sotKnown = true;
      }
      made += num2(p.passes_made) ?? 0;
      attempts += num2(p.pass_attempts) ?? 0;
    }
  }
  const allEvents = withEvents2 === players.length;
  const modelledGoals = allEvents ? inBox * GOAL_MODEL.onTargetInBox + outBox * GOAL_MODEL.onTargetOutsideBox : sotKnown ? sot * GOAL_MODEL.perShotOnTarget : shots * GOAL_MODEL.perShot;
  return {
    players: players.length,
    modelledGoals,
    passCompletion: attempts > 0 ? made / attempts * 100 : null,
    lostPerPlayer: allEvents ? lost / players.length : null,
    avgRating: mean(ratings),
    shots
  };
}
function poisson(lambda, k) {
  let p = Math.exp(-lambda);
  for (let i = 1; i <= k; i++) p *= lambda / i;
  return p;
}
function outcomeOdds(forGoals, againstGoals) {
  const a = Math.max(0.05, forGoals);
  const b = Math.max(0.05, againstGoals);
  let win = 0, draw = 0, loss = 0;
  for (let i = 0; i <= 15; i++) {
    const pi = poisson(a, i);
    for (let j = 0; j <= 15; j++) {
      const p = pi * poisson(b, j);
      if (i > j) win += p;
      else if (i === j) draw += p;
      else loss += p;
    }
  }
  const t = win + draw + loss;
  return { win: win / t, draw: draw / t, loss: loss / t };
}
function expectedPoints(forGoals, againstGoals) {
  const o = outcomeOdds(forGoals, againstGoals);
  return 3 * o.win + o.draw;
}
function quantileScore(q, value, higherIsBetter = true) {
  if (!q || !q.length || value === null || !Number.isFinite(value)) return null;
  let p;
  if (value <= q[0]) p = 0;
  else if (value >= q[q.length - 1]) p = 100;
  else {
    let i = 0;
    while (i < q.length - 2 && q[i + 1] <= value) i++;
    const span = q[i + 1] - q[i];
    p = (i + (span > 0 ? (value - q[i]) / span : 0)) * 100 / (q.length - 1);
  }
  return higherIsBetter ? p : 100 - p;
}
var team = (k) => FC27_BENCHMARKS.team?.[k];
var CLEAR_EDGE = 0.6;
function verdictFor(result, modelledFor, modelledAgainst) {
  const edge = modelledFor - modelledAgainst;
  if (result === "win") return edge >= CLEAR_EDGE ? "Deserved win" : edge > -CLEAR_EDGE ? "Edged it" : "Smash and grab";
  if (result === "draw") return edge >= CLEAR_EDGE ? "Should have won" : edge <= -CLEAR_EDGE ? "Got away with it" : "Fair draw";
  return edge <= -CLEAR_EDGE ? "Deserved loss" : edge < CLEAR_EDGE ? "Narrow loss" : "Hard luck";
}
var POINTS = { win: 3, draw: 1, loss: 0 };
function matchPerformance(m) {
  const us = sideTotals(m.players);
  const them = sideTotals(m.opponentPlayers || []);
  if (!us) return null;
  const modelledFor = us.modelledGoals;
  const modelledAgainst = them ? them.modelledGoals : m.scoreAgainst;
  const share = modelledFor + modelledAgainst > 0 ? modelledFor / (modelledFor + modelledAgainst) : 0.5;
  const ball = [quantileScore(team("passCompletion"), us.passCompletion), quantileScore(team("lostPerPlayer"), us.lostPerPlayer, false)].filter(
    (v) => v !== null
  );
  const scale = (v) => v === null ? null : v * (SCORE_MAX / 100);
  const areas = {
    attack: scale(quantileScore(team("modelledGoalsFor"), modelledFor)),
    ballSecurity: scale(ball.length ? mean(ball) : null),
    defending: scale(them ? quantileScore(team("modelledGoalsFor"), modelledAgainst, false) : null),
    control: scale(them ? quantileScore(team("modelledGoalShare"), share) : null),
    ratingEdge: scale(them && us.avgRating !== null && them.avgRating !== null ? quantileScore(team("ratingEdge"), us.avgRating - them.avgRating) : null)
  };
  const scored = Object.values(areas).filter((v) => v !== null);
  const fullData = !!them && m.players.every((p) => p.events) && (m.opponentPlayers || []).every((p) => p.events);
  return {
    id: m.id,
    playedAt: m.playedAt,
    opponent: m.opponent,
    result: m.result,
    scoreFor: m.scoreFor,
    scoreAgainst: m.scoreAgainst,
    modelledFor,
    modelledAgainst,
    expectedPoints: expectedPoints(modelledFor, modelledAgainst),
    points: POINTS[m.result],
    areas,
    control: scored.length >= 3 ? mean(scored) : null,
    verdict: verdictFor(m.result, modelledFor, modelledAgainst),
    fullData
  };
}
function areaMeans(perf) {
  const out = {};
  for (const { key } of AREAS) out[key] = mean(perf.map((p) => p.areas[key]).filter((v) => v !== null));
  return out;
}
function extremes(areas) {
  const list = AREAS.map((a) => [a.key, areas[a.key]]).filter((x) => x[1] !== null);
  if (!list.length) return { strongest: null, weakest: null };
  const sorted = [...list].sort((a, b) => b[1] - a[1]);
  return { strongest: sorted[0][0], weakest: sorted.length > 1 ? sorted[sorted.length - 1][0] : null };
}
function summarisePerformance(matches) {
  const perf = matches.map(matchPerformance).filter((p) => !!p).sort((a, b) => b.playedAt.getTime() - a.playedAt.getTime());
  const areas = areaMeans(perf);
  const sum2 = (f) => perf.reduce((t, p) => t + f(p), 0);
  return {
    games: perf.length,
    wins: perf.filter((p) => p.result === "win").length,
    draws: perf.filter((p) => p.result === "draw").length,
    losses: perf.filter((p) => p.result === "loss").length,
    points: sum2((p) => p.points),
    expectedPoints: sum2((p) => p.expectedPoints),
    goalsFor: sum2((p) => p.scoreFor),
    goalsAgainst: sum2((p) => p.scoreAgainst),
    modelledFor: sum2((p) => p.modelledFor),
    modelledAgainst: sum2((p) => p.modelledAgainst),
    control: mean(perf.map((p) => p.control).filter((v) => v !== null)),
    areas,
    ...extremes(areas),
    matches: perf,
    fullDataShare: perf.length ? perf.filter((p) => p.fullData).length / perf.length : 0
  };
}
function pointsVerdict(points, expected, games) {
  const gap = points - expected;
  const tolerance = Math.max(1, games * 0.35);
  const worth = `${points} point${points === 1 ? "" : "s"} from games worth ${expected.toFixed(1)}`;
  if (gap > tolerance) return `${worth}: you got more than the chances deserved.`;
  if (gap < -tolerance) return `${worth}: you played well enough for more.`;
  return `${worth}: the results matched the performances.`;
}
var SESSION_BREAK_MS = 90 * 60 * 1e3;
function groupSessions(matches) {
  const sorted = [...matches].sort((a, b) => a.playedAt.getTime() - b.playedAt.getTime());
  const nights = [];
  let last = -Infinity;
  for (const m of sorted) {
    const t = m.playedAt.getTime();
    if (t - last > SESSION_BREAK_MS || !nights.length) nights.push([]);
    nights[nights.length - 1].push(m);
    last = t;
  }
  return nights.reverse();
}
function grade(control) {
  if (control === null) return "\u2013";
  if (control >= 800) return "A+";
  if (control >= 700) return "A";
  if (control >= 620) return "B+";
  if (control >= 550) return "B";
  if (control >= 480) return "C+";
  if (control >= 400) return "C";
  if (control >= 300) return "D";
  return "F";
}
function tally(matches) {
  const out = /* @__PURE__ */ new Map();
  for (const m of matches) {
    for (const p of m.players) {
      const name = (p.ea_username || "").trim();
      if (!name) continue;
      const key = name.toLowerCase();
      let t = out.get(key);
      if (!t) out.set(key, t = { key, name, games: 0, goals: 0, assists: 0, secondAssists: 0, tackles: 0, interceptions: 0, passMade: 0, passAtt: 0, saves: 0, conceded: 0, ratingSum: 0, rated: 0, gk: 0 });
      t.games++;
      const s = p.events ? statsFromCounts(p.events) : null;
      t.goals += num2(p.goals) ?? 0;
      t.assists += num2(p.assists) ?? 0;
      t.secondAssists += s?.secondAssists ?? 0;
      t.tackles += s ? s.tacklesWon || 0 : num2(p.tackles) ?? 0;
      t.interceptions += s ? s.interceptions || 0 : num2(p.interceptions) ?? 0;
      t.passMade += s ? s.passesCompleted || 0 : num2(p.passes_made) ?? 0;
      t.passAtt += s ? (s.passesCompleted || 0) + (s.passesFailed || 0) : num2(p.pass_attempts) ?? 0;
      const isGk = /^(gk|goalkeeper)$/i.test(String(p.position || ""));
      if (isGk) {
        t.gk++;
        t.saves += num2(p.saves) ?? 0;
        t.conceded += m.scoreAgainst;
      }
      const r = num2(p.rating);
      if (r !== null && r > 0) {
        t.ratingSum += r;
        t.rated++;
      }
    }
  }
  return out;
}
var avg = (t) => t.rated ? t.ratingSum / t.rated : null;
var per = (n, g) => g ? n / g : 0;
var plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
function playerLine(t, usual) {
  const bits = [];
  if (t.gk >= Math.ceil(t.games / 2)) {
    bits.push(`${plural(t.saves, "save")} in ${plural(t.games, "game")}, ${per(t.conceded, t.gk).toFixed(1)} conceded a game`);
    if (usual?.gk) bits.push(`(usually ${per(usual.conceded, usual.gk).toFixed(1)})`);
    return bits.join(" ");
  }
  const contrib = [];
  if (t.goals) contrib.push(plural(t.goals, "goal"));
  if (t.assists) contrib.push(plural(t.assists, "assist"));
  if (t.secondAssists) contrib.push(plural(t.secondAssists, "second assist"));
  bits.push(contrib.length ? `${contrib.join(", ")} in ${plural(t.games, "game")}` : `${plural(t.games, "game")}`);
  const options = [
    { text: "tackles won a game", now: per(t.tackles, t.games), was: usual?.games ? per(usual.tackles, usual.games) : null, scale: 1.5 },
    { text: "interceptions a game", now: per(t.interceptions, t.games), was: usual?.games ? per(usual.interceptions, usual.games) : null, scale: 1 }
  ];
  if (t.passAtt >= 10) {
    options.push({ text: "% passing", now: t.passMade / t.passAtt * 100, was: usual && usual.passAtt >= 20 ? usual.passMade / usual.passAtt * 100 : null, scale: 6 });
  }
  const scored = options.filter((o) => o.now > 0).map((o) => ({ ...o, z: o.was === null ? 0 : (o.now - o.was) / o.scale }));
  const best = scored.filter((o) => o.z >= 0.5).sort((a, b) => b.z - a.z)[0] || scored.sort((a, b) => Math.abs(b.z) - Math.abs(a.z) || b.now - a.now)[0];
  if (!best) {
    const now = avg(t);
    const was = usual ? avg(usual) : null;
    if (now !== null) bits.push(`rated ${now.toFixed(1)}${was !== null ? ` (usually ${was.toFixed(1)})` : ""}`);
  } else {
    const value = best.text.startsWith("%") ? `${Math.round(best.now)}${best.text}` : `${best.now.toFixed(1)} ${best.text}`;
    const was = best.was === null ? "" : best.text.startsWith("%") ? ` (usually ${Math.round(best.was)}%)` : ` (usually ${best.was.toFixed(1)})`;
    bits.push(`${value}${was}`);
  }
  return bits.join(", ");
}
function sessionReport(session, history) {
  if (!session.length) return null;
  const now = summarisePerformance(session);
  const before = history.length ? summarisePerformance(history) : null;
  const areas = AREAS.map((a) => {
    const score = now.areas[a.key];
    const usual2 = before && before.games >= 3 ? before.areas[a.key] : null;
    return { key: a.key, label: a.label, score, usual: usual2, delta: score !== null && usual2 !== null ? score - usual2 : null };
  });
  const withDelta = areas.filter((a) => a.delta !== null);
  const pool = withDelta.length >= 2 ? withDelta : areas.filter((a) => a.score !== null);
  const rank = (a) => withDelta.length >= 2 ? a.delta : a.score;
  const sorted = [...pool].sort((a, b) => rank(b) - rank(a));
  const strength = sorted[0] ? { key: sorted[0].key, label: sorted[0].label, delta: sorted[0].delta } : null;
  const low = sorted.length > 1 ? sorted[sorted.length - 1] : null;
  const fixFirst = low ? { key: low.key, label: low.label, delta: low.delta } : null;
  const tonight = tally(session);
  const usual = tally(history);
  const minGames = Math.max(1, Math.ceil(session.length / 2));
  const players = [...tonight.values()].map((t) => ({ name: t.name, games: t.games, avgRating: avg(t), usualRating: usual.get(t.key) ? avg(usual.get(t.key)) : null, line: playerLine(t, usual.get(t.key)), t })).sort((a, b) => (b.avgRating ?? 0) - (a.avgRating ?? 0) || b.games - a.games).map(({ t: _t, ...rest }) => rest);
  const pots = [...tonight.values()].filter((t) => t.games >= minGames && avg(t) !== null).sort((a, b) => avg(b) + per(b.goals + b.assists, b.games) * 0.3 - (avg(a) + per(a.goals + a.assists, a.games) * 0.3))[0];
  const ordered = [...session].sort((a, b) => a.playedAt.getTime() - b.playedAt.getTime());
  return {
    startedAt: ordered[0].playedAt,
    endedAt: ordered[ordered.length - 1].playedAt,
    games: now.games,
    wins: now.wins,
    draws: now.draws,
    losses: now.losses,
    goalsFor: now.goalsFor,
    goalsAgainst: now.goalsAgainst,
    points: now.points,
    expectedPoints: now.expectedPoints,
    control: now.control,
    usualControl: before && before.games >= 3 ? before.control : null,
    grade: grade(now.control),
    areas,
    strength,
    fixFirst,
    pointsLine: pointsVerdict(now.points, now.expectedPoints, now.games),
    playerOfSession: pots ? players.find((p) => p.name === pots.name) || null : null,
    players,
    matches: now.matches
  };
}
var AREA_FIX = {
  attack: "Few good chances: get more shots away from inside the box.",
  ballSecurity: "Too many passes going astray: keep it simple and stop forcing the ball forward.",
  defending: "Letting the opposition get clean shots in your box: stay compact and track runners.",
  control: "The other side made more of the game: win the ball back higher and keep it longer.",
  ratingEdge: "Their players outperformed yours one for one: check who was out of position or chasing the game."
};

// src/lib/playerScores.ts
function num3(v) {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}
var mean2 = (xs) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
var SCORE_METRICS = [
  "goalsPerGame",
  "chancesCreatedPerGame",
  "shotsOnTargetPerGame",
  "passCompletion",
  "passesPerGame",
  "lostPerGame",
  "dribblesPerGame",
  "tacklesWonPerGame",
  "interceptionsPerGame",
  "gainsPerGame",
  "tackleSuccess",
  "savesPerGame",
  "concededPerGame",
  "cleanSheetRate",
  "avgRating"
];
var LOWER_IS_BETTER = { lostPerGame: true, concededPerGame: true };
function playerLines(matches, minGames = 1) {
  const acc = /* @__PURE__ */ new Map();
  for (const m of matches) {
    for (const p of m.players) {
      const name = (p.ea_username || "").trim();
      if (!name) continue;
      const key = name.toLowerCase();
      let a = acc.get(key);
      if (!a) {
        a = { key, name, games: 0, eventGames: 0, roleGames: {}, w: 0, d: 0, l: 0, goals: 0, assists: 0, secondAssists: 0, motm: 0, ratingSum: 0, rated: 0, sot: 0, passMade: 0, passAtt: 0, lost: 0, dribbles: 0, tackles: 0, tacklesLost: 0, interceptions: 0, gains: 0, gkGames: 0, saves: 0, conceded: 0, cleanSheets: 0 };
        acc.set(key, a);
      }
      a.games++;
      if (m.result === "win") a.w++;
      else if (m.result === "draw") a.d++;
      else a.l++;
      const role = roleOf(p.position);
      if (role) a.roleGames[role] = (a.roleGames[role] || 0) + 1;
      a.goals += num3(p.goals) ?? 0;
      a.assists += num3(p.assists) ?? 0;
      if (p.motm === true) a.motm++;
      const r = num3(p.rating);
      if (r !== null && r > 0) {
        a.ratingSum += r;
        a.rated++;
      }
      if (role === "GK") {
        a.gkGames++;
        a.saves += num3(p.saves) ?? 0;
        a.conceded += m.scoreAgainst;
        if (m.scoreAgainst === 0) a.cleanSheets++;
      }
      if (p.events) {
        const s = statsFromCounts(p.events);
        a.eventGames++;
        a.secondAssists += s.secondAssists || 0;
        a.sot += s.shotsOnTarget || 0;
        a.passMade += s.passesCompleted || 0;
        a.passAtt += (s.passesCompleted || 0) + (s.passesFailed || 0);
        a.lost += s.possessionsLost || 0;
        a.dribbles += s.dribbles || 0;
        a.tackles += s.tacklesWon || 0;
        a.tacklesLost += s.tacklesLost || 0;
        a.interceptions += s.interceptions || 0;
        a.gains += s.possessionGains || 0;
      }
    }
  }
  const out = [];
  for (const a of acc.values()) {
    if (a.games < minGames) continue;
    const role = Object.entries(a.roleGames).sort((x, y) => (y[1] || 0) - (x[1] || 0))[0]?.[0] || null;
    const eg = a.eventGames;
    const pg = (v) => eg ? v / eg : null;
    out.push({
      key: a.key,
      name: a.name,
      games: a.games,
      role,
      roleGames: a.roleGames,
      eventGames: eg,
      wins: a.w,
      draws: a.d,
      losses: a.l,
      goals: a.goals,
      assists: a.assists,
      secondAssists: a.secondAssists,
      motm: a.motm,
      avgRating: a.rated ? a.ratingSum / a.rated : null,
      perGame: {
        goalsPerGame: a.goals / a.games,
        chancesCreatedPerGame: eg ? (a.assists + a.secondAssists) / a.games : a.assists / a.games,
        shotsOnTargetPerGame: pg(a.sot),
        passCompletion: a.passAtt > 0 ? a.passMade / a.passAtt * 100 : null,
        passesPerGame: pg(a.passMade),
        lostPerGame: pg(a.lost),
        dribblesPerGame: pg(a.dribbles),
        tacklesWonPerGame: pg(a.tackles),
        interceptionsPerGame: pg(a.interceptions),
        gainsPerGame: pg(a.gains),
        tackleSuccess: a.tackles + a.tacklesLost > 0 ? a.tackles / (a.tackles + a.tacklesLost) * 100 : null,
        savesPerGame: a.gkGames ? a.saves / a.gkGames : null,
        concededPerGame: a.gkGames ? a.conceded / a.gkGames : null,
        cleanSheetRate: a.gkGames ? a.cleanSheets / a.gkGames * 100 : null,
        avgRating: a.rated ? a.ratingSum / a.rated : null
      }
    });
  }
  return out.sort((x, y) => y.games - x.games || x.name.localeCompare(y.name));
}
var SCORE_AREAS = [
  { key: "attack", label: "Attack", metrics: ["goalsPerGame", "chancesCreatedPerGame", "shotsOnTargetPerGame"] },
  { key: "possession", label: "Possession", metrics: ["passCompletion", "passesPerGame", "lostPerGame", "dribblesPerGame"] },
  { key: "ballWinning", label: "Ball-winning", metrics: ["tacklesWonPerGame", "interceptionsPerGame", "gainsPerGame", "tackleSuccess"] }
];
var ROLE_WEIGHTS = {
  FWD: { attack: 0.6, possession: 0.3, ballWinning: 0.1 },
  MID: { attack: 0.3, possession: 0.45, ballWinning: 0.25 },
  DEF: { attack: 0.1, possession: 0.35, ballWinning: 0.55 }
};
var KEEPER_METRICS = ["savesPerGame", "concededPerGame", "cleanSheetRate"];
function roleScore(role, metric, value) {
  const q = FC27_BENCHMARKS.playerScores?.[role]?.[metric];
  const p = quantileScore(q, value, !LOWER_IS_BETTER[metric]);
  return p === null ? null : p * (SCORE_MAX / 100);
}
function areaScore(role, line, metrics) {
  const s = metrics.map((k) => roleScore(role, k, line.perGame[k])).filter((v) => v !== null);
  return s.length ? mean2(s) : null;
}
function scorePlayer(line) {
  const role = line.role;
  if (!role) return null;
  if (role === "GK") {
    const metrics2 = KEEPER_METRICS.map((k) => ({ metric: k, value: line.perGame[k], score: roleScore("GK", k, line.perGame[k]) }));
    const s = metrics2.map((m) => m.score).filter((v) => v !== null);
    const weighted = s.length === 3 ? 0.5 * metrics2[0].score + 0.25 * metrics2[1].score + 0.25 * metrics2[2].score : mean2(s);
    return { key: line.key, name: line.name, role, games: line.games, overall: weighted, areas: { attack: null, possession: null, ballWinning: null }, metrics: metrics2, tag: (metrics2[0].score ?? 0) >= 700 ? "Shot-stopper" : "Keeper", line };
  }
  const areas = {};
  for (const a of SCORE_AREAS) areas[a.key] = areaScore(role, line, a.metrics);
  const weights = ROLE_WEIGHTS[role];
  let total = 0, weight = 0;
  for (const a of SCORE_AREAS) {
    const v = areas[a.key];
    if (v === null) continue;
    total += v * weights[a.key];
    weight += weights[a.key];
  }
  const metrics = SCORE_AREAS.flatMap((a) => a.metrics).map((k) => ({ metric: k, value: line.perGame[k], score: roleScore(role, k, line.perGame[k]) }));
  const best = Object.entries(areas).filter(([, v]) => v !== null).sort((x, y) => y[1] - x[1]);
  const spread = best.length >= 2 ? best[0][1] - best[best.length - 1][1] : 0;
  const tag = !best.length ? "All-rounder" : spread < 120 ? "All-rounder" : best[0][0] === "attack" ? (line.perGame.goalsPerGame || 0) >= (line.perGame.chancesCreatedPerGame || 0) ? "Finisher" : "Creator" : best[0][0] === "possession" ? "Playmaker" : "Ball-winner";
  return { key: line.key, name: line.name, role, games: line.games, overall: weight ? total / weight : null, areas, metrics, tag, line };
}
function playerScores(matches, minGames = 3) {
  return playerLines(matches, minGames).map(scorePlayer).filter((s) => !!s && s.overall !== null).sort((a, b) => (b.overall ?? 0) - (a.overall ?? 0));
}
function powerRankings(matches, window = 5) {
  const sorted = [...matches].sort((a, b) => b.playedAt.getTime() - a.playedAt.getTime());
  const rank = (games) => playerLines(games, 2).filter((l) => l.avgRating !== null).sort((a, b) => b.avgRating - a.avgRating || b.goals + b.assists - (a.goals + a.assists)).map((l, i) => ({ l, rank: i + 1 }));
  const now = rank(sorted.slice(0, window));
  const before = new Map(rank(sorted.slice(window, window * 2)).map((x) => [x.l.key, x.rank]));
  return now.map(({ l, rank: r }) => {
    let streak = 0;
    for (const m of sorted) {
      if (!m.players.some((p) => (p.ea_username || "").trim().toLowerCase() === l.key)) continue;
      if (m.result === "win") streak++;
      else break;
    }
    const prev = before.get(l.key) ?? null;
    return { name: l.name, rank: r, previousRank: prev, move: prev === null ? null : prev - r, games: l.games, goals: l.goals, assists: l.assists, avgRating: l.avgRating, streak };
  });
}
function clutchRatings(matches, minClose = 5) {
  const close = matches.filter((m) => Math.abs(m.scoreFor - m.scoreAgainst) <= 1);
  const rest = matches.filter((m) => Math.abs(m.scoreFor - m.scoreAgainst) > 1);
  const c = new Map(playerLines(close).map((l) => [l.key, l]));
  const r = new Map(playerLines(rest).map((l) => [l.key, l]));
  const out = [];
  for (const [key, l] of c) {
    if (l.games < minClose) continue;
    const other = r.get(key);
    const edge = l.avgRating !== null && other?.avgRating != null && other.games >= 3 ? l.avgRating - other.avgRating : null;
    out.push({
      name: l.name,
      closeGames: l.games,
      closeRating: l.avgRating,
      otherRating: other?.avgRating ?? null,
      edge,
      closeGoals: l.goals,
      closeAssists: l.assists,
      label: edge === null ? "Steady" : edge >= 0.15 ? "Ice cold" : edge <= -0.3 ? "Shrinks" : "Steady"
    });
  }
  return out.sort((a, b) => (b.closeRating ?? 0) - (a.closeRating ?? 0));
}
function carryScores(matches, minGames = 5) {
  const lines = playerLines(matches, minGames);
  const out = [];
  for (const l of lines) {
    let edgeSum = 0, edgeN = 0, goalsWith = 0, withW = 0, withN = 0, woW = 0, woN = 0;
    for (const m of matches) {
      const me = m.players.find((p) => (p.ea_username || "").trim().toLowerCase() === l.key);
      if (!me) {
        woN++;
        if (m.result === "win") woW++;
        continue;
      }
      withN++;
      if (m.result === "win") withW++;
      goalsWith += m.scoreFor;
      const mine = num3(me.rating);
      const others = m.players.filter((p) => p !== me).map((p) => num3(p.rating)).filter((v) => v !== null && v > 0);
      if (mine !== null && mine > 0 && others.length) {
        edgeSum += mine - others.reduce((a, b) => a + b, 0) / others.length;
        edgeN++;
      }
    }
    const ratingEdge = edgeN ? edgeSum / edgeN : null;
    const involvementShare = goalsWith ? Math.min(1, (l.goals + l.assists) / goalsWith) : 0;
    const winLift = woN >= 3 ? (withW / withN - woW / woN) * 100 : null;
    const clamp = (v) => Math.max(0, Math.min(1, v));
    const parts = [
      { w: 0.4, v: ratingEdge === null ? null : clamp((ratingEdge + 0.5) / 1.5) },
      // Keepers don't score or set up goals, so they are judged on the other two parts only
      { w: 0.35, v: l.role === "GK" ? null : clamp(involvementShare / 0.5) },
      { w: 0.25, v: winLift === null ? null : clamp((winLift + 30) / 60) }
    ].filter((p) => p.v !== null);
    const wsum = parts.reduce((t, p) => t + p.w, 0);
    const score = Math.round(parts.reduce((t, p) => t + p.w * p.v, 0) / wsum * SCORE_MAX);
    out.push({
      name: l.name,
      games: l.games,
      score,
      label: score >= 700 ? "Talisman" : score >= 500 ? "Key player" : score >= 300 ? "Contributor" : "Passenger",
      ratingEdge,
      involvementShare,
      winLift
    });
  }
  return out.sort((a, b) => b.score - a.score);
}
var atTheBack = (pos) => {
  const r = roleOf(pos);
  return r === "DEF" || r === "GK" ? r : null;
};
function defendingSummary(matches, minGames = 5, recentWindow = 10) {
  const back = matches.map((m) => ({ m, back: m.players.filter((p) => atTheBack(p.position)) }));
  const lines = playerLines(
    back.filter((b) => b.back.length).map((b) => ({ ...b.m, players: b.back })),
    minGames
  );
  const players = lines.filter((l) => l.role === "DEF" || l.role === "GK").map((l) => {
    const games = back.filter((b) => b.back.some((p) => (p.ea_username || "").trim().toLowerCase() === l.key)).map((b) => b.m);
    return {
      name: l.name,
      role: l.role,
      games: games.length,
      cleanSheetRate: games.filter((m) => m.scoreAgainst === 0).length / games.length * 100,
      concededPerGame: games.reduce((t, m) => t + m.scoreAgainst, 0) / games.length,
      tacklesWonPerGame: l.perGame.tacklesWonPerGame,
      tackleSuccess: l.perGame.tackleSuccess,
      avgRating: l.avgRating
    };
  }).sort((a, b) => a.concededPerGame - b.concededPerGame);
  const pairMap = /* @__PURE__ */ new Map();
  for (const b of back) {
    const names = [...new Set(b.back.map((p) => (p.ea_username || "").trim()).filter(Boolean))].sort((x, y) => x.toLowerCase().localeCompare(y.toLowerCase()));
    for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) {
      const id = `${names[i].toLowerCase()}|${names[j].toLowerCase()}`;
      const p = pairMap.get(id) || { names: [names[i], names[j]], games: 0, cs: 0, ga: 0 };
      p.games++;
      if (b.m.scoreAgainst === 0) p.cs++;
      p.ga += b.m.scoreAgainst;
      pairMap.set(id, p);
    }
  }
  const pairs = [...pairMap.values()].filter((p) => p.games >= minGames).map((p) => ({ names: p.names, games: p.games, cleanSheetRate: p.cs / p.games * 100, concededPerGame: p.ga / p.games })).sort((a, b) => a.concededPerGame - b.concededPerGame || b.games - a.games);
  const sorted = [...matches].sort((a, b) => b.playedAt.getTime() - a.playedAt.getTime());
  const sum2 = (ms) => ({ games: ms.length, cleanSheets: ms.filter((m) => m.scoreAgainst === 0).length, concededPerGame: ms.length ? ms.reduce((t, m) => t + m.scoreAgainst, 0) / ms.length : 0 });
  const recent = sum2(sorted.slice(0, recentWindow));
  const earlier = sum2(sorted.slice(recentWindow));
  const trend = recent.games >= 5 && earlier.games >= 5 ? recent.concededPerGame <= earlier.concededPerGame - 0.4 ? "Tightening" : recent.concededPerGame >= earlier.concededPerGame + 0.4 ? "Leaking" : "Steady" : null;
  return { players, pairs, recent, earlier, trend };
}
function roleLabel(role) {
  return ROLE_LABELS[role];
}

// src/lib/banter.ts
var keyOf2 = (p) => (p.ea_username || "").trim().toLowerCase();
var played = (m, key) => m.players.some((p) => keyOf2(p) === key);
var pts = (m) => m.result === "win" ? 3 : m.result === "draw" ? 1 : 0;
var f1 = (n) => n.toFixed(1);
var pctS = (n) => `${Math.round(n)}%`;
function banterWindow(matches, window) {
  const sorted = [...matches].sort((a, b) => b.playedAt.getTime() - a.playedAt.getTime());
  if (!sorted.length || window === "all") return sorted;
  if (window === "week") {
    const from = sorted[0].playedAt.getTime() - 7 * 864e5;
    return sorted.filter((m) => m.playedAt.getTime() >= from);
  }
  const out = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    if (out[out.length - 1].playedAt.getTime() - sorted[i].playedAt.getTime() > 90 * 6e4) break;
    out.push(sorted[i]);
  }
  return out;
}
function roleAverages(lines) {
  const out = {};
  for (const role of ["GK", "DEF", "MID", "FWD"]) {
    const ls = lines.filter((l) => l.role === role && l.avgRating !== null);
    if (!ls.length) continue;
    const games = ls.reduce((t, l) => t + l.games, 0);
    out[role] = {
      rating: ls.reduce((t, l) => t + (l.avgRating || 0) * l.games, 0) / games,
      gaPerGame: ls.reduce((t, l) => t + l.goals + l.assists, 0) / games
    };
  }
  return out;
}
function involvement(matches) {
  const out = /* @__PURE__ */ new Map();
  for (const m of matches) {
    for (const p of m.players) {
      const k = keyOf2(p);
      if (!k) continue;
      const a = out.get(k) || { shots: 0, touches: 0, eventGames: 0 };
      if (p.events) {
        const s = statsFromCounts(p.events);
        const shots = (s.shotsOnTarget || 0) + (s.shotsOffTarget || 0);
        a.shots += shots;
        a.touches += (s.passesCompleted || 0) + (s.passesFailed || 0) + (s.tacklesWon || 0) + (s.tacklesLost || 0) + (s.dribbles || 0) + shots;
        a.eventGames++;
      } else {
        a.shots += Number(p.shots) || 0;
      }
      out.set(k, a);
    }
  }
  return out;
}
function banterRankings(matches, minGames = 3) {
  const lines = playerLines(matches, minGames).filter((l) => l.role);
  if (!lines.length) return [];
  const roleAvg = roleAverages(playerLines(matches, 1));
  const inv = involvement(matches);
  const teamWin = matches.length ? matches.filter((m) => m.result === "win").length / matches.length * 100 : 0;
  const teamShots = [...inv.values()].reduce((t, a) => t + a.shots, 0);
  const teamGoals = lines.reduce((t, l) => t + l.goals, 0);
  const roleWord = (r) => r === "GK" ? "keepers" : r === "DEF" ? "defenders" : r === "MID" ? "midfielders" : "forwards";
  const rankings = [];
  const tigers = lines.filter((l) => l.avgRating !== null && roleAvg[l.role]).map((l) => {
    const winPct2 = l.wins / l.games * 100;
    const ratingGap = l.avgRating - roleAvg[l.role].rating;
    return { l, winPct: winPct2, ratingGap, value: ratingGap * 10 + (teamWin - winPct2) / 5 };
  }).filter((x) => x.ratingGap > 0 && x.winPct < teamWin).sort((a, b) => b.value - a.value);
  rankings.push({
    key: "paperTiger",
    title: "Paper Tiger",
    emoji: "\u{1F42F}",
    question: "Looks great on the ratings, but do the results follow?",
    entries: tigers.map((x) => ({
      name: x.l.name,
      value: x.value,
      line: `${f1(x.l.avgRating)} average (squad ${roleWord(x.l.role)} ${f1(roleAvg[x.l.role].rating)}), yet wins ${pctS(x.winPct)} of games to the squad's ${pctS(teamWin)}.`,
      verdict: x.value >= 6 ? "All bark" : "Suspicious"
    }))
  });
  const mains = lines.filter((l) => l.role !== "GK").map((l) => {
    const shotShare = teamShots ? (inv.get(l.key)?.shots || 0) / teamShots * 100 : 0;
    const goalShare = teamGoals ? l.goals / teamGoals * 100 : 0;
    return { l, shotShare, goalShare, value: shotShare + goalShare + l.motm * 2 };
  }).filter((x) => x.shotShare + x.goalShare > 0).sort((a, b) => b.value - a.value);
  rankings.push({
    key: "mainCharacter",
    title: "Main Character",
    emoji: "\u{1F451}",
    question: "Who thinks this is their story and everyone else is an extra?",
    entries: mains.map((x) => ({
      name: x.l.name,
      value: x.value,
      line: `${pctS(x.shotShare)} of the shots, ${pctS(x.goalShare)} of the goals and ${x.l.motm} man of the match award${x.l.motm === 1 ? "" : "s"} in ${x.l.games} games.`,
      verdict: x.goalShare >= 35 ? "Lead role" : x.shotShare >= 25 ? "Wants the lead role" : "Ensemble cast"
    }))
  });
  const withTouches = lines.filter((l) => l.role !== "GK" && (inv.get(l.key)?.eventGames || 0) >= minGames);
  const touchAvg = {};
  for (const role of ["DEF", "MID", "FWD"]) {
    const ls = withTouches.filter((l) => l.role === role);
    const g = ls.reduce((t, l) => t + inv.get(l.key).eventGames, 0);
    if (g) touchAvg[role] = ls.reduce((t, l) => t + inv.get(l.key).touches, 0) / g;
  }
  const ghosts = withTouches.map((l) => {
    const a = inv.get(l.key);
    const perGame2 = a.touches / a.eventGames;
    const avg2 = touchAvg[l.role] || perGame2;
    return { l, perGame: perGame2, avg: avg2, value: avg2 ? (avg2 - perGame2) / avg2 * 100 : 0 };
  }).filter((x) => x.value > 10).sort((a, b) => b.value - a.value);
  rankings.push({
    key: "invisible",
    title: "Invisible Man",
    emoji: "\u{1F47B}",
    question: "Was anyone actually on the pitch?",
    entries: ghosts.map((x) => ({
      name: x.l.name,
      value: x.value,
      line: `${f1(x.perGame)} on-ball actions a game, where the squad's ${roleWord(x.l.role)} average ${f1(x.avg)}.`,
      verdict: x.value >= 35 ? "Missing person" : "Quiet"
    }))
  });
  const magnets = lines.map((l) => {
    const without = matches.filter((m) => !played(m, l.key));
    if (without.length < 3) return null;
    const withWin = l.wins / l.games * 100;
    const woWin = without.filter((m) => m.result === "win").length / without.length * 100;
    return { l, withWin, woWin, woGames: without.length, value: woWin - withWin };
  }).filter((x) => !!x && x.value > 0).sort((a, b) => b.value - a.value);
  rankings.push({
    key: "lossMagnet",
    title: "Loss Magnet",
    emoji: "\u{1F9F2}",
    question: "Do the defeats follow someone around?",
    entries: magnets.map((x) => ({
      name: x.l.name,
      value: x.value,
      line: `The squad wins ${pctS(x.withWin)} with them (${x.l.games} games) and ${pctS(x.woWin)} without (${x.woGames}). Different games, so not proof.`,
      verdict: x.value >= 25 ? "Black cat" : "Unlucky charm"
    }))
  });
  const padders = lines.map((l) => {
    let goals = 0, padded = 0, tight = 0;
    for (const m of matches) {
      const me = m.players.find((p) => keyOf2(p) === l.key);
      const g = Number(me?.goals) || 0;
      if (!g) continue;
      goals += g;
      if (m.scoreFor - m.scoreAgainst >= 3) padded += g;
      if (Math.abs(m.scoreFor - m.scoreAgainst) <= 1) tight += g;
    }
    return { l, goals, padded, tight, value: goals ? padded / goals * 100 : 0 };
  }).filter((x) => x.goals >= 3 && x.value >= 40).sort((a, b) => b.value - a.value);
  rankings.push({
    key: "statPadder",
    title: "Stat Padder",
    emoji: "\u{1F4CA}",
    question: "Whose goals come when the game is already over?",
    entries: padders.map((x) => ({
      name: x.l.name,
      value: x.value,
      line: `${x.padded} of ${x.goals} goals came in wins by three or more; ${x.tight} in one-goal games or draws.`,
      verdict: x.value >= 60 ? "Padding merchant" : "Garbage-time specialist"
    }))
  });
  const squadGoals = lines.reduce((t, l) => t + l.goals, 0);
  const squadRatio = squadGoals ? lines.reduce((t, l) => t + l.assists, 0) / squadGoals : 0;
  const hogs = lines.filter((l) => l.role !== "GK" && l.goals >= 3).map((l) => {
    const ratio2 = l.assists / l.goals;
    return { l, ratio: ratio2, value: squadRatio - ratio2 };
  }).filter((x) => x.value > 0.15).sort((a, b) => b.value - a.value || b.l.goals - a.l.goals);
  rankings.push({
    key: "ballHog",
    title: "Ball Hog",
    emoji: "\u{1F437}",
    question: "Who never looks up?",
    entries: hogs.map((x) => ({
      name: x.l.name,
      value: x.value,
      line: `${x.l.goals} goals, ${x.l.assists} assist${x.l.assists === 1 ? "" : "s"}: ${x.ratio.toFixed(2)} assists per goal, where the squad manages ${squadRatio.toFixed(2)}.`,
      verdict: x.ratio < 0.2 ? "Pass it, mate" : "Selective vision"
    }))
  });
  return rankings.filter((r) => r.entries.length);
}
function superlatives(matches, minGames = 3) {
  const lines = playerLines(matches, minGames);
  const inv = involvement(matches);
  const out = [];
  const top = (list, f) => [...list].sort((a, b) => f(b) - f(a))[0];
  const outfield = lines.filter((l) => l.role && l.role !== "GK");
  const scorer = top(outfield, (l) => l.goals / l.games);
  if (scorer?.goals) out.push({ key: "score", title: "Most likely to score", emoji: "\u26BD", name: scorer.name, line: `${f1(scorer.goals / scorer.games)} goals a game` });
  const misser = top(
    outfield.filter((l) => (inv.get(l.key)?.shots || 0) >= 5),
    (l) => (inv.get(l.key).shots - l.goals) / l.games
  );
  if (misser) out.push({ key: "miss", title: "Most likely to miss", emoji: "\u{1F3AF}", name: misser.name, line: `${inv.get(misser.key).shots - misser.goals} shots without a goal` });
  const architect = top(outfield, (l) => (l.assists + l.secondAssists) / l.games);
  if (architect && architect.assists + architect.secondAssists) out.push({ key: "architect", title: "The Architect", emoji: "\u{1F3A8}", name: architect.name, line: `${architect.assists} assists, ${architect.secondAssists} second assists` });
  const og = top(lines, (l) => l.games);
  if (og) out.push({ key: "og", title: "The OG", emoji: "\u{1F474}", name: og.name, line: `${og.games} games, never misses a session` });
  const wall = top(
    lines.filter((l) => l.role === "DEF" || l.role === "GK"),
    (l) => -matches.filter((m) => played(m, l.key)).reduce((t, m) => t + m.scoreAgainst, 0) / l.games
  );
  if (wall) {
    const ga = matches.filter((m) => played(m, wall.key)).reduce((t, m) => t + m.scoreAgainst, 0) / wall.games;
    out.push({ key: "wall", title: "The Wall", emoji: "\u{1F9F1}", name: wall.name, line: `${f1(ga)} conceded a game with them at the back` });
  }
  const star = top(lines, (l) => l.motm / l.games);
  if (star?.motm) out.push({ key: "star", title: "Man of the Match machine", emoji: "\u{1F31F}", name: star.name, line: `${star.motm} MOTM in ${star.games}` });
  const rated = lines.filter((l) => l.avgRating !== null);
  const steady = top(rated, (l) => l.avgRating);
  if (steady) out.push({ key: "rated", title: "Highest rated", emoji: "\u2B50", name: steady.name, line: `${f1(steady.avgRating)} average` });
  const cards = /* @__PURE__ */ new Map();
  for (const m of matches) for (const p of m.players) if (p.events) cards.set(keyOf2(p), (cards.get(keyOf2(p)) || 0) + (statsFromCounts(p.events).yellowCards || 0) + (p.red_cards ? 1 : 0));
  const hot = top(lines.filter((l) => (cards.get(l.key) || 0) > 0), (l) => (cards.get(l.key) || 0) / l.games);
  if (hot) out.push({ key: "cards", title: "Most likely to see red", emoji: "\u{1F7E5}", name: hot.name, line: `${cards.get(hot.key)} cards in ${hot.games} games` });
  return out;
}
function split(ms) {
  const w = ms.filter((m) => m.result === "win").length;
  const d = ms.filter((m) => m.result === "draw").length;
  return {
    games: ms.length,
    wins: w,
    draws: d,
    losses: ms.length - w - d,
    pointsPerGame: ms.length ? ms.reduce((t, m) => t + pts(m), 0) / ms.length : 0,
    goalsFor: ms.length ? ms.reduce((t, m) => t + m.scoreFor, 0) / ms.length : 0,
    goalsAgainst: ms.length ? ms.reduce((t, m) => t + m.scoreAgainst, 0) / ms.length : 0
  };
}
function nameOf(matches, key) {
  for (const m of matches) for (const p of m.players) if (keyOf2(p) === key) return (p.ea_username || "").trim();
  return key;
}
function betterWithout(matches, player) {
  const key = player.trim().toLowerCase();
  const withMs = matches.filter((m) => played(m, key));
  const without = matches.filter((m) => !played(m, key));
  if (!withMs.length) return null;
  const a = split(withMs), b = split(without);
  const name = nameOf(matches, key);
  const headline = !without.length ? `${name} has played every game. No receipts without them.` : b.pointsPerGame > a.pointsPerGame + 0.3 ? `The squad is better off when ${name} is offline.` : a.pointsPerGame > b.pointsPerGame + 0.3 ? `Without ${name}, it falls apart.` : `${name} makes no difference either way.`;
  return { kind: "without", name, with: a, without: b, headline };
}
function betterTogether(matches, a, b) {
  const ka = a.trim().toLowerCase(), kb = b.trim().toLowerCase();
  if (ka === kb) return null;
  const both = matches.filter((m) => played(m, ka) && played(m, kb));
  const onlyA = matches.filter((m) => played(m, ka) && !played(m, kb));
  const onlyB = matches.filter((m) => !played(m, ka) && played(m, kb));
  if (!both.length && !onlyA.length && !onlyB.length) return null;
  const t = split(both), sa = split(onlyA), sb = split(onlyB);
  const na = nameOf(matches, ka), nb = nameOf(matches, kb);
  const apart = [sa, sb].filter((s) => s.games);
  const apartPpg = apart.length ? apart.reduce((x, s) => x + s.pointsPerGame * s.games, 0) / apart.reduce((x, s) => x + s.games, 0) : null;
  const headline = !both.length ? `${na} and ${nb} have never played together.` : apartPpg === null ? `${na} and ${nb} have only ever played together.` : t.pointsPerGame > apartPpg + 0.3 ? `${na} and ${nb}: a proper partnership.` : apartPpg > t.pointsPerGame + 0.3 ? `${na} and ${nb} should be kept apart.` : `${na} and ${nb}: no chemistry, no problem.`;
  return { kind: "together", names: [na, nb], together: t, onlyA: sa, onlyB: sb, headline };
}
function whoGetsTheShirt(matches, a, b) {
  const ka = a.trim().toLowerCase(), kb = b.trim().toLowerCase();
  if (ka === kb) return null;
  const roleIn = (m, k) => roleOf(m.players.find((p) => keyOf2(p) === k)?.position);
  const counts = /* @__PURE__ */ new Map();
  for (const m of matches) for (const k of [ka, kb]) {
    const r = roleIn(m, k);
    if (r) counts.set(r, (counts.get(r) || 0) + 1);
  }
  const role = [...counts.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] || null;
  const side = (k, other) => {
    const ms = matches.filter((m) => roleIn(m, k) === role && roleIn(m, other) !== role);
    const rows = ms.map((m) => m.players.find((p) => keyOf2(p) === k));
    const ratings = rows.map((p) => Number(p.rating) || 0).filter((r) => r > 0);
    const ev = rows.filter((p) => p.events);
    return {
      name: nameOf(matches, k),
      games: ms.length,
      avgRating: ratings.length ? ratings.reduce((x, y) => x + y, 0) / ratings.length : null,
      pointsPerGame: ms.length ? ms.reduce((t, m) => t + pts(m), 0) / ms.length : 0,
      goalInvolvementsPerGame: ms.length ? rows.reduce((t, p) => t + (Number(p.goals) || 0) + (Number(p.assists) || 0), 0) / ms.length : 0,
      tackleWinsPerGame: ev.length ? ev.reduce((t, p) => t + (statsFromCounts(p.events).tacklesWon || 0), 0) / ev.length : null
    };
  };
  const pa = side(ka, kb), pb = side(kb, ka);
  if (!pa.games && !pb.games) return null;
  let winner = null;
  if (pa.games >= 3 && pb.games >= 3) {
    const diff2 = pa.pointsPerGame - pb.pointsPerGame;
    if (Math.abs(diff2) >= 0.2) winner = diff2 > 0 ? pa.name : pb.name;
    else if (pa.avgRating !== null && pb.avgRating !== null && Math.abs(pa.avgRating - pb.avgRating) >= 0.2) winner = pa.avgRating > pb.avgRating ? pa.name : pb.name;
  }
  const roleName = role === "GK" ? "in goal" : role === "DEF" ? "in defence" : role === "MID" ? "in midfield" : role === "FWD" ? "up front" : "";
  const headline = winner ? `${winner} gets the shirt ${roleName}.`.replace(" .", ".") : pa.games < 3 || pb.games < 3 ? `Not enough games apart ${roleName} to call it yet.`.replace("  ", " ") : `Too close to call ${roleName}. Share the shirt.`.replace("  ", " ");
  return { kind: "shirt", role, players: [pa, pb], winner, headline };
}
function headToHead(matches, a, b) {
  const lines = playerLines(matches, 1);
  const la = lines.find((l) => l.key === a.trim().toLowerCase());
  const lb = lines.find((l) => l.key === b.trim().toLowerCase());
  if (!la || !lb || la === lb) return null;
  const rows = [];
  const add = (label, va, vb, fmt2, lowerBetter = false) => {
    if (va === null && vb === null) return;
    const better = va === null || vb === null || Math.abs(va - vb) < 1e-9 ? null : va > vb !== lowerBetter ? 0 : 1;
    rows.push({ label, values: [va === null ? "\u2013" : fmt2(va), vb === null ? "\u2013" : fmt2(vb)], better });
  };
  add("Games", la.games, lb.games, (n) => String(n));
  add("Average rating", la.avgRating, lb.avgRating, f1);
  add("Win rate", la.wins / la.games * 100, lb.wins / lb.games * 100, pctS);
  add("Goals a game", la.perGame.goalsPerGame, lb.perGame.goalsPerGame, (n) => n.toFixed(2));
  add("Chances created a game", la.perGame.chancesCreatedPerGame, lb.perGame.chancesCreatedPerGame, (n) => n.toFixed(2));
  add("Pass completion", la.perGame.passCompletion, lb.perGame.passCompletion, pctS);
  add("Tackles won a game", la.perGame.tacklesWonPerGame, lb.perGame.tacklesWonPerGame, f1);
  add("Interceptions a game", la.perGame.interceptionsPerGame, lb.perGame.interceptionsPerGame, f1);
  add("Dribbles a game", la.perGame.dribblesPerGame, lb.perGame.dribblesPerGame, f1);
  add("Ball lost a game", la.perGame.lostPerGame, lb.perGame.lostPerGame, f1, true);
  add("Man of the match", la.motm, lb.motm, (n) => String(n));
  return { players: [la, lb], rows };
}

// src/lib/transfers.ts
var SIGHTING_DAYS = 60;
var eaKey = (name) => name.trim().toLowerCase();
function detectMoves(clubId, clubName, names, prior, now = Date.now()) {
  const cutoff = now - SIGHTING_DAYS * 864e5;
  const byKey = /* @__PURE__ */ new Map();
  for (const s of prior) {
    if (new Date(s.last_seen).getTime() < cutoff) continue;
    const list = byKey.get(s.ea_key) || [];
    list.push(s);
    byKey.set(s.ea_key, list);
  }
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  for (const name of names) {
    const key = eaKey(name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const sightings = byKey.get(key) || [];
    if (!sightings.length || sightings.some((s) => s.ea_club_id === clubId)) continue;
    const latest = sightings.reduce((a, b) => new Date(b.last_seen) > new Date(a.last_seen) ? b : a);
    out.push({ ea_key: key, ea_username: name.trim(), from_club_id: latest.ea_club_id, from_club_name: latest.club_name, to_club_id: clubId, to_club_name: clubName });
  }
  return out;
}
function clubTransferNews(moves, clubId) {
  const sorted = [...moves].sort((a, b) => b.detected_at.localeCompare(a.detected_at));
  return {
    joined: sorted.filter((m) => m.to_club_id === clubId),
    left: sorted.filter((m) => m.from_club_id === clubId)
  };
}
var moveLine = (m) => `${m.ea_username}: ${m.from_club_name || "another club"} \u2192 ${m.to_club_name || "another club"}`;
var POSITION_LINES = {
  GK: ["GK"],
  DEF: ["CB", "LB", "RB", "LWB", "RWB"],
  MID: ["CDM", "CM", "CAM", "LM", "RM"],
  ATT: ["ST", "CF", "LW", "RW"]
};
function filterPlayers(players, { line, platform, verifiedOnly }) {
  const wanted = line && POSITION_LINES[line] ? new Set(POSITION_LINES[line]) : null;
  return players.filter(
    (p) => (!wanted || p.positions.some((pos) => wanted.has(pos))) && (!platform || p.platform === platform) && (!verifiedOnly || p.verified)
  );
}

// src/lib/clubInsights.ts
var MATCH_TAGS = [
  { value: "league", label: "League", emoji: "\u{1F3C6}" },
  { value: "tournament", label: "Tournament", emoji: "\u{1F3DF}\uFE0F" },
  { value: "byot", label: "BYOT", emoji: "\u{1F39F}\uFE0F" },
  // A friendly played short-handed (AI filling the rest). Counts in the regular record and stats like
  // any friendly, and has its own filter. Casual clubs get it automatically (casual.cjs).
  { value: "smalls", label: "Smalls", emoji: "\u{1F465}" }
];
var COMPETITIONS = [
  ...MATCH_TAGS,
  { value: "cup", label: "Cup/Playoff", emoji: "\u{1F947}" },
  { value: "friendly", label: "Friendly", emoji: "\u{1F91D}" }
];
var SEPARATE_COMPETITIONS = ["tournament", "byot"];
function isSeparateCompetition(c) {
  return !!c && SEPARATE_COMPETITIONS.includes(c);
}
function playerStatsTypeForTag(tag) {
  if (tag === "tournament" || tag === "byot") return tag;
  if (tag === "league") return "club";
  return null;
}
function matchTag(row) {
  const t = row.match_data?._tag;
  return MATCH_TAGS.some((m) => m.value === t) ? t : null;
}
function eaCompetition(row) {
  const raw = String(row.match_data?._matchCategory || row.match_type || "").toLowerCase();
  if (/friendly/.test(raw)) return "friendly";
  if (/competition|cup|playoff/.test(raw)) return "cup";
  return "league";
}
function matchCompetition(row) {
  return matchTag(row) || eaCompetition(row);
}
function competitionLabel(c) {
  return COMPETITIONS.find((x) => x.value === c)?.label || "Match";
}
function competitionEmoji(c) {
  return COMPETITIONS.find((x) => x.value === c)?.emoji || "\u26BD";
}
var LINEUP_WINDOW_MS = 6 * 60 * 60 * 1e3;
function num4(v) {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}
function playerKey(p) {
  const name = (p.ea_username || "").trim();
  return name ? name.toLowerCase() : null;
}
function normalizeResult(row) {
  const r = (row.result || "").toLowerCase();
  if (r === "win" || r === "w") return "win";
  if (r === "loss" || r === "l") return "loss";
  if (r === "draw" || r === "d") return "draw";
  const f = num4(row.score_for);
  const a = num4(row.score_against);
  if (f === null || a === null) return null;
  return f > a ? "win" : f < a ? "loss" : "draw";
}
function matchTime(row) {
  const data = row.match_data;
  const ts = num4(data?.timestamp);
  if (ts && ts > 1e9) return new Date(ts < 1e12 ? ts * 1e3 : ts);
  return new Date(row.created_at || 0);
}
function rawClubs(row) {
  const byClub = row.match_data?.players;
  return byClub && typeof byClub === "object" ? byClub : null;
}
function rawPlayerRows(row, players) {
  const byClub = rawClubs(row);
  const out = /* @__PURE__ */ new Map();
  if (!byClub) return out;
  const ours = new Set(players.map(playerKey).filter((k) => !!k));
  let best = null;
  let bestHits = 0;
  for (const club of Object.values(byClub)) {
    if (!club || typeof club !== "object") continue;
    const hits = Object.values(club).filter((r) => r && ours.has(String(r.playername || "").trim().toLowerCase())).length;
    if (hits > bestHits) {
      best = club;
      bestHits = hits;
    }
  }
  for (const r of Object.values(best || {})) {
    const k = String(r?.playername || "").trim().toLowerCase();
    if (k) out.set(k, r);
  }
  return out;
}
function opponentRows(row, players) {
  const byClub = rawClubs(row);
  if (!byClub) return [];
  const ours = new Set(players.map(playerKey).filter((k) => !!k));
  const clubs = Object.values(byClub).filter((c) => c && typeof c === "object");
  if (clubs.length < 2) return [];
  const hits = (c) => Object.values(c).filter((r) => r && ours.has(String(r.playername || "").trim().toLowerCase())).length;
  const mine = clubs.reduce((best, c) => hits(c) > hits(best) ? c : best, clubs[0]);
  if (!hits(mine)) return [];
  return clubs.filter((c) => c !== mine).flatMap((c) => Object.values(c)).filter((r) => r && r.playername).map((r) => ({
    ea_username: String(r.playername).trim(),
    position: r.pos ?? null,
    rating: num4(r.rating) ?? void 0,
    goals: num4(r.goals) ?? void 0,
    assists: num4(r.assists) ?? void 0,
    shots: num4(r.shots) ?? void 0,
    ...hasEventData(r) ? { events: eaEventCounts(r) } : {}
  }));
}
function withEvents(row, players) {
  const raw = rawPlayerRows(row, players);
  if (!raw.size) return players;
  return players.map((p) => {
    const r = raw.get(playerKey(p) || "");
    if (!r || !hasEventData(r)) return p;
    return { ...p, events: eaEventCounts(r), position: p.position ?? r.pos ?? null };
  });
}
function toInsightMatches(rows, lineups = []) {
  const sortedLineups = lineups.map((l) => ({ formation: l.formation, at: new Date(l.created_at).getTime() })).sort((a, b) => a.at - b.at);
  const matches = [];
  for (const row of rows) {
    const result = normalizeResult(row);
    if (!result) continue;
    const playedAt = matchTime(row);
    const t = playedAt.getTime();
    let formation = null;
    for (const l of sortedLineups) {
      if (l.at > t) break;
      if (t - l.at <= LINEUP_WINDOW_MS) formation = l.formation;
    }
    const players = Array.isArray(row.player_stats) ? row.player_stats : [];
    matches.push({
      id: row.id,
      result,
      scoreFor: num4(row.score_for) ?? 0,
      scoreAgainst: num4(row.score_against) ?? 0,
      matchType: row.match_type,
      tag: matchTag(row),
      competition: matchCompetition(row),
      playedAt,
      opponent: row.opponent_club_name || "Unknown",
      players: withEvents(row, players),
      opponentPlayers: opponentRows(row, players),
      formation
    });
  }
  return matches.sort((a, b) => b.playedAt.getTime() - a.playedAt.getTime());
}
function sum(players, key) {
  let total = 0;
  let seen = false;
  for (const p of players) {
    const v = num4(p[key]);
    if (v !== null) {
      total += v;
      seen = true;
    }
  }
  return seen ? total : null;
}
function ratio(made, attempts) {
  if (made === null || attempts === null || attempts <= 0) return null;
  return made / attempts * 100;
}
function teamMetrics(m) {
  const ps = m.players;
  const possessions = ps.map((p) => num4(p.possession)).filter((v) => v !== null && v > 0);
  const ratings = ps.map((p) => num4(p.rating)).filter((v) => v !== null && v > 0);
  const shots = sum(ps, "shots");
  return {
    // EA reports team possession on each player row
    possession: possessions.length ? possessions.reduce((a, b) => a + b, 0) / possessions.length : null,
    passCompletion: ratio(sum(ps, "passes_made"), sum(ps, "pass_attempts")),
    shots,
    shotAccuracy: ratio(sum(ps, "shots_on_target"), shots),
    tackleSuccess: ratio(sum(ps, "tackles"), sum(ps, "tackle_attempts")),
    interceptions: sum(ps, "interceptions"),
    ballRecoveries: sum(ps, "ball_recoveries"),
    dribbleSuccess: ratio(sum(ps, "dribbles"), sum(ps, "dribble_attempts")),
    fouls: sum(ps, "fouls"),
    avgRating: ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null
  };
}
function mean3(values) {
  const v = values.filter((x) => x !== null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}
function computeOverview(matches) {
  const wins = matches.filter((m) => m.result === "win").length;
  const draws = matches.filter((m) => m.result === "draw").length;
  const losses = matches.filter((m) => m.result === "loss").length;
  const metrics = matches.map(teamMetrics);
  return {
    played: matches.length,
    wins,
    draws,
    losses,
    winPct: matches.length ? wins / matches.length * 100 : 0,
    goalsFor: matches.reduce((a, m) => a + m.scoreFor, 0),
    goalsAgainst: matches.reduce((a, m) => a + m.scoreAgainst, 0),
    cleanSheets: matches.filter((m) => m.scoreAgainst === 0).length,
    avgPossession: mean3(metrics.map((x) => x.possession)),
    passCompletion: mean3(metrics.map((x) => x.passCompletion)),
    shotsPerGame: mean3(metrics.map((x) => x.shots)),
    form: matches.slice(0, 10).map((m) => m.result)
  };
}
function emptyRecord() {
  return { games: 0, wins: 0, draws: 0, losses: 0, goalDiff: 0 };
}
function addTo(r, m) {
  r.games++;
  if (m.result === "win") r.wins++;
  else if (m.result === "draw") r.draws++;
  else r.losses++;
  r.goalDiff += m.scoreFor - m.scoreAgainst;
}
function winPct(r) {
  return r.games ? r.wins / r.games * 100 : 0;
}
function gdPerGame(r) {
  return r.games ? r.goalDiff / r.games : 0;
}
function computeCompetitionRecords(matches) {
  return COMPETITIONS.map((c) => {
    const record = emptyRecord();
    for (const m of matches) if (m.competition === c.value) addTo(record, m);
    return { competition: c.value, label: c.label, emoji: c.emoji, record };
  }).filter((x) => x.record.games > 0);
}
function displayNames(matches) {
  const names = /* @__PURE__ */ new Map();
  for (const m of matches) {
    for (const p of m.players) {
      const k = playerKey(p);
      if (k && !names.has(k)) names.set(k, (p.ea_username || "").trim());
    }
  }
  return names;
}
function computePlayerImpact(matches, minGames = 5) {
  const names = displayNames(matches);
  const out = [];
  for (const [key, name] of names) {
    const withR = emptyRecord();
    const withoutR = emptyRecord();
    for (const m of matches) {
      const played2 = m.players.some((p) => playerKey(p) === key);
      addTo(played2 ? withR : withoutR, m);
    }
    if (withR.games < minGames) continue;
    out.push({
      key,
      name,
      with: withR,
      without: withoutR,
      lift: withoutR.games ? winPct(withR) - winPct(withoutR) : 0
    });
  }
  return out.sort((a, b) => b.with.games - a.with.games);
}
function combinations(items, size) {
  const out = [];
  const pick = (start, acc) => {
    if (acc.length === size) {
      out.push(acc.slice());
      return;
    }
    for (let i = start; i < items.length; i++) {
      acc.push(items[i]);
      pick(i + 1, acc);
      acc.pop();
    }
  };
  pick(0, []);
  return out;
}
function computeCombos(matches, size, minTogether = 5) {
  const names = displayNames(matches);
  const together = /* @__PURE__ */ new Map();
  for (const m of matches) {
    const keys = Array.from(new Set(m.players.map(playerKey).filter((k) => !!k))).sort();
    for (const combo of combinations(keys, size)) {
      const id = combo.join("|");
      if (!together.has(id)) together.set(id, emptyRecord());
      addTo(together.get(id), m);
    }
  }
  const combos = [];
  for (const [id, rec2] of together) {
    if (rec2.games < minTogether) continue;
    const members = id.split("|");
    const apart = emptyRecord();
    for (const m of matches) {
      const present = new Set(m.players.map(playerKey));
      const count = members.filter((k) => present.has(k)).length;
      if (count > 0 && count < members.length) addTo(apart, m);
    }
    combos.push({
      names: members.map((k) => names.get(k) || k),
      together: rec2,
      apart,
      lift: apart.games ? winPct(rec2) - winPct(apart) : 0
    });
  }
  return combos.sort((a, b) => b.lift - a.lift || b.together.games - a.together.games);
}
function computeFormations(matches) {
  const groups = /* @__PURE__ */ new Map();
  for (const m of matches) {
    if (!m.formation) continue;
    if (!groups.has(m.formation)) groups.set(m.formation, []);
    groups.get(m.formation).push(m);
  }
  return Array.from(groups.entries()).map(([formation, ms]) => {
    const record = emptyRecord();
    ms.forEach((m) => addTo(record, m));
    return {
      formation,
      record,
      avgRating: mean3(ms.map((m) => teamMetrics(m).avgRating)),
      goalsForPerGame: ms.reduce((a, m) => a + m.scoreFor, 0) / ms.length,
      goalsAgainstPerGame: ms.reduce((a, m) => a + m.scoreAgainst, 0) / ms.length
    };
  }).sort((a, b) => b.record.games - a.record.games);
}
var METRIC_LABELS = [
  { key: "possession", label: "Possession", unit: "%", higherIsBetter: true },
  { key: "passCompletion", label: "Pass completion", unit: "%", higherIsBetter: true },
  { key: "shots", label: "Shots", unit: "", higherIsBetter: true },
  { key: "shotAccuracy", label: "Shots on target", unit: "%", higherIsBetter: true },
  { key: "tackleSuccess", label: "Tackle success", unit: "%", higherIsBetter: true },
  { key: "interceptions", label: "Interceptions", unit: "", higherIsBetter: true },
  { key: "ballRecoveries", label: "Ball recoveries", unit: "", higherIsBetter: true },
  { key: "dribbleSuccess", label: "Dribble success", unit: "%", higherIsBetter: true },
  { key: "fouls", label: "Fouls", unit: "", higherIsBetter: false },
  { key: "avgRating", label: "Avg match rating", unit: "", higherIsBetter: true }
];
function computeWinLossGaps(matches, minEach = 3) {
  const wins = matches.filter((m) => m.result === "win").map(teamMetrics);
  const losses = matches.filter((m) => m.result === "loss").map(teamMetrics);
  if (wins.length < minEach || losses.length < minEach) return [];
  const gaps = [];
  for (const meta of METRIC_LABELS) {
    const w = mean3(wins.map((x) => x[meta.key]));
    const l = mean3(losses.map((x) => x[meta.key]));
    if (w === null || l === null || w === 0) continue;
    const rel = (w - l) / Math.abs(w);
    gaps.push({ ...meta, inWins: w, inLosses: l, severity: meta.higherIsBetter ? rel : -rel });
  }
  return gaps.sort((a, b) => b.severity - a.severity);
}
function fmt(n, unit = "") {
  return unit === "%" ? `${Math.round(n)}%` : n.toFixed(1);
}
function generateInsights(matches) {
  return [...generateBaseInsights(matches), ...generateAdvancedInsights(matches)];
}
function generateBaseInsights(matches) {
  const insights = [];
  if (matches.length < 5) return insights;
  const duos = computeCombos(matches, 2);
  const bestDuo = duos.find((d) => d.lift >= 15 && d.apart.games >= 3);
  if (bestDuo) {
    insights.push({
      tone: "good",
      text: `${bestDuo.names.join(" + ")} win ${fmt(winPct(bestDuo.together), "%")} of ${bestDuo.together.games} games together, but ${fmt(winPct(bestDuo.apart), "%")} when only one of them plays.`
    });
  }
  const worstDuo = [...duos].reverse().find((d) => d.lift <= -15 && d.apart.games >= 3);
  if (worstDuo) {
    insights.push({
      tone: "bad",
      text: `${worstDuo.names.join(" + ")} win only ${fmt(winPct(worstDuo.together), "%")} together (${worstDuo.together.games} games) versus ${fmt(winPct(worstDuo.apart), "%")} apart.`
    });
  }
  const impact = computePlayerImpact(matches).filter((p) => p.without.games >= 3);
  const mvp = [...impact].sort((a, b) => b.lift - a.lift)[0];
  if (mvp && mvp.lift >= 15) {
    insights.push({
      tone: "good",
      text: `The club wins ${fmt(winPct(mvp.with), "%")} with ${mvp.name} and ${fmt(winPct(mvp.without), "%")} without.`
    });
  }
  const gaps = computeWinLossGaps(matches);
  for (const g of gaps.slice(0, 2)) {
    if (g.severity < 0.08) break;
    insights.push({
      tone: "bad",
      text: `${g.label} falls from ${fmt(g.inWins, g.unit)} in wins to ${fmt(g.inLosses, g.unit)} in losses.`
    });
  }
  const formations = computeFormations(matches).filter((f) => f.record.games >= 3);
  if (formations.length >= 2) {
    const sorted = [...formations].sort((a, b) => winPct(b.record) - winPct(a.record));
    const best = sorted[0];
    const worst = sorted[sorted.length - 1];
    if (winPct(best.record) - winPct(worst.record) >= 15) {
      insights.push({
        tone: "neutral",
        text: `${best.formation} wins ${fmt(winPct(best.record), "%")} (${best.record.games} games); ${worst.formation} wins ${fmt(winPct(worst.record), "%")} (${worst.record.games} games).`
      });
    }
  }
  return insights;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  AREAS,
  AREA_FIX,
  BENCH_METRICS,
  CLEAR_EDGE,
  COMPETITIONS,
  GOAL_MODEL,
  KEEPER_METRICS,
  MATCH_TAGS,
  MIN_ROLE_GAMES,
  PASS_STYLE_CUTOFFS,
  POSITION_LINES,
  ROLE_LABELS,
  ROLE_WEIGHTS,
  SCORE_AREAS,
  SCORE_MAX,
  SCORE_METRICS,
  SEPARATE_COMPETITIONS,
  SESSION_BREAK_MS,
  SESSION_GAP_MS,
  SIGHTING_DAYS,
  banterRankings,
  banterWindow,
  benchRole,
  benchmarkPlayer,
  betterTogether,
  betterWithout,
  carryScores,
  clubTransferNews,
  clutchRatings,
  competitionEmoji,
  competitionLabel,
  computeAdvancedPlayers,
  computeCombos,
  computeCompetitionRecords,
  computeFormTrends,
  computeFormations,
  computeOpponentProfiles,
  computeOverview,
  computePartnerships,
  computePlayerImpact,
  computePressing,
  computeSessionFatigue,
  computeWinLossGaps,
  decisionScore,
  defendingSummary,
  deriveStats,
  detectMoves,
  divisionLabel,
  eaKey,
  expectedPoints,
  fc27Percentile,
  filterPlayers,
  gdPerGame,
  generateAdvancedInsights,
  generateInsights,
  grade,
  groupSessions,
  headToHead,
  isDivisionMatch,
  isSeparateCompetition,
  lineupHints,
  matchCompetition,
  matchDeepHighlights,
  matchPerformance,
  matchTag,
  moveLine,
  outcomeOdds,
  parseDivision,
  passStyle,
  percentileText,
  playerKey,
  playerLines,
  playerScores,
  playerStatsTypeForTag,
  pointsVerdict,
  positionalDiscipline,
  powerRankings,
  quantileScore,
  roleLabel,
  roleOf,
  roleScore,
  scorePlayer,
  sessionReport,
  sideTotals,
  signed,
  summarisePerformance,
  summarizeDivision,
  superlatives,
  teamEvents,
  teamMetrics,
  teamPercentile,
  toInsightMatches,
  verdictFor,
  whoGetsTheShirt,
  winPct
});
