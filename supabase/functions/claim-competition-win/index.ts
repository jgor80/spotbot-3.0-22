import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Validation helpers
const DISCORD_ID_REGEX = /^\d{17,19}$/;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const COMPETITION_TYPES = ["tournament", "league"] as const;
const TIERS = ["major", "minor", "community", "div1", "div2", "div3", "div4"] as const;

interface ClaimWinRequest {
  guild_id: string;
  claimed_by_discord_id: string;
  competition_type: "tournament" | "league";
  tier: "major" | "minor" | "community" | "div1" | "div2" | "div3" | "div4";
  competition_name: string;
  team_name?: string;
  placed_at?: string;
  proof_url?: string;
}

interface VerifyWinRequest {
  guild_id: string;
  claim_id: string;
  reviewer_discord_id: string;
  approved: boolean;
  rejection_reason?: string;
}

function validateClaimRequest(body: any): string[] {
  const errors: string[] = [];
  
  if (!body.guild_id || !DISCORD_ID_REGEX.test(body.guild_id)) {
    errors.push("guild_id must be a valid Discord ID");
  }
  if (!body.claimed_by_discord_id || !DISCORD_ID_REGEX.test(body.claimed_by_discord_id)) {
    errors.push("claimed_by_discord_id must be a valid Discord ID");
  }
  if (!COMPETITION_TYPES.includes(body.competition_type)) {
    errors.push(`competition_type must be one of: ${COMPETITION_TYPES.join(", ")}`);
  }
  if (!TIERS.includes(body.tier)) {
    errors.push(`tier must be one of: ${TIERS.join(", ")}`);
  }
  if (!body.competition_name || typeof body.competition_name !== "string") {
    errors.push("competition_name is required");
  } else if (body.competition_name.length > 200) {
    errors.push("competition_name must be at most 200 characters");
  }
  if (body.team_name && (typeof body.team_name !== "string" || body.team_name.length > 100)) {
    errors.push("team_name must be at most 100 characters");
  }
  if (body.placed_at && isNaN(new Date(body.placed_at).getTime())) {
    errors.push("placed_at must be a valid date");
  }
  if (body.proof_url && (typeof body.proof_url !== "string" || body.proof_url.length > 2000)) {
    errors.push("proof_url must be at most 2000 characters");
  }
  
  return errors;
}

function validateVerifyRequest(body: any): string[] {
  const errors: string[] = [];
  
  if (!body.guild_id || !DISCORD_ID_REGEX.test(body.guild_id)) {
    errors.push("guild_id must be a valid Discord ID");
  }
  if (!body.claim_id || !UUID_REGEX.test(body.claim_id)) {
    errors.push("claim_id must be a valid UUID");
  }
  if (!body.reviewer_discord_id || !DISCORD_ID_REGEX.test(body.reviewer_discord_id)) {
    errors.push("reviewer_discord_id must be a valid Discord ID");
  }
  if (typeof body.approved !== "boolean") {
    errors.push("approved must be a boolean");
  }
  if (body.rejection_reason && (typeof body.rejection_reason !== "string" || body.rejection_reason.length > 500)) {
    errors.push("rejection_reason must be at most 500 characters");
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

    // Check if this is a claim or verify request
    if (body.claim_id) {
      // Verification request
      const errors = validateVerifyRequest(body);
      if (errors.length > 0) {
        return new Response(
          JSON.stringify({ error: "Validation failed", details: errors }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      return handleVerification(supabase, body as VerifyWinRequest);
    } else {
      // New claim
      const errors = validateClaimRequest(body);
      if (errors.length > 0) {
        return new Response(
          JSON.stringify({ error: "Validation failed", details: errors }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      return handleClaim(supabase, body as ClaimWinRequest);
    }
  } catch (error) {
    console.error("[claim-competition-win] Error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function handleClaim(supabase: any, request: ClaimWinRequest) {
  const {
    guild_id,
    claimed_by_discord_id,
    competition_type,
    tier,
    competition_name,
    team_name,
    placed_at,
    proof_url,
  } = request;

  console.log(`[claim-competition-win] ${claimed_by_discord_id} claiming ${competition_type} win: ${competition_name}`);

  // Create pending claim
  const { data: claim, error } = await supabase
    .from("pending_win_claims")
    .insert({
      guild_id,
      claimed_by_discord_id,
      competition_type,
      tier,
      competition_name,
      team_name,
      placed_at: placed_at || new Date().toISOString().split("T")[0],
      proof_url,
      status: "pending",
    })
    .select()
    .single();

  if (error) throw error;

  console.log(`[claim-competition-win] Claim ${claim.id} created, pending verification`);

  return new Response(
    JSON.stringify({
      success: true,
      claim_id: claim.id,
      status: "pending",
      message: `Your ${tier} ${competition_type} win "${competition_name}" has been submitted for verification.`,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

async function handleVerification(supabase: any, request: VerifyWinRequest) {
  const { guild_id, claim_id, reviewer_discord_id, approved, rejection_reason } = request;

  console.log(`[claim-competition-win] ${reviewer_discord_id} ${approved ? "approving" : "rejecting"} claim ${claim_id}`);

  // Verify reviewer has permission (admin or moderator only)
  const { data: hasPermission, error: permError } = await supabase.rpc("has_any_role", {
    _guild_id: guild_id,
    _discord_user_id: reviewer_discord_id,
    _roles: ["admin", "moderator"],
  });

  if (permError) {
    console.error("[claim-competition-win] Permission check error:", permError);
    return new Response(
      JSON.stringify({ error: "Failed to verify permissions" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Enforce permission check - only admins/moderators can verify claims
  if (hasPermission !== true) {
    console.log(`[claim-competition-win] Permission denied for ${reviewer_discord_id}`);
    return new Response(
      JSON.stringify({ error: "You don't have permission to verify competition wins. Required role: admin or moderator." }),
      { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Get the claim
  const { data: claim, error: claimError } = await supabase
    .from("pending_win_claims")
    .select("*")
    .eq("id", claim_id)
    .single();

  if (claimError || !claim) {
    return new Response(
      JSON.stringify({ error: "Claim not found" }),
      { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  if (claim.status !== "pending") {
    return new Response(
      JSON.stringify({ error: "Claim has already been processed" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Update claim status
  await supabase
    .from("pending_win_claims")
    .update({
      status: approved ? "approved" : "rejected",
      reviewed_by_discord_id: reviewer_discord_id,
      reviewed_at: new Date().toISOString(),
      rejection_reason: rejection_reason || null,
    })
    .eq("id", claim_id);

  if (approved) {
    // Create the verified win
    await supabase.from("competition_wins").insert({
      guild_id: claim.guild_id,
      discord_user_id: claim.claimed_by_discord_id,
      competition_type: claim.competition_type,
      tier: claim.tier,
      competition_name: claim.competition_name,
      team_name: claim.team_name,
      placed_at: claim.placed_at,
      verified: true,
      verified_by_discord_id: reviewer_discord_id,
      verified_at: new Date().toISOString(),
    });

    // Update player summary
    await updatePlayerWinCounts(supabase, claim.guild_id, claim.claimed_by_discord_id);

    console.log(`[claim-competition-win] Win verified and recorded`);
  }

  return new Response(
    JSON.stringify({
      success: true,
      status: approved ? "approved" : "rejected",
      message: approved
        ? `Win "${claim.competition_name}" has been verified and added to the player's record.`
        : `Win claim rejected: ${rejection_reason || "No reason provided"}`,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

async function updatePlayerWinCounts(supabase: any, guildId: string, discordUserId: string) {
  const { data: wins } = await supabase
    .from("competition_wins")
    .select("competition_type, tier")
    .eq("guild_id", guildId)
    .eq("discord_user_id", discordUserId)
    .eq("verified", true);

  const tournamentWins = (wins || []).filter((w: any) => w.competition_type === "tournament").length;
  const leagueWins = (wins || []).filter((w: any) => w.competition_type === "league").length;
  const majorWins = (wins || []).filter((w: any) => ["major", "div1"].includes(w.tier)).length;

  await supabase
    .from("player_summary")
    .update({
      tournament_wins: tournamentWins,
      league_wins: leagueWins,
      major_wins: majorWins,
    })
    .eq("guild_id", guildId)
    .eq("discord_user_id", discordUserId);
}
