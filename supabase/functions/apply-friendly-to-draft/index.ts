import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
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

interface PlayerStatFromMatch {
  playername?: string;
  ea_username?: string;
  discord_user_id?: string;
  goals?: number;
  assists?: number;
  rating?: number;
  position?: string;
  saves?: number;
  tackles?: number;
  passes?: number;
  passAttempts?: number;
  shots?: number;
  motm?: boolean;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

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
      .single();

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
    const allDraftPlayers = [
      ...(draft.team_a_player_ids || []),
      ...(draft.team_b_player_ids || []),
      draft.captain_a_discord_id,
      draft.captain_b_discord_id,
    ].filter(Boolean);

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

    // Calculate time window: 2 hours after draft completion
    const completedAt = new Date(draft.completed_at);
    const windowEnd = new Date(completedAt.getTime() + 2 * 60 * 60 * 1000); // +2 hours

    if (action === "list") {
      // Fetch friendly matches in the time window
      const { data: friendlyMatches, error: matchError } = await supabase
        .from("club_matches")
        .select("*")
        .eq("guild_id", guild_id)
        .eq("match_type", "friendly")
        .gte("created_at", completedAt.toISOString())
        .lte("created_at", windowEnd.toISOString())
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

      const linkedMatchIds = new Set((linkedResults || []).map((r) => r.ea_match_id));

      // Filter and score matches
      const matchingFriendlies: MatchingFriendly[] = [];

      for (const match of friendlyMatches || []) {
        // Skip already linked matches
        if (linkedMatchIds.has(match.ea_match_id)) continue;

        // Parse player_stats to find matching players
        const playerStats = match.player_stats || [];
        const matchPlayerEaUsernames = playerStats
          .map((p: { playername?: string; ea_username?: string }) => 
            (p.playername || p.ea_username || "").toLowerCase()
          )
          .filter(Boolean);

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
            played_at: match.created_at,
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
      const matchTime = new Date(friendlyMatch.created_at);
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
        .single();

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

      // Update draft_results with ea_match_id
      const { error: updateError } = await supabase
        .from("draft_results")
        .update({ ea_match_id })
        .eq("draft_id", draft_id);

      if (updateError) {
        console.error("Error updating draft_results:", updateError);
        return new Response(
          JSON.stringify({ success: false, error: "Failed to link match to draft" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Extract player stats and update player_stats records
      const playerStats: PlayerStatFromMatch[] = friendlyMatch.player_stats || [];
      const statsApplied: Array<{
        discord_user_id: string;
        ea_username: string;
        goals: number;
        assists: number;
        rating: number;
        position: string;
      }> = [];

      for (const pStat of playerStats) {
        const eaUsername = (pStat.playername || pStat.ea_username || "").toLowerCase();
        const discordUserId = eaToDiscordMap.get(eaUsername);

        if (!discordUserId) continue;

        // Check if player is in this draft
        if (!allDraftPlayers.includes(discordUserId)) continue;

        // Check if player_stats record exists for this draft
        const { data: existingStat } = await supabase
          .from("player_stats")
          .select("id")
          .eq("guild_id", guild_id)
          .eq("discord_user_id", discordUserId)
          .eq("draft_id", draft_id)
          .maybeSingle();

        const statData = {
          guild_id,
          discord_user_id: discordUserId,
          draft_id,
          ea_match_id,
          match_type: "draft",
          goals: parseInt(pStat.goals?.toString() || "0"),
          assists: parseInt(pStat.assists?.toString() || "0"),
          ea_match_rating: parseFloat(pStat.rating?.toString() || "0"),
          position_played: pStat.position || null,
          saves: parseInt(pStat.saves?.toString() || "0"),
          tackles: parseInt(pStat.tackles?.toString() || "0"),
          passes: parseInt(pStat.passes?.toString() || "0"),
          pass_attempts: parseInt(pStat.passAttempts?.toString() || "0"),
          shots: parseInt(pStat.shots?.toString() || "0"),
          man_of_match: pStat.motm || false,
          won: friendlyMatch.result === "win",
          clean_sheet: pStat.position === "GK" && (friendlyMatch.score_against || 0) === 0,
        };

        if (existingStat) {
          // Update existing record with EA stats
          await supabase
            .from("player_stats")
            .update(statData)
            .eq("id", existingStat.id);
        } else {
          // Insert new record
          await supabase.from("player_stats").insert(statData);
        }

        statsApplied.push({
          discord_user_id: discordUserId,
          ea_username: eaUsername,
          goals: statData.goals,
          assists: statData.assists,
          rating: statData.ea_match_rating,
          position: statData.position_played || "?",
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
