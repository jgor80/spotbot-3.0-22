import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ManageTeamRequest {
  action: "create" | "delete";
  guild_id: string;
  discord_user_id: string;
  // For create
  team_name?: string;
  team_tag?: string;
  team_type?: string;
  // For delete
  team_id?: string;
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

    const body: ManageTeamRequest = await req.json();
    const { action, guild_id, discord_user_id, team_name, team_tag, team_type, team_id } = body;

    // Validate required fields
    if (!action || !guild_id || !discord_user_id) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if user has admin/moderator/manager role
    const { data: hasRole } = await supabase.rpc("has_any_role", {
      _guild_id: guild_id,
      _discord_user_id: discord_user_id,
      _roles: ["admin", "moderator", "manager"],
    });

    if (!hasRole) {
      return new Response(
        JSON.stringify({ success: false, error: "Insufficient permissions" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "create") {
      if (!team_name?.trim()) {
        return new Response(
          JSON.stringify({ success: false, error: "Team name is required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data, error } = await supabase
        .from("teams")
        .insert({
          guild_id,
          name: team_name.trim(),
          tag: team_tag?.trim() || null,
          team_type: team_type || "comp",
          active: true,
          manager_discord_ids: [],
        })
        .select()
        .single();

      if (error) throw error;

      console.log(`Team created: ${team_name} in guild ${guild_id} by ${discord_user_id}`);
      
      return new Response(
        JSON.stringify({ success: true, team: data }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "delete") {
      if (!team_id) {
        return new Response(
          JSON.stringify({ success: false, error: "Team ID is required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Verify team belongs to this guild
      const { data: team } = await supabase
        .from("teams")
        .select("id, guild_id, name")
        .eq("id", team_id)
        .single();

      if (!team || team.guild_id !== guild_id) {
        return new Response(
          JSON.stringify({ success: false, error: "Team not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { error } = await supabase
        .from("teams")
        .delete()
        .eq("id", team_id);

      if (error) throw error;

      console.log(`Team deleted: ${team.name} in guild ${guild_id} by ${discord_user_id}`);

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
    console.error("Error in manage-teams:", error);
    return new Response(
      JSON.stringify({ success: false, error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
