// Lineup board moves shared by the web drag-and-drop editor and the Discord swap flow
// (bundled into public/spotbot/lineup-autofill.cjs by npm run build:bot-lineup), so a move
// behaves the same wherever it is made.

export const MAX_BENCH = 9; // 11 starters + 9 subs fit the 20 slots a saved lineup allows

export interface BoardState {
  starters: (string | null)[]; // one entry per formation slot, in Lineup Builder order
  bench: string[];
}

export type BoardSpot =
  | { zone: "pitch"; index: number }
  | { zone: "bench"; index?: number } // index: drop on that bench player (or position); none: end of the bench
  | { zone: "pool" };

export function locate(state: BoardState, playerId: string): BoardSpot {
  const p = state.starters.indexOf(playerId);
  if (p >= 0) return { zone: "pitch", index: p };
  const b = state.bench.indexOf(playerId);
  if (b >= 0) return { zone: "bench", index: b };
  return { zone: "pool" };
}

// Move a player like dragging their card:
// - onto a pitch spot: takes it; whoever was there swaps into the mover's old place
//   (a player brought in from the squad sends the replaced starter to the bench, or out if it is full)
// - onto a bench player from the pitch: the two swap (a substitution)
// - onto the bench otherwise: joins it (or reorders within it); the pitch spot they left stays open
// - onto the squad list: leaves the lineup
// Returns the same state object when the move isn't possible.
export function movePlayer(state: BoardState, playerId: string, to: BoardSpot): BoardState {
  if (!playerId) return state;
  const from = locate(state, playerId);
  const starters = [...state.starters];
  const bench = [...state.bench];

  if (to.zone === "pool") {
    if (from.zone === "pool") return state;
    if (from.zone === "pitch") starters[from.index] = null;
    else bench.splice(from.index!, 1);
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
      if (occupant) bench[from.index!] = occupant;
      else bench.splice(from.index!, 1);
    } else if (occupant && bench.length < MAX_BENCH) {
      bench.push(occupant);
    }
    return { starters, bench };
  }

  // Bench
  const target = to.index;
  if (from.zone === "pitch" && target !== undefined && target >= 0 && target < bench.length) {
    starters[from.index] = bench[target];
    bench[target] = playerId;
    return { starters, bench };
  }
  if (from.zone === "bench") {
    if (target === undefined || target === from.index) return state;
    bench.splice(from.index!, 1);
    bench.splice(Math.min(Math.max(target, 0), bench.length), 0, playerId);
    return { starters, bench };
  }
  if (bench.length >= MAX_BENCH) return state;
  if (from.zone === "pitch") starters[from.index] = null;
  const at = target === undefined ? bench.length : Math.min(Math.max(target, 0), bench.length);
  bench.splice(at, 0, playerId);
  return { starters, bench };
}

// A new formation keeps everyone in the same slot order, adding or dropping open spots if the
// slot count changes; anyone past the end goes to the bench (or out if it is full).
export function resizeBoard(state: BoardState, slotCount: number): BoardState {
  const starters = state.starters.slice(0, slotCount);
  while (starters.length < slotCount) starters.push(null);
  const bench = [...state.bench];
  for (const id of state.starters.slice(slotCount)) if (id && bench.length < MAX_BENCH) bench.push(id);
  return { starters, bench };
}

export interface NamedPlayer {
  id: string;
  names: (string | null | undefined)[]; // EA name, Discord name, nickname...
}

const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");

// Paste names (as on lineup11.net): one player per line, goalkeeper first, the first lines fill
// the pitch in slot order and the rest go to the bench. A leading shirt number ("9 Kane",
// "9. Kane") is ignored. Unmatched lines leave the spot open and are reported back.
export function boardFromNames(text: string, players: NamedPlayer[], slotCount: number): { state: BoardState; unmatched: string[] } {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*\d{1,2}\s*[.)\-:]?\s+/, "").trim())
    .filter(Boolean)
    .slice(0, slotCount + MAX_BENCH);
  const used = new Set<string>();
  const unmatched: string[] = [];
  const find = (line: string): string | null => {
    const q = norm(line);
    if (!q) return null;
    const free = players.filter((p) => !used.has(p.id));
    const keys = (p: NamedPlayer) => p.names.filter(Boolean).map((n) => norm(n as string)).filter(Boolean);
    const hit = free.find((p) => keys(p).some((k) => k === q))
      || free.find((p) => keys(p).some((k) => k.startsWith(q)))
      || (q.length >= 3 ? free.find((p) => keys(p).some((k) => k.includes(q))) : undefined);
    return hit?.id ?? null;
  };
  const starters: (string | null)[] = Array(slotCount).fill(null);
  const bench: string[] = [];
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

// Saved lineup rows <-> board: starters keep their slot_index, subs sit at 11+ as position SUB
export const BENCH_SLOT_OFFSET = 11;

export function boardToSlots(state: BoardState, positions: string[]) {
  return [
    ...state.starters.flatMap((id, i) => (id ? [{ slot_index: i, position: positions[i] || "SUB", discord_user_id: id, is_substitute: false }] : [])),
    ...state.bench.map((id, k) => ({ slot_index: BENCH_SLOT_OFFSET + k, position: "SUB", discord_user_id: id, is_substitute: true })),
  ];
}

export function slotsToBoard(slots: { slot_index: number; discord_user_id: string; is_substitute?: boolean | null }[], slotCount: number): BoardState {
  const starters: (string | null)[] = Array(slotCount).fill(null);
  const bench: string[] = [];
  for (const s of [...slots].sort((a, b) => a.slot_index - b.slot_index)) {
    if (!s.is_substitute && s.slot_index < slotCount && !starters[s.slot_index]) starters[s.slot_index] = s.discord_user_id;
    else if (bench.length < MAX_BENCH && !bench.includes(s.discord_user_id) && !starters.includes(s.discord_user_id)) bench.push(s.discord_user_id);
  }
  return { starters, bench };
}

// Squad list order: keeper, back line, midfield, attack (as the positions read on a team sheet)
export const POSITION_ORDER = ["GK", "RB", "RWB", "CB", "LB", "LWB", "CDM", "CM", "CAM", "RM", "LM", "RW", "LW", "CF", "ST"];

export interface SquadEntry {
  id: string;
  position: string | null; // primary (comp) position
  rating: number;
  out?: boolean; // said they can't make the event
}

// Squad grouped by primary position in team-sheet order, best rated first in each group;
// players who said they're out sink to the bottom of their group, and anyone without a
// position comes last under "Any".
export function groupByPosition<T extends SquadEntry>(entries: T[]): { position: string; players: T[] }[] {
  const groups = new Map<string, T[]>();
  for (const e of entries) {
    const key = e.position && POSITION_ORDER.includes(e.position) ? e.position : "Any";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(e);
  }
  const rank = (p: string) => (p === "Any" ? POSITION_ORDER.length : POSITION_ORDER.indexOf(p));
  return [...groups.entries()]
    .sort(([a], [b]) => rank(a) - rank(b))
    .map(([position, players]) => ({ position, players: players.sort((a, b) => Number(!!a.out) - Number(!!b.out) || b.rating - a.rating) }));
}
