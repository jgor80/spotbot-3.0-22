// Generated from src/lib/eaEvents.ts by npm run build:bot-events. Do not edit by hand.
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

// src/lib/eaEvents.ts
var eaEvents_exports = {};
__export(eaEvents_exports, {
  EA_EVENT_STATS: () => EA_EVENT_STATS,
  eaEventCounts: () => eaEventCounts,
  eaEventStats: () => eaEventStats,
  hasEventData: () => hasEventData,
  statsFromCounts: () => statsFromCounts
});
module.exports = __toCommonJS(eaEvents_exports);
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
    out[name] = ids.reduce((sum, id) => sum + (c && c[id] || 0), 0);
  }
  return out;
}
function eaEventStats(p) {
  return statsFromCounts(eaEventCounts(p));
}
function hasEventData(p) {
  return Object.keys(eaEventCounts(p)).length > 0;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  EA_EVENT_STATS,
  eaEventCounts,
  eaEventStats,
  hasEventData,
  statsFromCounts
});
