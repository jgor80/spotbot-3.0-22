import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { rejectUnlessCaller } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Validation helpers
const DISCORD_ID_REGEX = /^\d{17,19}$/;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface DraftResultRequest {
  draft_id: string;
  reporter_discord_id: string;
  team_a_score: number;
  team_b_score: number;
}

function validateRequest(body: any): string[] {
  const errors: string[] = [];
  
  if (!body.draft_id || !UUID_REGEX.test(body.draft_id)) {
    errors.push("draft_id must be a valid UUID");
  }
  if (!body.reporter_discord_id || !DISCORD_ID_REGEX.test(body.reporter_discord_id)) {
    errors.push("reporter_discord_id must be a valid Discord ID");
  }
  if (typeof body.team_a_score !== "number" || !Number.isInteger(body.team_a_score) || body.team_a_score < 0 || body.team_a_score > 99) {
    errors.push("team_a_score must be an integer between 0 and 99");
  }
  if (typeof body.team_b_score !== "number" || !Number.isInteger(body.team_b_score) || body.team_b_score < 0 || body.team_b_score > 99) {
    errors.push("team_b_score must be an integer between 0 and 99");
  }
  
  return errors;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // verify_jwt is off for this function: only the bot may call it.
  const denied = await rejectUnlessCaller(req, { botOnly: true });
  if (denied) return denied;

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const body = await req.json();
    
    // Validate input
    const errors = validateRequest(body);
    if (errors.length > 0) {
      console.log(`[draft-result] Validation failed: ${errors.join("; ")}`);
      return new Response(
        JSON.stringify({ error: "Validation failed", details: errors }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { draft_id, reporter_discord_id, team_a_score, team_b_score }: DraftResultRequest = body;

    console.log(`[draft-result] ${reporter_discord_id} reporting ${team_a_score}-${team_b_score} for draft ${draft_id}`);

    // Get draft
    const { data: draft, error: fetchError } = await supabase
      .from("drafts")
      .select("*")
      .eq("id", draft_id)
      .single();

    if (fetchError || !draft) {
      return new Response(
        JSON.stringify({ error: "Draft not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify reporter is a participant
    const allPlayers = [...draft.team_a_player_ids, ...draft.team_b_player_ids];
    if (!allPlayers.includes(reporter_discord_id)) {
      return new Response(
        JSON.stringify({ error: "Only draft participants can report results" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const winningTeam = team_a_score > team_b_score ? "a" : team_a_score < team_b_score ? "b" : "draw";

    // Check for existing result
    const { data: existingResult } = await supabase
      .from("draft_results")
      .select("*")
      .eq("draft_id", draft_id)
      .maybeSingle();

    if (existingResult) {
      // Someone already reported - check if this confirms or disputes
      const sameScore = existingResult.team_a_score === team_a_score && 
                        existingResult.team_b_score === team_b_score;

      if (sameScore) {
        // Confirmation
        const newConfirmedBy = [...new Set([...existingResult.confirmed_by, reporter_discord_id])];
        
        // Check if we have majority (more than half of players)
        const majorityThreshold = Math.ceil(allPlayers.length / 2);
        const isConfirmed = newConfirmedBy.length >= majorityThreshold;

        await supabase
          .from("draft_results")
          .update({
            confirmed_by: newConfirmedBy,
            status: isConfirmed ? "confirmed" : "pending",
            confirmed_at: isConfirmed ? new Date().toISOString() : null,
          })
          .eq("id", existingResult.id);

        if (isConfirmed) {
          console.log(`[draft-result] Result confirmed! Triggering stats recording...`);
          
          // Trigger stats recording
          await recordDraftStats(supabase, draft, team_a_score, team_b_score, winningTeam);
          
          // Trigger DM feedback requests
          await createFeedbackRequests(supabase, draft);
          
          // Trigger achievement check
          await triggerAchievementCheck(supabase, draft.guild_id, [...draft.team_a_player_ids, ...draft.team_b_player_ids]);
          
          // Trigger rating recalculation for all participants
          const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
          const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
          
          fetch(`${supabaseUrl}/functions/v1/calculate-ratings`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${supabaseKey}`,
            },
            body: JSON.stringify({
              guild_id: draft.guild_id,
              player_ids: [...draft.team_a_player_ids, ...draft.team_b_player_ids],
              trigger: "draft_result",
            }),
          }).catch(e => console.error("[draft-result] Rating calculation trigger failed:", e));
          
          console.log(`[draft-result] Rating recalculation triggered for ${[...draft.team_a_player_ids, ...draft.team_b_player_ids].length} players`);
        }

        return new Response(
          JSON.stringify({
            success: true,
            status: isConfirmed ? "confirmed" : "pending",
            confirmations: newConfirmedBy.length,
            needed: majorityThreshold,
            message: isConfirmed ? "Result confirmed!" : `Need ${majorityThreshold - newConfirmedBy.length} more confirmations`,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } else {
        // Dispute
        const newDisputedBy = [...new Set([...existingResult.disputed_by, reporter_discord_id])];

        await supabase
          .from("draft_results")
          .update({
            disputed_by: newDisputedBy,
            status: "disputed",
          })
          .eq("id", existingResult.id);

        return new Response(
          JSON.stringify({
            success: true,
            status: "disputed",
            message: "Result disputed. An admin will need to resolve this.",
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // First report - create the result
    const { data: result, error: insertError } = await supabase
      .from("draft_results")
      .insert({
        draft_id,
        team_a_score,
        team_b_score,
        winning_team: winningTeam,
        reported_by: [reporter_discord_id],
        confirmed_by: [reporter_discord_id],
        status: "pending",
      })
      .select()
      .single();

    if (insertError) {
      console.error("[draft-result] Error creating result:", insertError);
      throw insertError;
    }

    const majorityThreshold = Math.ceil(allPlayers.length / 2);

    return new Response(
      JSON.stringify({
        success: true,
        result_id: result.id,
        status: "pending",
        confirmations: 1,
        needed: majorityThreshold,
        message: `Result reported: ${team_a_score}-${team_b_score}. Need ${majorityThreshold - 1} more confirmations.`,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[draft-result] Error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function recordDraftStats(
  supabase: any, 
  draft: any, 
  teamAScore: number, 
  teamBScore: number, 
  winningTeam: string
) {
  const guildId = draft.guild_id;
  const teamAWon = winningTeam === "a";
  const teamBWon = winningTeam === "b";
  const isDraw = winningTeam === "draw";

  // Record basic stats for all players (detailed stats come from EA API later)
  const statsInserts = [];

  for (const playerId of draft.team_a_player_ids) {
    statsInserts.push({
      guild_id: guildId,
      discord_user_id: playerId,
      draft_id: draft.id,
      match_type: "draft",
      won: teamAWon ? true : teamBWon ? false : null,
      team: "a",
    });
  }

  for (const playerId of draft.team_b_player_ids) {
    statsInserts.push({
      guild_id: guildId,
      discord_user_id: playerId,
      draft_id: draft.id,
      match_type: "draft",
      won: teamBWon ? true : teamAWon ? false : null,
      team: "b",
    });
  }

  await supabase.from("player_stats").insert(statsInserts);

  // Update player ratings and streaks
  const allPlayers = [...draft.team_a_player_ids, ...draft.team_b_player_ids];
  
  for (const playerId of allPlayers) {
    const isTeamA = draft.team_a_player_ids.includes(playerId);
    const won = isTeamA ? teamAWon : teamBWon;
    const lost = isTeamA ? teamBWon : teamAWon;

    // Upsert player rating
    const { data: existingRating } = await supabase
      .from("player_ratings")
      .select("*")
      .eq("guild_id", guildId)
      .eq("discord_user_id", playerId)
      .maybeSingle();

    if (existingRating) {
      await supabase
        .from("player_ratings")
        .update({
          games_played: existingRating.games_played + 1,
          wins: existingRating.wins + (won ? 1 : 0),
          losses: existingRating.losses + (lost ? 1 : 0),
          draws: existingRating.draws + (isDraw ? 1 : 0),
          last_game_at: new Date().toISOString(),
        })
        .eq("id", existingRating.id);
    } else {
      await supabase
        .from("player_ratings")
        .insert({
          guild_id: guildId,
          discord_user_id: playerId,
          games_played: 1,
          wins: won ? 1 : 0,
          losses: lost ? 1 : 0,
          draws: isDraw ? 1 : 0,
          last_game_at: new Date().toISOString(),
        });
    }

    // Update streaks
    await updatePlayerStreak(supabase, guildId, playerId, won, lost, isDraw);
  }

  // Update chemistry for all teammate pairs
  await updateChemistry(supabase, guildId, draft.team_a_player_ids, teamAWon, teamBWon, isDraw);
  await updateChemistry(supabase, guildId, draft.team_b_player_ids, teamBWon, teamAWon, isDraw);

  console.log(`[draft-result] Stats recorded for ${allPlayers.length} players`);
}

async function updatePlayerStreak(
  supabase: any,
  guildId: string,
  playerId: string,
  won: boolean,
  lost: boolean,
  isDraw: boolean,
  scoredGoal: boolean = false,
  keptCleanSheet: boolean = false
) {
  const result = won ? "W" : lost ? "L" : "D";

  const { data: existing } = await supabase
    .from("player_streaks")
    .select("*")
    .eq("guild_id", guildId)
    .eq("discord_user_id", playerId)
    .maybeSingle();

  if (existing) {
    const last5 = [result, ...existing.last_5_results.slice(0, 4)];
    const last10 = [result, ...existing.last_10_results.slice(0, 9)];

    let newWinStreak = won ? existing.current_win_streak + 1 : 0;
    let newLossStreak = lost ? existing.current_loss_streak + 1 : 0;
    
    // Goal streak tracking
    let newGoalStreak = scoredGoal ? (existing.current_goal_streak || 0) + 1 : 0;
    
    // Clean sheet streak tracking
    let newCleanSheetStreak = keptCleanSheet ? (existing.current_clean_sheet_streak || 0) + 1 : 0;
    
    const longestWin = Math.max(existing.longest_win_streak, newWinStreak);
    const longestLoss = Math.max(existing.longest_loss_streak, newLossStreak);
    const longestGoal = Math.max(existing.longest_goal_streak || 0, newGoalStreak);
    const longestCleanSheet = Math.max(existing.longest_clean_sheet_streak || 0, newCleanSheetStreak);

    // Calculate form rating (W=3, D=1, L=0, out of 15 max for last 5)
    const formPoints = last5.reduce((sum, r) => sum + (r === "W" ? 3 : r === "D" ? 1 : 0), 0);
    const formRating = (formPoints / 15) * 100;

    await supabase
      .from("player_streaks")
      .update({
        current_win_streak: newWinStreak,
        current_loss_streak: newLossStreak,
        current_goal_streak: newGoalStreak,
        current_clean_sheet_streak: newCleanSheetStreak,
        longest_win_streak: longestWin,
        longest_loss_streak: longestLoss,
        longest_goal_streak: longestGoal,
        longest_clean_sheet_streak: longestCleanSheet,
        last_5_results: last5,
        last_10_results: last10,
        form_rating: formRating,
      })
      .eq("id", existing.id);
  } else {
    await supabase
      .from("player_streaks")
      .insert({
        guild_id: guildId,
        discord_user_id: playerId,
        current_win_streak: won ? 1 : 0,
        current_loss_streak: lost ? 1 : 0,
        current_goal_streak: scoredGoal ? 1 : 0,
        current_clean_sheet_streak: keptCleanSheet ? 1 : 0,
        longest_win_streak: won ? 1 : 0,
        longest_loss_streak: lost ? 1 : 0,
        longest_goal_streak: scoredGoal ? 1 : 0,
        longest_clean_sheet_streak: keptCleanSheet ? 1 : 0,
        last_5_results: [result],
        last_10_results: [result],
        form_rating: won ? 100 : lost ? 0 : 33,
      });
  }
}

async function updateChemistry(
  supabase: any,
  guildId: string,
  teamPlayers: string[],
  won: boolean,
  lost: boolean,
  isDraw: boolean
) {
  // Update chemistry for all pairs in the team
  for (let i = 0; i < teamPlayers.length; i++) {
    for (let j = i + 1; j < teamPlayers.length; j++) {
      // Always store with smaller ID first for consistency
      const [playerA, playerB] = [teamPlayers[i], teamPlayers[j]].sort();

      const { data: existing } = await supabase
        .from("player_chemistry")
        .select("*")
        .eq("guild_id", guildId)
        .eq("player_a_discord_id", playerA)
        .eq("player_b_discord_id", playerB)
        .maybeSingle();

      if (existing) {
        const newGames = existing.games_together + 1;
        const newWins = existing.wins_together + (won ? 1 : 0);
        const newLosses = existing.losses_together + (lost ? 1 : 0);
        const newDraws = existing.draws_together + (isDraw ? 1 : 0);
        const winRate = (newWins / newGames) * 100;

        await supabase
          .from("player_chemistry")
          .update({
            games_together: newGames,
            wins_together: newWins,
            losses_together: newLosses,
            draws_together: newDraws,
            win_rate: winRate,
            last_played_together: new Date().toISOString(),
          })
          .eq("id", existing.id);
      } else {
        await supabase
          .from("player_chemistry")
          .insert({
            guild_id: guildId,
            player_a_discord_id: playerA,
            player_b_discord_id: playerB,
            games_together: 1,
            wins_together: won ? 1 : 0,
            losses_together: lost ? 1 : 0,
            draws_together: isDraw ? 1 : 0,
            win_rate: won ? 100 : lost ? 0 : 50,
            last_played_together: new Date().toISOString(),
          });
      }
    }
  }
}

async function createFeedbackRequests(supabase: any, draft: any) {
  // Check if feedback is enabled for this guild
  const { data: guildSettings } = await supabase
    .from("guild_settings")
    .select("feedback_enabled")
    .eq("guild_id", draft.guild_id)
    .single();

  // Skip if feedback is disabled (default to true if no settings exist)
  if (guildSettings && guildSettings.feedback_enabled === false) {
    console.log(`[draft-result] Feedback disabled for guild ${draft.guild_id}, skipping feedback requests`);
    return;
  }

  const allPlayers = [...draft.team_a_player_ids, ...draft.team_b_player_ids];
  // 30 minute window for feedback (consistent with club matches)
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

  const feedbackRequests = allPlayers.map(playerId => {
    const isTeamA = draft.team_a_player_ids.includes(playerId);
    const teammates = (isTeamA ? draft.team_a_player_ids : draft.team_b_player_ids)
      .filter((id: string) => id !== playerId);

    return {
      guild_id: draft.guild_id,
      draft_id: draft.id,
      match_type: "draft",
      evaluator_discord_id: playerId,
      teammates_to_evaluate: teammates,
      expires_at: expiresAt.toISOString(),
    };
  });

  await supabase.from("dm_feedback_requests").insert(feedbackRequests);
  console.log(`[draft-result] Created ${feedbackRequests.length} feedback requests (30 min window)`);
}

async function triggerAchievementCheck(supabase: any, guildId: string, playerIds: string[]) {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    
    await fetch(`${supabaseUrl}/functions/v1/award-achievements`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify({
        guild_id: guildId,
        player_ids: playerIds,
      }),
    });
    console.log(`[draft-result] Triggered achievement check for ${playerIds.length} players`);
  } catch (e) {
    console.error("[draft-result] Failed to trigger achievement check:", e);
  }
}
