import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const WEIGHTS = {
  draft_performance: 0.40,
  club_performance: 0.20,
  peer_evaluation: 0.25,
  build_quality: 0.15,
};

interface CalculateRatingsRequest {
  guild_id: string;
  discord_user_id?: string;
  player_ids?: string[];
  trigger?: string;
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

    const { guild_id, discord_user_id, player_ids, trigger }: CalculateRatingsRequest = await req.json();

    console.log(`[calculate-ratings] Calculating for guild ${guild_id}, trigger: ${trigger || 'manual'}`);

    let playerIdsToProcess: string[] = [];
    
    if (player_ids && player_ids.length > 0) {
      playerIdsToProcess = player_ids;
      console.log(`[calculate-ratings] Processing ${player_ids.length} players from EA sync`);
    } else if (discord_user_id) {
      playerIdsToProcess = [discord_user_id];
    }

    // BATCH: Ensure player_ratings records exist
    if (playerIdsToProcess.length > 0) {
      const { data: existingRatings } = await supabase
        .from("player_ratings")
        .select("discord_user_id")
        .eq("guild_id", guild_id)
        .in("discord_user_id", playerIdsToProcess);

      const existingIds = new Set((existingRatings || []).map(r => r.discord_user_id));
      const newPlayers = playerIdsToProcess.filter(id => !existingIds.has(id));

      if (newPlayers.length > 0) {
        const newRecords = newPlayers.map(playerId => ({
          guild_id,
          discord_user_id: playerId,
          overall_rating: 50,
          games_played: 0,
          wins: 0,
          losses: 0,
          draws: 0,
        }));
        await supabase.from("player_ratings").insert(newRecords);
        console.log(`[calculate-ratings] Created ${newPlayers.length} new rating records`);
      }
    }

    // Get players to calculate
    let query = supabase
      .from("player_ratings")
      .select("*")
      .eq("guild_id", guild_id);

    if (playerIdsToProcess.length > 0) {
      query = query.in("discord_user_id", playerIdsToProcess);
    }

    const { data: players, error } = await query;
    if (error) throw error;

    if (!players || players.length === 0) {
      return new Response(
        JSON.stringify({ success: true, players_updated: 0, results: [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // BATCH: Get all player stats in one query
    const playerIds = players.map(p => p.discord_user_id);
    const { data: allStats } = await supabase
      .from("player_stats")
      .select("*")
      .eq("guild_id", guild_id)
      .in("discord_user_id", playerIds);

    // Group stats by player
    const statsByPlayer = new Map<string, any[]>();
    for (const stat of (allStats || [])) {
      const existing = statsByPlayer.get(stat.discord_user_id) || [];
      existing.push(stat);
      statsByPlayer.set(stat.discord_user_id, existing);
    }

    // Process players in parallel batches of 10
    const BATCH_SIZE = 10;
    const results: any[] = [];
    const ratingUpdates: any[] = [];

    for (let i = 0; i < players.length; i += BATCH_SIZE) {
      const batch = players.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.all(
        batch.map(async (player) => {
          const playerStats = statsByPlayer.get(player.discord_user_id) || [];
          const { rating, update } = calculatePlayerRatingFast(player, playerStats);
          ratingUpdates.push({ id: player.id, ...update });
          return {
            discord_user_id: player.discord_user_id,
            old_rating: player.overall_rating,
            new_rating: rating,
          };
        })
      );
      results.push(...batchResults);
    }

    // BATCH: Update all ratings at once
    for (const update of ratingUpdates) {
      await supabase
        .from("player_ratings")
        .update({
          overall_rating: update.overall_rating,
          draft_performance_rating: update.draft_performance_rating,
          club_performance_rating: update.club_performance_rating,
          games_played: update.games_played,
          wins: update.wins,
          losses: update.losses,
          draws: update.draws,
          total_goals: update.total_goals,
          total_assists: update.total_assists,
          avg_match_rating: update.avg_match_rating,
          baseline_synced: update.baseline_synced,
          last_game_at: update.last_game_at,
          last_calculated_at: new Date().toISOString(),
        })
        .eq("id", update.id);
    }

    // BATCH: Update player summaries in parallel batches
    const summaryPlayerIds = results.map(r => r.discord_user_id);
    
    // Pre-fetch all data needed for summaries
    const [streakData, achievementData, reliabilityData, winsData, profileData, existingSummaryData] = await Promise.all([
      supabase.from("player_streaks").select("*").eq("guild_id", guild_id).in("discord_user_id", summaryPlayerIds),
      supabase.from("player_achievements").select("discord_user_id, achievement_icon").eq("guild_id", guild_id).in("discord_user_id", summaryPlayerIds),
      supabase.from("player_reliability").select("discord_user_id, reliability_score").eq("guild_id", guild_id).in("discord_user_id", summaryPlayerIds),
      supabase.from("competition_wins").select("discord_user_id, competition_type, tier").eq("guild_id", guild_id).in("discord_user_id", summaryPlayerIds).eq("verified", true),
      supabase.from("profiles").select("discord_user_id, discord_username, primary_position").in("discord_user_id", summaryPlayerIds),
      supabase.from("player_summary").select("discord_user_id, games_played, wins, goals, assists, losses, draws").eq("guild_id", guild_id).in("discord_user_id", summaryPlayerIds),
    ]);

    // Index data by player
    const streakMap = new Map((streakData.data || []).map(s => [s.discord_user_id, s]));
    const achievementMap = new Map<string, any[]>();
    for (const a of (achievementData.data || [])) {
      const arr = achievementMap.get(a.discord_user_id) || [];
      arr.push(a);
      achievementMap.set(a.discord_user_id, arr);
    }
    const reliabilityMap = new Map((reliabilityData.data || []).map(r => [r.discord_user_id, r]));
    const winsMap = new Map<string, any[]>();
    for (const w of (winsData.data || [])) {
      const arr = winsMap.get(w.discord_user_id) || [];
      arr.push(w);
      winsMap.set(w.discord_user_id, arr);
    }
    const profileMap = new Map((profileData.data || []).map(p => [p.discord_user_id, p]));
    const existingMap = new Map((existingSummaryData.data || []).map(e => [e.discord_user_id, e]));

    // Build summary upserts
    const summaryUpserts = [];
    for (const result of results) {
      const discordUserId = result.discord_user_id;
      const ratingUpdate = ratingUpdates.find(r => r.discord_user_id === discordUserId || players.find(p => p.id === r.id)?.discord_user_id === discordUserId);
      const rating = players.find(p => p.discord_user_id === discordUserId);
      
      const streak = streakMap.get(discordUserId);
      const achievements = (achievementMap.get(discordUserId) || []).slice(0, 3);
      const reliability = reliabilityMap.get(discordUserId);
      const wins = winsMap.get(discordUserId) || [];
      const profile = profileMap.get(discordUserId);
      const existing = existingMap.get(discordUserId);

      const currentStreak = streak?.current_win_streak || -(streak?.current_loss_streak || 0);
      const streakType = currentStreak > 2 ? "hot" : currentStreak < -2 ? "cold" : "neutral";

      const tournamentWins = wins.filter((w: any) => w.competition_type === "tournament").length;
      const leagueWins = wins.filter((w: any) => w.competition_type === "league").length;
      const majorWins = wins.filter((w: any) => ["major", "div1"].includes(w.tier)).length;

      const gamesPlayed = Math.max(existing?.games_played || 0, ratingUpdate?.games_played || rating?.games_played || 0);
      const totalWins = Math.max(existing?.wins || 0, ratingUpdate?.wins || rating?.wins || 0);
      const totalGoals = Math.max(existing?.goals || 0, ratingUpdate?.total_goals || rating?.total_goals || 0);
      const totalAssists = Math.max(existing?.assists || 0, ratingUpdate?.total_assists || rating?.total_assists || 0);
      const totalLosses = Math.max(existing?.losses || 0, ratingUpdate?.losses || rating?.losses || 0);
      const totalDraws = Math.max(existing?.draws || 0, ratingUpdate?.draws || rating?.draws || 0);
      const winRate = gamesPlayed > 0 ? (totalWins / gamesPlayed) * 100 : 0;

      summaryUpserts.push({
        guild_id,
        discord_user_id: discordUserId,
        discord_username: profile?.discord_username,
        overall_rating: result.new_rating,
        form_rating: streak?.form_rating,
        reliability_score: reliability?.reliability_score || 100,
        games_played: gamesPlayed,
        wins: totalWins,
        losses: totalLosses,
        draws: totalDraws,
        win_rate: winRate,
        goals: totalGoals,
        assists: totalAssists,
        current_streak: currentStreak,
        streak_type: streakType,
        longest_win_streak: streak?.longest_win_streak || 0,
        achievement_count: achievements.length,
        top_achievements: achievements.map((a: any) => a.achievement_icon),
        tournament_wins: tournamentWins,
        league_wins: leagueWins,
        major_wins: majorWins,
        primary_position: profile?.primary_position,
        last_active_at: ratingUpdate?.last_game_at || rating?.last_game_at,
      });
    }

    // Batch upsert summaries
    if (summaryUpserts.length > 0) {
      await supabase
        .from("player_summary")
        .upsert(summaryUpserts, { onConflict: "guild_id,discord_user_id" });
    }

    // Trigger achievement check (fire and forget)
    if (results.length > 0) {
      const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
      const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
      
      fetch(`${supabaseUrl}/functions/v1/award-achievements`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${supabaseKey}`,
        },
        body: JSON.stringify({
          guild_id,
          player_ids: summaryPlayerIds,
        }),
      }).catch(e => console.error("[calculate-ratings] Achievement check failed:", e));
      
      console.log(`[calculate-ratings] Triggered achievement check for ${summaryPlayerIds.length} players`);
    }

    console.log(`[calculate-ratings] Recalculated ${results.length} players`);

    return new Response(
      JSON.stringify({
        success: true,
        players_updated: results.length,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[calculate-ratings] Error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function calculatePlayerRatingFast(player: any, allStats: any[]): { rating: number; update: any } {
  // Separate stats by type
  const draftStats = allStats.filter(s => s.match_type === "draft");
  const clubStats = allStats.filter(s => s.match_type === "club");
  const baselineStats = allStats.filter(s => s.match_type === "ea_aggregate");

  const draftRating = calculatePerformanceRating(draftStats, baselineStats);
  const clubRating = calculatePerformanceRating(clubStats, baselineStats);
  const peerRating = player.peer_rating || 50;
  const buildRating = player.build_quality_rating || 50;

  const overall = 
    (draftRating.rating * WEIGHTS.draft_performance) +
    (clubRating.rating * WEIGHTS.club_performance) +
    (peerRating * WEIGHTS.peer_evaluation) +
    (buildRating * WEIGHTS.build_quality);

  // Apply inactivity decay
  const daysSinceLastGame = player.last_game_at 
    ? Math.floor((Date.now() - new Date(player.last_game_at).getTime()) / (1000 * 60 * 60 * 24))
    : 0;

  let finalRating = overall;
  if (daysSinceLastGame > 14) {
    const decayDays = Math.min(daysSinceLastGame - 14, 20);
    const decayMultiplier = 1 - (decayDays * 0.01);
    finalRating = overall * decayMultiplier;
  }

  finalRating = Math.max(0, Math.min(100, finalRating));

  // Combine stats
  const trackedStats = [...draftStats, ...clubStats];
  const trackedGames = trackedStats.length;
  const trackedWins = trackedStats.filter(s => s.won === true).length;
  const trackedLosses = trackedStats.filter(s => s.won === false).length;
  const trackedDraws = trackedStats.filter(s => s.won === null).length;
  const trackedGoals = trackedStats.reduce((sum, s) => sum + (s.goals || 0), 0);
  const trackedAssists = trackedStats.reduce((sum, s) => sum + (s.assists || 0), 0);

  // Baseline stats
  let baselineGoals = 0, baselineAssists = 0, baselineGames = 0;
  for (const bs of baselineStats) {
    baselineGoals = Math.max(baselineGoals, bs.goals || 0);
    baselineAssists = Math.max(baselineAssists, bs.assists || 0);
  }
  if (baselineGoals + baselineAssists > 0) {
    baselineGames = Math.floor((baselineGoals + baselineAssists) / 0.5);
  }

  const totalGames = baselineGames + trackedGames;
  const baselineWins = Math.floor(baselineGames * 0.5);
  const baselineLosses = Math.floor(baselineGames * 0.3);
  const baselineDraws = baselineGames - baselineWins - baselineLosses;

  // EA rating average
  const gamesWithRating = trackedStats.filter(s => s.ea_match_rating !== null && s.ea_match_rating > 0);
  const avgEARating = gamesWithRating.length > 0
    ? gamesWithRating.reduce((sum, s) => sum + s.ea_match_rating, 0) / gamesWithRating.length
    : null;

  return {
    rating: finalRating,
    update: {
      overall_rating: finalRating,
      draft_performance_rating: draftRating.rating,
      club_performance_rating: clubRating.rating,
      games_played: totalGames,
      wins: baselineWins + trackedWins,
      losses: baselineLosses + trackedLosses,
      draws: baselineDraws + trackedDraws,
      total_goals: baselineGoals + trackedGoals,
      total_assists: baselineAssists + trackedAssists,
      avg_match_rating: avgEARating,
      baseline_synced: baselineGames > 0,
      last_game_at: trackedStats.length > 0 ? new Date().toISOString() : player.last_game_at,
      discord_user_id: player.discord_user_id,
    },
  };
}

function calculatePerformanceRating(stats: any[], baselineStats: any[]): { rating: number } {
  if (stats.length === 0) {
    // Use baseline for estimated rating
    let baselineGoals = 0, baselineAssists = 0;
    for (const bs of baselineStats) {
      baselineGoals = Math.max(baselineGoals, bs.goals || 0);
      baselineAssists = Math.max(baselineAssists, bs.assists || 0);
    }
    if (baselineGoals + baselineAssists > 0) {
      return { rating: 50 }; // Default estimated rating from baseline
    }
    return { rating: 50 };
  }

  const trackedGames = stats.length;
  const trackedWins = stats.filter(s => s.won === true).length;
  const trackedGoals = stats.reduce((sum, s) => sum + (s.goals || 0), 0);
  const trackedAssists = stats.reduce((sum, s) => sum + (s.assists || 0), 0);

  const winRate = trackedGames > 0 ? (trackedWins / trackedGames) * 100 : 50;
  const avgGoals = trackedGames > 0 ? trackedGoals / trackedGames : 0;
  const avgAssists = trackedGames > 0 ? trackedAssists / trackedGames : 0;

  const gamesWithRating = stats.filter(s => s.ea_match_rating !== null && s.ea_match_rating > 0);
  const avgEARating = gamesWithRating.length > 0
    ? gamesWithRating.reduce((sum, s) => sum + s.ea_match_rating, 0) / gamesWithRating.length
    : null;

  let performanceRating = winRate * 0.5;
  const gaContribution = Math.min(100, (avgGoals + avgAssists) * 50);
  performanceRating += gaContribution * 0.3;

  if (avgEARating !== null) {
    performanceRating += (avgEARating * 10) * 0.2;
  } else {
    performanceRating += winRate * 0.2;
  }

  return { rating: Math.max(0, Math.min(100, performanceRating)) };
}
