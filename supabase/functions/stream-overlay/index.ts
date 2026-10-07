// Data for the OBS stream overlay (web app route /overlay/:token).
// POST { token, club } -> the club's latest team sheet plus tonight's EA ratings per player.
// The token is a per-server secret the bot hands out with /premium overlay (premium_servers.overlay_token),
// so the page needs no login. Read-only.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// "Tonight" is the last few hours of synced matches
const SESSION_WINDOW_MS = 6 * 60 * 60 * 1000;
// EA gives 3.0 to players who left early; leave those out of averages
const LEAVER_RATING = 3;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" } });
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

interface PlayerStat {
  ea_username?: string;
  goals?: number;
  assists?: number;
  rating?: number;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const url = new URL(req.url);
    const token = String(body.token ?? url.searchParams.get("token") ?? "").trim();
    const clubKey = String(body.club ?? url.searchParams.get("club") ?? "").trim();
    if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return json({ error: "Invalid overlay link" }, 400);

    const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");

    const { data: server } = await supabase.from("premium_servers").select("guild_id").eq("overlay_token", token).maybeSingle();
    if (!server) return json({ error: "This overlay link is not valid any more. Get a new one in Discord with /manager → Premium → Stream Overlay." }, 404);
    const guildId = server.guild_id as string;

    const { data: settings } = await supabase.from("guild_settings").select("clubs, branding").eq("guild_id", guildId).maybeSingle();
    const clubs = (settings?.clubs as Array<Record<string, unknown>> | null) ?? [];
    const club = clubs.find((c) => c.key === clubKey) ?? clubs.find((c) => c.enabled !== false) ?? null;
    if (!club) return json({ error: "Club not found" }, 404);
    const branding = (settings?.branding as Record<string, unknown> | null) ?? {};

    // Latest team sheet for the club's squad (any in the server when the club has no squad)
    let lineupQuery = supabase.from("lineups").select("id, name, formation, updated_at").eq("guild_id", guildId).order("updated_at", { ascending: false }).limit(1);
    if (club.team_id) lineupQuery = lineupQuery.eq("team_id", club.team_id as string);
    const { data: lineup } = await lineupQuery.maybeSingle();
    const { data: slots } = lineup
      ? await supabase.from("lineup_slots").select("discord_user_id, position, slot_index, is_substitute").eq("lineup_id", lineup.id).order("slot_index")
      : { data: [] };
    const ids = (slots ?? []).map((s) => s.discord_user_id);
    const { data: profiles } = ids.length
      ? await supabase.from("profiles").select("discord_user_id, discord_username, ea_username").in("discord_user_id", ids)
      : { data: [] };
    const profileOf = new Map((profiles ?? []).map((p) => [p.discord_user_id, p]));

    // Tonight's synced matches
    const { data: rows } = await supabase
      .from("club_matches")
      .select("score_for, score_against, opponent_club_name, created_at, player_stats")
      .eq("guild_id", guildId)
      .eq("club_key", club.key as string)
      .gte("created_at", new Date(Date.now() - SESSION_WINDOW_MS).toISOString())
      .order("created_at", { ascending: true });
    const tonight = new Map<string, { games: number; ratingSum: number; rated: number; goals: number; assists: number }>();
    const record = { wins: 0, draws: 0, losses: 0 };
    for (const r of rows ?? []) {
      const f = num(r.score_for);
      const a = num(r.score_against);
      if (f > a) record.wins++;
      else if (f < a) record.losses++;
      else record.draws++;
      for (const p of (Array.isArray(r.player_stats) ? r.player_stats : []) as PlayerStat[]) {
        const key = String(p.ea_username ?? "").trim().toLowerCase();
        if (!key) continue;
        const t = tonight.get(key) ?? { games: 0, ratingSum: 0, rated: 0, goals: 0, assists: 0 };
        t.games++;
        t.goals += num(p.goals);
        t.assists += num(p.assists);
        if (num(p.rating) > LEAVER_RATING) {
          t.ratingSum += num(p.rating);
          t.rated++;
        }
        tonight.set(key, t);
      }
    }
    const last = rows?.length ? rows[rows.length - 1] : null;

    const players = (slots ?? []).map((s) => {
      const p = profileOf.get(s.discord_user_id);
      const name = (p?.ea_username || p?.discord_username || "Player") as string;
      const t = p?.ea_username ? tonight.get(String(p.ea_username).toLowerCase()) : undefined;
      return {
        position: s.position,
        slot: s.slot_index,
        substitute: s.is_substitute,
        name,
        games: t?.games ?? 0,
        rating: t?.rated ? Math.round((t.ratingSum / t.rated) * 10) / 10 : null,
        goals: t?.goals ?? 0,
        assists: t?.assists ?? 0,
      };
    });

    return json({
      club: { name: club.name, key: club.key },
      branding: { color: Number.isInteger(branding.color) ? branding.color : null, logo_url: branding.logo_url ?? null },
      formation: lineup?.formation ?? null,
      lineup_name: lineup?.name ?? null,
      players,
      session: {
        matches: rows?.length ?? 0,
        ...record,
        last: last ? { score_for: num(last.score_for), score_against: num(last.score_against), opponent: last.opponent_club_name } : null,
      },
      updated_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[stream-overlay]", err);
    return json({ error: "Overlay data is unavailable right now" }, 500);
  }
});
