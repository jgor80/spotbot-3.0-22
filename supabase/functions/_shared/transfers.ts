// Record who EA lists in a club and log any moves (src/lib/transfers.ts has the rules). Called by the EA
// sync for GafferBot clubs and by public club lookups, so the more clubs anyone looks at, the more moves
// get spotted. Never throws: a failure here must not break the sync or the page.
import { detectMoves, eaKey, type MemberSighting } from "../../../src/lib/transfers.ts";

// deno-lint-ignore no-explicit-any
type Db = any;

export async function recordMemberSightings(
  db: Db,
  { platform, clubId, clubName, names }: { platform: string; clubId: string; clubName: string; names: string[] },
): Promise<number> {
  try {
    const clean = [...new Map(names.filter((n) => n && n.trim()).map((n) => [eaKey(n), n.trim()])).values()].slice(0, 60);
    if (!clean.length || !clubId) return 0;
    const keys = clean.map(eaKey);
    const { data: prior, error } = await db
      .from("ea_club_members")
      .select("ea_club_id, ea_key, club_name, last_seen")
      .eq("platform", platform)
      .in("ea_key", keys);
    if (error) throw error;
    const moves = detectMoves(clubId, clubName, clean, (prior || []) as MemberSighting[]);
    if (moves.length) {
      const { error: moveErr } = await db
        .from("transfer_moves")
        .upsert(moves.map((m) => ({ ...m, platform })), { onConflict: "platform,ea_key,from_club_id,to_club_id", ignoreDuplicates: true });
      if (moveErr) console.error("[transfers] moves:", moveErr.message);
    }
    const now = new Date().toISOString();
    const { error: upErr } = await db
      .from("ea_club_members")
      .upsert(clean.map((n) => ({ platform, ea_club_id: clubId, ea_key: eaKey(n), ea_username: n, club_name: clubName, last_seen: now })), { onConflict: "platform,ea_club_id,ea_key" });
    if (upErr) console.error("[transfers] sightings:", upErr.message);
    return moves.length;
  } catch (e) {
    console.error("[transfers]", e instanceof Error ? e.message : e);
    return 0;
  }
}
