import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface GetLeaderboardRequest {
  guild_id: string;
  type?: "overall" | "goals" | "assists" | "wins" | "form" | "reliability";
  position?: string; // Filter by position
  limit?: number;
  month_year?: string; // For monthly leaderboard, e.g., "2025-01"
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

    const { 
      guild_id, 
      type = "overall",
      position,
      limit = 10,
      month_year,
    }: GetLeaderboardRequest = await req.json();

    console.log(`[get-leaderboard] Fetching ${type} leaderboard for guild ${guild_id}`);

    // If requesting monthly snapshot
    if (month_year) {
      const { data: snapshots } = await supabase
        .from("monthly_snapshots")
        .select("*")
        .eq("guild_id", guild_id)
        .eq("month_year", month_year)
        .order("overall_rating", { ascending: false })
        .limit(limit);

      return new Response(
        JSON.stringify({
          success: true,
          leaderboard_type: "monthly",
          month_year,
          entries: snapshots || [],
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get from player_summary for current leaderboard
    let query = supabase
      .from("player_summary")
      .select("*")
      .eq("guild_id", guild_id)
      .gt("games_played", 0); // Only players who have played

    // Position filter
    if (position) {
      query = query.eq("primary_position", position);
    }

    // Order by type
    switch (type) {
      case "goals":
        query = query.order("goals", { ascending: false });
        break;
      case "assists":
        query = query.order("assists", { ascending: false });
        break;
      case "wins":
        query = query.order("wins", { ascending: false });
        break;
      case "form":
        query = query.order("form_rating", { ascending: false, nullsFirst: false });
        break;
      case "reliability":
        query = query.order("reliability_score", { ascending: false });
        break;
      default:
        query = query.order("overall_rating", { ascending: false });
    }

    query = query.limit(limit);

    const { data: players, error } = await query;

    if (error) throw error;

    // Get EA usernames from profiles
    const discordIds = (players || []).map(p => p.discord_user_id);
    const { data: profiles } = await supabase
      .from("profiles")
      .select("discord_user_id, ea_username")
      .in("discord_user_id", discordIds);

    const eaUsernameMap = new Map(
      (profiles || []).map(p => [p.discord_user_id, p.ea_username])
    );

    // Enhance with ranking, tier, and EA username
    const leaderboard = (players || []).map((player, index) => ({
      rank: index + 1,
      discord_user_id: player.discord_user_id,
      discord_username: player.discord_username,
      ea_username: eaUsernameMap.get(player.discord_user_id) || null,
      overall_rating: player.overall_rating,
      rating_tier: getRatingTier(player.overall_rating),
      games_played: player.games_played,
      wins: player.wins,
      losses: player.losses,
      draws: player.draws,
      win_rate: player.win_rate,
      goals: player.goals,
      assists: player.assists,
      clean_sheets: player.clean_sheets || 0,
      man_of_match: player.man_of_match || 0,
      avg_match_rating: player.avg_match_rating,
      shots: player.shots || 0,
      tackles: player.tackles || 0,
      passes_made: player.passes_made || 0,
      pass_attempts: player.pass_attempts || 0,
      saves: player.saves || 0,
      form_rating: player.form_rating,
      reliability_score: player.reliability_score,
      current_streak: player.current_streak,
      streak_type: player.streak_type,
      top_achievements: player.top_achievements,
      primary_position: player.primary_position,
      tournament_wins: player.tournament_wins,
      league_wins: player.league_wins,
    }));

    return new Response(
      JSON.stringify({
        success: true,
        leaderboard_type: type,
        position_filter: position || null,
        entries: leaderboard,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[get-leaderboard] Error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function getRatingTier(rating: number): { name: string; icon: string } {
  if (rating >= 90) return { name: "Diamond", icon: "💎" };
  if (rating >= 80) return { name: "Platinum", icon: "🏆" };
  if (rating >= 70) return { name: "Gold", icon: "🥇" };
  if (rating >= 60) return { name: "Silver", icon: "🥈" };
  if (rating >= 50) return { name: "Bronze", icon: "🥉" };
  return { name: "Iron", icon: "⚙️" };
}
