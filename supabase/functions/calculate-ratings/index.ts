import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const WEIGHTS = {
  win_rate: 0.18,                // Reduced from 0.20
  draft_performance: 0.08,       // Reduced from 0.10
  club_performance: 0.18,        // Reduced from 0.20
  competition_performance: 0.18, // Reduced from 0.20
  peer_evaluation: 0.10,         // Reduced from 0.15 - vibes/casual
  manager_evaluation: 0.13,      // NEW - deep performance ratings
  build_quality: 0.15,           // Keep 15%
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
    
    // Pre-fetch all data needed for summaries (including manager evaluations)
    const [streakData, achievementData, reliabilityData, winsData, profileData, existingSummaryData, managerEvalData, recentStatsData] = await Promise.all([
      supabase.from("player_streaks").select("*").eq("guild_id", guild_id).in("discord_user_id", summaryPlayerIds),
      supabase.from("player_achievements").select("discord_user_id, achievement_icon").eq("guild_id", guild_id).in("discord_user_id", summaryPlayerIds),
      supabase.from("player_reliability").select("discord_user_id, reliability_score").eq("guild_id", guild_id).in("discord_user_id", summaryPlayerIds),
      supabase.from("competition_wins").select("discord_user_id, competition_type, tier").eq("guild_id", guild_id).in("discord_user_id", summaryPlayerIds).eq("verified", true),
      supabase.from("profiles").select("discord_user_id, discord_username, primary_position").in("discord_user_id", summaryPlayerIds),
      supabase.from("player_summary").select("discord_user_id, games_played, wins, goals, assists, losses, draws, manager_rating").eq("guild_id", guild_id).in("discord_user_id", summaryPlayerIds),
      supabase.from("manager_evaluations").select("evaluated_discord_id, weighted_score, trust_weight").eq("guild_id", guild_id).in("evaluated_discord_id", summaryPlayerIds),
      // Fetch recent club match results for form calculation
      supabase.from("player_stats")
        .select("discord_user_id, won, created_at")
        .eq("guild_id", guild_id)
        .eq("match_type", "club")
        .in("discord_user_id", summaryPlayerIds)
        .not("won", "is", null)
        .order("created_at", { ascending: false })
        .limit(summaryPlayerIds.length * 10), // Get up to 10 games per player
    ]);

    // Build form rating from recent stats if player_streaks is empty
    const recentStatsByPlayer = new Map<string, Array<{ won: boolean | null; created_at: string }>>();
    for (const stat of (recentStatsData.data || [])) {
      const existing = recentStatsByPlayer.get(stat.discord_user_id) || [];
      if (existing.length < 10) { // Only keep last 10 per player
        existing.push(stat);
      }
      recentStatsByPlayer.set(stat.discord_user_id, existing);
    }

    // Calculate form from recent stats
    const calculatedFormMap = new Map<string, { form_rating: number; current_win_streak: number; current_loss_streak: number; last_5: string[] }>();
    for (const [playerId, stats] of recentStatsByPlayer) {
      const results = stats.map(s => s.won === true ? 'W' : s.won === false ? 'L' : 'D');
      const last5 = results.slice(0, 5);
      
      // Form rating: W=3pts, D=1pt, L=0pt, max 15 pts = 100%
      const formPoints = last5.reduce((sum, r) => sum + (r === 'W' ? 3 : r === 'D' ? 1 : 0), 0);
      const formRating = Math.round((formPoints / 15) * 100);
      
      // Current streak
      let currentWinStreak = 0;
      let currentLossStreak = 0;
      for (const r of results) {
        if (r === 'W' && currentLossStreak === 0) currentWinStreak++;
        else if (r === 'L' && currentWinStreak === 0) currentLossStreak++;
        else break;
      }
      
      calculatedFormMap.set(playerId, { form_rating: formRating, current_win_streak: currentWinStreak, current_loss_streak: currentLossStreak, last_5: last5 });
    }

    console.log(`[calculate-ratings] Calculated form for ${calculatedFormMap.size} players from ${recentStatsData.data?.length || 0} stats`);

    // Index data by player - prefer player_streaks if exists, else use calculated
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
    
    // Index manager evaluations by player
    const managerEvalMap = new Map<string, { totalWeightedScore: number; totalTrustWeight: number }>();
    for (const ev of (managerEvalData.data || [])) {
      const existing = managerEvalMap.get(ev.evaluated_discord_id) || { totalWeightedScore: 0, totalTrustWeight: 0 };
      const score = ev.weighted_score || 3;
      const trust = ev.trust_weight || 1;
      existing.totalWeightedScore += score * trust;
      existing.totalTrustWeight += trust;
      managerEvalMap.set(ev.evaluated_discord_id, existing);
    }

    // Build summary upserts
    const summaryUpserts = [];
    for (const result of results) {
      const discordUserId = result.discord_user_id;
      const ratingUpdate = ratingUpdates.find(r => r.discord_user_id === discordUserId || players.find(p => p.id === r.id)?.discord_user_id === discordUserId);
      const rating = players.find(p => p.discord_user_id === discordUserId);
      
      const streak = streakMap.get(discordUserId);
      const calculatedForm = calculatedFormMap.get(discordUserId);
      const achievements = (achievementMap.get(discordUserId) || []).slice(0, 3);
      const reliability = reliabilityMap.get(discordUserId);
      const wins = winsMap.get(discordUserId) || [];
      const profile = profileMap.get(discordUserId);
      const existing = existingMap.get(discordUserId);

      // Use calculated form if player_streaks is empty, otherwise prefer player_streaks
      const formRating = streak?.form_rating ?? calculatedForm?.form_rating ?? null;
      const winStreak = streak?.current_win_streak ?? calculatedForm?.current_win_streak ?? 0;
      const lossStreak = streak?.current_loss_streak ?? calculatedForm?.current_loss_streak ?? 0;
      const currentStreak = winStreak > 0 ? winStreak : -lossStreak;
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

      // Calculate manager rating from evaluations
      const managerEvalData = managerEvalMap.get(discordUserId);
      let managerRating = existing?.manager_rating || null;
      if (managerEvalData && managerEvalData.totalTrustWeight > 0) {
        const avgScore = managerEvalData.totalWeightedScore / managerEvalData.totalTrustWeight;
        managerRating = ((avgScore - 1) / 4) * 100; // 1->0, 5->100
      }

      summaryUpserts.push({
        guild_id,
        discord_user_id: discordUserId,
        discord_username: profile?.discord_username,
        overall_rating: result.new_rating,
        form_rating: formRating,
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
        manager_rating: managerRating,
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
  const competitionStats = allStats.filter(s => s.match_type === "competition" || s.match_type === "friendly");
  const baselineStats = allStats.filter(s => s.match_type === "ea_aggregate");

  const draftRating = calculatePerformanceRating(draftStats, baselineStats);
  const clubRating = calculatePerformanceRating(clubStats, baselineStats);
  const competitionRating = calculatePerformanceRating(competitionStats, baselineStats);
  const peerRating = player.peer_rating || 50;
  const buildRating = player.build_quality_rating || 50;
  const managerRating = player.manager_rating || 50; // NEW: Manager evaluation rating

  // Calculate direct win rate from all tracked games
  const allTrackedStats = [...draftStats, ...clubStats, ...competitionStats];
  const totalTrackedGames = allTrackedStats.length;
  const totalTrackedWins = allTrackedStats.filter(s => s.won === true).length;
  const directWinRate = totalTrackedGames > 0 ? (totalTrackedWins / totalTrackedGames) * 100 : 50;

  const overall = 
    (directWinRate * WEIGHTS.win_rate) +
    (draftRating.rating * WEIGHTS.draft_performance) +
    (clubRating.rating * WEIGHTS.club_performance) +
    (competitionRating.rating * WEIGHTS.competition_performance) +
    (peerRating * WEIGHTS.peer_evaluation) +
    (managerRating * WEIGHTS.manager_evaluation) + // NEW: Manager evaluation contribution
    (buildRating * WEIGHTS.build_quality);

  // Apply games-played confidence factor
  // Players with fewer games have their rating pulled toward baseline (50)
  // Under 40 games = significant reduction, scaling up to full confidence at 40+ games
  const GAMES_CONFIDENCE_THRESHOLD = 40;
  const BASELINE_RATING = 50;
  
  // Use a curve that heavily penalizes low game counts:
  // 0 games = 0% confidence (rating = 50)
  // 10 games = 25% confidence
  // 20 games = 50% confidence  
  // 30 games = 75% confidence
  // 40+ games = 100% confidence (full rating)
  const gamesConfidence = Math.min(1, totalTrackedGames / GAMES_CONFIDENCE_THRESHOLD);
  
  // Blend the calculated rating with baseline based on confidence
  // Low games = rating pulled heavily toward 50
  const confidenceAdjustedRating = (overall * gamesConfidence) + (BASELINE_RATING * (1 - gamesConfidence));
  
  console.log(`[calculate-ratings] Player ${player.discord_user_id}: ${totalTrackedGames} games, confidence: ${(gamesConfidence * 100).toFixed(0)}%, raw: ${overall.toFixed(1)}, adjusted: ${confidenceAdjustedRating.toFixed(1)}`);

  // Apply inactivity decay
  const daysSinceLastGame = player.last_game_at 
    ? Math.floor((Date.now() - new Date(player.last_game_at).getTime()) / (1000 * 60 * 60 * 24))
    : 0;

  let finalRating = confidenceAdjustedRating;
  if (daysSinceLastGame > 14) {
    const decayDays = Math.min(daysSinceLastGame - 14, 20);
    const decayMultiplier = 1 - (decayDays * 0.01);
    finalRating = confidenceAdjustedRating * decayMultiplier;
  }

  finalRating = Math.max(0, Math.min(100, finalRating));

  // Combine stats
  const trackedStats = [...draftStats, ...clubStats, ...competitionStats];
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

  // Defensive stats
  const trackedTackles = stats.reduce((sum, s) => sum + (s.tackles || 0), 0);
  const trackedInterceptions = stats.reduce((sum, s) => sum + (s.interceptions || 0), 0);
  const trackedClearances = stats.reduce((sum, s) => sum + (s.clearances || 0), 0);
  const trackedCleanSheets = stats.filter(s => s.clean_sheet === true).length;
  
  // GK stats
  const trackedSaves = stats.reduce((sum, s) => sum + (s.saves || 0) + (s.saves_diving || 0) + (s.saves_reflex || 0) + (s.saves_parry || 0) + (s.saves_cross || 0) + (s.saves_punch || 0), 0);
  const trackedGoalsConceded = stats.reduce((sum, s) => sum + (s.goals_conceded || 0), 0);

  // Determine primary position from stats
  const positionCounts: Record<string, number> = {};
  for (const s of stats) {
    const pos = s.position_played?.toUpperCase() || "";
    if (pos) {
      positionCounts[pos] = (positionCounts[pos] || 0) + 1;
    }
  }
  const primaryPosition = Object.keys(positionCounts).sort((a, b) => positionCounts[b] - positionCounts[a])[0] || "";
  
  // Position classification
  const isGK = primaryPosition === "GK";
  const isDefender = ["CB", "LB", "RB", "LWB", "RWB", "SW"].includes(primaryPosition);
  const isMidfielder = ["CDM", "CM", "LM", "RM", "CAM", "LCM", "RCM", "LDM", "RDM"].includes(primaryPosition);

  const winRate = trackedGames > 0 ? (trackedWins / trackedGames) * 100 : 50;
  const avgGoals = trackedGames > 0 ? trackedGoals / trackedGames : 0;
  const avgAssists = trackedGames > 0 ? trackedAssists / trackedGames : 0;
  const avgTackles = trackedGames > 0 ? trackedTackles / trackedGames : 0;
  const avgInterceptions = trackedGames > 0 ? trackedInterceptions / trackedGames : 0;
  const avgClearances = trackedGames > 0 ? trackedClearances / trackedGames : 0;
  const avgSaves = trackedGames > 0 ? trackedSaves / trackedGames : 0;
  const cleanSheetRate = trackedGames > 0 ? (trackedCleanSheets / trackedGames) * 100 : 0;
  const avgGoalsConceded = trackedGames > 0 ? trackedGoalsConceded / trackedGames : 0;

  const gamesWithRating = stats.filter(s => s.ea_match_rating !== null && s.ea_match_rating > 0);
  const avgEARating = gamesWithRating.length > 0
    ? gamesWithRating.reduce((sum, s) => sum + s.ea_match_rating, 0) / gamesWithRating.length
    : null;

  // Position difficulty multipliers - harder positions get boosted to normalize ratings
  // GK/Defenders get fewer chances to impact match rating, Forwards get more
  const EA_RATING_MULTIPLIERS = {
    GK: 1.15,        // Hardest to get high ratings - 15% boost
    DEFENDER: 1.10,  // Hard to get high ratings - 10% boost
    MIDFIELDER: 1.00, // Baseline - no adjustment
    FORWARD: 0.90,   // Easiest to get high ratings - 10% reduction
  };

  // Apply position-based normalization to EA rating
  const getPositionMultiplier = () => {
    if (isGK) return EA_RATING_MULTIPLIERS.GK;
    if (isDefender) return EA_RATING_MULTIPLIERS.DEFENDER;
    if (isMidfielder) return EA_RATING_MULTIPLIERS.MIDFIELDER;
    return EA_RATING_MULTIPLIERS.FORWARD;
  };
  
  const positionMultiplier = getPositionMultiplier();
  const normalizedEARating = avgEARating !== null ? Math.min(10, avgEARating * positionMultiplier) : null;

  let performanceRating: number;

  if (isGK) {
    // GK Rating: 25% win rate, 15% saves, 20% clean sheets, 40% EA rating (heavily weighted due to limited data)
    performanceRating = winRate * 0.25;
    
    // Saves contribution (reduced weight since data is sparse)
    const savesContribution = Math.min(100, avgSaves * 20);
    performanceRating += savesContribution * 0.15;
    
    // Clean sheet rate
    performanceRating += cleanSheetRate * 0.20;
    
    // EA rating heavily weighted (captures overall GK performance) - now normalized
    if (normalizedEARating !== null) {
      performanceRating += (normalizedEARating * 10) * 0.40;
    } else {
      // Fallback: blend clean sheets + goals conceded penalty
      const gcPenalty = Math.max(0, 100 - avgGoalsConceded * 30);
      performanceRating += (cleanSheetRate * 0.5 + gcPenalty * 0.5) * 0.40;
    }
  } else if (isDefender) {
    // Defender Rating: 20% win rate, 25% tackles/game, 20% GA/game (inverted), 20% clean sheets, 5% G+A (defensive only), 10% EA rating
    performanceRating = winRate * 0.20;
    
    // Tackles per game - highly weighted for defenders (scale: 0-5 tackles/game = 0-100)
    const tacklesContribution = Math.min(100, avgTackles * 20);
    performanceRating += tacklesContribution * 0.25;
    
    // Goals against per game - lower is better (scale: 0 GA = 100, 3+ GA = 0)
    const gaPerGameScore = Math.max(0, 100 - (avgGoalsConceded * 33.33));
    performanceRating += gaPerGameScore * 0.20;
    
    // Clean sheet rate - highly weighted for defenders
    performanceRating += cleanSheetRate * 0.20;
    
    // G+A only count when playing defensive positions (confirmed defensive role)
    const DEFENSIVE_POSITIONS = ["CB", "LB", "RB", "LWB", "RWB", "SW", "LCB", "RCB"];
    let defensiveGoals = 0, defensiveAssists = 0;
    for (const s of stats) {
      const pos = (s.position_played || "").toUpperCase();
      if (DEFENSIVE_POSITIONS.includes(pos)) {
        defensiveGoals += s.goals || 0;
        defensiveAssists += s.assists || 0;
      }
    }
    const defensiveGAPerGame = trackedGames > 0 ? (defensiveGoals + defensiveAssists) / trackedGames : 0;
    const defGAContribution = Math.min(100, defensiveGAPerGame * 100);
    performanceRating += defGAContribution * 0.05;
    
    // EA rating - reduced weight, normalized for position difficulty
    if (normalizedEARating !== null) {
      performanceRating += (normalizedEARating * 10) * 0.10;
    } else {
      // Fallback: use tackles + GA/game blend
      performanceRating += (tacklesContribution * 0.5 + gaPerGameScore * 0.5) * 0.10;
    }
  } else if (isMidfielder) {
    // Midfielder Rating: 40% win rate, 20% G+A, 20% defensive, 10% clean sheets, 10% EA rating
    performanceRating = winRate * 0.40;
    
    const gaContribution = Math.min(100, (avgGoals + avgAssists) * 50);
    performanceRating += gaContribution * 0.20;
    
    // Midfielders should contribute defensively too
    const defensiveContribution = Math.min(100, (avgTackles * 12) + (avgInterceptions * 15));
    performanceRating += defensiveContribution * 0.20;
    
    // Slight clean sheet bonus for defensive mids
    performanceRating += cleanSheetRate * 0.10;
    
    // EA rating - no normalization needed (baseline)
    if (normalizedEARating !== null) {
      performanceRating += (normalizedEARating * 10) * 0.10;
    } else {
      performanceRating += winRate * 0.10;
    }
  } else {
    // Attacker/Default Rating: 50% win rate, 30% G+A, 20% EA rating (original formula)
    performanceRating = winRate * 0.50;
    const gaContribution = Math.min(100, (avgGoals + avgAssists) * 50);
    performanceRating += gaContribution * 0.30;

    // EA rating reduced for forwards (easier to get high ratings)
    if (normalizedEARating !== null) {
      performanceRating += (normalizedEARating * 10) * 0.20;
    } else {
      performanceRating += winRate * 0.20;
    }
  }

  return { rating: Math.max(0, Math.min(100, performanceRating)) };
}
