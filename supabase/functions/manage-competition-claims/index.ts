import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { hasGuildRole, resolveDiscordActor } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ManageClaimRequest {
  action: "submit" | "approve" | "reject";
  guild_id: string;
  discord_user_id: string;
  // For submit
  competition_name?: string;
  competition_type?: "tournament" | "league";
  tier?: string;
  team_name?: string;
  placed_at?: string;
  // For approve/reject
  claim_id?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body: ManageClaimRequest = await req.json();
    const { action, guild_id, competition_name, competition_type, tier, team_name, placed_at, claim_id } = body;
    // A web user always acts as their own verified Discord account, never the ID in the body.
    const actor = await resolveDiscordActor(req, supabase, body.discord_user_id);
    if (actor instanceof Response) return actor;
    const discord_user_id = actor.discordUserId;

    // Validate required fields
    if (!action || !guild_id || !discord_user_id) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "submit") {
      if (!competition_name || !tier) {
        return new Response(
          JSON.stringify({ success: false, error: "Competition name and tier are required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Validate tier
      const validTiers = ["major", "minor", "community", "div1", "div2", "div3", "div4"];
      if (!validTiers.includes(tier)) {
        return new Response(
          JSON.stringify({ success: false, error: "Invalid tier" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data, error } = await supabase
        .from("pending_win_claims")
        .insert({
          guild_id,
          claimed_by_discord_id: discord_user_id,
          competition_name,
          competition_type: competition_type || "tournament",
          tier,
          team_name: team_name || null,
          placed_at: placed_at || null,
          status: "pending",
        })
        .select()
        .single();

      if (error) throw error;

      console.log(`Win claim submitted: ${competition_name} by ${discord_user_id} in guild ${guild_id}`);

      return new Response(
        JSON.stringify({ success: true, claim: data }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "approve" || action === "reject") {
      if (!claim_id) {
        return new Response(
          JSON.stringify({ success: false, error: "Claim ID is required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Check if user has admin/moderator role
      const { data: hasRole } = await hasGuildRole(supabase, {
        _guild_id: guild_id,
        _discord_user_id: discord_user_id,
        _roles: ["admin", "moderator"],
      });

      if (!hasRole) {
        return new Response(
          JSON.stringify({ success: false, error: "Insufficient permissions" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Get the claim
      const { data: claim } = await supabase
        .from("pending_win_claims")
        .select("*")
        .eq("id", claim_id)
        .eq("guild_id", guild_id)
        .single();

      if (!claim) {
        return new Response(
          JSON.stringify({ success: false, error: "Claim not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (action === "approve") {
        // Create verified win
        const { error: insertError } = await supabase
          .from("competition_wins")
          .insert({
            guild_id,
            discord_user_id: claim.claimed_by_discord_id,
            competition_name: claim.competition_name,
            competition_type: claim.competition_type,
            tier: claim.tier,
            team_name: claim.team_name,
            verified: true,
            verified_at: new Date().toISOString(),
            verified_by_discord_id: discord_user_id,
          });

        if (insertError) throw insertError;

        // Update claim status
        const { error: updateError } = await supabase
          .from("pending_win_claims")
          .update({ 
            status: "approved", 
            reviewed_at: new Date().toISOString(),
            reviewed_by_discord_id: discord_user_id,
          })
          .eq("id", claim_id);

        if (updateError) throw updateError;

        console.log(`Win claim approved: ${claim.competition_name} by ${discord_user_id}`);

        return new Response(
          JSON.stringify({ success: true }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (action === "reject") {
        const { error } = await supabase
          .from("pending_win_claims")
          .update({ 
            status: "rejected", 
            reviewed_at: new Date().toISOString(),
            reviewed_by_discord_id: discord_user_id,
          })
          .eq("id", claim_id);

        if (error) throw error;

        console.log(`Win claim rejected: ${claim.competition_name} by ${discord_user_id}`);

        return new Response(
          JSON.stringify({ success: true }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    return new Response(
      JSON.stringify({ success: false, error: "Invalid action" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in manage-competition-claims:", error);
    return new Response(
      JSON.stringify({ success: false, error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
