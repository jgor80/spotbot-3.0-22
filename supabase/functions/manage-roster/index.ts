import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { hasGuildRole, resolveDiscordActor } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ManageRosterRequest {
  action: "add" | "remove";
  guild_id: string;
  discord_user_id: string; // The user making the request
  team_id: string;
  // For add
  player_discord_id?: string;
  role?: string;
  primary_position?: string;
  // For remove
  roster_id?: string;
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

    const body: ManageRosterRequest = await req.json();
    const { action, guild_id, team_id, player_discord_id, role, primary_position, roster_id } = body;
    // A web user always acts as their own verified Discord account, never the ID in the body.
    const actor = await resolveDiscordActor(req, supabase, body.discord_user_id);
    if (actor instanceof Response) return actor;
    const discord_user_id = actor.discordUserId;

    // Validate required fields
    if (!action || !guild_id || !discord_user_id || !team_id) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if user has admin/moderator/manager/captain role
    const { data: hasRole } = await hasGuildRole(supabase, {
      _guild_id: guild_id,
      _discord_user_id: discord_user_id,
      _roles: ["admin", "moderator", "manager", "captain"],
    });

    if (!hasRole) {
      return new Response(
        JSON.stringify({ success: false, error: "Insufficient permissions" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify team belongs to this guild
    const { data: team } = await supabase
      .from("teams")
      .select("id, guild_id")
      .eq("id", team_id)
      .single();

    if (!team || team.guild_id !== guild_id) {
      return new Response(
        JSON.stringify({ success: false, error: "Team not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "add") {
      if (!player_discord_id) {
        return new Response(
          JSON.stringify({ success: false, error: "Player Discord ID is required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data, error } = await supabase
        .from("team_rosters")
        .insert({
          team_id,
          discord_user_id: player_discord_id,
          role: role || "player",
          primary_position: primary_position || null,
        })
        .select()
        .single();

      if (error) throw error;

      console.log(`Player ${player_discord_id} added to team ${team_id} by ${discord_user_id}`);

      return new Response(
        JSON.stringify({ success: true, roster: data }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "remove") {
      if (!roster_id) {
        return new Response(
          JSON.stringify({ success: false, error: "Roster ID is required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Verify roster entry belongs to this team
      const { data: rosterEntry } = await supabase
        .from("team_rosters")
        .select("id, team_id")
        .eq("id", roster_id)
        .single();

      if (!rosterEntry || rosterEntry.team_id !== team_id) {
        return new Response(
          JSON.stringify({ success: false, error: "Roster entry not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { error } = await supabase
        .from("team_rosters")
        .delete()
        .eq("id", roster_id);

      if (error) throw error;

      console.log(`Roster entry ${roster_id} removed from team ${team_id} by ${discord_user_id}`);

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: false, error: "Invalid action" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in manage-roster:", error);
    return new Response(
      JSON.stringify({ success: false, error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
