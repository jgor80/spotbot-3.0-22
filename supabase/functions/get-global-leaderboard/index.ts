import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Cache headers for CDN/browser caching
const cacheHeaders = {
  "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
};

interface GetLeaderboardRequest {
  limit?: number;
  offset?: number;
  platform?: string;
  status?: string;
  search?: string;
  view?: "clubs" | "discord";
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
      search,
      view = "clubs"
    } = body;

    if (view === "discord") {
      // Use optimized materialized view for Discord standings
      return await getDiscordLeaderboard(supabase, { limit, offset, platform, status, search });
    }

    // Default: Club-level leaderboard (now uses denormalized guild_name)
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

    // Calculate rank - guild_name is now denormalized in the table
    const rankedClubs = clubs?.map((club, index) => ({
      ...club,
      rank: offset + index + 1,
      guild_name: club.guild_name || club.guild_id,
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
      { headers: { ...corsHeaders, ...cacheHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in get-global-leaderboard:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// OPTIMIZED: Query materialized view instead of aggregating in JS
async function getDiscordLeaderboard(
  supabase: any,
  { limit, offset, platform, status, search }: Omit<GetLeaderboardRequest, "view">
) {
  const safeOffset = offset ?? 0;
  const safeLimit = limit ?? 50;

  // Query the pre-computed materialized view
  let query = supabase
    .from("global_league_discord_standings")
    .select("*")
    .order("best_elo", { ascending: false });

  if (search) {
    query = query.or(`guild_name.ilike.%${search}%,best_club_name.ilike.%${search}%`);
  }

  const { data: standings, error } = await query;

  if (error) {
    console.error("Error fetching discord standings:", error);
    // Fallback to legacy aggregation if materialized view fails
    return await getDiscordLeaderboardLegacy(supabase, { limit, offset, platform, status, search });
  }

  // If platform filter is set, we need to get clubs to check platforms
  // (The materialized view aggregates all clubs regardless of platform)
  let filteredStandings = standings || [];

  if (platform) {
    // Get guild IDs that have clubs on the specified platform
    const { data: guildIdsWithPlatform } = await supabase
      .from("global_league_clubs")
      .select("guild_id")
      .eq("ea_platform", platform)
      .eq("status", status);

    const validGuildIds = new Set(guildIdsWithPlatform?.map((g: any) => g.guild_id) || []);
    filteredStandings = filteredStandings.filter((s: any) => validGuildIds.has(s.guild_id));
  }

  const total = filteredStandings.length;
  const paged = filteredStandings.slice(safeOffset, safeOffset + safeLimit);

  // For each Discord, fetch their clubs for the expandable view
  const guildIds = paged.map((s: any) => s.guild_id);
  
  const { data: clubsData } = await supabase
    .from("global_league_clubs")
    .select("guild_id, club_name, elo_rating, matches_played")
    .in("guild_id", guildIds)
    .eq("status", status)
    .order("elo_rating", { ascending: false });

  // Group clubs by guild_id
  const clubsByGuild = new Map<string, Array<{ club_name: string; elo_rating: number; matches_played: number }>>();
  for (const club of clubsData || []) {
    if (!clubsByGuild.has(club.guild_id)) {
      clubsByGuild.set(club.guild_id, []);
    }
    clubsByGuild.get(club.guild_id)!.push({
      club_name: club.club_name,
      elo_rating: club.elo_rating,
      matches_played: club.matches_played,
    });
  }

  // Add ranks and clubs to standings
  const ranked = paged.map((d: any, index: number) => ({
    ...d,
    rank: safeOffset + index + 1,
    goal_difference: d.goals_for - d.goals_against,
    clubs: clubsByGuild.get(d.guild_id) || [],
  }));

  return new Response(
    JSON.stringify({
      discords: ranked,
      total,
      limit: safeLimit,
      offset: safeOffset,
    }),
    { headers: { ...corsHeaders, ...cacheHeaders, "Content-Type": "application/json" } }
  );
}

// Legacy fallback function (in case materialized view isn't available)
async function getDiscordLeaderboardLegacy(
  supabase: any,
  { limit, offset, platform, status, search }: Omit<GetLeaderboardRequest, "view">
) {
  let query = supabase
    .from("global_league_clubs")
    .select("*")
    .eq("status", status);

  if (platform) {
    query = query.eq("ea_platform", platform);
  }

  const { data: clubs, error } = await query;

  if (error) {
    console.error("Error fetching clubs for discord view:", error);
    return new Response(
      JSON.stringify({ error: "Failed to fetch leaderboard" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Aggregate by guild_id
  const discordMap = new Map<string, {
    guild_id: string;
    guild_name: string;
    total_elo: number;
    avg_elo: number;
    best_elo: number;
    club_count: number;
    total_matches: number;
    wins: number;
    draws: number;
    losses: number;
    goals_for: number;
    goals_against: number;
    best_club_name: string;
    clubs: Array<{ club_name: string; elo_rating: number; matches_played: number }>;
  }>();

  for (const club of clubs || []) {
    const existing = discordMap.get(club.guild_id);
    
    if (!existing) {
      discordMap.set(club.guild_id, {
        guild_id: club.guild_id,
        guild_name: club.guild_name || club.guild_id,
        total_elo: club.elo_rating || 1200,
        avg_elo: club.elo_rating || 1200,
        best_elo: club.elo_rating || 1200,
        club_count: 1,
        total_matches: club.matches_played || 0,
        wins: club.wins || 0,
        draws: club.draws || 0,
        losses: club.losses || 0,
        goals_for: club.goals_for || 0,
        goals_against: club.goals_against || 0,
        best_club_name: club.club_name,
        clubs: [{ club_name: club.club_name, elo_rating: club.elo_rating || 1200, matches_played: club.matches_played || 0 }],
      });
    } else {
      existing.total_elo += club.elo_rating || 1200;
      existing.club_count += 1;
      existing.avg_elo = Math.round(existing.total_elo / existing.club_count);
      existing.total_matches += club.matches_played || 0;
      existing.wins += club.wins || 0;
      existing.draws += club.draws || 0;
      existing.losses += club.losses || 0;
      existing.goals_for += club.goals_for || 0;
      existing.goals_against += club.goals_against || 0;
      existing.clubs.push({ club_name: club.club_name, elo_rating: club.elo_rating || 1200, matches_played: club.matches_played || 0 });
      
      if ((club.elo_rating || 1200) > existing.best_elo) {
        existing.best_elo = club.elo_rating || 1200;
        existing.best_club_name = club.club_name;
      }
    }
  }

  let discordStandings = Array.from(discordMap.values()).map((d) => ({
    ...d,
    goal_difference: d.goals_for - d.goals_against,
  }));

  if (search) {
    const searchLower = search.toLowerCase();
    discordStandings = discordStandings.filter(
      (d) =>
        d.guild_name.toLowerCase().includes(searchLower) ||
        d.clubs.some((c) => c.club_name.toLowerCase().includes(searchLower))
    );
  }

  discordStandings.sort((a, b) => b.best_elo - a.best_elo);

  const total = discordStandings.length;
  const safeOffset = offset ?? 0;
  const safeLimit = limit ?? 50;
  const paged = discordStandings.slice(safeOffset, safeOffset + safeLimit);

  const ranked = paged.map((d, index) => ({
    ...d,
    rank: safeOffset + index + 1,
  }));

  return new Response(
    JSON.stringify({
      discords: ranked,
      total,
      limit: safeLimit,
      offset: safeOffset,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

function calculateForm(club: any): string {
  const { wins, draws, losses, current_streak } = club;
  const total = wins + draws + losses;
  
  if (total === 0) return "-----";
  
  const formArray: string[] = [];
  const last5 = Math.min(5, total);
  
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
