import { createAdminClient, identifyCaller } from "../_shared/auth.ts";
import {
  validateDiscordId,
  validateUUID,
  validateEnum,
  collectErrors,
  formatValidationErrors,
} from "../_shared/validation.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface ListRequest {
  guild_id: string;
  draft_id: string;
  action: "list";
}

interface ApplyRequest {
  guild_id: string;
  draft_id: string;
  ea_match_id: string;
  action: "apply";
  requester_discord_id?: string;
}

type RequestBody = ListRequest | ApplyRequest;

interface MatchingFriendly {
  ea_match_id: string;
  result: string;
  score_for: number;
  score_against: number;
  played_at: string;
  player_count: number;
  matching_players: number;
  match_percentage: number;
  opponent_club_name: string | null;
}

// One player's line from a match, from either side, in our player_stats column names
interface MatchPlayerLine {
  ea_username: string;
  side_won: boolean | null;
  side_conceded: number;
  stats: Record<string, number | boolean | string | null>;
}

const WINDOW_MS = 2 * 60 * 60 * 1000;

function toInt(v: unknown): number {
  const n = parseInt(String(v ?? "0"), 10);
  return Number.isFinite(n) ? n : 0;
}

function toFloat(v: unknown): number {
  const n = parseFloat(String(v ?? "0"));
  return Number.isFinite(n) ? n : 0;
}

// When the match was played: EA's timestamp (epoch seconds) if stored, else when we synced it
function playedAt(match: { created_at: string; match_data?: any }): Date {
  const ts = Number(match.match_data?.timestamp);
  if (Number.isFinite(ts) && ts > 1e9) return new Date(ts < 1e12 ? ts * 1000 : ts);
  return new Date(match.created_at);
}

function isGoalkeeper(pos: unknown): boolean {
  return /^(gk|goalkeeper)$/i.test(String(pos ?? ""));
}

// Accepts raw EA player rows (match_data.players) and our stored player_stats rows
function statsFromRow(p: any) {
  return {
    goals: toInt(p.goals),
    assists: toInt(p.assists),
    ea_match_rating: toFloat(p.rating),
    position_played: p.pos ?? p.position ?? null,
    shots: toInt(p.shots),
    tackles: toInt(p.tacklesmade ?? p.tackles),
    tackle_attempts: toInt(p.tackleattempts ?? p.tackle_attempts),
    passes_made: toInt(p.passesmade ?? p.passes_made),
    pass_attempts: toInt(p.passattempts ?? p.pass_attempts),
    interceptions: toInt(p.interceptions),
    clearances: toInt(p.clearances),
    possession: toFloat(p.possession),
    dribbles: toInt(p.dribbles),
    dribble_attempts: toInt(p.dribble_attempts),
    fouls: toInt(p.fouls ?? p.foulscommited),
    offsides: toInt(p.offsides),
    red_cards: toInt(p.redcards ?? p.red_cards) > 0 || p.red_cards === true,
    man_of_match: p.mom === "1" || p.mom === 1 || p.motm === true,
  };
}

// Players from both clubs when the raw match is stored (a draft is often our club vs. a second club),
// otherwise just our club's stored player_stats
function matchPlayerLines(match: any): MatchPlayerLine[] {
  const lines: MatchPlayerLine[] = [];
  const clubs = match.match_data?.clubs;
  const players = match.match_data?.players;
  if (clubs && players && typeof players === "object") {
    const clubIds = Object.keys(players);
    for (const clubId of clubIds) {
      const goalsFor = toInt(clubs[clubId]?.goals);
      const otherId = Object.keys(clubs).find((id) => id !== clubId);
      const goalsAgainst = otherId ? toInt(clubs[otherId]?.goals) : 0;
      for (const p of Object.values(players[clubId] || {}) as any[]) {
        const name = String(p.playername || p.name || "").trim();
        if (!name) continue;
        lines.push({
          ea_username: name.toLowerCase(),
          side_won: goalsFor === goalsAgainst ? null : goalsFor > goalsAgainst,
          side_conceded: goalsAgainst,
          stats: statsFromRow(p),
        });
      }
    }
    if (lines.length) return lines;
  }
  const won = match.result === "win" ? true : match.result === "loss" ? false : null;
  for (const p of (match.player_stats || []) as any[]) {
    const name = String(p.ea_username || p.playername || "").trim();
    if (!name) continue;
    lines.push({
      ea_username: name.toLowerCase(),
      side_won: won,
      side_conceded: toInt(match.score_against),
      stats: statsFromRow(p),
    });
  }
  return lines;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createAdminClient();

    if (!(await identifyCaller(req, supabase))) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body: RequestBody = await req.json();
    const { guild_id, draft_id, action } = body;

    // Validate common fields
    const errors = collectErrors([
      validateDiscordId(guild_id, "guild_id"),
      validateUUID(draft_id, "draft_id"),
      validateEnum(action, "action", ["list", "apply"] as const),
    ]);

    if (errors.length > 0) {
      return new Response(
        JSON.stringify({ success: false, error: formatValidationErrors(errors) }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch draft details
    const { data: draft, error: draftError } = await supabase
      .from("drafts")
      .select(`
        id,
        guild_id,
        status,
        completed_at,
        team_a_player_ids,
        team_b_player_ids,
        captain_a_discord_id,
        captain_b_discord_id
      `)
      .eq("id", draft_id)
      .eq("guild_id", guild_id)
      .single();

    if (draftError || !draft) {
      return new Response(
        JSON.stringify({ success: false, error: "Draft not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (draft.status !== "completed") {
      return new Response(
        JSON.stringify({ success: false, error: "Draft must be completed to apply friendly stats" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get draft result to check if EA match already linked
    const { data: draftResult } = await supabase
      .from("draft_results")
      .select("id, ea_match_id, team_a_score, team_b_score")
      .eq("draft_id", draft_id)
      .maybeSingle();

    if (draftResult?.ea_match_id) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "This draft already has an EA match linked",
          linked_match_id: draftResult.ea_match_id
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get all draft players
    const teamA = new Set<string>([...(draft.team_a_player_ids || []), draft.captain_a_discord_id].filter(Boolean));
    const teamB = new Set<string>([...(draft.team_b_player_ids || []), draft.captain_b_discord_id].filter(Boolean));
    const allDraftPlayers = Array.from(new Set([...teamA, ...teamB]));

    // Get profiles for draft players to match EA usernames
    const { data: profiles } = await supabase
      .from("profiles")
      .select("discord_user_id, ea_username")
      .in("discord_user_id", allDraftPlayers)
      .not("ea_username", "is", null);

    const discordToEaMap = new Map<string, string>();
    const eaToDiscordMap = new Map<string, string>();
    
    for (const p of profiles || []) {
      if (p.ea_username) {
        discordToEaMap.set(p.discord_user_id, p.ea_username.toLowerCase());
        eaToDiscordMap.set(p.ea_username.toLowerCase(), p.discord_user_id);
      }
    }

    // Matches played within 2 hours of draft completion count
    const completedAt = new Date(draft.completed_at);
    const windowEnd = new Date(completedAt.getTime() + WINDOW_MS);

    if (action === "list") {
      // Fetch friendly matches in the time window
      const { data: friendlyMatches, error: matchError } = await supabase
        .from("club_matches")
        .select("*")
        .eq("guild_id", guild_id)
        .eq("match_type", "friendly")
        // Syncs can lag behind play, so fetch matches synced up to a day later and filter on play time
        .gte("created_at", completedAt.toISOString())
        .lte("created_at", new Date(windowEnd.getTime() + 22 * 60 * 60 * 1000).toISOString())
        .order("created_at", { ascending: false });

      if (matchError) {
        console.error("Error fetching friendly matches:", matchError);
        return new Response(
          JSON.stringify({ success: false, error: "Failed to fetch friendly matches" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Get already-linked ea_match_ids
      const { data: linkedResults } = await supabase
        .from("draft_results")
        .select("ea_match_id")
        .not("ea_match_id", "is", null);

      const linkedMatchIds = new Set((linkedResults || []).map((r: any) => r.ea_match_id));

      // Filter and score matches
      const matchingFriendlies: MatchingFriendly[] = [];

      for (const match of friendlyMatches || []) {
        // Skip already linked matches and ones played outside the window
        if (linkedMatchIds.has(match.ea_match_id)) continue;
        const played = playedAt(match);
        if (played < completedAt || played > windowEnd) continue;

        const matchPlayerEaUsernames = Array.from(new Set(matchPlayerLines(match).map((l) => l.ea_username)));

        // Count how many draft players are in this match
        let matchingPlayers = 0;
        for (const eaUsername of matchPlayerEaUsernames) {
          if (eaToDiscordMap.has(eaUsername)) {
            matchingPlayers++;
          }
        }

        const matchPercentage = allDraftPlayers.length > 0 
          ? Math.round((matchingPlayers / allDraftPlayers.length) * 100)
          : 0;

        // Only include if at least 50% of draft players match
        if (matchPercentage >= 50) {
          matchingFriendlies.push({
            ea_match_id: match.ea_match_id,
            result: match.result || "unknown",
            score_for: match.score_for || 0,
            score_against: match.score_against || 0,
            played_at: played.toISOString(),
            player_count: matchPlayerEaUsernames.length,
            matching_players: matchingPlayers,
            match_percentage: matchPercentage,
            opponent_club_name: match.opponent_club_name,
          });
        }
      }

      // Sort by match percentage (desc), then by time (asc - closest to draft completion)
      matchingFriendlies.sort((a, b) => {
        if (b.match_percentage !== a.match_percentage) {
          return b.match_percentage - a.match_percentage;
        }
        return new Date(a.played_at).getTime() - new Date(b.played_at).getTime();
      });

      return new Response(
        JSON.stringify({
          success: true,
          draft: {
            id: draft.id,
            completed_at: draft.completed_at,
            team_a_score: draftResult?.team_a_score,
            team_b_score: draftResult?.team_b_score,
            all_players: allDraftPlayers,
          },
          matching_friendlies: matchingFriendlies,
          window: {
            start: completedAt.toISOString(),
            end: windowEnd.toISOString(),
          },
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // APPLY action
    if (action === "apply") {
      const { ea_match_id } = body as ApplyRequest;

      if (!ea_match_id) {
        return new Response(
          JSON.stringify({ success: false, error: "ea_match_id is required for apply action" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Fetch the specific friendly match
      const { data: friendlyMatch, error: matchError } = await supabase
        .from("club_matches")
        .select("*")
        .eq("guild_id", guild_id)
        .eq("ea_match_id", ea_match_id)
        .eq("match_type", "friendly")
        .single();

      if (matchError || !friendlyMatch) {
        return new Response(
          JSON.stringify({ success: false, error: "Friendly match not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Validate time window
      const matchTime = playedAt(friendlyMatch);
      if (matchTime < completedAt || matchTime > windowEnd) {
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: "Match is outside the 2-hour window after draft completion" 
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Check if this match is already linked to another draft
      const { data: existingLink } = await supabase
        .from("draft_results")
        .select("draft_id")
        .eq("ea_match_id", ea_match_id)
        .limit(1)
        .maybeSingle();

      if (existingLink) {
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: "This match is already linked to another draft",
            linked_draft_id: existingLink.draft_id
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Work out each draft player's line in the match
      const lines = matchPlayerLines(friendlyMatch);
      const linesForDraft = lines
        .map((line) => ({ line, discordUserId: eaToDiscordMap.get(line.ea_username) }))
        .filter((x): x is { line: MatchPlayerLine; discordUserId: string } =>
          !!x.discordUserId && allDraftPlayers.includes(x.discordUserId));

      // Record the link. If nobody reported a score yet, record EA's score for the draft teams.
      if (draftResult) {
        const { error: updateError } = await supabase
          .from("draft_results")
          .update({ ea_match_id })
          .eq("id", draftResult.id);
        if (updateError) {
          console.error("Error updating draft_results:", updateError);
          return new Response(
            JSON.stringify({ success: false, error: "Failed to link match to draft" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      } else {
        // Team A's score is the score of the side most team A players were on
        const sideOf = (team: Set<string>) => {
          const won = linesForDraft.filter((x) => team.has(x.discordUserId)).map((x) => x.line.side_won);
          const wins = won.filter((w) => w === true).length;
          const losses = won.filter((w) => w === false).length;
          return wins > losses ? "won" : losses > wins ? "lost" : "unknown";
        };
        const teamASide = sideOf(teamA);
        const scoreFor = toInt(friendlyMatch.score_for);
        const scoreAgainst = toInt(friendlyMatch.score_against);
        const ourSideWon = scoreFor > scoreAgainst;
        // Our club's score belongs to team A when team A's result matches ours
        const teamAIsOurs = teamASide === "unknown" ? true : (teamASide === "won") === ourSideWon;
        const teamAScore = teamAIsOurs ? scoreFor : scoreAgainst;
        const teamBScore = teamAIsOurs ? scoreAgainst : scoreFor;
        const { error: insertError } = await supabase.from("draft_results").insert({
          draft_id,
          ea_match_id,
          team_a_score: teamAScore,
          team_b_score: teamBScore,
          winning_team: teamAScore === teamBScore ? "draw" : teamAScore > teamBScore ? "a" : "b",
          status: "confirmed",
          confirmed_at: new Date().toISOString(),
        });
        if (insertError) {
          console.error("Error creating draft_results:", insertError);
          return new Response(
            JSON.stringify({ success: false, error: "Failed to link match to draft" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }

      const statsApplied: Array<{
        discord_user_id: string;
        ea_username: string;
        goals: number;
        assists: number;
        rating: number;
        position: string;
      }> = [];
      const failed: string[] = [];

      for (const { line, discordUserId } of linesForDraft) {
        const { data: existingStat } = await supabase
          .from("player_stats")
          .select("id")
          .eq("guild_id", guild_id)
          .eq("discord_user_id", discordUserId)
          .eq("draft_id", draft_id)
          .limit(1)
          .maybeSingle();

        const statData = {
          guild_id,
          discord_user_id: discordUserId,
          draft_id,
          ea_match_id,
          match_type: "draft",
          team: teamA.has(discordUserId) ? "a" : teamB.has(discordUserId) ? "b" : null,
          ...line.stats,
          won: line.side_won,
          clean_sheet: isGoalkeeper(line.stats.position_played) && line.side_conceded === 0,
        };

        const { error: writeError } = existingStat
          ? await supabase.from("player_stats").update(statData).eq("id", existingStat.id)
          : await supabase.from("player_stats").insert(statData);
        if (writeError) {
          console.error(`Error saving stats for ${discordUserId}:`, writeError);
          failed.push(discordUserId);
          continue;
        }

        statsApplied.push({
          discord_user_id: discordUserId,
          ea_username: line.ea_username,
          goals: Number(line.stats.goals) || 0,
          assists: Number(line.stats.assists) || 0,
          rating: Number(line.stats.ea_match_rating) || 0,
          position: String(line.stats.position_played || "?"),
        });

        // Trigger rating recalculation for this player
        try {
          await fetch(`${supabaseUrl}/functions/v1/calculate-ratings`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${supabaseKey}`,
            },
            body: JSON.stringify({
              guild_id,
              discord_user_id: discordUserId,
            }),
          });
        } catch (calcError) {
          console.error("Error triggering rating calculation:", calcError);
        }
      }

      return new Response(
        JSON.stringify({
          success: true,
          draft_id,
          ea_match_id,
          match_result: friendlyMatch.result,
          match_score: `${friendlyMatch.score_for}-${friendlyMatch.score_against}`,
          players_updated: statsApplied.length,
          players_failed: failed.length,
          stats_applied: statsApplied,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: false, error: "Invalid action" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Error in apply-friendly-to-draft:", message);
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
