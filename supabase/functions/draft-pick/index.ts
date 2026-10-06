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

interface DraftPickRequest {
  draft_id: string;
  captain_discord_id: string;
  picked_player_discord_id: string;
}

function validateRequest(body: any): string[] {
  const errors: string[] = [];
  
  if (!body.draft_id || !UUID_REGEX.test(body.draft_id)) {
    errors.push("draft_id must be a valid UUID");
  }
  if (!body.captain_discord_id || !DISCORD_ID_REGEX.test(body.captain_discord_id)) {
    errors.push("captain_discord_id must be a valid Discord ID");
  }
  if (!body.picked_player_discord_id || !DISCORD_ID_REGEX.test(body.picked_player_discord_id)) {
    errors.push("picked_player_discord_id must be a valid Discord ID");
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
      console.log(`[draft-pick] Validation failed: ${errors.join("; ")}`);
      return new Response(
        JSON.stringify({ error: "Validation failed", details: errors }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { draft_id, captain_discord_id, picked_player_discord_id }: DraftPickRequest = body;

    console.log(`[draft-pick] Captain ${captain_discord_id} picking ${picked_player_discord_id} in draft ${draft_id}`);

    // Get current draft state
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

    if (draft.status !== "picking") {
      return new Response(
        JSON.stringify({ error: "Draft is not in picking phase" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify it's the right captain's turn
    const expectedCaptain = draft.current_picker === "a" 
      ? draft.captain_a_discord_id 
      : draft.captain_b_discord_id;

    if (captain_discord_id !== expectedCaptain) {
      return new Response(
        JSON.stringify({ error: "It's not your turn to pick" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify player is available
    if (!draft.available_player_ids.includes(picked_player_discord_id)) {
      return new Response(
        JSON.stringify({ error: "Player is not available for picking" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update teams
    const newAvailable = draft.available_player_ids.filter(
      (id: string) => id !== picked_player_discord_id
    );

    const isTeamA = draft.current_picker === "a";
    const newTeamA = isTeamA 
      ? [...draft.team_a_player_ids, picked_player_discord_id]
      : draft.team_a_player_ids;
    const newTeamB = !isTeamA 
      ? [...draft.team_b_player_ids, picked_player_discord_id]
      : draft.team_b_player_ids;

    // Determine next picker (alternating 1-1-1)
    const nextPicker = draft.current_picker === "a" ? "b" : "a";
    const newPickNumber = draft.pick_number + 1;

    // Check if draft is complete
    const isComplete = newAvailable.length === 0;

    // Record the pick
    await supabase.from("draft_picks").insert({
      draft_id,
      pick_number: newPickNumber,
      captain_discord_id,
      picked_player_discord_id,
      team: draft.current_picker,
    });

    // Update the draft
    const { error: updateError } = await supabase
      .from("drafts")
      .update({
        team_a_player_ids: newTeamA,
        team_b_player_ids: newTeamB,
        available_player_ids: newAvailable,
        current_picker: isComplete ? null : nextPicker,
        pick_number: newPickNumber,
        status: isComplete ? "completed" : "picking",
        completed_at: isComplete ? new Date().toISOString() : null,
      })
      .eq("id", draft_id);

    if (updateError) {
      console.error("[draft-pick] Error updating draft:", updateError);
      throw updateError;
    }

    console.log(`[draft-pick] Pick recorded. Draft ${isComplete ? "complete" : "continues"}`);

    // Get player info for the picked player
    const { data: pickedPlayerInfo } = await supabase
      .from("player_summary")
      .select("discord_user_id, discord_username, overall_rating, current_streak, streak_type")
      .eq("guild_id", draft.guild_id)
      .eq("discord_user_id", picked_player_discord_id)
      .maybeSingle();

    return new Response(
      JSON.stringify({
        success: true,
        pick_number: newPickNumber,
        picked_player: pickedPlayerInfo || { discord_user_id: picked_player_discord_id, overall_rating: 50 },
        team: draft.current_picker,
        team_a: newTeamA,
        team_b: newTeamB,
        available_players: newAvailable,
        next_picker: isComplete ? null : nextPicker,
        is_complete: isComplete,
        draft_complete: isComplete, // Alias for compatibility
        draft_status: isComplete ? "completed" : "picking",
        // Include VC info when draft is complete so bot can move players
        team_a_vc_id: isComplete ? draft.team_a_vc_id : null,
        team_b_vc_id: isComplete ? draft.team_b_vc_id : null,
        guild_id: draft.guild_id,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[draft-pick] Error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
