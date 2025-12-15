import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface GetLeaderboardRequest {
  guild_id: string;
  type?: "overall" | "goals" | "assists" | "wins" | "form" | "reliability" | "avg_rating" | "saves" | "tackles" | "clean_sheets";
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

    const { data: guildSettings } = await supabase
      .from("guild_settings")
      .select("clubs")
      .eq("guild_id", guild_id)
      .maybeSingle();

    const enabledClubs = Array.isArray(guildSettings?.clubs)
      ? (guildSettings?.clubs as Array<{ key: string; name: string; enabled: boolean }>).filter((c) => c.enabled)
      : [];

    // Get from player_summary for current leaderboard. We aggregate across
    // all clubs tied to this guild so the web UI always shows a server-first
    // leaderboard that rolls up multi-club stats.
    let query = supabase
      .from("player_summary")
      .select("*")
      .eq("guild_id", guild_id)
      .gt("games_played", 0); // Only players who have played

    // Position filter
    if (position) {
      query = query.eq("primary_position", position);
    }

    // Note: we aggregate locally (in case the table still has per-club rows)
    // so we only need to fetch a generous slice, then we will re-order after
    // combining per-discord entries. Fetching 5x the requested limit gives
    // headroom for duplicates before trimming the final list.
    const { data: players, error } = await query.limit(limit * 5);

    if (error) throw error;

    const aggregatedPlayers = aggregatePlayers(players || []);

    // Order by type using the aggregated values
    const sortedPlayers = aggregatedPlayers.sort((a, b) => {
      switch (type) {
        case "goals":
          return (b.goals ?? 0) - (a.goals ?? 0);
        case "assists":
          return (b.assists ?? 0) - (a.assists ?? 0);
        case "wins":
          return (b.wins ?? 0) - (a.wins ?? 0);
        case "form":
          return (b.form_rating ?? 0) - (a.form_rating ?? 0);
        case "reliability":
          return (b.reliability_score ?? 0) - (a.reliability_score ?? 0);
        case "avg_rating":
          return (b.avg_match_rating ?? 0) - (a.avg_match_rating ?? 0);
        case "saves":
          return (b.saves ?? 0) - (a.saves ?? 0);
        case "tackles":
          return (b.tackles ?? 0) - (a.tackles ?? 0);
        case "clean_sheets":
          return (b.clean_sheets ?? 0) - (a.clean_sheets ?? 0);
        default:
          return (b.overall_rating ?? 0) - (a.overall_rating ?? 0);
      }
    });

    const limitedPlayers = sortedPlayers.slice(0, limit);

    // Get EA usernames from profiles
    const discordIds = limitedPlayers.map(p => p.discord_user_id);
    const { data: profiles } = await supabase
      .from("profiles")
      .select("discord_user_id, ea_username")
      .in("discord_user_id", discordIds);

    const eaUsernameMap = new Map(
      (profiles || []).map(p => [p.discord_user_id, p.ea_username])
    );

    // Enhance with ranking, tier, and EA username
    const leaderboard = limitedPlayers.map((player, index) => ({
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
      club_keys: player.club_keys || [],
    }));

    return new Response(
      JSON.stringify({
        success: true,
        leaderboard_type: type,
        position_filter: position || null,
        guild_scope: {
          guild_id,
          clubs: enabledClubs.map((c) => ({ key: c.key, name: c.name })),
        },
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

function aggregatePlayers(players: any[]) {
  const aggregated = new Map<string, any>();

  for (const player of players) {
    const existing = aggregated.get(player.discord_user_id);

    const clubKeys = new Set<string>();
    if (player.club_key) clubKeys.add(player.club_key);
    if (existing?.club_keys) existing.club_keys.forEach((k: string) => clubKeys.add(k));

    const positionCounts = existing?.position_counts || {};
    if (player.primary_position) {
      positionCounts[player.primary_position] = (positionCounts[player.primary_position] || 0) + 1;
    }

    const aggregate = existing ?? {
      discord_user_id: player.discord_user_id,
      discord_username: player.discord_username,
      wins: 0,
      losses: 0,
      draws: 0,
      goals: 0,
      assists: 0,
      games_played: 0,
      clean_sheets: 0,
      man_of_match: 0,
      shots: 0,
      tackles: 0,
      passes_made: 0,
      pass_attempts: 0,
      saves: 0,
      form_rating: null,
      reliability_score: player.reliability_score,
      primary_position: player.primary_position,
      overall_rating: player.overall_rating,
      top_achievements: player.top_achievements,
      tournament_wins: player.tournament_wins,
      league_wins: player.league_wins,
      rating_sum: 0,
      overall_sum: 0,
      form_sum: 0,
      form_weight: 0,
      position_counts: {},
      current_streak: player.current_streak,
      streak_type: player.streak_type,
      club_keys: [],
    };

    aggregate.discord_username = aggregate.discord_username || player.discord_username;
    aggregate.wins += player.wins || 0;
    aggregate.losses += player.losses || 0;
    aggregate.draws += player.draws || 0;
    aggregate.goals += player.goals || 0;
    aggregate.assists += player.assists || 0;
    aggregate.games_played += player.games_played || 0;
    aggregate.clean_sheets += player.clean_sheets || 0;
    aggregate.man_of_match += player.man_of_match || 0;
    aggregate.shots += player.shots || 0;
    aggregate.tackles += player.tackles || 0;
    aggregate.passes_made += player.passes_made || 0;
    aggregate.pass_attempts += player.pass_attempts || 0;
    aggregate.saves += player.saves || 0;
    aggregate.reliability_score = aggregate.reliability_score ?? player.reliability_score;
    aggregate.primary_position = aggregate.primary_position || player.primary_position;
    aggregate.rating_sum += (player.avg_match_rating || 0) * (player.games_played || 0);
    aggregate.overall_sum += (player.overall_rating || 0) * (player.games_played || 0);
    if (player.form_rating != null) {
      aggregate.form_sum += (player.form_rating || 0) * (player.games_played || 1);
      aggregate.form_weight += player.games_played || 1;
    }

    aggregate.position_counts = positionCounts;
    aggregate.club_keys = Array.from(clubKeys);

    aggregated.set(player.discord_user_id, aggregate);
  }

  return Array.from(aggregated.values()).map((agg) => {
    const games = agg.games_played || 0;
    const draws = Math.max(agg.draws || 0, games - (agg.wins || 0) - (agg.losses || 0));
    const winRate = games > 0 ? (agg.wins / games) * 100 : 0;
    const avgMatchRating = games > 0 ? agg.rating_sum / games : null;
    const overallRating = games > 0 ? agg.overall_sum / games : agg.overall_rating;
    const formRating = agg.form_weight > 0 ? agg.form_sum / agg.form_weight : agg.form_rating;
    const primaryPosition = getPrimaryPositionFromCounts(agg.position_counts) || agg.primary_position || null;

    return {
      ...agg,
      draws,
      win_rate: winRate,
      avg_match_rating: avgMatchRating,
      overall_rating: overallRating,
      form_rating: formRating,
      primary_position: primaryPosition,
      club_keys: agg.club_keys || [],
    };
  });
}

function getPrimaryPositionFromCounts(positionCounts: Record<string, number> = {}) {
  const entries = Object.entries(positionCounts || {});
  if (entries.length === 0) return null;
  return entries.sort((a, b) => b[1] - a[1])[0][0];
}
