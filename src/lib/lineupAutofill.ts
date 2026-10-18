import { getPositionRatingCategory } from "@/lib/formations";

export interface AutofillPlayer {
  discord_user_id: string;
  overall_rating: number;
  // Position codes in preference order, e.g. ["ST", "CAM"]
  preferences: string[];
  // Position tiers (docs/position-tiers.md); when given they decide fit instead of preferences
  tiers?: PositionTiersInput | null;
  // Answered Maybe for the event: still picked, but after an equally good Yes
  maybe?: boolean;
}

export interface PositionTiersInput {
  primary?: string | null;
  secondary?: string[] | null;
  emergency?: string[] | null;
}

export interface PositionRatingRow {
  discord_user_id: string;
  position: string;
  rating: number;
}

// Pitch lines a preferred position also fits reasonably well
const LINE_OF: Record<string, string> = {
  GK: "GK",
  CB: "DEF", LB: "DEF", RB: "DEF", LWB: "DEF", RWB: "DEF",
  CDM: "MID", CM: "MID", CAM: "MID", LM: "MID", RM: "MID", LAM: "MID", RAM: "MID",
  ST: "ATT", CF: "ATT", LW: "ATT", RW: "ATT", LF: "ATT", RF: "ATT",
};

// Older positions read as their nearest pick on the button list (position-tiers.cjs LEGACY_POSITIONS)
const LEGACY: Record<string, string> = { LWB: "LB", RWB: "RB", CF: "ST" };
const norm = (p?: string | null) => {
  const up = String(p || "").trim().toUpperCase();
  return LEGACY[up] || up;
};

// comp position, plays well, emergency cover, or none of them
export function tierFit(tiers: PositionTiersInput | null | undefined, slotPosition: string): "primary" | "secondary" | "emergency" | "none" | null {
  if (!tiers || !(tiers.primary || tiers.secondary?.length || tiers.emergency?.length)) return null;
  const at = norm(slotPosition);
  if (norm(tiers.primary) === at) return "primary";
  if ((tiers.secondary || []).some((p) => norm(p) === at)) return "secondary";
  if ((tiers.emergency || []).some((p) => norm(p) === at)) return "emergency";
  return "none";
}

const TIER_BONUS = { primary: 14, secondary: 9, emergency: 2 };

function fitScore(player: AutofillPlayer, slotPosition: string, ratings: Map<string, number>): number {
  const rated = ratings.get(`${player.discord_user_id}|${getPositionRatingCategory(slotPosition)}`);
  let score = rated ?? player.overall_rating - 5;
  if (player.maybe) score -= 6;

  const fit = tierFit(player.tiers, slotPosition);
  if (fit && fit !== "none") return score + TIER_BONUS[fit];
  if (fit === "none") {
    const all = [player.tiers?.primary, ...(player.tiers?.secondary || [])].map(norm);
    const sameLine = all.some((p) => LINE_OF[p] && LINE_OF[p] === LINE_OF[norm(slotPosition)]);
    return score + (sameLine ? 0 : norm(slotPosition) === "GK" || all.includes("GK") ? -30 : -10);
  }

  const exact = player.preferences.indexOf(slotPosition);
  if (exact !== -1) {
    score += 12 - Math.min(exact, 4) * 2;
  } else if (player.preferences.some((p) => LINE_OF[p] && LINE_OF[p] === LINE_OF[slotPosition])) {
    score += 4;
  } else if (player.preferences.length > 0) {
    // Plays somewhere else entirely; a keeper in midfield is worse than a winger at striker
    score -= slotPosition === "GK" || player.preferences.includes("GK") ? 30 : 8;
  }
  return score;
}

// Assign players to formation slots, best fits first. Returns slot index -> discord_user_id.
export function autofillLineup(
  slotPositions: string[],
  players: AutofillPlayer[],
  positionRatings: PositionRatingRow[],
  lockedSlots: Set<number> = new Set(),
): Map<number, string> {
  const ratings = new Map(positionRatings.map((r) => [`${r.discord_user_id}|${r.position}`, r.rating]));
  const pairs: { slot: number; player: string; score: number }[] = [];
  slotPositions.forEach((pos, slot) => {
    if (lockedSlots.has(slot)) return;
    for (const p of players) pairs.push({ slot, player: p.discord_user_id, score: fitScore(p, pos, ratings) });
  });
  pairs.sort((a, b) => b.score - a.score);

  const result = new Map<number, string>();
  const used = new Set<string>();
  for (const { slot, player } of pairs) {
    if (result.has(slot) || used.has(player)) continue;
    result.set(slot, player);
    used.add(player);
  }
  return result;
}

export interface PickedLineup {
  // slot index -> discord_user_id
  starters: Map<number, string>;
  bench: string[];
}

// The XI plus a bench of everyone else (Yes before Maybe, then rating), up to benchMax.
export function pickLineup(
  slotPositions: string[],
  players: AutofillPlayer[],
  positionRatings: PositionRatingRow[] = [],
  benchMax = 9,
): PickedLineup {
  const starters = autofillLineup(slotPositions, players, positionRatings);
  const used = new Set(starters.values());
  const bench = players
    .filter((p) => !used.has(p.discord_user_id))
    .sort((a, b) => Number(!!a.maybe) - Number(!!b.maybe) || b.overall_rating - a.overall_rating)
    .slice(0, benchMax)
    .map((p) => p.discord_user_id);
  return { starters, bench };
}
