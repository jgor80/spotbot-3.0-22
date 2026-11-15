// Public transfer board (gafferbot.app/transfers), no sign-in:
//   players   free agents who chose to show on the public board (/me → Free Agent Details → Public board)
//   clubs     recruitment posters clubs put on the public board, for 14 days
//   moves     transfer news: gamertags EA's member lists show moving between clubs
// No Discord IDs or names ever leave here; managers reach out through GafferBot in Discord.
import type { BoardClub, BoardPlayer, TransferMove } from "../../../src/lib/transfers.ts";

// deno-lint-ignore no-explicit-any
type Db = any;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

export const LISTING_DAYS = 30; // matches public/spotbot/recruitment.cjs
const CACHE_MS = 60_000;
let cached: { at: number; body: unknown } | null = null;
export const clearCache = () => (cached = null);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": status === 200 ? "public, max-age=60" : "no-store" },
  });

// deno-lint-ignore no-explicit-any
const n = (v: any) => (Number.isFinite(Number(v)) ? Number(v) : 0);

export async function board(db: Db, now = Date.now()) {
  const since = new Date(now - LISTING_DAYS * 86400000).toISOString();
  const [fa, wanted, moves] = await Promise.all([
    db
      .from("free_agents")
      .select("id, discord_user_id, status, position, secondary_positions, secondary_position, platform, timezone, ea_username, ea_verified, notes, updated_at")
      .eq("public_board", true)
      .eq("no_contact", false)
      .neq("status", "off")
      .gte("updated_at", since)
      .order("updated_at", { ascending: false })
      .limit(200),
    db
      .from("club_wanted")
      .select("club_name, crest_url, positions, notes, record, division, invite_url, ea_club_id, ea_platform, updated_at, expires_at")
      .gt("expires_at", new Date(now).toISOString())
      .order("updated_at", { ascending: false })
      .limit(100),
    db
      .from("transfer_moves")
      .select("ea_username, platform, from_club_id, from_club_name, to_club_id, to_club_name, detected_at")
      .order("detected_at", { ascending: false })
      .limit(100),
  ]);
  for (const r of [fa, wanted, moves]) if (r.error) throw r.error;

  // Career totals for listed players with linked stats (player_summary, one row per server they played in)
  const ids = (fa.data || []).map((r: Db) => r.discord_user_id).filter(Boolean);
  const totals = new Map<string, { games: number; ratingSum: number; rated: number; goals: number; assists: number; motm: number }>();
  if (ids.length) {
    const { data } = await db.from("player_summary").select("discord_user_id, games_played, avg_match_rating, goals, assists, man_of_match").in("discord_user_id", ids);
    for (const r of data || []) {
      const g = n(r.games_played);
      if (!g) continue;
      const t = totals.get(r.discord_user_id) || { games: 0, ratingSum: 0, rated: 0, goals: 0, assists: 0, motm: 0 };
      t.games += g;
      if (n(r.avg_match_rating) > 0) {
        t.ratingSum += n(r.avg_match_rating) * g;
        t.rated += g;
      }
      t.goals += n(r.goals);
      t.assists += n(r.assists);
      t.motm += n(r.man_of_match);
      totals.set(r.discord_user_id, t);
    }
  }

  const players: BoardPlayer[] = (fa.data || []).map((r: Db) => {
    const t = totals.get(r.discord_user_id);
    const secondary: string[] = Array.isArray(r.secondary_positions) && r.secondary_positions.length ? r.secondary_positions : r.secondary_position ? [r.secondary_position] : [];
    return {
      id: String(r.id),
      status: r.status === "open" ? "open" : "looking",
      positions: [r.position, ...secondary].filter(Boolean),
      platform: r.platform || null,
      timezone: r.timezone || null,
      gamertag: r.ea_username || null,
      verified: !!r.ea_verified,
      notes: r.notes || null,
      updatedAt: r.updated_at,
      stats: t ? { games: t.games, rating: t.rated ? Math.round((t.ratingSum / t.rated) * 10) / 10 : null, goals: t.goals, assists: t.assists, motm: t.motm } : null,
    };
  });
  const clubs: BoardClub[] = (wanted.data || []).map((r: Db) => ({
    name: r.club_name,
    crest: r.crest_url || null,
    positions: r.positions,
    notes: r.notes || null,
    record: r.record || null,
    division: r.division || null,
    invite: /^https:\/\/discord\.(gg|com)\//.test(r.invite_url || "") ? r.invite_url : null,
    eaClubId: r.ea_club_id || null,
    platform: r.ea_platform || null,
    updatedAt: r.updated_at,
  }));
  return { players, clubs, moves: (moves.data || []) as TransferMove[] };
}

export function createHandler(getDb: () => Db) {
  return async function handle(req: Request): Promise<Response> {
    if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
    if (req.method !== "GET") return json({ error: "GET only" }, 405);
    try {
      if (!cached || Date.now() - cached.at > CACHE_MS) cached = { at: Date.now(), body: await board(getDb()) };
      return json(cached.body);
    } catch (e) {
      console.error("[transfer-board]", e);
      return json({ error: "Couldn't load the transfer board." }, 500);
    }
  };
}
