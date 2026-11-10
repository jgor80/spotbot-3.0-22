// Metaratings (Jeff, 2026-11-10): "is this card actually good?" A score per position and role from the card's in-game
// attributes (not its overall), PlayStyles and PlayStyles+, height, AcceleRATE, weak foot and skill moves, under the
// chemistry style that suits it best, with the reasons in words. Role weights and chem style boosts are GafferBot's
// own estimates (FC 27 chem style numbers aren't confirmed yet), so treat scores as a guide, not EA's numbers. Pure.

export interface MetaCard {
  name: string; rating: number; positions: string[];
  stats: Record<string, number>;
  playstyles: string[]; playstyles_plus: string[];
  height_cm: number | null; accelerate_type: string | null; weak_foot: number | null; skill_moves: number | null;
}
type W = Record<string, number>;
interface Role { role: string; weights: W; playstyles: string[]; tall?: number; agile?: boolean; explosive?: boolean; strong?: boolean; wf?: number; sm?: number }

const PACE = { acceleration: 2, sprint_speed: 2 };
const DEF_CORE = { defensive_awareness: 3, standing_tackle: 3, interceptions: 2 };
const ROLES: Record<string, Role[]> = {
  GK: [
    { role: "Goalkeeper", weights: { gk_diving: 3, gk_reflexes: 3, gk_handling: 2, gk_positioning: 2, gk_kicking: 1, reactions: 1 }, playstyles: ["Far Reach", "Deflector", "Cross Claimer", "Footwork"], tall: 188 },
    { role: "Sweeper Keeper", weights: { gk_reflexes: 2, gk_diving: 2, gk_positioning: 1, gk_kicking: 2, gk_speed: 2 }, playstyles: ["1v1 Close Down", "Far Throw", "Footwork", "Cross Claimer"], tall: 186 },
  ],
  CB: [
    { role: "Defender", weights: { ...DEF_CORE, sliding_tackle: 1, strength: 2, jumping: 1, heading_accuracy: 1, ...PACE }, playstyles: ["Block", "Intercept", "Anticipate", "Jockey", "Slide Tackle", "Aerial Fortress"], tall: 185, wf: 0.5 },
    { role: "Ball-Playing Defender", weights: { ...DEF_CORE, short_passing: 2, long_passing: 2, composure: 2, vision: 1, ...PACE }, playstyles: ["Intercept", "Anticipate", "Long Ball Pass", "Pinged Pass", "Block"], tall: 184, wf: 1 },
    { role: "Stopper", weights: { defensive_awareness: 2, standing_tackle: 3, strength: 3, aggression: 2, heading_accuracy: 2, jumping: 2 }, playstyles: ["Bruiser", "Aerial Fortress", "Block", "Anticipate", "Enforcer"], tall: 187, strong: true },
  ],
  FB: [
    { role: "Fullback", weights: { ...PACE, standing_tackle: 2, defensive_awareness: 2, interceptions: 2, stamina: 2, crossing: 1 }, playstyles: ["Jockey", "Intercept", "Anticipate", "Relentless", "Whipped Pass"], explosive: true },
    { role: "Wingback", weights: { acceleration: 3, sprint_speed: 3, crossing: 2, stamina: 2, dribbling: 2, ball_control: 1, short_passing: 1, standing_tackle: 1 }, playstyles: ["Whipped Pass", "Relentless", "Rapid", "Quick Step", "Incisive Pass"], explosive: true, sm: 0.6 },
    { role: "Falseback", weights: { short_passing: 3, interceptions: 2, defensive_awareness: 2, ball_control: 2, composure: 2, stamina: 1 }, playstyles: ["Tiki Taka", "Intercept", "Press Proven", "Anticipate"], wf: 1 },
  ],
  CDM: [
    { role: "Holding", weights: { ...DEF_CORE, strength: 2, short_passing: 2, stamina: 1, aggression: 1 }, playstyles: ["Intercept", "Anticipate", "Block", "Bruiser", "Press Proven", "Long Ball Pass"], tall: 180, wf: 1 },
    { role: "Deep-Lying Playmaker", weights: { short_passing: 3, long_passing: 3, vision: 2, composure: 2, interceptions: 1, ball_control: 1 }, playstyles: ["Pinged Pass", "Long Ball Pass", "Tiki Taka", "Incisive Pass", "Press Proven"], wf: 1.5 },
  ],
  CM: [
    { role: "Box-to-Box", weights: { stamina: 3, short_passing: 2, standing_tackle: 2, interceptions: 1, long_shots: 1, ...PACE, strength: 1, ball_control: 1 }, playstyles: ["Relentless", "Intercept", "Press Proven", "Power Shot", "Tiki Taka"], wf: 1.5, sm: 0.5 },
    { role: "Playmaker", weights: { short_passing: 3, vision: 3, long_passing: 2, ball_control: 2, composure: 2, dribbling: 1 }, playstyles: ["Incisive Pass", "Pinged Pass", "Tiki Taka", "Long Ball Pass", "Technical", "Press Proven"], wf: 1.5, sm: 0.5 },
    { role: "Holding", weights: { ...DEF_CORE, strength: 2, short_passing: 2, stamina: 1 }, playstyles: ["Intercept", "Anticipate", "Block", "Bruiser", "Press Proven"], wf: 1 },
  ],
  CAM: [
    { role: "Playmaker", weights: { short_passing: 3, vision: 3, ball_control: 2, dribbling: 2, composure: 2, long_shots: 1 }, playstyles: ["Incisive Pass", "Tiki Taka", "Technical", "Finesse Shot", "Press Proven", "Inventive"], agile: true, wf: 1.5, sm: 1 },
    { role: "Shadow Striker", weights: { finishing: 3, positioning: 3, acceleration: 2, composure: 2, dribbling: 1, agility: 1, reactions: 1 }, playstyles: ["Finesse Shot", "Low Driven Shot", "Quick Step", "Rapid", "Technical"], explosive: true, wf: 1.5, sm: 1 },
    { role: "Classic 10", weights: { vision: 3, dribbling: 3, short_passing: 2, ball_control: 2, agility: 2, curve: 1 }, playstyles: ["Technical", "Trickster", "Incisive Pass", "First Touch", "Finesse Shot"], agile: true, wf: 1, sm: 1.2 },
  ],
  W: [
    { role: "Winger", weights: { acceleration: 3, sprint_speed: 2, dribbling: 3, agility: 2, ball_control: 2, crossing: 2, balance: 1 }, playstyles: ["Rapid", "Quick Step", "Technical", "Trickster", "Whipped Pass", "First Touch"], agile: true, explosive: true, sm: 1.2, wf: 0.8 },
    { role: "Inside Forward", weights: { finishing: 3, dribbling: 3, acceleration: 2, agility: 2, positioning: 2, curve: 1, composure: 1 }, playstyles: ["Finesse Shot", "Technical", "Rapid", "Quick Step", "Low Driven Shot", "Trickster"], agile: true, explosive: true, sm: 1.2, wf: 1.5 },
    { role: "Wide Playmaker", weights: { short_passing: 3, vision: 2, crossing: 2, dribbling: 2, ball_control: 2, curve: 1 }, playstyles: ["Incisive Pass", "Whipped Pass", "Tiki Taka", "Technical", "First Touch"], agile: true, sm: 1, wf: 1.2 },
  ],
  ST: [
    { role: "Advanced Forward", weights: { acceleration: 3, sprint_speed: 2, finishing: 3, positioning: 3, composure: 2, ball_control: 1, dribbling: 1 }, playstyles: ["Finesse Shot", "Rapid", "Quick Step", "Low Driven Shot", "Power Shot", "Technical"], explosive: true, sm: 0.8, wf: 1.8 },
    { role: "Target Forward", weights: { strength: 3, heading_accuracy: 3, jumping: 2, finishing: 2, positioning: 2, shot_power: 1 }, playstyles: ["Precision Header", "Aerial Fortress", "Power Shot", "Bruiser", "Acrobatic"], tall: 186, strong: true, wf: 1 },
    { role: "Poacher", weights: { finishing: 3, positioning: 3, reactions: 2, composure: 2, acceleration: 2, heading_accuracy: 1 }, playstyles: ["Finesse Shot", "Low Driven Shot", "Acrobatic", "Quick Step", "Precision Header"], explosive: true, wf: 1.8 },
    { role: "False 9", weights: { short_passing: 2, vision: 2, dribbling: 3, ball_control: 3, agility: 1, finishing: 2, composure: 1 }, playstyles: ["Technical", "Incisive Pass", "Tiki Taka", "First Touch", "Finesse Shot"], agile: true, sm: 1, wf: 1.5 },
  ],
};
const GROUP: Record<string, string> = { GK: "GK", CB: "CB", LB: "FB", RB: "FB", LWB: "FB", RWB: "FB", CDM: "CDM", CM: "CM", CAM: "CAM", LM: "W", RM: "W", LW: "W", RW: "W", ST: "ST", CF: "ST" };
export const META_POSITIONS = Object.keys(GROUP);
export const rolesFor = (position: string) => ROLES[GROUP[position.toUpperCase()] ?? ""] ?? [];

/** Approximate boosts at full chemistry. FC 27's real numbers aren't confirmed; these follow recent games' patterns. */
export const CHEM_STYLES: Record<string, W> = {
  Hunter: { acceleration: 6, sprint_speed: 6, finishing: 6, volleys: 6, shot_power: 6 },
  Hawk: { acceleration: 4, sprint_speed: 4, finishing: 4, shot_power: 4, long_shots: 4, jumping: 4, strength: 4, aggression: 4 },
  Finisher: { finishing: 6, shot_power: 6, long_shots: 6, dribbling: 4, agility: 4, balance: 4 },
  Marksman: { finishing: 4, shot_power: 4, long_shots: 4, reactions: 4, ball_control: 4, dribbling: 4, jumping: 4, strength: 4 },
  Deadeye: { positioning: 6, finishing: 6, long_shots: 6, short_passing: 6, vision: 6, curve: 4 },
  Engine: { acceleration: 4, sprint_speed: 4, short_passing: 4, vision: 4, curve: 4, dribbling: 4, balance: 4, agility: 4 },
  Catalyst: { acceleration: 6, sprint_speed: 6, short_passing: 6, crossing: 6, curve: 6 },
  Artist: { vision: 6, crossing: 6, long_passing: 6, agility: 6, reactions: 6 },
  Maestro: { shot_power: 4, long_shots: 4, short_passing: 4, vision: 4, long_passing: 4, ball_control: 4, dribbling: 4, agility: 4 },
  Architect: { short_passing: 6, long_passing: 6, curve: 6, strength: 6, aggression: 6 },
  Powerhouse: { short_passing: 6, vision: 6, long_passing: 6, standing_tackle: 6, interceptions: 6 },
  Shadow: { acceleration: 6, sprint_speed: 6, interceptions: 6, defensive_awareness: 6, standing_tackle: 6, sliding_tackle: 6 },
  Anchor: { acceleration: 4, sprint_speed: 4, defensive_awareness: 4, standing_tackle: 4, sliding_tackle: 4, jumping: 4, strength: 4, aggression: 4 },
  Sentinel: { interceptions: 6, defensive_awareness: 6, standing_tackle: 6, heading_accuracy: 6, jumping: 6, strength: 6 },
  Gladiator: { finishing: 4, shot_power: 4, long_shots: 4, interceptions: 4, defensive_awareness: 4, standing_tackle: 4, sliding_tackle: 4 },
};
export const GK_CHEM_STYLES: Record<string, W> = {
  Wall: { gk_diving: 6, gk_handling: 6, gk_kicking: 6 }, Shield: { gk_kicking: 6, gk_reflexes: 6, gk_speed: 6 },
  Cat: { gk_reflexes: 6, gk_speed: 6, gk_positioning: 6 }, Glove: { gk_diving: 6, gk_handling: 6, gk_positioning: 6 },
};

/** Sub-attributes from face stats when FUT.GG's full stats aren't in yet (an estimate). */
const FROM_FACE: Record<string, string> = {
  acceleration: "pac", sprint_speed: "pac", positioning: "sho", finishing: "sho", shot_power: "sho", long_shots: "sho", volleys: "sho", penalties: "sho",
  vision: "pas", crossing: "pas", fk_accuracy: "pas", short_passing: "pas", long_passing: "pas", curve: "pas",
  agility: "dri", balance: "dri", reactions: "dri", ball_control: "dri", dribbling: "dri", composure: "dri",
  interceptions: "def", heading_accuracy: "def", defensive_awareness: "def", standing_tackle: "def", sliding_tackle: "def",
  jumping: "phy", stamina: "phy", strength: "phy", aggression: "phy",
};
const LABEL: Record<string, string> = Object.fromEntries(Object.keys({ ...FROM_FACE, gk_diving: 1, gk_handling: 1, gk_kicking: 1, gk_reflexes: 1, gk_positioning: 1, gk_speed: 1 }).map((k) => [k, k.replace(/^gk_/, "GK ").replace(/_/g, " ")]));
LABEL.fk_accuracy = "free kicks";

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const r1 = (v: number) => Math.round(v * 10) / 10;
export const tier = (s: number) => (s >= 90 ? "Elite" : s >= 85 ? "Very good" : s >= 80 ? "Good" : s >= 74 ? "Decent" : "Weak");

export interface RoleScore {
  position: string; role: string; score: number; tier: string; chem_style: string | null; base: number;
  bonuses: { playstyles: number; height: number; accelerate: number; weak_foot: number; skill_moves: number };
  strengths: string[]; weaknesses: string[]; playstyles: string[];
}

/** One card in one role: weighted attributes under each chem style (best kept), plus PlayStyle and body bonuses. */
export function scoreRole(card: MetaCard, position: string, role: Role, estimated = false): RoleScore {
  const value = (k: string, boost: W = {}) => clamp((card.stats[k] ?? (estimated ? card.stats[FROM_FACE[k] ?? ""] : undefined) ?? 50) + (boost[k] ?? 0), 1, 99);
  const total = Object.values(role.weights).reduce((a, b) => a + b, 0);
  const weighted = (boost: W = {}) => Object.entries(role.weights).reduce((a, [k, w]) => a + value(k, boost) * w, 0) / total;
  const styles = position === "GK" ? GK_CHEM_STYLES : CHEM_STYLES;
  let base = weighted(), chem: string | null = null;
  for (const [name, boost] of Object.entries(styles)) { const s = weighted(boost); if (s > base + 0.05) { base = s; chem = name; } }
  const ps = role.playstyles.filter((p) => card.playstyles_plus.includes(p)).length * 2.5 + role.playstyles.filter((p) => card.playstyles.includes(p) && !card.playstyles_plus.includes(p)).length * 1.2;
  const h = card.height_cm;
  const height = h === null ? 0 : role.tall ? clamp((h - role.tall) * 0.35, -4, 4) : role.agile ? clamp((181 - h) * 0.12, -2, 1.5) : 0;
  const a = (card.accelerate_type ?? "").toUpperCase();
  const accel = !a ? 0 : role.explosive ? (/EXPLOSIVE/.test(a) && !/CONTROLLED/.test(a) ? 2 : /LENGTHY/.test(a) ? -1.5 : 0) : role.strong ? (/LENGTHY/.test(a) ? 1 : 0) : 0;
  const wf = card.weak_foot === null || !role.wf ? 0 : (card.weak_foot - 3) * role.wf;
  const sm = card.skill_moves === null || !role.sm ? 0 : (card.skill_moves - 3) * role.sm;
  const score = Math.round(clamp(base + Math.min(6, ps) + height + accel + wf + sm, 1, 99));
  const ranked = Object.entries(role.weights).map(([k, w]) => ({ k, w, v: value(k) })).sort((x, y) => y.w - x.w || y.v - x.v);
  const strengths = ranked.filter((x) => x.v >= 85).sort((x, y) => y.v - x.v).slice(0, 3).map((x) => `${x.v} ${LABEL[x.k] ?? x.k}`);
  const weaknesses = ranked.filter((x) => x.v < 72 && x.w >= 2).sort((x, y) => x.v - y.v).slice(0, 2).map((x) => `${x.v} ${LABEL[x.k] ?? x.k}`);
  if (wf <= -1.5) weaknesses.push(`${card.weak_foot}★ weak foot`);
  if (height <= -2) weaknesses.push(`${h} cm is short for this role`);
  if (height >= 2) strengths.push(`${h} cm`);
  if (accel >= 2) strengths.push("explosive acceleration");
  return {
    position, role: role.role, score, tier: tier(score), chem_style: chem, base: r1(base),
    bonuses: { playstyles: r1(Math.min(6, ps)), height: r1(height), accelerate: r1(accel), weak_foot: r1(wf), skill_moves: r1(sm) },
    strengths, weaknesses, playstyles: role.playstyles.filter((p) => card.playstyles.includes(p) || card.playstyles_plus.includes(p)).map((p) => card.playstyles_plus.includes(p) ? `${p}+` : p),
  };
}

/** Every role at each of the card's positions, best first, with a one-line verdict. */
export function metaRate(card: MetaCard, positions = card.positions) {
  const estimated = !Object.keys(card.stats).some((k) => k in FROM_FACE || k.startsWith("gk_"));
  const roles = [...new Set(positions.map((p) => p.toUpperCase()))].flatMap((p) => rolesFor(p).map((r) => scoreRole(card, p, r, estimated))).sort((a, b) => b.score - a.score);
  const best = roles[0] ?? null;
  const gap = best ? best.score - card.rating : 0;
  const verdict = !best ? "No roles for these positions."
    : `${tier(best.score)} as a ${best.position} ${best.role} (${best.score}${best.chem_style ? ` with ${best.chem_style}` : ""}). `
      + (gap >= 3 ? `Plays better than its ${card.rating} rating.` : gap <= -4 ? `Plays worse than its ${card.rating} rating suggests.` : `About what its ${card.rating} rating suggests.`)
      + (best.strengths.length ? ` Strengths: ${best.strengths.join(", ")}.` : "") + (best.weaknesses.length ? ` Watch: ${best.weaknesses.join(", ")}.` : "");
  return { best, roles, verdict, estimated };
}

/** Weights for the database's pre-ranking (the search's fit sort) for one role. */
export const roleWeights = (position: string, role?: string) => {
  const r = rolesFor(position).find((x) => !role || x.role.toLowerCase() === role.toLowerCase()) ?? rolesFor(position)[0];
  return r ? Object.entries(r.weights).map(([stat, weight]) => ({ stat, weight })) : [];
};
