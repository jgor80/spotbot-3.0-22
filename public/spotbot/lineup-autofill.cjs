// Generated from src/lib/botLineup.ts by npm run build:bot-lineup. Do not edit by hand.
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

// src/lib/botLineup.ts
var botLineup_exports = {};
__export(botLineup_exports, {
  BENCH_SLOT_OFFSET: () => BENCH_SLOT_OFFSET,
  FORMATION_COORDS: () => FORMATION_COORDS,
  FORMATION_SLOTS: () => FORMATION_SLOTS,
  MAX_BENCH: () => MAX_BENCH,
  autofillLineup: () => autofillLineup,
  boardFromNames: () => boardFromNames,
  boardToSlots: () => boardToSlots,
  getPositionRatingCategory: () => getPositionRatingCategory,
  locate: () => locate,
  movePlayer: () => movePlayer,
  resizeBoard: () => resizeBoard,
  slotsToBoard: () => slotsToBoard
});
module.exports = __toCommonJS(botLineup_exports);

// src/lib/formations.ts
var FORMATIONS = {
  "4-5-1 ATTACK": [
    { position: "GK", x: 50, y: 90 },
    { position: "LB", x: 15, y: 70 },
    { position: "CB", x: 35, y: 75 },
    { position: "CB", x: 65, y: 75 },
    { position: "RB", x: 85, y: 70 },
    { position: "LM", x: 10, y: 45 },
    { position: "CM", x: 30, y: 50 },
    { position: "CAM", x: 50, y: 35 },
    { position: "CAM", x: 70, y: 35 },
    { position: "RM", x: 90, y: 45 },
    { position: "ST", x: 50, y: 15 }
  ],
  "4-3-2-1": [
    { position: "GK", x: 50, y: 90 },
    { position: "LB", x: 15, y: 70 },
    { position: "CB", x: 35, y: 75 },
    { position: "CB", x: 65, y: 75 },
    { position: "RB", x: 85, y: 70 },
    { position: "CM", x: 25, y: 50 },
    { position: "CM", x: 50, y: 50 },
    { position: "CM", x: 75, y: 50 },
    { position: "CAM", x: 35, y: 30 },
    { position: "CAM", x: 65, y: 30 },
    { position: "ST", x: 50, y: 15 }
  ],
  "4-3-1-2": [
    { position: "GK", x: 50, y: 90 },
    { position: "LB", x: 15, y: 70 },
    { position: "CB", x: 35, y: 75 },
    { position: "CB", x: 65, y: 75 },
    { position: "RB", x: 85, y: 70 },
    { position: "CM", x: 25, y: 50 },
    { position: "CM", x: 50, y: 55 },
    { position: "CM", x: 75, y: 50 },
    { position: "CAM", x: 50, y: 35 },
    { position: "ST", x: 35, y: 15 },
    { position: "ST", x: 65, y: 15 }
  ],
  "4-3-3 FLAT": [
    { position: "GK", x: 50, y: 90 },
    { position: "LB", x: 15, y: 70 },
    { position: "CB", x: 35, y: 75 },
    { position: "CB", x: 65, y: 75 },
    { position: "RB", x: 85, y: 70 },
    { position: "CM", x: 25, y: 48 },
    { position: "CM", x: 50, y: 50 },
    { position: "CM", x: 75, y: 48 },
    { position: "LW", x: 15, y: 22 },
    { position: "ST", x: 50, y: 15 },
    { position: "RW", x: 85, y: 22 }
  ],
  "4-4-2 FLAT": [
    { position: "GK", x: 50, y: 90 },
    { position: "LB", x: 15, y: 70 },
    { position: "CB", x: 35, y: 75 },
    { position: "CB", x: 65, y: 75 },
    { position: "RB", x: 85, y: 70 },
    { position: "LM", x: 15, y: 45 },
    { position: "CM", x: 35, y: 50 },
    { position: "CM", x: 65, y: 50 },
    { position: "RM", x: 85, y: 45 },
    { position: "ST", x: 35, y: 18 },
    { position: "ST", x: 65, y: 18 }
  ],
  "3-5-2": [
    { position: "GK", x: 50, y: 90 },
    { position: "CB", x: 25, y: 75 },
    { position: "CB", x: 50, y: 78 },
    { position: "CB", x: 75, y: 75 },
    { position: "CDM", x: 35, y: 55 },
    { position: "CDM", x: 65, y: 55 },
    { position: "CAM", x: 50, y: 35 },
    { position: "LM", x: 10, y: 45 },
    { position: "RM", x: 90, y: 45 },
    { position: "ST", x: 35, y: 15 },
    { position: "ST", x: 65, y: 15 }
  ],
  "3-1-4-2": [
    { position: "GK", x: 50, y: 90 },
    { position: "CB", x: 25, y: 75 },
    { position: "CB", x: 50, y: 78 },
    { position: "CB", x: 75, y: 75 },
    { position: "CDM", x: 50, y: 60 },
    { position: "CM", x: 35, y: 45 },
    { position: "CM", x: 65, y: 45 },
    { position: "LM", x: 10, y: 40 },
    { position: "RM", x: 90, y: 40 },
    { position: "ST", x: 35, y: 15 },
    { position: "ST", x: 65, y: 15 }
  ],
  "3-4-2-1": [
    { position: "GK", x: 50, y: 90 },
    { position: "CB", x: 25, y: 75 },
    { position: "CB", x: 50, y: 78 },
    { position: "CB", x: 75, y: 75 },
    { position: "CM", x: 35, y: 50 },
    { position: "CM", x: 65, y: 50 },
    { position: "LM", x: 10, y: 45 },
    { position: "RM", x: 90, y: 45 },
    { position: "CAM", x: 35, y: 30 },
    { position: "CAM", x: 65, y: 30 },
    { position: "ST", x: 50, y: 15 }
  ],
  "3-4-1-2": [
    { position: "GK", x: 50, y: 90 },
    { position: "CB", x: 25, y: 75 },
    { position: "CB", x: 50, y: 78 },
    { position: "CB", x: 75, y: 75 },
    { position: "CM", x: 35, y: 50 },
    { position: "CM", x: 65, y: 50 },
    { position: "LM", x: 10, y: 45 },
    { position: "RM", x: 90, y: 45 },
    { position: "CAM", x: 50, y: 30 },
    { position: "ST", x: 35, y: 15 },
    { position: "ST", x: 65, y: 15 }
  ],
  "3-4-3 FLAT": [
    { position: "GK", x: 50, y: 90 },
    { position: "CB", x: 25, y: 75 },
    { position: "CB", x: 50, y: 78 },
    { position: "CB", x: 75, y: 75 },
    { position: "CM", x: 35, y: 50 },
    { position: "CM", x: 65, y: 50 },
    { position: "LM", x: 10, y: 45 },
    { position: "RM", x: 90, y: 45 },
    { position: "LW", x: 20, y: 20 },
    { position: "RW", x: 80, y: 20 },
    { position: "ST", x: 50, y: 15 }
  ],
  "4-2-2-2": [
    { position: "GK", x: 50, y: 90 },
    { position: "LB", x: 15, y: 70 },
    { position: "CB", x: 35, y: 75 },
    { position: "CB", x: 65, y: 75 },
    { position: "RB", x: 85, y: 70 },
    { position: "CDM", x: 35, y: 55 },
    { position: "CDM", x: 65, y: 55 },
    { position: "CAM", x: 30, y: 35 },
    { position: "CAM", x: 70, y: 35 },
    { position: "ST", x: 35, y: 15 },
    { position: "ST", x: 65, y: 15 }
  ],
  "4-5-1 FLAT": [
    { position: "GK", x: 50, y: 90 },
    { position: "LB", x: 15, y: 70 },
    { position: "CB", x: 35, y: 75 },
    { position: "CB", x: 65, y: 75 },
    { position: "RB", x: 85, y: 70 },
    { position: "LM", x: 10, y: 45 },
    { position: "CM", x: 30, y: 50 },
    { position: "CM", x: 50, y: 48 },
    { position: "CM", x: 70, y: 50 },
    { position: "RM", x: 90, y: 45 },
    { position: "ST", x: 50, y: 15 }
  ],
  "4-2-3-1 WIDE": [
    { position: "GK", x: 50, y: 90 },
    { position: "LB", x: 15, y: 70 },
    { position: "CB", x: 35, y: 75 },
    { position: "CB", x: 65, y: 75 },
    { position: "RB", x: 85, y: 70 },
    { position: "CDM", x: 35, y: 55 },
    { position: "CDM", x: 65, y: 55 },
    { position: "LM", x: 15, y: 35 },
    { position: "CAM", x: 50, y: 35 },
    { position: "RM", x: 85, y: 35 },
    { position: "ST", x: 50, y: 15 }
  ],
  "4-2-3-1 NARROW": [
    { position: "GK", x: 50, y: 90 },
    { position: "LB", x: 15, y: 70 },
    { position: "CB", x: 35, y: 75 },
    { position: "CB", x: 65, y: 75 },
    { position: "RB", x: 85, y: 70 },
    { position: "CDM", x: 35, y: 55 },
    { position: "CDM", x: 65, y: 55 },
    { position: "CAM", x: 25, y: 35 },
    { position: "CAM", x: 50, y: 32 },
    { position: "CAM", x: 75, y: 35 },
    { position: "ST", x: 50, y: 15 }
  ],
  "4-2-1-3": [
    { position: "GK", x: 50, y: 90 },
    { position: "LB", x: 15, y: 70 },
    { position: "CB", x: 35, y: 75 },
    { position: "CB", x: 65, y: 75 },
    { position: "RB", x: 85, y: 70 },
    { position: "CDM", x: 35, y: 55 },
    { position: "CDM", x: 65, y: 55 },
    { position: "CAM", x: 50, y: 38 },
    { position: "LW", x: 15, y: 22 },
    { position: "RW", x: 85, y: 22 },
    { position: "ST", x: 50, y: 15 }
  ],
  "4-2-4": [
    { position: "GK", x: 50, y: 90 },
    { position: "LB", x: 15, y: 70 },
    { position: "CB", x: 35, y: 75 },
    { position: "CB", x: 65, y: 75 },
    { position: "RB", x: 85, y: 70 },
    { position: "CM", x: 35, y: 50 },
    { position: "CM", x: 65, y: 50 },
    { position: "LW", x: 15, y: 22 },
    { position: "RW", x: 85, y: 22 },
    { position: "ST", x: 35, y: 15 },
    { position: "ST", x: 65, y: 15 }
  ],
  "4-1-2-1-2 WIDE": [
    { position: "GK", x: 50, y: 90 },
    { position: "LB", x: 15, y: 70 },
    { position: "CB", x: 35, y: 75 },
    { position: "CB", x: 65, y: 75 },
    { position: "RB", x: 85, y: 70 },
    { position: "CDM", x: 50, y: 58 },
    { position: "LM", x: 15, y: 42 },
    { position: "RM", x: 85, y: 42 },
    { position: "CAM", x: 50, y: 32 },
    { position: "ST", x: 35, y: 15 },
    { position: "ST", x: 65, y: 15 }
  ],
  "4-1-2-1-2 NARROW": [
    { position: "GK", x: 50, y: 90 },
    { position: "LB", x: 15, y: 70 },
    { position: "CB", x: 35, y: 75 },
    { position: "CB", x: 65, y: 75 },
    { position: "RB", x: 85, y: 70 },
    { position: "CDM", x: 50, y: 58 },
    { position: "CM", x: 30, y: 45 },
    { position: "CM", x: 70, y: 45 },
    { position: "CAM", x: 50, y: 32 },
    { position: "ST", x: 35, y: 15 },
    { position: "ST", x: 65, y: 15 }
  ],
  "4-4-1-1": [
    { position: "GK", x: 50, y: 90 },
    { position: "LB", x: 15, y: 70 },
    { position: "CB", x: 35, y: 75 },
    { position: "CB", x: 65, y: 75 },
    { position: "RB", x: 85, y: 70 },
    { position: "LM", x: 15, y: 45 },
    { position: "CM", x: 35, y: 50 },
    { position: "CM", x: 65, y: 50 },
    { position: "RM", x: 85, y: 45 },
    { position: "CF", x: 50, y: 28 },
    { position: "ST", x: 50, y: 15 }
  ],
  "4-4-2 HOLD": [
    { position: "GK", x: 50, y: 90 },
    { position: "LB", x: 15, y: 70 },
    { position: "CB", x: 35, y: 75 },
    { position: "CB", x: 65, y: 75 },
    { position: "RB", x: 85, y: 70 },
    { position: "LM", x: 15, y: 45 },
    { position: "CDM", x: 35, y: 55 },
    { position: "CDM", x: 65, y: 55 },
    { position: "RM", x: 85, y: 45 },
    { position: "ST", x: 35, y: 18 },
    { position: "ST", x: 65, y: 18 }
  ],
  "5-4-1 FLAT": [
    { position: "GK", x: 50, y: 90 },
    { position: "LWB", x: 10, y: 65 },
    { position: "CB", x: 30, y: 75 },
    { position: "CB", x: 50, y: 78 },
    { position: "CB", x: 70, y: 75 },
    { position: "RWB", x: 90, y: 65 },
    { position: "LM", x: 15, y: 45 },
    { position: "CM", x: 35, y: 48 },
    { position: "CM", x: 65, y: 48 },
    { position: "RM", x: 85, y: 45 },
    { position: "ST", x: 50, y: 15 }
  ],
  "5-3-2": [
    { position: "GK", x: 50, y: 90 },
    { position: "LWB", x: 10, y: 65 },
    { position: "CB", x: 30, y: 75 },
    { position: "CB", x: 50, y: 78 },
    { position: "CB", x: 70, y: 75 },
    { position: "RWB", x: 90, y: 65 },
    { position: "CM", x: 30, y: 48 },
    { position: "CM", x: 50, y: 45 },
    { position: "CM", x: 70, y: 48 },
    { position: "ST", x: 35, y: 18 },
    { position: "ST", x: 65, y: 18 }
  ],
  "5-2-1-2": [
    { position: "GK", x: 50, y: 90 },
    { position: "LWB", x: 10, y: 65 },
    { position: "CB", x: 30, y: 75 },
    { position: "CB", x: 50, y: 78 },
    { position: "CB", x: 70, y: 75 },
    { position: "RWB", x: 90, y: 65 },
    { position: "CDM", x: 35, y: 55 },
    { position: "CDM", x: 65, y: 55 },
    { position: "CAM", x: 50, y: 35 },
    { position: "ST", x: 35, y: 15 },
    { position: "ST", x: 65, y: 15 }
  ],
  "5-2-2-1": [
    { position: "GK", x: 50, y: 90 },
    { position: "LWB", x: 10, y: 65 },
    { position: "CB", x: 30, y: 75 },
    { position: "CB", x: 50, y: 78 },
    { position: "CB", x: 70, y: 75 },
    { position: "RWB", x: 90, y: 65 },
    { position: "CM", x: 35, y: 50 },
    { position: "CM", x: 65, y: 50 },
    { position: "CAM", x: 35, y: 32 },
    { position: "CAM", x: 65, y: 32 },
    { position: "ST", x: 50, y: 15 }
  ],
  "5-1-2-2": [
    { position: "GK", x: 50, y: 90 },
    { position: "LB", x: 10, y: 70 },
    { position: "CB", x: 30, y: 75 },
    { position: "CB", x: 50, y: 78 },
    { position: "CB", x: 70, y: 75 },
    { position: "RB", x: 90, y: 70 },
    { position: "CDM", x: 50, y: 58 },
    { position: "CM", x: 35, y: 42 },
    { position: "CM", x: 65, y: 42 },
    { position: "ST", x: 35, y: 18 },
    { position: "ST", x: 65, y: 18 }
  ],
  "4-1-4-1": [
    { position: "GK", x: 50, y: 90 },
    { position: "LB", x: 15, y: 70 },
    { position: "CB", x: 35, y: 75 },
    { position: "CB", x: 65, y: 75 },
    { position: "RB", x: 85, y: 70 },
    { position: "CDM", x: 50, y: 58 },
    { position: "LM", x: 15, y: 40 },
    { position: "CM", x: 35, y: 42 },
    { position: "CM", x: 65, y: 42 },
    { position: "RM", x: 85, y: 40 },
    { position: "ST", x: 50, y: 15 }
  ],
  "4-1-3-2": [
    { position: "GK", x: 50, y: 90 },
    { position: "LB", x: 15, y: 70 },
    { position: "CB", x: 35, y: 75 },
    { position: "CB", x: 65, y: 75 },
    { position: "RB", x: 85, y: 70 },
    { position: "CDM", x: 50, y: 58 },
    { position: "LM", x: 15, y: 40 },
    { position: "CM", x: 50, y: 42 },
    { position: "RM", x: 85, y: 40 },
    { position: "ST", x: 35, y: 18 },
    { position: "ST", x: 65, y: 18 }
  ],
  "4-3-3 ATTACK": [
    { position: "GK", x: 50, y: 90 },
    { position: "LB", x: 15, y: 70 },
    { position: "CB", x: 35, y: 75 },
    { position: "CB", x: 65, y: 75 },
    { position: "RB", x: 85, y: 70 },
    { position: "CM", x: 30, y: 52 },
    { position: "CM", x: 70, y: 52 },
    { position: "CAM", x: 50, y: 38 },
    { position: "LW", x: 15, y: 22 },
    { position: "RW", x: 85, y: 22 },
    { position: "ST", x: 50, y: 15 }
  ],
  "5-2-3": [
    { position: "GK", x: 50, y: 90 },
    { position: "LB", x: 10, y: 70 },
    { position: "CB", x: 30, y: 75 },
    { position: "CB", x: 50, y: 78 },
    { position: "CB", x: 70, y: 75 },
    { position: "RB", x: 90, y: 70 },
    { position: "CM", x: 35, y: 50 },
    { position: "CM", x: 65, y: 50 },
    { position: "LW", x: 20, y: 22 },
    { position: "RW", x: 80, y: 22 },
    { position: "ST", x: 50, y: 15 }
  ]
};
var FORMATION_OPTIONS = Object.keys(FORMATIONS);
function getPositionRatingCategory(position) {
  if (position === "GK") return "GK";
  if (["CB", "LB", "RB", "LWB", "RWB"].includes(position)) return "CB";
  if (["CM", "CDM", "CAM", "LM", "RM", "LAM", "RAM", "CF"].includes(position)) return "MIDFIELDER";
  return "FORWARD";
}

// src/lib/lineupAutofill.ts
var LINE_OF = {
  GK: "GK",
  CB: "DEF",
  LB: "DEF",
  RB: "DEF",
  LWB: "DEF",
  RWB: "DEF",
  CDM: "MID",
  CM: "MID",
  CAM: "MID",
  LM: "MID",
  RM: "MID",
  LAM: "MID",
  RAM: "MID",
  ST: "ATT",
  CF: "ATT",
  LW: "ATT",
  RW: "ATT",
  LF: "ATT",
  RF: "ATT"
};
function fitScore(player, slotPosition, ratings) {
  const rated = ratings.get(`${player.discord_user_id}|${getPositionRatingCategory(slotPosition)}`);
  let score = rated ?? player.overall_rating - 5;
  const exact = player.preferences.indexOf(slotPosition);
  if (exact !== -1) {
    score += 12 - Math.min(exact, 4) * 2;
  } else if (player.preferences.some((p) => LINE_OF[p] && LINE_OF[p] === LINE_OF[slotPosition])) {
    score += 4;
  } else if (player.preferences.length > 0) {
    score -= slotPosition === "GK" || player.preferences.includes("GK") ? 30 : 8;
  }
  return score;
}
function autofillLineup(slotPositions, players, positionRatings, lockedSlots = /* @__PURE__ */ new Set()) {
  const ratings = new Map(positionRatings.map((r) => [`${r.discord_user_id}|${r.position}`, r.rating]));
  const pairs = [];
  slotPositions.forEach((pos, slot) => {
    if (lockedSlots.has(slot)) return;
    for (const p of players) pairs.push({ slot, player: p.discord_user_id, score: fitScore(p, pos, ratings) });
  });
  pairs.sort((a, b) => b.score - a.score);
  const result = /* @__PURE__ */ new Map();
  const used = /* @__PURE__ */ new Set();
  for (const { slot, player } of pairs) {
    if (result.has(slot) || used.has(player)) continue;
    result.set(slot, player);
    used.add(player);
  }
  return result;
}

// src/lib/lineupBoard.ts
var MAX_BENCH = 9;
function locate(state, playerId) {
  const p = state.starters.indexOf(playerId);
  if (p >= 0) return { zone: "pitch", index: p };
  const b = state.bench.indexOf(playerId);
  if (b >= 0) return { zone: "bench", index: b };
  return { zone: "pool" };
}
function movePlayer(state, playerId, to) {
  if (!playerId) return state;
  const from = locate(state, playerId);
  const starters = [...state.starters];
  const bench = [...state.bench];
  if (to.zone === "pool") {
    if (from.zone === "pool") return state;
    if (from.zone === "pitch") starters[from.index] = null;
    else bench.splice(from.index, 1);
    return { starters, bench };
  }
  if (to.zone === "pitch") {
    if (to.index < 0 || to.index >= starters.length) return state;
    if (from.zone === "pitch" && from.index === to.index) return state;
    const occupant = starters[to.index];
    starters[to.index] = playerId;
    if (from.zone === "pitch") {
      starters[from.index] = occupant;
    } else if (from.zone === "bench") {
      if (occupant) bench[from.index] = occupant;
      else bench.splice(from.index, 1);
    } else if (occupant && bench.length < MAX_BENCH) {
      bench.push(occupant);
    }
    return { starters, bench };
  }
  const target = to.index;
  if (from.zone === "pitch" && target !== void 0 && target >= 0 && target < bench.length) {
    starters[from.index] = bench[target];
    bench[target] = playerId;
    return { starters, bench };
  }
  if (from.zone === "bench") {
    if (target === void 0 || target === from.index) return state;
    bench.splice(from.index, 1);
    bench.splice(Math.min(Math.max(target, 0), bench.length), 0, playerId);
    return { starters, bench };
  }
  if (bench.length >= MAX_BENCH) return state;
  if (from.zone === "pitch") starters[from.index] = null;
  const at = target === void 0 ? bench.length : Math.min(Math.max(target, 0), bench.length);
  bench.splice(at, 0, playerId);
  return { starters, bench };
}
function resizeBoard(state, slotCount) {
  const starters = state.starters.slice(0, slotCount);
  while (starters.length < slotCount) starters.push(null);
  const bench = [...state.bench];
  for (const id of state.starters.slice(slotCount)) if (id && bench.length < MAX_BENCH) bench.push(id);
  return { starters, bench };
}
var norm = (s) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
function boardFromNames(text, players, slotCount) {
  const lines = String(text || "").split(/\r?\n/).map((l) => l.replace(/^\s*\d{1,2}\s*[.)\-:]?\s+/, "").trim()).filter(Boolean).slice(0, slotCount + MAX_BENCH);
  const used = /* @__PURE__ */ new Set();
  const unmatched = [];
  const find = (line) => {
    const q = norm(line);
    if (!q) return null;
    const free = players.filter((p) => !used.has(p.id));
    const keys = (p) => p.names.filter(Boolean).map((n) => norm(n)).filter(Boolean);
    const hit = free.find((p) => keys(p).some((k) => k === q)) || free.find((p) => keys(p).some((k) => k.startsWith(q))) || (q.length >= 3 ? free.find((p) => keys(p).some((k) => k.includes(q))) : void 0);
    return hit?.id ?? null;
  };
  const starters = Array(slotCount).fill(null);
  const bench = [];
  lines.forEach((line, i) => {
    const id = find(line);
    if (!id) {
      unmatched.push(line);
      return;
    }
    used.add(id);
    if (i < slotCount) starters[i] = id;
    else bench.push(id);
  });
  return { state: { starters, bench }, unmatched };
}
var BENCH_SLOT_OFFSET = 11;
function boardToSlots(state, positions) {
  return [
    ...state.starters.flatMap((id, i) => id ? [{ slot_index: i, position: positions[i] || "SUB", discord_user_id: id, is_substitute: false }] : []),
    ...state.bench.map((id, k) => ({ slot_index: BENCH_SLOT_OFFSET + k, position: "SUB", discord_user_id: id, is_substitute: true }))
  ];
}
function slotsToBoard(slots, slotCount) {
  const starters = Array(slotCount).fill(null);
  const bench = [];
  for (const s of [...slots].sort((a, b) => a.slot_index - b.slot_index)) {
    if (!s.is_substitute && s.slot_index < slotCount && !starters[s.slot_index]) starters[s.slot_index] = s.discord_user_id;
    else if (bench.length < MAX_BENCH && !bench.includes(s.discord_user_id) && !starters.includes(s.discord_user_id)) bench.push(s.discord_user_id);
  }
  return { starters, bench };
}

// src/lib/botLineup.ts
var FORMATION_SLOTS = Object.fromEntries(
  Object.entries(FORMATIONS).map(([name, slots]) => [name, slots.map((s) => s.position)])
);
var FORMATION_COORDS = Object.fromEntries(
  Object.entries(FORMATIONS).map(([name, slots]) => [name, slots.map((s) => ({ position: s.position, x: s.x, y: s.y }))])
);
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  BENCH_SLOT_OFFSET,
  FORMATION_COORDS,
  FORMATION_SLOTS,
  MAX_BENCH,
  autofillLineup,
  boardFromNames,
  boardToSlots,
  getPositionRatingCategory,
  locate,
  movePlayer,
  resizeBoard,
  slotsToBoard
});
