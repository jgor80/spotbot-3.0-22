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
  FORMATION_SLOTS: () => FORMATION_SLOTS,
  autofillLineup: () => autofillLineup,
  getPositionRatingCategory: () => getPositionRatingCategory
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

// src/lib/botLineup.ts
var FORMATION_SLOTS = Object.fromEntries(
  Object.entries(FORMATIONS).map(([name, slots]) => [name, slots.map((s) => s.position)])
);
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  FORMATION_SLOTS,
  autofillLineup,
  getPositionRatingCategory
});
