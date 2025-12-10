import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface DraftPickRequest {
  draft_id: string;
  captain_discord_id: string;
  picked_player_discord_id: string;
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

    const { draft_id, captain_discord_id, picked_player_discord_id }: DraftPickRequest = await req.json();

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
        draft_status: isComplete ? "completed" : "picking",
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
