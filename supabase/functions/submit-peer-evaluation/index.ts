import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Validation helpers
const DISCORD_ID_REGEX = /^\d{17,19}$/;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface PeerEvaluationRequest {
  guild_id: string;
  evaluator_discord_id: string;
  evaluated_discord_id: string;
  draft_id?: string;
  ratings: {
    technical_skill: number;
    game_iq: number;
    work_ethic: number;
    communication: number;
    consistency: number;
    clutch_factor: number;
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
  
  // Validate ratings object
  if (!body.ratings || typeof body.ratings !== "object") {
    errors.push("ratings object is required");
  } else {
    const requiredRatings = ["technical_skill", "game_iq", "work_ethic", "communication", "consistency", "clutch_factor"];
    for (const field of requiredRatings) {
      const value = body.ratings[field];
      if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 5) {
        errors.push(`ratings.${field} must be an integer between 1 and 5`);
      }
    }
  }
  
  return errors;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

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

    const { guild_id, evaluator_discord_id, evaluated_discord_id, draft_id, ratings }: PeerEvaluationRequest = body;

    console.log(`[peer-eval] ${evaluator_discord_id} evaluating ${evaluated_discord_id}`);

    // Can't evaluate yourself
    if (evaluator_discord_id === evaluated_discord_id) {
      return new Response(
        JSON.stringify({ error: "Cannot evaluate yourself" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get evaluator's trust score
    const { data: trustData } = await supabase
      .from("evaluator_trust_scores")
      .select("trust_score")
      .eq("guild_id", guild_id)
      .eq("discord_user_id", evaluator_discord_id)
      .maybeSingle();

    const trustScore = trustData?.trust_score ?? 1.0;

    // Calculate overall score (average of all ratings)
    const ratingValues = Object.values(ratings);
    const overallScore = ratingValues.reduce((a, b) => a + b, 0) / ratingValues.length;
    const trustWeightedScore = overallScore * trustScore;

    // Insert evaluation
    const { error: insertError } = await supabase
      .from("peer_evaluations")
      .insert({
        guild_id,
        evaluator_discord_id,
        evaluated_discord_id,
        draft_id,
        technical_skill: ratings.technical_skill,
        game_iq: ratings.game_iq,
        work_ethic: ratings.work_ethic,
        communication: ratings.communication,
        consistency: ratings.consistency,
        clutch_factor: ratings.clutch_factor,
        overall_score: overallScore,
        trust_weighted_score: trustWeightedScore,
      });

    if (insertError) {
      console.error("[peer-eval] Error inserting:", insertError);
      throw insertError;
    }

    // Update evaluator's trust score (more evaluations = more trusted, up to a point)
    await supabase
      .from("evaluator_trust_scores")
      .upsert({
        guild_id,
        discord_user_id: evaluator_discord_id,
        evaluations_given: (trustData ? 1 : 1),
        trust_score: Math.min(2.0, (trustScore || 1.0) + 0.01),
      }, { onConflict: "guild_id,discord_user_id" });

    // Update the feedback request if this was from a DM
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

    console.log(`[peer-eval] Evaluation recorded successfully`);

    return new Response(
      JSON.stringify({
        success: true,
        message: "Evaluation submitted",
        overall_score: overallScore,
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
