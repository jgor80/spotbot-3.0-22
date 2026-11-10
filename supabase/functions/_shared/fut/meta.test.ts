// Metaratings: role scores from attributes, PlayStyles, body and chem style; verdicts in words.
import { metaRate, roleWeights, rolesFor, scoreRole, tier, type MetaCard } from "./meta.ts";
function assert(value: unknown, message = "Assertion failed"): asserts value { if (!value) throw new Error(message); }

const all = (v: number) => Object.fromEntries(["acceleration", "sprint_speed", "positioning", "finishing", "shot_power", "long_shots", "volleys", "vision", "crossing", "short_passing", "long_passing", "curve", "agility", "balance", "reactions", "ball_control", "dribbling", "composure", "interceptions", "heading_accuracy", "defensive_awareness", "standing_tackle", "sliding_tackle", "jumping", "stamina", "strength", "aggression"].map((k) => [k, v]));
const card = (p: Partial<MetaCard> = {}): MetaCard => ({ name: "X", rating: 85, positions: ["ST"], stats: all(80), playstyles: [], playstyles_plus: [], height_cm: 182, accelerate_type: "CONTROLLED", weak_foot: 3, skill_moves: 3, ...p });

Deno.test("scoreRole: chem style lifts the right stats, PlayStyles+, height and weak foot move the score", () => {
  const af = rolesFor("ST").find((r) => r.role === "Advanced Forward")!;
  const plain = scoreRole(card(), "ST", af);
  assert(plain.chem_style === "Hunter" && plain.base > 80 && plain.score === 83, JSON.stringify(plain));
  const plus = scoreRole(card({ playstyles_plus: ["Finesse Shot", "Rapid"], playstyles: ["Quick Step"] }), "ST", af);
  assert(plus.bonuses.playstyles === 6 && plus.score === 89 && plus.playstyles.includes("Finesse Shot+"), JSON.stringify(plus));
  const wf = scoreRole(card({ weak_foot: 5, accelerate_type: "EXPLOSIVE" }), "ST", af);
  assert(wf.bonuses.weak_foot === 3.6 && wf.bonuses.accelerate === 2 && wf.strengths.includes("explosive acceleration"), JSON.stringify(wf));
  const tf = rolesFor("ST").find((r) => r.role === "Target Forward")!;
  assert(scoreRole(card({ height_cm: 196 }), "ST", tf).bonuses.height === 3.5 && scoreRole(card({ height_cm: 170 }), "ST", tf).weaknesses.some((w) => /short/.test(w)), "height for target men");
  const weak = scoreRole(card({ stats: { ...all(80), finishing: 60, positioning: 65 } }), "ST", af);
  assert(weak.weaknesses[0] === "60 finishing", JSON.stringify(weak.weaknesses));
});

Deno.test("metaRate: best role across positions, verdict vs rating, face-stat estimate, GK styles", () => {
  const r = metaRate(card({ positions: ["ST", "CAM"], rating: 80, stats: all(88) }));
  assert(r.best!.score >= 90 && /Plays better than its 80 rating/.test(r.verdict) && r.roles.length === 7, r.verdict);
  const face = metaRate(card({ stats: { pac: 95, sho: 90, pas: 70, dri: 85, def: 40, phy: 70 } }));
  assert(face.estimated && face.best!.role === "Advanced Forward", JSON.stringify(face.best));
  const gk = metaRate(card({ positions: ["GK"], stats: { gk_diving: 88, gk_reflexes: 88, gk_handling: 85, gk_positioning: 85, gk_kicking: 80, gk_speed: 60, reactions: 85 }, height_cm: 194 }));
  assert(gk.best!.role === "Goalkeeper" && ["Wall", "Glove", "Cat", "Shield"].includes(gk.best!.chem_style ?? ""), JSON.stringify(gk.best));
  assert(tier(91) === "Elite" && tier(70) === "Weak", "tiers");
  assert(roleWeights("LW", "Winger").some((w) => w.stat === "acceleration" && w.weight === 3) && roleWeights("ZZ").length === 0, "weights for the search");
});
