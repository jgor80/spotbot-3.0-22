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
  club_key?: string; // Filter by specific club, or "all" for aggregate
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
      club_key,
    }: GetLeaderboardRequest = await req.json();

    console.log(`[get-leaderboard] Fetching ${type} leaderboard for guild ${guild_id}, club: ${club_key || 'all'}`);

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

    // If club_key is provided and not "all", aggregate stats from player_stats for that club only
    let players: any[] = [];
    
    if (club_key && club_key !== "all") {
      console.log(`[get-leaderboard] Filtering by club: ${club_key}`);
      
      // Get player stats for the specific club by joining with club_matches
      const { data: clubPlayerStats, error: statsError } = await supabase
        .from("player_stats")
        .select(`
          discord_user_id,
          goals,
          assists,
          won,
          ea_match_rating,
          clean_sheet,
          man_of_match,
          shots,
          tackles,
          passes_made,
          pass_attempts,
          saves_diving,
          saves_reflex,
          saves_parry,
          saves_cross,
          saves_punch,
          goals_conceded,
          interceptions,
          clearances,
          dribbles,
          fouls,
          offsides,
          seconds_played,
          position_played,
          archetypeid,
          ea_match_id
        `)
        .eq("guild_id", guild_id)
        .eq("match_type", "club");
      
      if (statsError) throw statsError;
      
      // Get club_matches to filter by club_key
      const { data: clubMatches } = await supabase
        .from("club_matches")
        .select("ea_match_id")
        .eq("guild_id", guild_id)
        .eq("club_key", club_key);
      
      const clubMatchIds = new Set((clubMatches || []).map(m => m.ea_match_id));
      
      // Filter player_stats to only those matches for this club
      const filteredStats = (clubPlayerStats || []).filter(ps => 
        ps.ea_match_id && clubMatchIds.has(ps.ea_match_id)
      );
      
      // Aggregate stats per player
      const playerAggregates = new Map<string, any>();
      
      for (const stat of filteredStats) {
        const existing = playerAggregates.get(stat.discord_user_id) || {
          discord_user_id: stat.discord_user_id,
          games_played: 0,
          wins: 0,
          losses: 0,
          draws: 0,
          goals: 0,
          assists: 0,
          clean_sheets: 0,
          man_of_match: 0,
          shots: 0,
          tackles: 0,
          passes_made: 0,
          pass_attempts: 0,
          saves: 0,
          saves_diving: 0,
          saves_reflex: 0,
          saves_parry: 0,
          saves_cross: 0,
          saves_punch: 0,
          goals_conceded: 0,
          interceptions: 0,
          clearances: 0,
          dribbles: 0,
          fouls: 0,
          offsides: 0,
          seconds_played: 0,
          rating_sum: 0,
          position_counts: {} as Record<string, number>,
          archetypeid: null,
        };
        
        existing.games_played += 1;
        existing.goals += stat.goals || 0;
        existing.assists += stat.assists || 0;
        existing.clean_sheets += stat.clean_sheet ? 1 : 0;
        existing.man_of_match += stat.man_of_match ? 1 : 0;
        existing.shots += stat.shots || 0;
        existing.tackles += stat.tackles || 0;
        existing.passes_made += stat.passes_made || 0;
        existing.pass_attempts += stat.pass_attempts || 0;
        existing.saves += (stat.saves_diving || 0) + (stat.saves_reflex || 0) + (stat.saves_parry || 0) + (stat.saves_cross || 0) + (stat.saves_punch || 0);
        existing.saves_diving += stat.saves_diving || 0;
        existing.saves_reflex += stat.saves_reflex || 0;
        existing.saves_parry += stat.saves_parry || 0;
        existing.saves_cross += stat.saves_cross || 0;
        existing.saves_punch += stat.saves_punch || 0;
        existing.goals_conceded += stat.goals_conceded || 0;
        existing.interceptions += stat.interceptions || 0;
        existing.clearances += stat.clearances || 0;
        existing.dribbles += stat.dribbles || 0;
        existing.fouls += stat.fouls || 0;
        existing.offsides += stat.offsides || 0;
        existing.seconds_played += stat.seconds_played || 0;
        existing.rating_sum += stat.ea_match_rating || 0;
        existing.archetypeid = existing.archetypeid || stat.archetypeid;
        
        if (stat.won === true) existing.wins += 1;
        else if (stat.won === false) existing.losses += 1;
        else existing.draws += 1;
        
        if (stat.position_played) {
          existing.position_counts[stat.position_played] = (existing.position_counts[stat.position_played] || 0) + 1;
        }
        
        playerAggregates.set(stat.discord_user_id, existing);
      }
      
      // Convert to array with calculated fields
      players = Array.from(playerAggregates.values()).map(p => {
        const winRate = p.games_played > 0 ? (p.wins / p.games_played) * 100 : 0;
        const avgMatchRating = p.games_played > 0 ? p.rating_sum / p.games_played : 0;
        // Estimate overall rating from avg match rating (scale 0-10 to 0-100)
        const overallRating = avgMatchRating ? Math.min(100, avgMatchRating * 10) : 50;
        const primaryPosition = getPrimaryPositionFromCounts(p.position_counts);
        
        return {
          ...p,
          win_rate: winRate,
          avg_match_rating: avgMatchRating,
          overall_rating: overallRating,
          primary_position: primaryPosition,
          form_rating: null,
          reliability_score: 100,
          top_achievements: [],
          tournament_wins: 0,
          league_wins: 0,
          current_streak: 0,
          streak_type: null,
          club_keys: [club_key],
        };
      }).filter(p => p.games_played > 0);
      
      // Apply position filter
      if (position) {
        players = players.filter(p => p.primary_position === position);
      }
    } else {
      // Get from player_summary for aggregate leaderboard across all clubs
      let query = supabase
        .from("player_summary")
        .select("*")
        .eq("guild_id", guild_id)
        .gt("games_played", 0);

      if (position) {
        query = query.eq("primary_position", position);
      }

      const { data, error } = await query.limit(500);
      if (error) throw error;
      players = data || [];
    }

    // Get all profiles to map ea_ accounts to real Discord IDs
    const { data: allProfiles } = await supabase
      .from("profiles")
      .select("discord_user_id, ea_username")
      .not("ea_username", "is", null);

    // Build a map from ea_username (normalized) to real discord_user_id
    const eaToDiscordMap = new Map<string, string>();
    for (const profile of allProfiles || []) {
      if (profile.ea_username && !profile.discord_user_id.startsWith('ea_')) {
        // Normalize EA username for matching (lowercase, remove special chars variations)
        const normalized = profile.ea_username.toLowerCase().replace(/[\s\-_]/g, '');
        eaToDiscordMap.set(normalized, profile.discord_user_id);
        // Also map the exact ea_username
        eaToDiscordMap.set(profile.ea_username.toLowerCase(), profile.discord_user_id);
      }
    }

    const aggregatedPlayers = aggregatePlayers(players || [], eaToDiscordMap);

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
        club_filter: club_key || "all",
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

function aggregatePlayers(players: any[], eaToDiscordMap: Map<string, string>) {
  const aggregated = new Map<string, any>();

  for (const player of players) {
    // Determine the canonical discord_user_id
    let canonicalId = player.discord_user_id;
    
    // If this is an ea_ prefixed account, try to find the linked real Discord ID
    if (canonicalId.startsWith('ea_')) {
      const eaUsername = canonicalId.replace('ea_', '');
      const normalized = eaUsername.toLowerCase().replace(/[\s\-_]/g, '');
      const linkedId = eaToDiscordMap.get(normalized) || eaToDiscordMap.get(eaUsername.toLowerCase());
      if (linkedId) {
        canonicalId = linkedId;
      }
    }

    const existing = aggregated.get(canonicalId);

    const clubKeys = new Set<string>();
    if (player.club_key) clubKeys.add(player.club_key);
    if (existing?.club_keys) existing.club_keys.forEach((k: string) => clubKeys.add(k));

    const positionCounts = existing?.position_counts || {};
    if (player.primary_position) {
      positionCounts[player.primary_position] = (positionCounts[player.primary_position] || 0) + 1;
    }

    const aggregate = existing ?? {
      discord_user_id: canonicalId,
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
      saves_diving: 0,
      saves_reflex: 0,
      saves_parry: 0,
      saves_cross: 0,
      saves_punch: 0,
      goals_conceded: 0,
      interceptions: 0,
      clearances: 0,
      dribbles: 0,
      fouls: 0,
      offsides: 0,
      seconds_played: 0,
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
      archetypeid: player.archetypeid,
    };

    // Prefer real Discord username over ea_ username
    if (!aggregate.discord_username || aggregate.discord_username.startsWith('ea_') || aggregate.discord_username === canonicalId) {
      aggregate.discord_username = player.discord_username || aggregate.discord_username;
    }
    
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
    aggregate.saves_diving += player.saves_diving || 0;
    aggregate.saves_reflex += player.saves_reflex || 0;
    aggregate.saves_parry += player.saves_parry || 0;
    aggregate.saves_cross += player.saves_cross || 0;
    aggregate.saves_punch += player.saves_punch || 0;
    aggregate.goals_conceded += player.goals_conceded || 0;
    aggregate.interceptions += player.interceptions || 0;
    aggregate.clearances += player.clearances || 0;
    aggregate.dribbles += player.dribbles || 0;
    aggregate.fouls += player.fouls || 0;
    aggregate.offsides += player.offsides || 0;
    aggregate.seconds_played += player.seconds_played || 0;
    aggregate.reliability_score = aggregate.reliability_score ?? player.reliability_score;
    aggregate.primary_position = aggregate.primary_position || player.primary_position;
    aggregate.archetypeid = aggregate.archetypeid || player.archetypeid;
    aggregate.rating_sum += (player.avg_match_rating || 0) * (player.games_played || 0);
    aggregate.overall_sum += (player.overall_rating || 0) * (player.games_played || 0);
    if (player.form_rating != null) {
      aggregate.form_sum += (player.form_rating || 0) * (player.games_played || 1);
      aggregate.form_weight += player.games_played || 1;
    }

    aggregate.position_counts = positionCounts;
    aggregate.club_keys = Array.from(clubKeys);

    aggregated.set(canonicalId, aggregate);
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
