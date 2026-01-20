import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ManageGlobalLeagueRequest {
  action: "join" | "leave" | "update-status" | "get-profile" | "get-club-by-guild";
  guild_id: string;
  club_key?: string;
  discord_user_id?: string;
  status?: "active" | "inactive";
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body: ManageGlobalLeagueRequest = await req.json();
    const { action, guild_id, club_key, discord_user_id, status } = body;

    if (!guild_id) {
      return new Response(
        JSON.stringify({ error: "guild_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    switch (action) {
      case "join": {
        if (!club_key || !discord_user_id) {
          return new Response(
            JSON.stringify({ error: "club_key and discord_user_id are required for join" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Get club stats to verify the club exists
        const { data: clubStats, error: clubError } = await supabase
          .from("club_stats")
          .select("*")
          .eq("guild_id", guild_id)
          .eq("club_key", club_key)
          .single();

        if (clubError || !clubStats) {
          return new Response(
            JSON.stringify({ error: "Club not found. Please link an EA club first using /link" }),
            { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Check if club is already registered
        const { data: existingClub } = await supabase
          .from("global_league_clubs")
          .select("*")
          .eq("ea_club_id", clubStats.ea_club_id)
          .eq("ea_platform", clubStats.ea_platform)
          .single();

        if (existingClub) {
          return new Response(
            JSON.stringify({ 
              error: "This club is already registered in the Global League",
              club: existingClub
            }),
            { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Get guild name for display
        const { data: guildSettings } = await supabase
          .from("guild_settings")
          .select("name")
          .eq("guild_id", guild_id)
          .single();

        // Register the club
        const { data: newClub, error: insertError } = await supabase
          .from("global_league_clubs")
          .insert({
            guild_id,
            club_key,
            ea_club_id: clubStats.ea_club_id,
            ea_platform: clubStats.ea_platform,
            club_name: clubStats.club_name || "Unknown Club",
            registered_by_discord_id: discord_user_id,
          })
          .select()
          .single();

        if (insertError) {
          console.error("Error registering club:", insertError);
          return new Response(
            JSON.stringify({ error: "Failed to register club" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Get current rank
        const { count: rank } = await supabase
          .from("global_league_clubs")
          .select("*", { count: "exact", head: true })
          .gte("elo_rating", newClub.elo_rating);

        return new Response(
          JSON.stringify({
            success: true,
            message: "Club registered in Global League!",
            club: {
              ...newClub,
              guild_name: guildSettings?.name || guild_id,
              rank: rank || 1,
            },
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "leave": {
        if (!club_key) {
          return new Response(
            JSON.stringify({ error: "club_key is required for leave" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Get club stats to find EA club ID
        const { data: clubStats } = await supabase
          .from("club_stats")
          .select("ea_club_id, ea_platform")
          .eq("guild_id", guild_id)
          .eq("club_key", club_key)
          .single();

        if (!clubStats) {
          return new Response(
            JSON.stringify({ error: "Club not found" }),
            { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const { error: deleteError } = await supabase
          .from("global_league_clubs")
          .delete()
          .eq("ea_club_id", clubStats.ea_club_id)
          .eq("ea_platform", clubStats.ea_platform);

        if (deleteError) {
          console.error("Error removing club:", deleteError);
          return new Response(
            JSON.stringify({ error: "Failed to remove club from Global League" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        return new Response(
          JSON.stringify({ success: true, message: "Club removed from Global League" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "update-status": {
        if (!club_key || !status) {
          return new Response(
            JSON.stringify({ error: "club_key and status are required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const { data: clubStats } = await supabase
          .from("club_stats")
          .select("ea_club_id, ea_platform")
          .eq("guild_id", guild_id)
          .eq("club_key", club_key)
          .single();

        if (!clubStats) {
          return new Response(
            JSON.stringify({ error: "Club not found" }),
            { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const { error: updateError } = await supabase
          .from("global_league_clubs")
          .update({ status, updated_at: new Date().toISOString() })
          .eq("ea_club_id", clubStats.ea_club_id)
          .eq("ea_platform", clubStats.ea_platform);

        if (updateError) {
          return new Response(
            JSON.stringify({ error: "Failed to update status" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        return new Response(
          JSON.stringify({ success: true, message: `Club status updated to ${status}` }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "get-profile": {
        // Get club stats for this guild (use provided club_key or default to club1)
        const { data: clubStats } = await supabase
          .from("club_stats")
          .select("ea_club_id, ea_platform")
          .eq("guild_id", guild_id)
          .eq("club_key", club_key || "club1")
          .single();

        if (!clubStats) {
          return new Response(
            JSON.stringify({ club: null }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const { data: globalClub } = await supabase
          .from("global_league_clubs")
          .select("*")
          .eq("ea_club_id", clubStats.ea_club_id)
          .eq("ea_platform", clubStats.ea_platform)
          .single();

        if (!globalClub) {
          return new Response(
            JSON.stringify({ club: null }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Get rank
        const { count: rank } = await supabase
          .from("global_league_clubs")
          .select("*", { count: "exact", head: true })
          .gt("elo_rating", globalClub.elo_rating);

        // Get total clubs
        const { count: totalClubs } = await supabase
          .from("global_league_clubs")
          .select("*", { count: "exact", head: true })
          .eq("status", "active");

        // Get recent matches
        const { data: recentMatches } = await supabase
          .from("global_league_matches")
          .select(`
            *,
            home_club:home_club_id(id, club_name, elo_rating),
            away_club:away_club_id(id, club_name, elo_rating)
          `)
          .or(`home_club_id.eq.${globalClub.id},away_club_id.eq.${globalClub.id}`)
          .eq("status", "completed")
          .order("completed_at", { ascending: false })
          .limit(5);

        // Get guild name
        const { data: guildSettings } = await supabase
          .from("guild_settings")
          .select("name")
          .eq("guild_id", globalClub.guild_id)
          .single();

        return new Response(
          JSON.stringify({
            club: {
              ...globalClub,
              rank: (rank || 0) + 1,
              total_clubs: totalClubs || 0,
              guild_name: guildSettings?.name || globalClub.guild_id,
              recent_matches: recentMatches || [],
              goal_difference: globalClub.goals_for - globalClub.goals_against,
            }
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "get-club-by-guild": {
        // Get the club stats for this guild/club_key
        const { data: clubStats } = await supabase
          .from("club_stats")
          .select("ea_club_id, ea_platform")
          .eq("guild_id", guild_id)
          .eq("club_key", club_key || "club1")
          .single();

        if (!clubStats) {
          return new Response(
            JSON.stringify({ registered: false }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const { data: globalClub } = await supabase
          .from("global_league_clubs")
          .select("*")
          .eq("ea_club_id", clubStats.ea_club_id)
          .eq("ea_platform", clubStats.ea_platform)
          .single();

        if (!globalClub) {
          return new Response(
            JSON.stringify({ registered: false }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Get rank
        const { count: rank } = await supabase
          .from("global_league_clubs")
          .select("*", { count: "exact", head: true })
          .gt("elo_rating", globalClub.elo_rating);

        return new Response(
          JSON.stringify({
            registered: true,
            club: {
              ...globalClub,
              rank: (rank || 0) + 1,
            },
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      default:
        return new Response(
          JSON.stringify({ error: "Invalid action" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
  } catch (error) {
    console.error("Error in manage-global-league:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
