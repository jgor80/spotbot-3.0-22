import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { rejectUnlessCaller, requireGuildAccess, resolveDiscordActor } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Trust multipliers by role (all players can rate, leadership gets more weight)
const TRUST_MULTIPLIERS: Record<string, number> = {
  owner: 2.0,
  manager: 1.5,
  captain: 1.25,
  moderator: 1.1,
  scout: 1.1,
  player: 1.0,
  default: 0.75,
};

// Position categories
const ATTACKER_POSITIONS = ["ST", "LW", "RW", "CF", "LS", "RS"];
const MIDFIELDER_POSITIONS = ["CM", "CAM", "CDM", "LM", "RM", "LCM", "RCM", "LDM", "RDM", "AM"];
const DEFENDER_POSITIONS = ["CB", "LB", "RB", "LWB", "RWB", "SW", "LCB", "RCB"];
const GK_POSITIONS = ["GK"];

interface ManagerEvaluationRequest {
  guild_id: string;
  evaluator_discord_id: string;
  evaluated_discord_id: string;
  position_played: string;
  draft_id?: string;
  club_match_id?: string;
  
  // Offensive ratings (1-5)
  shooting?: number;
  passing?: number;
  dribbling?: number;
  pace?: number;
  creativity?: number;
  off_ball_movement?: number;
  
  // Defensive ratings (1-5)
  tackling?: number;
  defensive_positioning?: number;
  marking?: number;
  aerial_ability?: number;
  strength?: number;
  defensive_awareness?: number;
  
  // GK ratings (1-5)
  shot_stopping?: number;
  gk_positioning?: number;
  handling?: number;
  distribution?: number;
  command_of_area?: number;
  one_on_ones?: number;
  
  // Overall
  overall_performance: number;
  notes?: string;
}

function getPositionType(position: string): "attacker" | "midfielder" | "defender" | "goalkeeper" {
  const pos = position.toUpperCase();
  if (GK_POSITIONS.includes(pos)) return "goalkeeper";
  if (DEFENDER_POSITIONS.includes(pos)) return "defender";
  if (MIDFIELDER_POSITIONS.includes(pos)) return "midfielder";
  return "attacker";
}

function calculateWeightedScore(data: ManagerEvaluationRequest): number {
  const posType = getPositionType(data.position_played);
  let score = 0;
  
  // Helper to average provided ratings
  const avg = (values: (number | undefined)[]): number => {
    const valid = values.filter(v => v !== undefined && v !== null) as number[];
    return valid.length > 0 ? valid.reduce((a, b) => a + b, 0) / valid.length : 3;
  };
  
  const offensiveRatings = [data.shooting, data.passing, data.dribbling, data.pace, data.creativity, data.off_ball_movement];
  const defensiveRatings = [data.tackling, data.defensive_positioning, data.marking, data.aerial_ability, data.strength, data.defensive_awareness];
  const gkRatings = [data.shot_stopping, data.gk_positioning, data.handling, data.distribution, data.command_of_area, data.one_on_ones];
  
  const offenseAvg = avg(offensiveRatings);
  const defenseAvg = avg(defensiveRatings);
  const gkAvg = avg(gkRatings);
  const overallAvg = data.overall_performance;
  
  switch (posType) {
    case "attacker":
      // 60% offensive, 20% defensive, 20% overall
      score = (offenseAvg * 0.60) + (defenseAvg * 0.20) + (overallAvg * 0.20);
      break;
    case "midfielder":
      // 35% offensive, 35% defensive, 30% overall
      score = (offenseAvg * 0.35) + (defenseAvg * 0.35) + (overallAvg * 0.30);
      break;
    case "defender":
      // 20% offensive, 60% defensive, 20% overall
      score = (offenseAvg * 0.20) + (defenseAvg * 0.60) + (overallAvg * 0.20);
      break;
    case "goalkeeper":
      // 100% GK specific
      score = gkAvg;
      break;
  }
  
  return score;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // verify_jwt is off for this function: only the bot or a signed-in web user may call it.
  const denied = await rejectUnlessCaller(req);
  if (denied) return denied;

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const data: ManagerEvaluationRequest = await req.json();

    // A web user always rates as their own verified Discord account, and only in a server they belong to.
    const actor = await resolveDiscordActor(req, supabase, data.evaluator_discord_id);
    if (actor instanceof Response) return actor;
    data.evaluator_discord_id = actor.discordUserId as string;
    const noAccess = await requireGuildAccess(req, supabase, data.guild_id, "member");
    if (noAccess) return noAccess;
    
    console.log(`[submit-manager-evaluation] Evaluator: ${data.evaluator_discord_id} rating ${data.evaluated_discord_id} at ${data.position_played}`);

    // Validate required fields
    if (!data.guild_id || !data.evaluator_discord_id || !data.evaluated_discord_id || !data.position_played || !data.overall_performance) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: guild_id, evaluator_discord_id, evaluated_discord_id, position_played, overall_performance" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate overall_performance is 1-5
    if (data.overall_performance < 1 || data.overall_performance > 5) {
      return new Response(
        JSON.stringify({ error: "overall_performance must be between 1 and 5" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check evaluator's role (for trust weighting, not rejection - all players can rate)
    const { data: roleData, error: roleError } = await supabase
      .from("user_roles")
      .select("role")
      .eq("guild_id", data.guild_id)
      .eq("discord_user_id", data.evaluator_discord_id);

    if (roleError) {
      console.error("[submit-manager-evaluation] Role check error:", roleError);
    }

    // Determine trust multiplier based on highest role (no rejection)
    let evaluatorRole = "default";
    let trustWeight = TRUST_MULTIPLIERS.default;

    if (roleData && roleData.length > 0) {
      const roles = roleData.map(r => r.role);
      if (roles.includes("owner")) { evaluatorRole = "owner"; trustWeight = TRUST_MULTIPLIERS.owner; }
      else if (roles.includes("manager")) { evaluatorRole = "manager"; trustWeight = TRUST_MULTIPLIERS.manager; }
      else if (roles.includes("captain")) { evaluatorRole = "captain"; trustWeight = TRUST_MULTIPLIERS.captain; }
      else if (roles.includes("moderator")) { evaluatorRole = "moderator"; trustWeight = TRUST_MULTIPLIERS.moderator; }
      else if (roles.includes("scout")) { evaluatorRole = "scout"; trustWeight = TRUST_MULTIPLIERS.scout; }
      else { evaluatorRole = "player"; trustWeight = TRUST_MULTIPLIERS.player; }
    }

    const weightedScore = calculateWeightedScore(data);

    console.log(`[submit-manager-evaluation] Role: ${evaluatorRole}, trust: ${trustWeight}, weighted score: ${weightedScore.toFixed(2)}`);

    // Insert the evaluation
    const { data: evaluation, error: insertError } = await supabase
      .from("manager_evaluations")
      .insert({
        guild_id: data.guild_id,
        evaluator_discord_id: data.evaluator_discord_id,
        evaluated_discord_id: data.evaluated_discord_id,
        position_played: data.position_played.toUpperCase(),
        evaluator_role: evaluatorRole,
        draft_id: data.draft_id || null,
        club_match_id: data.club_match_id || null,
        
        // Offensive
        shooting: data.shooting || null,
        passing: data.passing || null,
        dribbling: data.dribbling || null,
        pace: data.pace || null,
        creativity: data.creativity || null,
        off_ball_movement: data.off_ball_movement || null,
        
        // Defensive
        tackling: data.tackling || null,
        defensive_positioning: data.defensive_positioning || null,
        marking: data.marking || null,
        aerial_ability: data.aerial_ability || null,
        strength: data.strength || null,
        defensive_awareness: data.defensive_awareness || null,
        
        // GK
        shot_stopping: data.shot_stopping || null,
        gk_positioning: data.gk_positioning || null,
        handling: data.handling || null,
        distribution: data.distribution || null,
        command_of_area: data.command_of_area || null,
        one_on_ones: data.one_on_ones || null,
        
        // Overall
        overall_performance: data.overall_performance,
        notes: data.notes || null,
        weighted_score: weightedScore,
        trust_weight: trustWeight,
      })
      .select()
      .single();

    if (insertError) {
      console.error("[submit-manager-evaluation] Insert error:", insertError);
      return new Response(
        JSON.stringify({ error: "Failed to save evaluation: " + insertError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Calculate and update the player's manager_rating
    const { data: allEvaluations, error: evalError } = await supabase
      .from("manager_evaluations")
      .select("weighted_score, trust_weight")
      .eq("guild_id", data.guild_id)
      .eq("evaluated_discord_id", data.evaluated_discord_id);

    if (!evalError && allEvaluations && allEvaluations.length > 0) {
      // Calculate trust-weighted average
      let totalWeightedScore = 0;
      let totalTrustWeight = 0;

      for (const ev of allEvaluations) {
        const score = ev.weighted_score || 3;
        const trust = ev.trust_weight || 1;
        totalWeightedScore += score * trust;
        totalTrustWeight += trust;
      }

      // Average on 1-5 scale, convert to 0-100
      const avgScore = totalTrustWeight > 0 ? totalWeightedScore / totalTrustWeight : 3;
      const managerRating = ((avgScore - 1) / 4) * 100; // 1->0, 5->100

      console.log(`[submit-manager-evaluation] Updated manager_rating for ${data.evaluated_discord_id}: ${managerRating.toFixed(1)}`);

      // Update player_ratings
      await supabase
        .from("player_ratings")
        .update({ manager_rating: managerRating })
        .eq("guild_id", data.guild_id)
        .eq("discord_user_id", data.evaluated_discord_id);

      // Update player_summary
      await supabase
        .from("player_summary")
        .update({ manager_rating: managerRating })
        .eq("guild_id", data.guild_id)
        .eq("discord_user_id", data.evaluated_discord_id);

      // Trigger rating recalculation
      const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
      const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
      
      fetch(`${supabaseUrl}/functions/v1/calculate-ratings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${supabaseKey}`,
        },
        body: JSON.stringify({
          guild_id: data.guild_id,
          player_ids: [data.evaluated_discord_id],
          trigger: "manager_evaluation",
        }),
      }).catch(e => console.error("[submit-manager-evaluation] Rating recalc failed:", e));
    }

    return new Response(
      JSON.stringify({
        success: true,
        evaluation_id: evaluation.id,
        weighted_score: weightedScore,
        trust_weight: trustWeight,
        evaluator_role: evaluatorRole,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[submit-manager-evaluation] Error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
