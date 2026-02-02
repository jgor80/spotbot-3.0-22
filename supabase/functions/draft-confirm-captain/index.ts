import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DISCORD_ID_REGEX = /^\d{17,19}$/;

interface DraftConfirmRequest {
  draft_id: string;
  captain_discord_id: string;
  action?: "confirm" | "decline"; // Default is confirm
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

    const body: DraftConfirmRequest = await req.json();
    const { draft_id, captain_discord_id, action = "confirm" } = body;

    // Validate input
    if (!draft_id || typeof draft_id !== "string") {
      return new Response(
        JSON.stringify({ error: "draft_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!captain_discord_id || !DISCORD_ID_REGEX.test(captain_discord_id)) {
      return new Response(
        JSON.stringify({ error: "captain_discord_id must be a valid Discord ID" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[draft-confirm-captain] ${action} for draft ${draft_id} by ${captain_discord_id}`);

    // Fetch the draft
    const { data: draft, error: fetchError } = await supabase
      .from("drafts")
      .select("*")
      .eq("id", draft_id)
      .single();

    if (fetchError || !draft) {
      console.error("[draft-confirm-captain] Draft not found:", fetchError);
      return new Response(
        JSON.stringify({ error: "Draft not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if draft is in pending status
    if (draft.status !== "pending") {
      return new Response(
        JSON.stringify({ 
          error: "Draft is not awaiting captain confirmation",
          current_status: draft.status
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if confirmation has expired
    if (draft.confirmation_expires_at && new Date(draft.confirmation_expires_at) < new Date()) {
      return new Response(
        JSON.stringify({ error: "Captain confirmation period has expired" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Determine which captain is confirming
    let captainRole: "a" | "b" | null = null;
    if (captain_discord_id === draft.captain_a_discord_id) {
      captainRole = "a";
    } else if (captain_discord_id === draft.captain_b_discord_id) {
      captainRole = "b";
    }

    if (!captainRole) {
      return new Response(
        JSON.stringify({ error: "You are not a captain of this draft" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Handle decline action
    if (action === "decline") {
      console.log(`[draft-confirm-captain] Captain ${captainRole} declined`);
      
      // Cancel the draft
      await supabase
        .from("drafts")
        .update({ 
          status: "cancelled",
          completed_at: new Date().toISOString()
        })
        .eq("id", draft_id);

      return new Response(
        JSON.stringify({
          success: true,
          action: "declined",
          captain_declined: captainRole,
          draft_cancelled: true,
          message: `Captain ${captainRole.toUpperCase()} declined. Draft has been cancelled.`
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Handle confirm action
    const updateData: Record<string, boolean | string> = {};
    let captain_a_confirmed = draft.captain_a_confirmed || false;
    let captain_b_confirmed = draft.captain_b_confirmed || false;

    if (captainRole === "a") {
      if (captain_a_confirmed) {
        return new Response(
          JSON.stringify({ 
            error: "You have already confirmed",
            captain_a_confirmed,
            captain_b_confirmed
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      updateData.captain_a_confirmed = true;
      captain_a_confirmed = true;
    } else {
      if (captain_b_confirmed) {
        return new Response(
          JSON.stringify({ 
            error: "You have already confirmed",
            captain_a_confirmed,
            captain_b_confirmed
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      updateData.captain_b_confirmed = true;
      captain_b_confirmed = true;
    }

    // Check if both captains have now confirmed
    const bothConfirmed = captain_a_confirmed && captain_b_confirmed;
    
    if (bothConfirmed) {
      updateData.status = "picking";
      console.log(`[draft-confirm-captain] Both captains confirmed, transitioning to picking`);
    }

    // Update the draft
    const { error: updateError } = await supabase
      .from("drafts")
      .update(updateData)
      .eq("id", draft_id);

    if (updateError) {
      console.error("[draft-confirm-captain] Failed to update draft:", updateError);
      return new Response(
        JSON.stringify({ error: "Failed to update draft" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[draft-confirm-captain] Captain ${captainRole} confirmed. Both: ${bothConfirmed}`);

    return new Response(
      JSON.stringify({
        success: true,
        action: "confirmed",
        captain_confirmed: captainRole,
        captain_a_confirmed,
        captain_b_confirmed,
        both_confirmed: bothConfirmed,
        status: bothConfirmed ? "picking" : "pending",
        current_picker: bothConfirmed ? draft.current_picker : null,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[draft-confirm-captain] Error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
