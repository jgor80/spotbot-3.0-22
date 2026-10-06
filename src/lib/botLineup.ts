// Entry point for the bot's copy of the lineup autofill (public/spotbot/lineup-autofill.cjs),
// so the bot places players exactly like the Lineup Builder's Fill from Voice.
import { FORMATIONS } from "@/lib/formations";

export { autofillLineup } from "@/lib/lineupAutofill";
export { getPositionRatingCategory } from "@/lib/formations";

// Formation name -> slot positions in Lineup Builder order (slot_index is the array index)
export const FORMATION_SLOTS: Record<string, string[]> = Object.fromEntries(
  Object.entries(FORMATIONS).map(([name, slots]) => [name, slots.map((s) => s.position)]),
);
