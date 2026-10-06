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
const VALID_PLAY_AGAIN = ["prefer", "neutral", "avoid"] as const;
const VALID_POSITION_CATEGORIES = ["GK", "DEF", "MID", "ATT"] as const;

// Position category mapping
function getPositionCategory(position: string | null | undefined): "GK" | "DEF" | "MID" | "ATT" {
  if (!position) return "ATT";
  const gk = ['GK'];
  const def = ['CB', 'LB', 'RB', 'LWB', 'RWB', 'SW'];
  const mid = ['CDM', 'CM', 'CAM', 'LM', 'RM', 'LDM', 'RDM', 'LAM', 'RAM'];
  const att = ['ST', 'CF', 'LW', 'RW', 'LS', 'RS', 'LF', 'RF'];
  
  if (gk.includes(position)) return 'GK';
  if (def.includes(position)) return 'DEF';
  if (mid.includes(position)) return 'MID';
  return 'ATT';
}

interface PeerEvaluationRequest {
  guild_id: string;
  evaluator_discord_id: string;
  evaluated_discord_id: string;
  draft_id?: string;
  club_match_id?: string;
  position_played?: string;
  ratings: {
    // GK only - just performance
    performance?: number;        // GK overall performance (1-5)
    // Outfield players - offensive and defensive ability
    offensive_ability?: number;  // Outfield only (1-5)
    defensive_ability?: number;  // Outfield only (1-5)
  };
  // Vibe ratings
  vibe?: {
    enjoyment: number;
    team_energy: number;
    play_again: "prefer" | "neutral" | "avoid";
  };
}

function validateRequest(body: any): string[] {
  const errors: string[] = [];
  
  if (!body.guild_id || !DISCORD_ID_REGEX.test(body.guild_id)) {
    errors.push("guild_id must be a valid Discord ID");
  }
  if (!body.evaluator_discord_id || !DISCORD_ID_REGEX.test(body.evaluator_discord_id)) {
    errors.push("evaluator_discord_id must be a valid Discord ID");
  }
  if (!body.evaluated_discord_id || !DISCORD_ID_REGEX.test(body.evaluated_discord_id)) {
    errors.push("evaluated_discord_id must be a valid Discord ID");
  }
  if (body.draft_id && !UUID_REGEX.test(body.draft_id)) {
    errors.push("draft_id must be a valid UUID");
  }
  if (body.club_match_id && !UUID_REGEX.test(body.club_match_id)) {
    errors.push("club_match_id must be a valid UUID");
  }
  
  // Validate ratings object
  if (!body.ratings || typeof body.ratings !== "object") {
    errors.push("ratings object is required");
  } else {
    const positionCategory = getPositionCategory(body.position_played);
    
    if (positionCategory === "GK") {
      // GK only requires performance rating
      if (body.ratings.performance !== undefined) {
        const val = body.ratings.performance;
        if (typeof val !== "number" || !Number.isInteger(val) || val < 1 || val > 5) {
          errors.push("ratings.performance must be an integer between 1 and 5");
        }
      }
    } else {
      // Outfield players: validate offensive and defensive ability
      if (body.ratings.offensive_ability !== undefined) {
        const val = body.ratings.offensive_ability;
        if (typeof val !== "number" || !Number.isInteger(val) || val < 1 || val > 5) {
          errors.push("ratings.offensive_ability must be an integer between 1 and 5");
        }
      }
      if (body.ratings.defensive_ability !== undefined) {
        const val = body.ratings.defensive_ability;
        if (typeof val !== "number" || !Number.isInteger(val) || val < 1 || val > 5) {
          errors.push("ratings.defensive_ability must be an integer between 1 and 5");
        }
      }
    }
  }

  // Validate vibe object (optional)
  if (body.vibe) {
    if (typeof body.vibe.enjoyment !== "number" || body.vibe.enjoyment < 1 || body.vibe.enjoyment > 5) {
      errors.push("vibe.enjoyment must be an integer between 1 and 5");
    }
    if (typeof body.vibe.team_energy !== "number" || body.vibe.team_energy < 1 || body.vibe.team_energy > 5) {
      errors.push("vibe.team_energy must be an integer between 1 and 5");
    }
    if (!VALID_PLAY_AGAIN.includes(body.vibe.play_again)) {
      errors.push("vibe.play_again must be 'prefer', 'neutral', or 'avoid'");
    }
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
      console.log(`[peer-eval] Validation failed: ${errors.join("; ")}`);
      return new Response(
        JSON.stringify({ error: "Validation failed", details: errors }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { 
      guild_id, 
      evaluator_discord_id, 
      evaluated_discord_id, 
      draft_id, 
      club_match_id,
      position_played,
      ratings,
      vibe 
    }: PeerEvaluationRequest = body;

    const positionCategory = getPositionCategory(position_played);
    console.log(`[peer-eval] ${evaluator_discord_id} evaluating ${evaluated_discord_id} (${positionCategory})${vibe ? ' with vibe' : ''}`);

    // Can't evaluate yourself
    if (evaluator_discord_id === evaluated_discord_id) {
      return new Response(
        JSON.stringify({ error: "Cannot evaluate yourself" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if there's a valid (non-expired) feedback request for this match
    if (club_match_id) {
      const { data: feedbackRequest } = await supabase
        .from("dm_feedback_requests")
        .select("expires_at, status")
        .eq("club_match_id", club_match_id)
        .eq("evaluator_discord_id", evaluator_discord_id)
        .maybeSingle();
      
      if (feedbackRequest) {
        const expiresAt = new Date(feedbackRequest.expires_at);
        if (expiresAt < new Date()) {
          console.log(`[peer-eval] Feedback expired for match ${club_match_id}`);
          return new Response(
            JSON.stringify({ error: "Feedback window has expired (30 minutes)" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }
    }

    // Get evaluator's trust score
    const { data: trustData } = await supabase
      .from("evaluator_trust_scores")
      .select("trust_score")
      .eq("guild_id", guild_id)
      .eq("discord_user_id", evaluator_discord_id)
      .maybeSingle();

    const trustScore = trustData?.trust_score ?? 1.0;

    // Calculate overall score based on position-specific ratings
    let ratingSum = 0;
    let ratingCount = 0;
    
    if (positionCategory === "GK") {
      // GK: just performance
      if (ratings.performance) {
        ratingSum += ratings.performance;
        ratingCount += 1;
      }
    } else {
      // Outfield: offensive and defensive ability
      if (ratings.offensive_ability) {
        ratingSum += ratings.offensive_ability;
        ratingCount += 1;
      }
      if (ratings.defensive_ability) {
        ratingSum += ratings.defensive_ability;
        ratingCount += 1;
      }
    }
    
    const overallScore = ratingCount > 0 ? ratingSum / ratingCount : 3; // Default to 3 if no ratings
    const trustWeightedScore = overallScore * trustScore;

    // Insert evaluation with simplified position-specific data
    const evaluationData: any = {
      guild_id,
      evaluator_discord_id,
      evaluated_discord_id,
      draft_id,
      club_match_id,
      position_played,
      // Store ratings in existing columns - map new fields to old columns
      technical_skill: positionCategory === "GK" ? ratings.performance : null,
      goal_scoring: ratings.offensive_ability || null,
      defensive_skill: ratings.defensive_ability || null,
      overall_score: overallScore,
      trust_weighted_score: trustWeightedScore,
    };

    // Add vibe ratings if provided
    if (vibe) {
      evaluationData.enjoyment = vibe.enjoyment;
      evaluationData.team_energy = vibe.team_energy;
      evaluationData.play_again = vibe.play_again;
    }

    const { error: insertError } = await supabase
      .from("peer_evaluations")
      .insert(evaluationData);

    if (insertError) {
      console.error("[peer-eval] Error inserting:", insertError);
      throw insertError;
    }

    // Update evaluator's trust score
    await supabase
      .from("evaluator_trust_scores")
      .upsert({
        guild_id,
        discord_user_id: evaluator_discord_id,
        evaluations_given: (trustData ? 1 : 1),
        trust_score: Math.min(2.0, (trustScore || 1.0) + 0.01),
      }, { onConflict: "guild_id,discord_user_id" });

    // Update the feedback request if this was from a draft
    if (draft_id) {
      const { data: feedbackRequest } = await supabase
        .from("dm_feedback_requests")
        .select("*")
        .eq("draft_id", draft_id)
        .eq("evaluator_discord_id", evaluator_discord_id)
        .maybeSingle();

      if (feedbackRequest) {
        const remaining = feedbackRequest.teammates_to_evaluate.filter(
          (id: string) => id !== evaluated_discord_id
        );

        await supabase
          .from("dm_feedback_requests")
          .update({
            teammates_to_evaluate: remaining,
            status: remaining.length === 0 ? "completed" : "pending",
            completed_at: remaining.length === 0 ? new Date().toISOString() : null,
          })
          .eq("id", feedbackRequest.id);
      }
    }

    // Trigger rating recalculation for the evaluated player
    await recalculatePeerRating(supabase, guild_id, evaluated_discord_id);

    // Update vibe chemistry if vibe data was provided
    if (vibe) {
      await updateVibeChemistry(supabase, guild_id, evaluator_discord_id, evaluated_discord_id, vibe);
    }

    console.log(`[peer-eval] Evaluation recorded successfully for ${positionCategory}`);

    return new Response(
      JSON.stringify({
        success: true,
        message: "Evaluation submitted",
        overall_score: overallScore,
        position_category: positionCategory,
        vibe_recorded: !!vibe,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[peer-eval] Error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function recalculatePeerRating(supabase: any, guildId: string, playerId: string) {
  // Get all evaluations for this player
  const { data: evaluations } = await supabase
    .from("peer_evaluations")
    .select("trust_weighted_score")
    .eq("guild_id", guildId)
    .eq("evaluated_discord_id", playerId);

  if (!evaluations || evaluations.length === 0) return;

  // Calculate weighted average
  const totalWeighted = evaluations.reduce((sum: number, e: any) => sum + e.trust_weighted_score, 0);
  const avgPeerRating = totalWeighted / evaluations.length;

  // Convert 1-5 scale to 0-100 scale
  const peerRating100 = ((avgPeerRating - 1) / 4) * 100;

  // Update player's peer rating
  await supabase
    .from("player_ratings")
    .update({ peer_rating: peerRating100 })
    .eq("guild_id", guildId)
    .eq("discord_user_id", playerId);

  console.log(`[peer-eval] Updated peer rating for ${playerId}: ${peerRating100.toFixed(1)}`);
}

async function updateVibeChemistry(
  supabase: any, 
  guildId: string, 
  evaluatorId: string, 
  evaluatedId: string,
  vibe: { enjoyment: number; team_energy: number; play_again: string }
) {
  // Ensure consistent ordering of player IDs for bidirectional chemistry
  const [playerA, playerB] = [evaluatorId, evaluatedId].sort();

  // Get existing chemistry record
  const { data: existing } = await supabase
    .from("player_vibe_chemistry")
    .select("*")
    .eq("guild_id", guildId)
    .eq("player_a_discord_id", playerA)
    .eq("player_b_discord_id", playerB)
    .maybeSingle();

  // Calculate new averages
  const currentGames = existing?.games_together || 0;
  const newGames = currentGames + 1;

  const avgEnjoyment = existing?.avg_enjoyment 
    ? ((existing.avg_enjoyment * currentGames) + vibe.enjoyment) / newGames
    : vibe.enjoyment;

  const avgTeamEnergy = existing?.avg_team_energy
    ? ((existing.avg_team_energy * currentGames) + vibe.team_energy) / newGames
    : vibe.team_energy;

  // Update play_again counts
  const preferCount = (existing?.prefer_count || 0) + (vibe.play_again === "prefer" ? 1 : 0);
  const neutralCount = (existing?.neutral_count || 0) + (vibe.play_again === "neutral" ? 1 : 0);
  const avoidCount = (existing?.avoid_count || 0) + (vibe.play_again === "avoid" ? 1 : 0);

  // Calculate vibe score (0-100)
  const baseScore = ((avgEnjoyment + avgTeamEnergy) / 2) * 20;
  const playAgainModifier = (preferCount * 10 - avoidCount * 15) / Math.max(1, newGames);
  const vibeScore = Math.max(0, Math.min(100, baseScore + playAgainModifier));

  // Determine vibe status
  let vibeStatus = "neutral";
  if (vibeScore >= 80) vibeStatus = "great";
  else if (vibeScore >= 60) vibeStatus = "good";
  else if (vibeScore < 40 || avoidCount >= 2) vibeStatus = "avoid";

  // Upsert chemistry record
  await supabase
    .from("player_vibe_chemistry")
    .upsert({
      guild_id: guildId,
      player_a_discord_id: playerA,
      player_b_discord_id: playerB,
      games_together: newGames,
      avg_enjoyment: avgEnjoyment,
      avg_team_energy: avgTeamEnergy,
      prefer_count: preferCount,
      neutral_count: neutralCount,
      avoid_count: avoidCount,
      vibe_score: vibeScore,
      vibe_status: vibeStatus,
      last_played_together: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: "guild_id,player_a_discord_id,player_b_discord_id" });

  console.log(`[peer-eval] Updated vibe chemistry for ${playerA} <-> ${playerB}: ${vibeScore.toFixed(1)} (${vibeStatus})`);

  // Update player vibe scores in player_summary
  await updatePlayerVibeScore(supabase, guildId, evaluatedId);
}

async function updatePlayerVibeScore(supabase: any, guildId: string, playerId: string) {
  // Get all vibe chemistry records involving this player
  const { data: chemistryRecords } = await supabase
    .from("player_vibe_chemistry")
    .select("vibe_score, games_together")
    .eq("guild_id", guildId)
    .or(`player_a_discord_id.eq.${playerId},player_b_discord_id.eq.${playerId}`);

  if (!chemistryRecords || chemistryRecords.length === 0) return;

  // Calculate weighted average vibe score based on games together
  let totalWeightedScore = 0;
  let totalGames = 0;

  for (const record of chemistryRecords) {
    if (record.vibe_score != null) {
      totalWeightedScore += record.vibe_score * record.games_together;
      totalGames += record.games_together;
    }
  }

  const avgVibeScore = totalGames > 0 ? totalWeightedScore / totalGames : null;

  // Update player_summary
  if (avgVibeScore != null) {
    await supabase
      .from("player_summary")
      .update({ vibe_score: avgVibeScore })
      .eq("guild_id", guildId)
      .eq("discord_user_id", playerId);

    console.log(`[peer-eval] Updated vibe score for ${playerId}: ${avgVibeScore.toFixed(1)}`);
  }
}
