import type { CurrentSquad } from "./futApi";
// Squad Builder edits that need no server call: the squad on screen is only saved when the user presses Save.
// Same behaviour as swapSlots / assignCard(null) in XI Lab's workspace (supabase/functions/_shared/fut/xilab/workspace/squad.ts).
import type { FutSquad } from "./futApi";

/** Move a player to another slot. A player already there swaps back; locks travel with their players. */
export function moveBetweenSlots(squad: FutSquad, from: string, to: string): FutSquad {
  const a = squad.slots.find(s => s.slot === from), b = squad.slots.find(s => s.slot === to);
  if (!a || !b || a === b || !a.card) return squad;
  return { ...squad, slots: squad.slots.map(s => s === a ? { ...s, card: b.card, locked: b.card ? b.locked : false } : s === b ? { ...s, card: a.card, locked: a.locked } : s) };
}

/** Take the player out of a slot (the slot unlocks). */
export function removeFromSlot(squad: FutSquad, slot: string): FutSquad {
  if (!squad.slots.some(s => s.slot === slot && s.card)) return squad;
  return { ...squad, slots: squad.slots.map(s => s.slot === slot ? { ...s, card: null, locked: false } : s) };
}

/** True when the player can play the slot's position. */
export const playsSlot = (positions: string[] | undefined, position: string) => !!positions?.includes(position);

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

/** Where a "current squad" came from, in a line. */
export function currentSquadLabel(c: CurrentSquad): string {
  return c.source === "game" ? `From the EA Web App${c.seen_at ? `, ${when(c.seen_at)}` : ""}` : c.source === "saved" ? "Your newest saved squad" : c.source === "club" ? "Best eleven from your club" : "No squad yet";
}
