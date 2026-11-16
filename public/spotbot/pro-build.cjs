// Generated from src/lib/proBuild.ts by npm run build:bot-probuild. Do not edit by hand.
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

// src/lib/proBuild.ts
var proBuild_exports = {};
__export(proBuild_exports, {
  AP_BY_LEVEL: () => AP_BY_LEVEL,
  ARCHETYPES: () => ARCHETYPES,
  ARCHETYPE_RULES: () => ARCHETYPE_RULES,
  ATTRIBUTES: () => ATTRIBUTES,
  ATTR_GROUPS: () => ATTR_GROUPS,
  BODY: () => BODY,
  BOOST_MAX: () => BOOST_MAX,
  HEIGHT_RANGE: () => HEIGHT_RANGE,
  LEVEL_CAP: () => LEVEL_CAP,
  LEVEL_MAX: () => LEVEL_MAX,
  MAX_PLAYSTYLES: () => MAX_PLAYSTYLES,
  PLAYSTYLES: () => PLAYSTYLES,
  PLAYSTYLE_DEFS: () => PLAYSTYLE_DEFS,
  PLAYSTYLE_SLOT_LEVELS: () => PLAYSTYLE_SLOT_LEVELS,
  POINTS_MAX_PER_ATTR: () => POINTS_MAX_PER_ATTR,
  SPECIALIZATIONS: () => SPECIALIZATIONS,
  STYLE_GROUPS: () => STYLE_GROUPS,
  WEIGHT_RANGE: () => WEIGHT_RANGE,
  accelerate: () => accelerate,
  accelerateType: () => accelerateType,
  apAtLevel: () => apAtLevel,
  apSpent: () => apSpent,
  applyProfile: () => applyProfile,
  attrCap: () => attrCap,
  bodyEffects: () => bodyEffects,
  buildPath: () => buildPath,
  buildSummary: () => buildSummary,
  canonStyle: () => canonStyle,
  capConfirmed: () => capConfirmed,
  cleanProfile: () => cleanProfile,
  costBetween: () => costBetween,
  costTier: () => costTier,
  decodeBuild: () => decodeBuild,
  emptyBuild: () => emptyBuild,
  encodeBuild: () => encodeBuild,
  formatHeight: () => formatHeight,
  formatWeight: () => formatWeight,
  groupAverages: () => groupAverages,
  groupTotals: () => groupTotals,
  importProClubsBuilder: () => importProClubsBuilder,
  isKeeper: () => isKeeper,
  levelNeeded: () => levelNeeded,
  masteryBonus: () => masteryBonus,
  masteryLevelOf: () => masteryLevelOf,
  matchValue: () => matchValue,
  menuValue: () => menuValue,
  nextSlotLevel: () => nextSlotLevel,
  normaliseBuild: () => normaliseBuild,
  playstyleSlots: () => playstyleSlots,
  playstyleStatus: () => playstyleStatus,
  pointCost: () => pointCost,
  pointsSpent: () => pointsSpent,
  raiseFor: () => raiseFor,
  specializationStatus: () => specializationStatus,
  startValue: () => startValue,
  trainable: () => trainable,
  trainedValue: () => trainedValue
});
module.exports = __toCommonJS(proBuild_exports);

// src/lib/proClubsData.ts
var ATTRIBUTE_KEYS = [
  "acceleration",
  "sprintSpeed",
  "positioning",
  "finishing",
  "shotPower",
  "longShots",
  "volleys",
  "penalties",
  "vision",
  "crossing",
  "fkAccuracy",
  "shortPassing",
  "longPassing",
  "curve",
  "agility",
  "balance",
  "reactions",
  "ballControl",
  "dribbling",
  "composure",
  "interceptions",
  "headingAccuracy",
  "defAware",
  "standingTackle",
  "slidingTackle",
  "jumping",
  "stamina",
  "strength",
  "aggression",
  "gkDiving",
  "gkHandling",
  "gkKicking",
  "gkPositioning",
  "gkReflexes"
];
var START_VALUES = {
  shotstopper: [75, 55, 50, 40, 50, 40, 40, 40, 65, 40, 40, 65, 65, 40, 50, 65, 75, 65, 45, 55, 65, 40, 40, 40, 50, 65, 65, 65, 65, 75, 75, 65, 75, 75],
  sweeperkeeper: [75, 65, 50, 40, 50, 45, 40, 55, 75, 40, 40, 50, 75, 40, 65, 70, 75, 65, 65, 75, 75, 65, 40, 50, 65, 75, 75, 70, 75, 75, 65, 75, 75, 75],
  progressor: [70, 72, 70, 50, 65, 50, 50, 65, 75, 50, 45, 75, 75, 50, 70, 70, 65, 70, 65, 75, 75, 75, 75, 75, 75, 75, 65, 70, 65, 0, 0, 0, 0, 0],
  boss: [70, 70, 75, 45, 70, 60, 60, 65, 55, 45, 50, 65, 65, 50, 65, 75, 60, 65, 60, 65, 75, 75, 75, 75, 75, 75, 70, 75, 75, 0, 0, 0, 0, 0],
  marauder: [75, 75, 65, 55, 65, 60, 65, 65, 60, 75, 60, 65, 65, 75, 70, 65, 70, 70, 70, 65, 70, 65, 70, 70, 75, 60, 75, 60, 72, 0, 0, 0, 0, 0],
  disruptor: [75, 70, 70, 50, 70, 65, 65, 65, 65, 65, 50, 75, 70, 65, 68, 75, 70, 65, 65, 70, 75, 65, 70, 70, 75, 65, 75, 75, 70, 0, 0, 0, 0, 0],
  recycler: [70, 70, 70, 55, 70, 65, 65, 65, 75, 65, 50, 70, 75, 65, 68, 75, 65, 65, 65, 72, 75, 60, 75, 75, 75, 65, 72, 72, 75, 0, 0, 0, 0, 0],
  maestro: [70, 65, 80, 65, 70, 70, 65, 70, 75, 75, 75, 75, 75, 70, 75, 70, 65, 75, 65, 75, 75, 50, 65, 72, 50, 60, 65, 65, 65, 0, 0, 0, 0, 0],
  creator: [70, 65, 80, 65, 72, 72, 72, 75, 75, 75, 75, 75, 75, 75, 72, 65, 75, 75, 75, 72, 55, 50, 50, 65, 50, 60, 65, 65, 55, 0, 0, 0, 0, 0],
  spark: [75, 75, 80, 65, 65, 65, 72, 75, 75, 75, 65, 75, 65, 75, 75, 75, 75, 75, 75, 72, 55, 50, 50, 55, 45, 55, 65, 65, 50, 0, 0, 0, 0, 0],
  magician: [75, 70, 80, 75, 70, 65, 72, 75, 75, 65, 65, 75, 50, 75, 72, 75, 75, 75, 75, 72, 50, 65, 45, 40, 40, 60, 65, 65, 55, 0, 0, 0, 0, 0],
  finisher: [75, 70, 80, 75, 75, 60, 75, 75, 65, 55, 65, 70, 50, 70, 72, 75, 75, 75, 70, 75, 60, 75, 55, 50, 40, 65, 65, 70, 65, 0, 0, 0, 0, 0],
  target: [70, 65, 80, 72, 75, 65, 72, 75, 65, 50, 65, 75, 50, 55, 70, 75, 75, 70, 70, 72, 50, 75, 50, 45, 40, 75, 60, 75, 65, 0, 0, 0, 0, 0]
};
var COST_TIERS = {
  shotstopper: [3, 4, 2, 4, 3, 3, 2, 2, 3, 3, 2, 3, 3, 2, 4, 3, 1, 3, 4, 3, 4, 3, 3, 4, 3, 2, 2, 3, 2, 3, 3, 4, 4, 3],
  sweeperkeeper: [4, 4, 2, 4, 3, 3, 2, 2, 2, 3, 2, 4, 2, 2, 4, 3, 2, 2, 4, 3, 4, 3, 3, 4, 3, 2, 2, 3, 2, 3, 4, 3, 3, 4],
  progressor: [4, 4, 2, 4, 3, 3, 2, 2, 3, 3, 2, 4, 2, 2, 4, 3, 2, 2, 4, 2, 4, 3, 2, 4, 3, 2, 2, 3, 2, 0, 0, 0, 0, 0],
  boss: [4, 4, 2, 4, 3, 3, 2, 2, 3, 3, 2, 4, 3, 2, 4, 3, 2, 3, 4, 3, 4, 2, 3, 4, 3, 1, 2, 2, 1, 0, 0, 0, 0, 0],
  marauder: [4, 3, 2, 4, 3, 3, 2, 2, 3, 2, 2, 4, 3, 2, 4, 3, 2, 3, 4, 3, 4, 3, 3, 4, 2, 2, 1, 3, 2, 0, 0, 0, 0, 0],
  disruptor: [3, 4, 2, 4, 3, 3, 2, 2, 3, 3, 2, 4, 3, 2, 4, 3, 2, 3, 4, 3, 4, 3, 3, 3, 3, 2, 1, 3, 1, 0, 0, 0, 0, 0],
  recycler: [4, 4, 2, 4, 3, 3, 2, 2, 3, 3, 2, 3, 3, 2, 4, 3, 2, 3, 4, 3, 3, 3, 2, 4, 3, 2, 2, 2, 2, 0, 0, 0, 0, 0],
  maestro: [4, 4, 2, 4, 3, 3, 2, 2, 3, 3, 2, 4, 2, 2, 3, 3, 1, 2, 4, 3, 4, 3, 3, 4, 3, 2, 2, 3, 2, 0, 0, 0, 0, 0],
  creator: [4, 4, 2, 4, 3, 2, 2, 2, 2, 3, 2, 4, 3, 1, 4, 3, 2, 3, 3, 3, 4, 3, 3, 4, 3, 2, 2, 3, 2, 0, 0, 0, 0, 0],
  spark: [4, 3, 2, 4, 3, 3, 2, 2, 2, 3, 2, 4, 3, 2, 3, 3, 2, 3, 3, 3, 4, 3, 3, 4, 3, 2, 2, 3, 2, 0, 0, 0, 0, 0],
  magician: [3, 4, 2, 4, 3, 3, 2, 2, 3, 3, 2, 3, 3, 1, 4, 3, 2, 2, 4, 3, 4, 3, 3, 4, 3, 2, 2, 3, 2, 0, 0, 0, 0, 0],
  finisher: [4, 4, 2, 3, 3, 3, 1, 2, 3, 3, 2, 4, 3, 2, 4, 3, 1, 3, 4, 2, 4, 3, 3, 4, 3, 2, 2, 3, 2, 0, 0, 0, 0, 0],
  target: [4, 4, 2, 4, 3, 3, 2, 2, 3, 3, 2, 4, 3, 2, 4, 2, 2, 3, 4, 3, 4, 2, 3, 4, 3, 1, 2, 2, 2, 0, 0, 0, 0, 0]
};
var COST_BANDS = [
  [60, 1, 1, 1, 2],
  [63, 1, 1, 2, 3],
  [66, 1, 2, 3, 4],
  [69, 1, 2, 3, 5],
  [74, 2, 3, 4, 6],
  [79, 3, 4, 6, 8],
  [84, 3, 5, 7, 10],
  [89, 6, 8, 11, 15],
  [92, 8, 11, 15, 20],
  [94, 10, 15, 20, 25],
  [95, 15, 20, 25, 30],
  [96, 20, 25, 30, 35],
  [97, 25, 30, 35, 40],
  [98, 30, 35, 40, 45],
  [99, 35, 40, 45, 50]
];
var AP_GAINS = [0, 100, 9, 9, 9, 19, 10, 10, 10, 10, 38, 13, 13, 13, 13, 25, 13, 13, 13, 13, 44, 19, 19, 19, 19, 38, 25, 25, 25, 25, 63, 25, 25, 25, 25, 38, 25, 25, 25, 25, 50, 25, 25, 25, 25, 44, 25, 25, 25, 25, 63, 25, 25, 25, 25, 50];
var AP_BY_LEVEL = AP_GAINS.reduce((acc, g, i) => (acc.push((acc[i - 1] ?? 0) + g), acc), []);
var LEVEL_CAP = 55;
var CAPS = {
  spark: { acceleration: 99, sprintSpeed: 95 },
  finisher: { acceleration: 95, sprintSpeed: 95, standingTackle: 75 },
  magician: { acceleration: 95, sprintSpeed: 95, standingTackle: 75 },
  marauder: { acceleration: 95, sprintSpeed: 95 },
  creator: { acceleration: 92, sprintSpeed: 92 },
  progressor: { acceleration: 92, sprintSpeed: 92 },
  disruptor: { acceleration: 92, sprintSpeed: 92 },
  target: { acceleration: 90, sprintSpeed: 92, standingTackle: 75, jumping: 96, finishing: 96, shortPassing: 96, ballControl: 92, agility: 92 },
  maestro: { acceleration: 90, sprintSpeed: 90 },
  recycler: { acceleration: 90, sprintSpeed: 90 },
  boss: { acceleration: 90, sprintSpeed: 90, curve: 75 },
  shotstopper: { sprintSpeed: 85, defAware: 75, standingTackle: 75 },
  sweeperkeeper: { sprintSpeed: 88, defAware: 75 }
};
var BODY = {
  finisher: { h: [164, 190], w: [70, 90], startH: 177, startW: 80 },
  magician: { h: [162, 188], w: [60, 80], startH: 175, startW: 70 },
  spark: { h: [162, 188], w: [60, 80], startH: 175, startW: 70 },
  target: { h: [177, 195], w: [80, 100], startH: 186, startW: 90 },
  creator: { h: [162, 188], w: [65, 85], startH: 175, startW: 75 },
  maestro: { h: [162, 188], w: [65, 85], startH: 175, startW: 75 },
  disruptor: { h: [168, 188], w: [65, 85], startH: 178, startW: 75 },
  recycler: { h: [172, 192], w: [65, 85], startH: 182, startW: 75 },
  marauder: { h: [168, 188], w: [65, 85], startH: 178, startW: 75 },
  boss: { h: [180, 196], w: [80, 100], startH: 188, startW: 90 },
  progressor: { h: [177, 195], w: [75, 95], startH: 186, startW: 85 },
  shotstopper: { h: [179, 197], w: [80, 100], startH: 188, startW: 90 },
  sweeperkeeper: { h: [184, 200], w: [80, 100], startH: 192, startW: 90 }
};
var BODY_EFFECTS = {
  outfield: {
    taller: { up: ["jumping", "sprintSpeed", "strength"], down: ["acceleration", "agility", "balance"] },
    heavier: { up: ["balance", "jumping", "strength"], down: ["acceleration", "agility", "sprintSpeed"] }
  },
  keeper: {
    taller: { up: ["gkDiving", "gkReflexes", "sprintSpeed", "strength"], down: ["gkHandling", "acceleration"] },
    heavier: { up: ["gkHandling", "strength"], down: ["gkDiving", "gkReflexes", "acceleration", "sprintSpeed"] }
  }
};
var ACCELERATE = {
  explosive: { maxHeight: 182, agility: 65, agilityOverStrength: 10, acceleration: 80 },
  lengthy: { minHeight: 183, strength: 65, strengthOverAgility: 4, acceleration: 40 }
};
var MASTERIES = {
  shotstopper: ["gkPositioning", "gkReflexes"],
  sweeperkeeper: ["gkHandling", "gkDiving"],
  progressor: ["longPassing", "standingTackle"],
  boss: ["aggression", "strength"],
  marauder: ["slidingTackle", "sprintSpeed"],
  disruptor: ["stamina", "interceptions"],
  recycler: ["defAware", "shortPassing"],
  maestro: ["reactions", "ballControl"],
  creator: ["fkAccuracy", "vision"],
  spark: ["crossing", "dribbling"],
  magician: ["curve", "acceleration"],
  finisher: ["composure", "finishing"],
  target: ["balance", "jumping"]
};
var PLAYSTYLE_DEFS = [
  { name: "Acrobatic", group: "shooting", req: { agility: 80, reactions: 80, volleys: 75 } },
  { name: "Chip Shot", group: "shooting", req: { reactions: 75, composure: 80, ballControl: 80 } },
  { name: "Dead Ball", group: "shooting", req: { crossing: 80, fkAccuracy: 75, shotPower: 80 } },
  { name: "Finesse Shot", group: "shooting", req: { vision: 80, finishing: 75, curve: 80 } },
  { name: "Gamechanger", group: "shooting", req: { composure: 80, finishing: 75, curve: 80 } },
  { name: "Low Driven Shot", group: "shooting", req: { composure: 80, finishing: 75, shotPower: 80 } },
  { name: "Power Shot", group: "shooting", req: { finishing: 80, shotPower: 75, longShots: 80 } },
  { name: "Precision Header", group: "shooting", req: { jumping: 80, aggression: 80, headingAccuracy: 75 } },
  { name: "Incisive Pass", group: "passing", req: { vision: 75, longPassing: 80, curve: 80 } },
  { name: "Inventive", group: "passing", req: { composure: 80, longPassing: 75, curve: 80 } },
  { name: "Long Ball Pass", group: "passing", req: { vision: 85, longPassing: 80 } },
  { name: "Pinged Pass", group: "passing", req: { longPassing: 85, shortPassing: 80 } },
  { name: "Tiki Taka", group: "passing", req: { reactions: 80, ballControl: 80, shortPassing: 75 } },
  { name: "Whipped Pass", group: "passing", req: { crossing: 80, longPassing: 75 } },
  { name: "First Touch", group: "ballControl", req: { composure: 80, ballControl: 75 } },
  { name: "Press Proven", group: "ballControl", req: { strength: 75, composure: 80, ballControl: 80 } },
  { name: "Rapid", group: "ballControl", req: { acceleration: 75, sprintSpeed: 80, dribbling: 80 } },
  { name: "Technical", group: "ballControl", req: { balance: 80, ballControl: 75, dribbling: 80 } },
  { name: "Trickster", group: "ballControl", req: { acceleration: 80, agility: 75, dribbling: 80 } },
  { name: "Aerial Fortress", group: "defending", req: { jumping: 75, headingAccuracy: 75 } },
  { name: "Anticipate", group: "defending", req: { balance: 80, defAware: 75, standingTackle: 80 } },
  { name: "Block", group: "defending", req: { agility: 80, strength: 75, reactions: 80 } },
  { name: "Intercept", group: "defending", req: { aggression: 80, interceptions: 80 } },
  { name: "Jockey", group: "defending", req: { agility: 75, defAware: 80, standingTackle: 80 } },
  { name: "Slide Tackle", group: "defending", req: { aggression: 80, slidingTackle: 75 } },
  { name: "Bruiser", group: "physical", req: { strength: 75, aggression: 80, defAware: 80 } },
  { name: "Enforcer", group: "physical", req: { balance: 80, strength: 75, ballControl: 80 } },
  { name: "Long Throw", group: "physical", req: { strength: 80, vision: 75 } },
  { name: "Quick Step", group: "physical", req: { acceleration: 75, sprintSpeed: 80, stamina: 80 } },
  { name: "Relentless", group: "physical", req: { agility: 80, stamina: 80 } },
  { name: "1v1 Close Down", group: "goalkeeping", req: { acceleration: 80, agility: 75, aggression: 80 }, keeperOnly: true, unconfirmed: true },
  { name: "Cross Claimer", group: "goalkeeping", req: { jumping: 80, strength: 80, gkPositioning: 75 }, keeperOnly: true, unconfirmed: true },
  { name: "Deflector", group: "goalkeeping", req: { strength: 75, gkDiving: 80, gkReflexes: 75 }, keeperOnly: true, unconfirmed: true },
  { name: "Far Reach", group: "goalkeeping", req: { agility: 80, reactions: 80, gkDiving: 75 }, keeperOnly: true, unconfirmed: true },
  { name: "Far Throw", group: "goalkeeping", req: { vision: 75, longPassing: 75, gkKicking: 80 }, keeperOnly: true, unconfirmed: true },
  { name: "Footwork", group: "goalkeeping", req: { agility: 80, balance: 80, gkReflexes: 75 }, keeperOnly: true, unconfirmed: true }
];
var PLAYSTYLE_SLOT_LEVELS = [5, 15, 40, 55];
var SIGNATURE_PLUS_LEVELS = [20, 55];
var ARCHETYPE_RULES = {
  shotstopper: { signatures: ["Far Reach", "Deflector"], perk45: { name: "Ready to Act", trigger: "jockey a dribbler in your attacking third", boosts: "Diving, Balance, Reflexes" } },
  sweeperkeeper: { signatures: ["Footwork", "Cross Claimer"], perk45: { name: "Rush Specialist", trigger: "rush a dribbler in the box", boosts: "Acceleration, Aggression, Reactions" } },
  progressor: { signatures: ["Long Ball Pass", "Anticipate"], perk45: { name: "Goalkeeper's Favourite", trigger: "take a pass from your keeper in the defensive third", boosts: "Long Passing, Short Passing, Vision" } },
  boss: { signatures: ["Bruiser", "Aerial Fortress"], perk45: { name: "Box Controller", trigger: "clear the ball from your box", boosts: "Heading, Jumping, Reactions" } },
  marauder: { signatures: ["Quick Step", "Whipped Pass"], perk45: { name: "Tackle and Run", trigger: "win a standing tackle on your defensive wing", boosts: "Acceleration, Agility, Sprint Speed" } },
  disruptor: { signatures: ["Jockey", "Relentless"], perk45: { name: "Presser", trigger: "win the ball in your half", boosts: "Short Passing, Vision, Balance" } },
  recycler: { signatures: ["Intercept", "Press Proven"], perk45: { name: "Physical Passer", trigger: "shield the ball in your half", boosts: "Balance, Short Passing, Aggression" } },
  maestro: { signatures: ["Pinged Pass", "Long Ball Pass"], perk45: { name: "Eagle Eyes", trigger: "receive a pass in your half", boosts: "Long Passing, Vision, Ball Control" } },
  creator: { signatures: ["Incisive Pass", "Inventive"], perk45: { name: "Bullseye Passer", trigger: "precise passes in the middle third", boosts: "Curve, Long Passing, Short Passing" } },
  spark: { signatures: ["Trickster", "Rapid"], perk45: { name: "Cut Back Specialist", trigger: "pass after entering the box from the wing", boosts: "Short Passing, Crossing, Vision" } },
  magician: { signatures: ["Technical", "Finesse Shot"], perk45: { name: "Ankle Breaker", trigger: "fake a shot to beat a man in the final third", boosts: "Balance, Ball Control, Dribbling" } },
  finisher: { signatures: ["Low Driven Shot", "First Touch"], perk45: { name: "1v1 Master", trigger: "go one on one with the keeper", boosts: "Ball Control, Agility, Balance" } },
  target: { signatures: ["Precision Header", "Enforcer"], perk45: { name: "Physical Shooter", trigger: "shield off a defender then shoot in the box", boosts: "Strength, Shot Power, Balance" } }
};
var spec = (archetype, name, plus, a, b, c, unconfirmed) => ({
  key: `${archetype}.${name.toLowerCase().replace(/[^a-z0-9]+/g, "")}`,
  archetype,
  name,
  plus,
  req: [[a, 92], [b, 90], ...c ? [[c, 90]] : []],
  ...unconfirmed ? { unconfirmed } : {}
});
var SPECIALIZATIONS = [
  spec("shotstopper", "Shot Stopper+", "Cross Claimer", "gkHandling", "jumping", "gkPositioning"),
  spec("shotstopper", "Octopus", "Deflector", "gkDiving", "strength", "gkPositioning"),
  spec("shotstopper", "Spider", "1v1 Close Down", "gkReflexes", "acceleration", "agility"),
  spec("sweeperkeeper", "Sweeper Keeper+", "Far Throw", "gkDiving", "vision", "gkKicking"),
  spec("sweeperkeeper", "Launcher", "Long Ball Pass", "gkKicking", "longPassing", "gkReflexes"),
  spec("sweeperkeeper", "Extra", "Press Proven", "gkPositioning", "shortPassing", "composure"),
  spec("progressor", "Progressor+", "Jockey", "standingTackle", "longPassing", "defAware"),
  spec("progressor", "Pioneer", "Pinged Pass", "dribbling", "shortPassing", "longPassing"),
  spec("progressor", "Janitor", "Quick Step", "acceleration", "sprintSpeed", "slidingTackle"),
  spec("boss", "Boss+", "Slide Tackle", "slidingTackle", "strength", "aggression"),
  spec("boss", "Capitano", "Block", "defAware", "agility", "reactions"),
  spec("boss", "Enforcer", "Press Proven", "composure", "vision", "ballControl"),
  spec("marauder", "Marauder+", "Slide Tackle", "sprintSpeed", "slidingTackle", "aggression"),
  spec("marauder", "Athlete", "Bruiser", "strength", "defAware", "aggression"),
  spec("marauder", "Speedster", "Rapid", "sprintSpeed", "acceleration", "dribbling"),
  spec("disruptor", "Disruptor+", "Intercept", "interceptions", "balance", "reactions"),
  spec("disruptor", "Destroyer", "Slide Tackle", "strength", "sprintSpeed", "slidingTackle"),
  spec("disruptor", "Anchor", "Bruiser", "shortPassing", "ballControl", "dribbling"),
  spec("recycler", "Recycler+", "Pinged Pass", "shortPassing", "longPassing", "strength"),
  spec("recycler", "Thief", "Anticipate", "standingTackle", "interceptions", "defAware"),
  spec("recycler", "Driver", "Enforcer", "balance", "sprintSpeed", "strength"),
  spec("maestro", "Heartbeat", "Relentless", "agility", "stamina", "aggression"),
  spec("maestro", "Crasher", "First Touch", "composure", "ballControl", "finishing"),
  spec("maestro", "Maestro+", "Technical", "vision", "balance", "dribbling"),
  spec("creator", "Creator+", "Whipped Pass", "vision", "crossing", "longPassing"),
  spec("creator", "Architect", "Dead Ball", "crossing", "shotPower", "fkAccuracy"),
  spec("creator", "Sniper", "Power Shot", "shotPower", "finishing", "longShots"),
  spec("spark", "Joker", "Whipped Pass", "crossing", "longPassing", null, "third attribute not confirmed"),
  spec("spark", "Spark+", "Quick Step", "agility", "acceleration", "sprintSpeed"),
  spec("spark", "Ace", "Chip Shot", "finishing", "reactions", "ballControl"),
  spec("magician", "Invader", "Incisive Pass", "longPassing", "vision", null, "third attribute not confirmed"),
  spec("magician", "Magician+", "First Touch", "ballControl", "acceleration", "composure"),
  spec("magician", "Hotshot", "Power Shot", "shotPower", "finishing", "longShots"),
  spec("finisher", "Finisher+", "Chip Shot", "composure", "reactions", "ballControl"),
  spec("finisher", "Hunter", "Gamechanger", "curve", "finishing", "balance", "Balance target reported by players"),
  spec("finisher", "Presser", "Relentless", "stamina", "agility", "aggression"),
  spec("target", "Target+", "Acrobatic", "jumping", "agility", "volleys"),
  spec("target", "Runner", "Enforcer", "sprintSpeed", "strength", "aggression", "Aggression target reported by players"),
  spec("target", "Roamer", "Incisive Pass", "shortPassing", "vision", "longPassing")
];

// src/lib/proBuild.ts
var ARCHETYPES = [
  { key: "shotstopper", name: "Shot Stopper", line: "GK", blurb: "Reflexes and positioning on the line.", focus: ["goalkeeping"] },
  { key: "sweeperkeeper", name: "Sweeper Keeper", line: "GK", blurb: "Comes off the line and plays out from the back.", focus: ["goalkeeping", "passing"] },
  { key: "progressor", name: "Progressor", line: "DEF", blurb: "A defender who moves the ball forward.", focus: ["defending", "passing"] },
  { key: "boss", name: "Boss", line: "DEF", blurb: "Strong, aerial, wins duels.", focus: ["defending", "physical"] },
  { key: "marauder", name: "Marauder", line: "DEF", blurb: "Gets up and down the flank.", focus: ["pace", "defending"] },
  { key: "disruptor", name: "Disruptor", line: "MID", blurb: "Breaks up play in midfield.", focus: ["defending", "physical"] },
  { key: "recycler", name: "Recycler", line: "MID", blurb: "Keeps the ball moving and the shape tidy.", focus: ["passing", "defending"] },
  { key: "maestro", name: "Maestro", line: "MID", blurb: "Controls tempo with range of passing.", focus: ["passing", "dribbling"] },
  { key: "creator", name: "Creator", line: "MID", blurb: "Unlocks defences in the final third.", focus: ["passing", "dribbling"] },
  { key: "spark", name: "Spark", line: "FWD", blurb: "Pace and tricks out wide.", focus: ["pace", "dribbling"] },
  { key: "magician", name: "Magician", line: "FWD", blurb: "Close control and invention.", focus: ["dribbling", "shooting"] },
  { key: "finisher", name: "Finisher", line: "FWD", blurb: "Lives in the box and scores.", focus: ["shooting", "pace"] },
  { key: "target", name: "Target", line: "FWD", blurb: "Holds it up and wins headers.", focus: ["physical", "shooting"] }
];
var ATTR_GROUPS = [
  { key: "pace", label: "Pace" },
  { key: "shooting", label: "Shooting" },
  { key: "passing", label: "Passing" },
  { key: "dribbling", label: "Dribbling" },
  { key: "defending", label: "Defending" },
  { key: "physical", label: "Physical" },
  { key: "goalkeeping", label: "Goalkeeping" }
];
var ATTRIBUTES = [
  { key: "acceleration", label: "Acceleration", group: "pace" },
  { key: "sprintSpeed", label: "Sprint Speed", group: "pace" },
  { key: "positioning", label: "Att. Positioning", group: "shooting", aliases: ["attPosition", "attackPositioning", "attPositioning"] },
  { key: "finishing", label: "Finishing", group: "shooting" },
  { key: "shotPower", label: "Shot Power", group: "shooting" },
  { key: "longShots", label: "Long Shots", group: "shooting" },
  { key: "volleys", label: "Volleys", group: "shooting" },
  { key: "penalties", label: "Penalties", group: "shooting" },
  { key: "vision", label: "Vision", group: "passing" },
  { key: "crossing", label: "Crossing", group: "passing" },
  { key: "fkAccuracy", label: "FK Accuracy", group: "passing", aliases: ["freeKick", "freeKickAccuracy", "fkAcc"] },
  { key: "shortPassing", label: "Short Passing", group: "passing" },
  { key: "longPassing", label: "Long Passing", group: "passing" },
  { key: "curve", label: "Curve", group: "passing" },
  { key: "agility", label: "Agility", group: "dribbling" },
  { key: "balance", label: "Balance", group: "dribbling" },
  { key: "reactions", label: "Reactions", group: "dribbling" },
  { key: "ballControl", label: "Ball Control", group: "dribbling" },
  { key: "dribbling", label: "Dribbling", group: "dribbling" },
  { key: "composure", label: "Composure", group: "dribbling" },
  { key: "interceptions", label: "Interceptions", group: "defending" },
  { key: "headingAccuracy", label: "Heading Acc.", group: "defending", aliases: ["heading", "headingAcc"] },
  { key: "defAware", label: "Def. Awareness", group: "defending", aliases: ["defensiveAwareness", "defAwareness", "marking"] },
  { key: "standingTackle", label: "Standing Tackle", group: "defending" },
  { key: "slidingTackle", label: "Sliding Tackle", group: "defending" },
  { key: "jumping", label: "Jumping", group: "physical" },
  { key: "stamina", label: "Stamina", group: "physical" },
  { key: "strength", label: "Strength", group: "physical" },
  { key: "aggression", label: "Aggression", group: "physical" },
  { key: "gkDiving", label: "GK Diving", group: "goalkeeping", aliases: ["diving"] },
  { key: "gkHandling", label: "GK Handling", group: "goalkeeping", aliases: ["handling"] },
  { key: "gkKicking", label: "GK Kicking", group: "goalkeeping", aliases: ["kicking"] },
  { key: "gkPositioning", label: "GK Positioning", group: "goalkeeping", aliases: ["gkPosition"] },
  { key: "gkReflexes", label: "GK Reflexes", group: "goalkeeping", aliases: ["reflexes"] }
];
var ATTR_BY_ANY = /* @__PURE__ */ new Map();
for (const a of ATTRIBUTES) for (const k of [a.key, ...a.aliases ?? []]) ATTR_BY_ANY.set(k.toLowerCase(), a);
var KEY_INDEX = new Map(ATTRIBUTE_KEYS.map((k, i) => [k, i]));
var PLAYSTYLES = PLAYSTYLE_DEFS.map(({ name, group }) => ({ name, group }));
var STYLE_GROUPS = [
  { key: "shooting", label: "Shooting" },
  { key: "passing", label: "Passing" },
  { key: "ballControl", label: "Ball control" },
  { key: "defending", label: "Defending" },
  { key: "physical", label: "Physical" },
  { key: "goalkeeping", label: "Goalkeeping" }
];
var MAX_PLAYSTYLES = PLAYSTYLE_SLOT_LEVELS.length;
var STYLE_ALIASES = { "Game Changer": "Gamechanger", "Game changer": "Gamechanger", "1v1 Close down": "1v1 Close Down" };
var canonStyle = (name) => STYLE_ALIASES[name] ?? name;
var LEVEL_MAX = LEVEL_CAP;
var HEIGHT_RANGE = [162, 200];
var WEIGHT_RANGE = [60, 100];
var POINTS_MAX_PER_ATTR = 59;
var BOOST_MAX = 10;
var archOf = (key) => ARCHETYPES.find((a) => a.key === key) ?? ARCHETYPES[ARCHETYPES.length - 2];
var isKeeper = (archetype) => archOf(archetype).line === "GK";
var emptyBuild = (archetype = "finisher") => ({
  name: "",
  archetype,
  level: 1,
  heightCm: BODY[archetype]?.startH ?? 180,
  weightKg: BODY[archetype]?.startW ?? 75,
  skillMoves: 3,
  weakFoot: 3,
  points: {},
  playstyles: [],
  specialization: null,
  budget: null,
  masteryLevels: {},
  boosts: {}
});
var clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
var int = (v, lo, hi, fallback) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? clamp(n, lo, hi) : fallback;
};
var startValue = (archetype, key) => START_VALUES[archetype]?.[KEY_INDEX.get(key) ?? -1] ?? 0;
var trainable = (archetype, key) => startValue(archetype, key) > 0;
var attrCap = (archetype, key) => trainable(archetype, key) ? CAPS[archetype]?.[key] ?? 99 : 0;
var capConfirmed = (archetype, key) => CAPS[archetype]?.[key] !== void 0;
var costTier = (archetype, key) => COST_TIERS[archetype]?.[KEY_INDEX.get(key) ?? -1] ?? 0;
function pointCost(archetype, key, value) {
  const tier = costTier(archetype, key);
  if (!tier) return Infinity;
  const band = COST_BANDS.find((b) => value <= b[0]) ?? COST_BANDS[COST_BANDS.length - 1];
  return band[tier];
}
function costBetween(archetype, key, from, to) {
  let t = 0;
  for (let v = from + 1; v <= to; v++) t += pointCost(archetype, key, v);
  return t;
}
var trainedValue = (b, key) => trainable(b.archetype, key) ? startValue(b.archetype, key) + (b.points[key] ?? 0) : 0;
function masteryLevelOf(b, archetype) {
  const own = archetype === b.archetype ? b.level : 0;
  return Math.max(own, b.masteryLevels?.[archetype] ?? 0);
}
function masteryBonus(b, key) {
  let n = 0;
  for (const [arch, pair] of Object.entries(MASTERIES)) {
    const level = masteryLevelOf(b, arch);
    if (level < 10) continue;
    const [first, second] = pair;
    if (key === first) n += 1 + (level >= 55 ? 1 : 0);
    if (key === second) n += 1 + (level >= 30 ? 1 : 0);
  }
  return n;
}
var menuValue = (b, key) => trainable(b.archetype, key) ? Math.min(99, trainedValue(b, key) + masteryBonus(b, key)) : 0;
var steps = (diff, per) => Math.sign(diff) * Math.ceil(Math.abs(diff) / per);
function bodyEffects(b) {
  const body = BODY[b.archetype];
  const fx = isKeeper(b.archetype) ? BODY_EFFECTS.keeper : BODY_EFFECTS.outfield;
  const out = {};
  const add = (keys, n) => keys.forEach((k) => out[k] = (out[k] ?? 0) + n);
  if (!body) return out;
  const h = steps(b.heightCm - body.startH, 4);
  const w = steps(b.weightKg - body.startW, 8);
  add(fx.taller.up, h);
  add(fx.taller.down, -h);
  add(fx.heavier.up, w);
  add(fx.heavier.down, -w);
  for (const k of Object.keys(out)) if (!out[k] || !trainable(b.archetype, k)) delete out[k];
  return out;
}
var matchValue = (b, key, fx = bodyEffects(b)) => trainable(b.archetype, key) ? clamp(menuValue(b, key) + (fx[key] ?? 0) + (b.boosts?.[key] ?? 0), 1, 99) : 0;
function accelerate(b, fx = bodyEffects(b)) {
  const acc = matchValue(b, "acceleration", fx), agi = matchValue(b, "agility", fx), str = matchValue(b, "strength", fx);
  const E = ACCELERATE.explosive, L = ACCELERATE.lengthy;
  const explosive = [
    { label: "Height", ok: b.heightCm <= E.maxHeight, have: b.heightCm, need: `${E.maxHeight} cm or less` },
    { label: "Agility", ok: agi >= E.agility, have: agi, need: `${E.agility}+` },
    { label: "Agility over Strength", ok: agi - str >= E.agilityOverStrength, have: agi - str, need: `+${E.agilityOverStrength}` },
    { label: "Acceleration", ok: acc >= E.acceleration, have: acc, need: `${E.acceleration}+` }
  ];
  const lengthy = [
    { label: "Height", ok: b.heightCm >= L.minHeight, have: b.heightCm, need: `${L.minHeight} cm or more` },
    { label: "Strength", ok: str >= L.strength, have: str, need: `${L.strength}+` },
    { label: "Strength over Agility", ok: str - agi >= L.strengthOverAgility, have: str - agi, need: `+${L.strengthOverAgility}` },
    { label: "Acceleration", ok: acc >= L.acceleration, have: acc, need: `${L.acceleration}+` }
  ];
  const type = explosive.every((c) => c.ok) ? "Explosive" : lengthy.every((c) => c.ok) ? "Lengthy" : "Controlled";
  return { type, explosive, lengthy };
}
var accelerateType = (b) => accelerate(b).type;
function formatHeight(cm, units = "imperial") {
  if (units === "metric") return `${cm} cm`;
  const inches = Math.round(cm / 2.54);
  return `${Math.floor(inches / 12)}'${inches % 12}"`;
}
var formatWeight = (kg, units = "imperial") => units === "metric" ? `${kg} kg` : `${Math.round(kg * 2.20462)} lb`;
var apAtLevel = (level) => AP_BY_LEVEL[clamp(Math.round(level), 1, LEVEL_CAP)];
function apSpent(b) {
  let t = 0;
  for (const [k, p] of Object.entries(b.points)) if (p > 0) t += costBetween(b.archetype, k, startValue(b.archetype, k), startValue(b.archetype, k) + p);
  return t;
}
function levelNeeded(spent) {
  const lvl = AP_BY_LEVEL.findIndex((ap, i) => i >= 1 && ap >= spent);
  return lvl === -1 ? null : lvl;
}
function raisePlan(b, req) {
  const missing = [];
  let ap = 0;
  for (const [k, need] of req) {
    const have = menuValue(b, k);
    if (have >= need) continue;
    missing.push({ key: k, need, have });
    if (!trainable(b.archetype, k) || need - masteryBonus(b, k) > attrCap(b.archetype, k)) {
      ap = NaN;
      continue;
    }
    const from = trainedValue(b, k);
    ap += costBetween(b.archetype, k, from, need - masteryBonus(b, k));
  }
  return { missing, ap: Number.isNaN(ap) ? null : ap };
}
function raiseFor(b, req) {
  const points = { ...b.points };
  for (const [k, need] of req) {
    if (!trainable(b.archetype, k)) continue;
    const target = Math.min(attrCap(b.archetype, k), need - masteryBonus(b, k));
    points[k] = Math.max(points[k] ?? 0, target - startValue(b.archetype, k));
  }
  return normaliseBuild({ ...b, points });
}
function playstyleStatus(b) {
  const keeper = isKeeper(b.archetype);
  const sigs = ARCHETYPE_RULES[b.archetype]?.signatures ?? ["", ""];
  return PLAYSTYLE_DEFS.map((def) => {
    const sig = sigs[0] === def.name ? 1 : sigs[1] === def.name ? 2 : 0;
    const available = !def.keeperOnly || keeper;
    const { missing, ap } = raisePlan(b, Object.entries(def.req));
    return {
      def,
      available,
      unlocked: available && (sig > 0 || missing.length === 0),
      missing: sig ? [] : missing,
      apToUnlock: sig ? 0 : available ? ap : null,
      signature: sig,
      plus: sig > 0 && b.level >= SIGNATURE_PLUS_LEVELS[sig - 1]
    };
  });
}
var playstyleSlots = (level) => PLAYSTYLE_SLOT_LEVELS.filter((l) => level >= l).length;
var nextSlotLevel = (level) => PLAYSTYLE_SLOT_LEVELS.find((l) => level < l) ?? null;
function specializationStatus(b) {
  return SPECIALIZATIONS.filter((s) => s.archetype === b.archetype).map((spec2) => {
    const { missing, ap } = raisePlan(b, spec2.req);
    return { spec: spec2, met: missing.length === 0, missing, apToReach: ap };
  });
}
function normaliseBuild(b) {
  const archetype = ARCHETYPES.some((a) => a.key === b.archetype) ? b.archetype : "finisher";
  const base = emptyBuild(archetype);
  const body = BODY[archetype];
  const points = {};
  for (const [k, v] of Object.entries(b.points ?? {})) {
    const a = ATTR_BY_ANY.get(k.toLowerCase());
    if (!a || !trainable(archetype, a.key)) continue;
    const n = int(v, 0, attrCap(archetype, a.key) - startValue(archetype, a.key), 0);
    if (n) points[a.key] = n;
  }
  const known = new Set(PLAYSTYLE_DEFS.filter((p) => !p.keeperOnly || isKeeper(archetype)).map((p) => p.name));
  const sigs = new Set(ARCHETYPE_RULES[archetype]?.signatures ?? []);
  const spec2 = SPECIALIZATIONS.find((s) => s.key === b.specialization && s.archetype === archetype);
  return {
    name: String(b.name ?? "").replace(/[|~\n\r]/g, " ").trim().slice(0, 40),
    archetype,
    level: int(b.level, 1, LEVEL_CAP, 1),
    heightCm: int(b.heightCm, body.h[0], body.h[1], base.heightCm),
    weightKg: int(b.weightKg, body.w[0], body.w[1], base.weightKg),
    skillMoves: int(b.skillMoves, 1, 5, 3),
    weakFoot: int(b.weakFoot, 1, 5, 3),
    points,
    playstyles: [...new Set((b.playstyles ?? []).map(canonStyle).filter((p) => known.has(p) && !sigs.has(p)))].slice(0, MAX_PLAYSTYLES),
    specialization: spec2 ? spec2.key : null,
    budget: null,
    masteryLevels: Object.fromEntries(
      Object.entries(b.masteryLevels ?? {}).filter(([k]) => ARCHETYPES.some((a) => a.key === k)).map(([k, v]) => [k, int(v, 0, LEVEL_CAP, 0)]).filter(([, v]) => v)
    ),
    boosts: Object.fromEntries(
      Object.entries(b.boosts ?? {}).map(([k, v]) => [ATTR_BY_ANY.get(k.toLowerCase())?.key, int(v, 0, BOOST_MAX, 0)]).filter(([k, v]) => k && v && trainable(archetype, k))
    )
  };
}
function cleanProfile(p) {
  return {
    masteryLevels: Object.fromEntries(
      Object.entries(p?.masteryLevels ?? {}).filter(([k]) => ARCHETYPES.some((a) => a.key === k)).map(([k, v]) => [k, int(v, 0, LEVEL_CAP, 0)]).filter(([, v]) => v)
    ),
    boosts: Object.fromEntries(
      Object.entries(p?.boosts ?? {}).map(([k, v]) => [ATTR_BY_ANY.get(k.toLowerCase())?.key, int(v, 0, BOOST_MAX, 0)]).filter(([k, v]) => k && v)
    )
  };
}
function applyProfile(b, profile, savedLevels = {}) {
  const p = cleanProfile(profile);
  const levels = { ...p.masteryLevels };
  for (const [k, v] of Object.entries(savedLevels)) levels[k] = Math.max(levels[k] ?? 0, Number(v) || 0);
  return normaliseBuild({ ...b, masteryLevels: levels, boosts: p.boosts });
}
var pointsSpent = (b) => Object.values(b.points).reduce((t, v) => t + v, 0);
function groupTotals(b) {
  const out = Object.fromEntries(ATTR_GROUPS.map((g) => [g.key, 0]));
  for (const a of ATTRIBUTES) out[a.group] += b.points[a.key] || 0;
  return out;
}
function groupAverages(b) {
  const fx = bodyEffects(b);
  const out = {};
  for (const g of ATTR_GROUPS) {
    const vals = ATTRIBUTES.filter((a) => a.group === g.key && trainable(b.archetype, a.key)).map((a) => matchValue(b, a.key, fx));
    out[g.key] = vals.length ? vals.reduce((t, v) => t + v, 0) / vals.length : 0;
  }
  return out;
}
function buildSummary(b) {
  const spent = apSpent(b);
  const available = apAtLevel(b.level);
  const byGroup = Object.fromEntries(ATTR_GROUPS.map((g) => [g.key, 0]));
  for (const a of ATTRIBUTES) {
    const p = b.points[a.key];
    if (p) byGroup[a.group] += costBetween(b.archetype, a.key, startValue(b.archetype, a.key), startValue(b.archetype, a.key) + p);
  }
  const focus = ATTR_GROUPS.map((g) => ({ group: g.key, label: g.label, share: spent ? byGroup[g.key] / spent : 0 })).filter((f) => f.share > 0).sort((x, y) => y.share - x.share);
  const notes = [];
  const need = levelNeeded(spent);
  if (spent > available) notes.push(need ? `${spent - available} AP over what level ${b.level} gives you: this build needs level ${need}.` : `${spent - available} AP over: more than even level ${LEVEL_CAP} gives (${apAtLevel(LEVEL_CAP)} AP).`);
  const slots = playstyleSlots(b.level);
  if (b.playstyles.length > slots) notes.push(`Level ${b.level} has ${slots} PlayStyle slot${slots === 1 ? "" : "s"}; ${b.playstyles.length} are picked.`);
  const status = new Map(playstyleStatus(b).map((s) => [s.def.name, s]));
  const locked = b.playstyles.filter((p) => !status.get(p)?.unlocked);
  if (locked.length) notes.push(`Not unlocked yet: ${locked.join(", ")}.`);
  const spec2 = specializationStatus(b).find((s) => s.spec.key === b.specialization);
  if (spec2 && !spec2.met) notes.push(`${spec2.spec.name} isn't reached yet.`);
  return { spent, available, remaining: available - spent, levelNeeded: need, slots, focus, notes };
}
var LEGACY_STYLES = [
  "Finesse Shot",
  "Chip Shot",
  "Power Shot",
  "Dead Ball",
  "Precision Header",
  "Acrobatic",
  "Low Driven Shot",
  "Power Header",
  "Game Changer",
  "Incisive Pass",
  "Pinged Pass",
  "Long Ball Pass",
  "Tiki Taka",
  "Whipped Pass",
  "Inventive",
  "Technical",
  "Rapid",
  "First Touch",
  "Trickster",
  "Press Proven",
  "Flair",
  "Jockey",
  "Block",
  "Intercept",
  "Anticipate",
  "Slide Tackle",
  "Aerial Fortress",
  "Quick Step",
  "Relentless",
  "Long Throw",
  "Bruiser",
  "Enforcer",
  "Far Throw",
  "Footwork",
  "Cross Claimer",
  "Rush Out",
  "Far Reach",
  "Deflector"
];
var b64urlEncode = (s) => {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
var b64Decode = (s) => {
  const norm = s.trim().replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(norm + "=".repeat((4 - norm.length % 4) % 4));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
};
function encodeBuild(input) {
  const b = normaliseBuild(input);
  const attrs = ATTRIBUTES.map((a, i) => b.points[a.key] ? `${i}.${b.points[a.key]}` : "").filter(Boolean).join(",");
  const styles = b.playstyles.map((p) => PLAYSTYLE_DEFS.findIndex((s) => s.name === p)).filter((i) => i >= 0).join(",");
  const spec2 = b.specialization ? SPECIALIZATIONS.findIndex((s) => s.key === b.specialization) : -1;
  const mast = ARCHETYPES.map((a, i) => b.masteryLevels[a.key] ? `${i}.${b.masteryLevels[a.key]}` : "").filter(Boolean).join(",");
  const boosts = ATTRIBUTES.map((a, i) => b.boosts[a.key] ? `${i}.${b.boosts[a.key]}` : "").filter(Boolean).join(",");
  const v3 = mast || boosts;
  return b64urlEncode([v3 ? "gb3" : "gb2", b.archetype, b.level, b.heightCm, b.weightKg, b.skillMoves, b.weakFoot, attrs, styles, spec2 >= 0 ? spec2 : "", ...v3 ? [mast, boosts] : [], b.name].join("~"));
}
function decodeBuild(code) {
  try {
    const parts = b64Decode(code).split("~");
    const ver = parts[0];
    if (!["gb1", "gb2", "gb3"].includes(ver) || parts.length < (ver === "gb3" ? 13 : 11)) return null;
    const v2 = ver !== "gb1";
    const [, archetype, level, h, w, sm, wf] = parts;
    const [attrs, styles, specIdx, ...rest] = v2 ? parts.slice(7) : [parts[8], parts[9], "", ...parts.slice(10)];
    const [mast, boostList, ...name] = ver === "gb3" ? rest : ["", "", ...rest];
    const pairs = (list2, keys) => {
      const out = {};
      for (const pair of list2 ? list2.split(",") : []) {
        const [k, v] = pair.split(".");
        const item = keys[Number(k)];
        if (item) out[item.key] = Number(v);
      }
      return out;
    };
    const points = pairs(attrs, ATTRIBUTES);
    const list = v2 ? PLAYSTYLE_DEFS.map((p) => p.name) : LEGACY_STYLES;
    return normaliseBuild({
      archetype,
      level: Number(level),
      heightCm: Number(h),
      weightKg: Number(w),
      skillMoves: Number(sm),
      weakFoot: Number(wf),
      points,
      playstyles: (styles ? styles.split(",") : []).map((i) => list[Number(i)]).filter(Boolean),
      specialization: specIdx !== "" && specIdx !== void 0 ? SPECIALIZATIONS[Number(specIdx)]?.key ?? null : null,
      masteryLevels: pairs(mast, ARCHETYPES),
      boosts: pairs(boostList, ATTRIBUTES),
      name: name.join("~")
    });
  } catch {
    return null;
  }
}
var buildPath = (b) => `/build?b=${encodeBuild(b)}`;
function importProClubsBuilder(linkOrCode) {
  let code = linkOrCode.trim().replace(/[?#].*$/, "");
  const at = code.lastIndexOf("/b/");
  if (at >= 0) code = code.slice(at + 3);
  code = code.replace(/\/+$/, "");
  if (!/^[A-Za-z0-9_\-+/=]{8,}$/.test(code)) return null;
  let text;
  try {
    text = b64Decode(code);
  } catch {
    return null;
  }
  const f = text.split("|");
  if (f.length < 8 || !/^\d+$/.test(f[0])) return null;
  const arch = ARCHETYPES[Number(f[1]) - 1];
  if (!arch) return null;
  const points = {};
  const skipped = [];
  for (const pair of f[7] ? f[7].split(",") : []) {
    const [k, v] = pair.split(":");
    const a = ATTR_BY_ANY.get(String(k).toLowerCase());
    if (a) points[a.key] = Number(v);
    else if (k) skipped.push(k);
  }
  const name = f.slice(8).filter(Boolean).pop() ?? "";
  return {
    build: normaliseBuild({ archetype: arch.key, level: Number(f[2]), heightCm: Number(f[3]), weightKg: Number(f[4]), skillMoves: Number(f[5]), weakFoot: Number(f[6]), points, name }),
    skipped
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  AP_BY_LEVEL,
  ARCHETYPES,
  ARCHETYPE_RULES,
  ATTRIBUTES,
  ATTR_GROUPS,
  BODY,
  BOOST_MAX,
  HEIGHT_RANGE,
  LEVEL_CAP,
  LEVEL_MAX,
  MAX_PLAYSTYLES,
  PLAYSTYLES,
  PLAYSTYLE_DEFS,
  PLAYSTYLE_SLOT_LEVELS,
  POINTS_MAX_PER_ATTR,
  SPECIALIZATIONS,
  STYLE_GROUPS,
  WEIGHT_RANGE,
  accelerate,
  accelerateType,
  apAtLevel,
  apSpent,
  applyProfile,
  attrCap,
  bodyEffects,
  buildPath,
  buildSummary,
  canonStyle,
  capConfirmed,
  cleanProfile,
  costBetween,
  costTier,
  decodeBuild,
  emptyBuild,
  encodeBuild,
  formatHeight,
  formatWeight,
  groupAverages,
  groupTotals,
  importProClubsBuilder,
  isKeeper,
  levelNeeded,
  masteryBonus,
  masteryLevelOf,
  matchValue,
  menuValue,
  nextSlotLevel,
  normaliseBuild,
  playstyleSlots,
  playstyleStatus,
  pointCost,
  pointsSpent,
  raiseFor,
  specializationStatus,
  startValue,
  trainable,
  trainedValue
});
