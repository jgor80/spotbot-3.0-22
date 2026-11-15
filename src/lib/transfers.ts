// Transfer board and transfer news. Moves are spotted from EA's own club member lists: when a gamertag
// shows up in a club's member list and was last seen in a different club's list, that's a move EA
// itself confirms (no self-reporting). Pure functions, shared by the backend functions and tests.

export interface MemberSighting {
  ea_club_id: string;
  ea_key: string; // lower-cased gamertag
  club_name: string | null;
  last_seen: string; // ISO time
}

export interface DetectedMove {
  ea_key: string;
  ea_username: string;
  from_club_id: string;
  from_club_name: string | null;
  to_club_id: string;
  to_club_name: string;
}

// How long a sighting counts: a player last seen in another club longer ago than this isn't a fresh move
export const SIGHTING_DAYS = 60;

export const eaKey = (name: string) => name.trim().toLowerCase();

// names: the gamertags in clubId's member list now. prior: earlier sightings of those gamertags anywhere.
// A move is a player not seen in this club before whose latest sighting was in another club.
export function detectMoves(clubId: string, clubName: string, names: string[], prior: MemberSighting[], now = Date.now()): DetectedMove[] {
  const cutoff = now - SIGHTING_DAYS * 86400000;
  const byKey = new Map<string, MemberSighting[]>();
  for (const s of prior) {
    if (new Date(s.last_seen).getTime() < cutoff) continue;
    const list = byKey.get(s.ea_key) || [];
    list.push(s);
    byKey.set(s.ea_key, list);
  }
  const out: DetectedMove[] = [];
  const seen = new Set<string>();
  for (const name of names) {
    const key = eaKey(name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const sightings = byKey.get(key) || [];
    if (!sightings.length || sightings.some((s) => s.ea_club_id === clubId)) continue;
    const latest = sightings.reduce((a, b) => (new Date(b.last_seen) > new Date(a.last_seen) ? b : a));
    out.push({ ea_key: key, ea_username: name.trim(), from_club_id: latest.ea_club_id, from_club_name: latest.club_name, to_club_id: clubId, to_club_name: clubName });
  }
  return out;
}

export interface TransferMove {
  ea_username: string;
  platform: string;
  from_club_id: string;
  from_club_name: string | null;
  to_club_id: string;
  to_club_name: string | null;
  detected_at: string;
}

// One club's moves for a digest: who joined and who left, newest first
export function clubTransferNews(moves: TransferMove[], clubId: string): { joined: TransferMove[]; left: TransferMove[] } {
  const sorted = [...moves].sort((a, b) => b.detected_at.localeCompare(a.detected_at));
  return {
    joined: sorted.filter((m) => m.to_club_id === clubId),
    left: sorted.filter((m) => m.from_club_id === clubId),
  };
}

export const moveLine = (m: TransferMove) => `${m.ea_username}: ${m.from_club_name || "another club"} → ${m.to_club_name || "another club"}`;

// Public board listings, as the transfer-board function returns them (no Discord IDs)
export interface BoardPlayer {
  id: string;
  status: "looking" | "open";
  positions: string[];
  platform: string | null;
  timezone: string | null;
  gamertag: string | null;
  verified: boolean;
  notes: string | null;
  updatedAt: string;
  stats: { games: number; rating: number | null; goals: number; assists: number; motm: number } | null;
}

export interface BoardClub {
  name: string;
  crest: string | null;
  positions: string;
  notes: string | null;
  record: string | null;
  division: string | null;
  invite: string | null;
  eaClubId: string | null;
  platform: string | null;
  updatedAt: string;
}

// Position groups for filtering, by line
export const POSITION_LINES: Record<string, string[]> = {
  GK: ["GK"],
  DEF: ["CB", "LB", "RB", "LWB", "RWB"],
  MID: ["CDM", "CM", "CAM", "LM", "RM"],
  ATT: ["ST", "CF", "LW", "RW"],
};

export function filterPlayers(players: BoardPlayer[], { line, platform, verifiedOnly }: { line?: string; platform?: string; verifiedOnly?: boolean }): BoardPlayer[] {
  const wanted = line && POSITION_LINES[line] ? new Set(POSITION_LINES[line]) : null;
  return players.filter(
    (p) => (!wanted || p.positions.some((pos) => wanted.has(pos))) && (!platform || p.platform === platform) && (!verifiedOnly || p.verified)
  );
}
