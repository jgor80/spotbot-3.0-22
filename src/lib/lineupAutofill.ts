import { getPositionRatingCategory } from "@/lib/formations";

export interface AutofillPlayer {
  discord_user_id: string;
  overall_rating: number;
  // Position codes in preference order, e.g. ["ST", "CAM"]
  preferences: string[];
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

function fitScore(player: AutofillPlayer, slotPosition: string, ratings: Map<string, number>): number {
  const rated = ratings.get(`${player.discord_user_id}|${getPositionRatingCategory(slotPosition)}`);
  let score = rated ?? player.overall_rating - 5;

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
