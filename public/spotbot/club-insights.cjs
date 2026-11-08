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
  BENCH_METRICS: () => BENCH_METRICS,
  COMPETITIONS: () => COMPETITIONS,
  MATCH_TAGS: () => MATCH_TAGS,
  MIN_ROLE_GAMES: () => MIN_ROLE_GAMES,
  PASS_STYLE_CUTOFFS: () => PASS_STYLE_CUTOFFS,
  ROLE_LABELS: () => ROLE_LABELS,
  SEPARATE_COMPETITIONS: () => SEPARATE_COMPETITIONS,
  SESSION_GAP_MS: () => SESSION_GAP_MS,
  benchRole: () => benchRole,
  benchmarkPlayer: () => benchmarkPlayer,
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
  deriveStats: () => deriveStats,
  divisionLabel: () => divisionLabel,
  fc27Percentile: () => fc27Percentile,
  gdPerGame: () => gdPerGame,
  generateAdvancedInsights: () => generateAdvancedInsights,
  generateInsights: () => generateInsights,
  isDivisionMatch: () => isDivisionMatch,
  isSeparateCompetition: () => isSeparateCompetition,
  lineupHints: () => lineupHints,
  matchCompetition: () => matchCompetition,
  matchDeepHighlights: () => matchDeepHighlights,
  matchTag: () => matchTag,
  parseDivision: () => parseDivision,
  passStyle: () => passStyle,
  percentileText: () => percentileText,
  playerKey: () => playerKey,
  playerStatsTypeForTag: () => playerStatsTypeForTag,
  positionalDiscipline: () => positionalDiscipline,
  roleOf: () => roleOf,
  signed: () => signed,
  summarizeDivision: () => summarizeDivision,
  teamEvents: () => teamEvents,
  teamMetrics: () => teamMetrics,
  teamPercentile: () => teamPercentile,
  toInsightMatches: () => toInsightMatches,
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
    ]
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
  const avg = (ls, k) => {
    const g = ls.reduce((s, l) => s + (l[k] === null ? 0 : l.games), 0);
    return g ? ls.reduce((s, l) => s + (l[k] ?? 0) * l.games, 0) / g : null;
  };
  const earlyGames = early.reduce((s, l) => s + l.games, 0);
  const lateGames = late.reduce((s, l) => s + l.games, 0);
  if (earlyGames >= 5 && lateGames >= 5) {
    const dq1 = avg(early, "decisionScore");
    const dq2 = avg(late, "decisionScore");
    const w1 = avg(early, "winPct");
    const w2 = avg(late, "winPct");
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
    const wr = avg(rest, "winPct");
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
function num2(v) {
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
  const f = num2(row.score_for);
  const a = num2(row.score_against);
  if (f === null || a === null) return null;
  return f > a ? "win" : f < a ? "loss" : "draw";
}
function matchTime(row) {
  const data = row.match_data;
  const ts = num2(data?.timestamp);
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
    rating: num2(r.rating) ?? void 0,
    goals: num2(r.goals) ?? void 0,
    assists: num2(r.assists) ?? void 0,
    shots: num2(r.shots) ?? void 0,
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
      scoreFor: num2(row.score_for) ?? 0,
      scoreAgainst: num2(row.score_against) ?? 0,
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
    const v = num2(p[key]);
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
  const possessions = ps.map((p) => num2(p.possession)).filter((v) => v !== null && v > 0);
  const ratings = ps.map((p) => num2(p.rating)).filter((v) => v !== null && v > 0);
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
function mean(values) {
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
    avgPossession: mean(metrics.map((x) => x.possession)),
    passCompletion: mean(metrics.map((x) => x.passCompletion)),
    shotsPerGame: mean(metrics.map((x) => x.shots)),
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
      const played = m.players.some((p) => playerKey(p) === key);
      addTo(played ? withR : withoutR, m);
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
      avgRating: mean(ms.map((m) => teamMetrics(m).avgRating)),
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
    const w = mean(wins.map((x) => x[meta.key]));
    const l = mean(losses.map((x) => x[meta.key]));
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
  BENCH_METRICS,
  COMPETITIONS,
  MATCH_TAGS,
  MIN_ROLE_GAMES,
  PASS_STYLE_CUTOFFS,
  ROLE_LABELS,
  SEPARATE_COMPETITIONS,
  SESSION_GAP_MS,
  benchRole,
  benchmarkPlayer,
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
  deriveStats,
  divisionLabel,
  fc27Percentile,
  gdPerGame,
  generateAdvancedInsights,
  generateInsights,
  isDivisionMatch,
  isSeparateCompetition,
  lineupHints,
  matchCompetition,
  matchDeepHighlights,
  matchTag,
  parseDivision,
  passStyle,
  percentileText,
  playerKey,
  playerStatsTypeForTag,
  positionalDiscipline,
  roleOf,
  signed,
  summarizeDivision,
  teamEvents,
  teamMetrics,
  teamPercentile,
  toInsightMatches,
  winPct
});
