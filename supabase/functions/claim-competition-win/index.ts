import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ClaimWinRequest {
  guild_id: string;
  claimed_by_discord_id: string;
  competition_type: "tournament" | "league";
  tier: "major" | "minor" | "community" | "div1" | "div2" | "div3" | "div4";
  competition_name: string;
  team_name?: string;
  placed_at?: string; // ISO date
  proof_url?: string;
}

interface VerifyWinRequest {
  guild_id: string;
  claim_id: string;
  reviewer_discord_id: string;
  approved: boolean;
  rejection_reason?: string;
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
      return handleVerification(supabase, body as VerifyWinRequest);
    } else {
      // New claim
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

  // Verify reviewer has permission
  const { data: hasPermission } = await supabase.rpc("has_any_role", {
    _guild_id: guild_id,
    _discord_user_id: reviewer_discord_id,
    _roles: ["admin", "moderator"],
  });

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
