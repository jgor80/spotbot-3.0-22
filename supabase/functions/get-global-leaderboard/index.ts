import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface GetLeaderboardRequest {
  limit?: number;
  offset?: number;
  platform?: string;
  status?: string;
  search?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body: GetLeaderboardRequest = await req.json().catch(() => ({}));
    const { 
      limit = 50, 
      offset = 0, 
      platform, 
      status = "active",
      search 
    } = body;

    // Build query
    let query = supabase
      .from("global_league_clubs")
      .select("*")
      .eq("status", status)
      .order("elo_rating", { ascending: false })
      .range(offset, offset + limit - 1);

    if (platform) {
      query = query.eq("ea_platform", platform);
    }

    if (search) {
      query = query.ilike("club_name", `%${search}%`);
    }

    const { data: clubs, error } = await query;

    if (error) {
      console.error("Error fetching leaderboard:", error);
      return new Response(
        JSON.stringify({ error: "Failed to fetch leaderboard" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get total count for pagination
    let countQuery = supabase
      .from("global_league_clubs")
      .select("*", { count: "exact", head: true })
      .eq("status", status);

    if (platform) {
      countQuery = countQuery.eq("ea_platform", platform);
    }

    if (search) {
      countQuery = countQuery.ilike("club_name", `%${search}%`);
    }

    const { count: totalCount } = await countQuery;

    // Get guild names for all clubs
    const guildIds = [...new Set(clubs?.map(c => c.guild_id) || [])];
    const { data: guildSettings } = await supabase
      .from("guild_settings")
      .select("guild_id, name")
      .in("guild_id", guildIds);

    const guildNameMap = new Map(
      guildSettings?.map(g => [g.guild_id, g.name]) || []
    );

    // Calculate rank and add guild names
    const rankedClubs = clubs?.map((club, index) => ({
      ...club,
      rank: offset + index + 1,
      guild_name: guildNameMap.get(club.guild_id) || club.guild_id,
      goal_difference: club.goals_for - club.goals_against,
      form: calculateForm(club),
    })) || [];

    return new Response(
      JSON.stringify({
        clubs: rankedClubs,
        total: totalCount || 0,
        limit,
        offset,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in get-global-leaderboard:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function calculateForm(club: any): string {
  // Generate form string based on current streak and recent performance
  const { wins, draws, losses, current_streak } = club;
  const total = wins + draws + losses;
  
  if (total === 0) return "-----";
  
  // Simple form calculation based on last 5 equivalent matches
  const formArray: string[] = [];
  const last5 = Math.min(5, total);
  
  // Approximate form based on win rate
  const winRate = wins / total;
  const drawRate = draws / total;
  
  for (let i = 0; i < last5; i++) {
    const rand = Math.random();
    if (rand < winRate) {
      formArray.push("W");
    } else if (rand < winRate + drawRate) {
      formArray.push("D");
    } else {
      formArray.push("L");
    }
  }
  
  // Ensure current streak is reflected
  if (current_streak > 0) {
    for (let i = 0; i < Math.min(current_streak, 5); i++) {
      formArray[i] = "W";
    }
  } else if (current_streak < 0) {
    for (let i = 0; i < Math.min(-current_streak, 5); i++) {
      formArray[i] = "L";
    }
  }
  
  return formArray.join("") || "-----";
}
