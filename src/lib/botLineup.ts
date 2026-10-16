// Entry point for the bot's copy of the lineup autofill (public/spotbot/lineup-autofill.cjs),
// so the bot places players exactly like the Lineup Builder's Fill from Voice.
import { FORMATIONS } from "@/lib/formations";

export { autofillLineup } from "@/lib/lineupAutofill";
export { getPositionRatingCategory } from "@/lib/formations";
export { movePlayer, resizeBoard, boardFromNames, boardToSlots, slotsToBoard, locate, MAX_BENCH, BENCH_SLOT_OFFSET } from "@/lib/lineupBoard";

// Formation name -> slot positions in Lineup Builder order (slot_index is the array index)
export const FORMATION_SLOTS: Record<string, string[]> = Object.fromEntries(
  Object.entries(FORMATIONS).map(([name, slots]) => [name, slots.map((s) => s.position)]),
);

// Formation name -> where each slot sits on the pitch (percent across, percent down), for the
// bot's lineup image so it matches the web pitch
export const FORMATION_COORDS: Record<string, { position: string; x: number; y: number }[]> = Object.fromEntries(
  Object.entries(FORMATIONS).map(([name, slots]) => [name, slots.map((s) => ({ position: s.position, x: s.x, y: s.y }))]),
);
