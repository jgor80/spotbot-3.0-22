import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Rating weights as defined in the plan
const WEIGHTS = {
  draft_performance: 0.40,
  club_performance: 0.20,
  peer_evaluation: 0.25,
  build_quality: 0.15,
};

interface CalculateRatingsRequest {
  guild_id: string;
  discord_user_id?: string; // If provided, only recalculate for this player
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

    const { guild_id, discord_user_id }: CalculateRatingsRequest = await req.json();

    console.log(`[calculate-ratings] Calculating for guild ${guild_id}${discord_user_id ? `, player ${discord_user_id}` : " (all players)"}`);

    // Get players to calculate
    let query = supabase
      .from("player_ratings")
      .select("*")
      .eq("guild_id", guild_id);

    if (discord_user_id) {
      query = query.eq("discord_user_id", discord_user_id);
    }

    const { data: players, error } = await query;

    if (error) throw error;

    const results = [];

    for (const player of players || []) {
      const newRating = await calculatePlayerRating(supabase, guild_id, player);
      results.push({
        discord_user_id: player.discord_user_id,
        old_rating: player.overall_rating,
        new_rating: newRating,
      });
    }

    // Update player summaries
    for (const result of results) {
      await updatePlayerSummary(supabase, guild_id, result.discord_user_id);
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

async function calculatePlayerRating(supabase: any, guildId: string, player: any): Promise<number> {
  // Calculate draft performance rating (win rate, goals, assists, EA rating avg)
  const draftRating = await calculateDraftPerformance(supabase, guildId, player, "draft");
  
  // Calculate club performance rating from EA API matches
  const clubRating = await calculateDraftPerformance(supabase, guildId, player, "club");
  
  // Peer rating already calculated on evaluation submission
  const peerRating = player.peer_rating || 50;
  
  // Build quality rating
  const buildRating = player.build_quality_rating || 50;

  // Calculate weighted overall
  const overall = 
    (draftRating * WEIGHTS.draft_performance) +
    (clubRating * WEIGHTS.club_performance) +
    (peerRating * WEIGHTS.peer_evaluation) +
    (buildRating * WEIGHTS.build_quality);

  // Apply inactivity decay if player hasn't played in 14+ days
  const daysSinceLastGame = player.last_game_at 
    ? Math.floor((Date.now() - new Date(player.last_game_at).getTime()) / (1000 * 60 * 60 * 24))
    : 0;

  let finalRating = overall;
  if (daysSinceLastGame > 14) {
    // Decay 1% per day after 14 days, max 20% decay
    const decayDays = Math.min(daysSinceLastGame - 14, 20);
    const decayMultiplier = 1 - (decayDays * 0.01);
    finalRating = overall * decayMultiplier;
  }

  // Clamp between 0-100
  finalRating = Math.max(0, Math.min(100, finalRating));

  // Update the rating
  await supabase
    .from("player_ratings")
    .update({
      overall_rating: finalRating,
      draft_performance_rating: draftRating,
      club_performance_rating: clubRating,
      last_calculated_at: new Date().toISOString(),
    })
    .eq("id", player.id);

  return finalRating;
}

async function calculateDraftPerformance(supabase: any, guildId: string, player: any, matchType: string): Promise<number> {
  // Get all stats for this player of the specified match type
  const { data: stats } = await supabase
    .from("player_stats")
    .select("*")
    .eq("guild_id", guildId)
    .eq("discord_user_id", player.discord_user_id)
    .eq("match_type", matchType);

  if (!stats || stats.length === 0) return 50; // Default rating

  // Calculate components
  const totalGames = stats.length;
  const wins = stats.filter((s: any) => s.won === true).length;
  const winRate = (wins / totalGames) * 100;

  const totalGoals = stats.reduce((sum: number, s: any) => sum + (s.goals || 0), 0);
  const totalAssists = stats.reduce((sum: number, s: any) => sum + (s.assists || 0), 0);
  const avgGoals = totalGoals / totalGames;
  const avgAssists = totalAssists / totalGames;

  // EA match ratings if available
  const gamesWithRating = stats.filter((s: any) => s.ea_match_rating !== null);
  const avgEARating = gamesWithRating.length > 0
    ? gamesWithRating.reduce((sum: number, s: any) => sum + s.ea_match_rating, 0) / gamesWithRating.length
    : null;

  // Calculate draft performance (weighted formula)
  // Win rate: 50% weight, Goals+Assists contribution: 30%, EA rating: 20%
  let draftRating = winRate * 0.5;

  // Goals+Assists contribution (normalize: 1 G/A per game = good)
  const gaContribution = Math.min(100, (avgGoals + avgAssists) * 50);
  draftRating += gaContribution * 0.3;

  // EA rating if available (already 0-10 scale, convert to 0-100)
  if (avgEARating !== null) {
    draftRating += (avgEARating * 10) * 0.2;
  } else {
    // If no EA rating, redistribute weight to win rate
    draftRating += winRate * 0.2;
  }

  return Math.max(0, Math.min(100, draftRating));
}

async function updatePlayerSummary(supabase: any, guildId: string, discordUserId: string) {
  // Gather all data for the summary
  const [ratingData, streakData, achievementData, reliabilityData, winsData, profileData] = await Promise.all([
    supabase.from("player_ratings").select("*").eq("guild_id", guildId).eq("discord_user_id", discordUserId).maybeSingle(),
    supabase.from("player_streaks").select("*").eq("guild_id", guildId).eq("discord_user_id", discordUserId).maybeSingle(),
    supabase.from("player_achievements").select("achievement_icon").eq("guild_id", guildId).eq("discord_user_id", discordUserId).order("earned_at", { ascending: false }).limit(3),
    supabase.from("player_reliability").select("reliability_score").eq("guild_id", guildId).eq("discord_user_id", discordUserId).maybeSingle(),
    supabase.from("competition_wins").select("competition_type, tier").eq("guild_id", guildId).eq("discord_user_id", discordUserId).eq("verified", true),
    supabase.from("profiles").select("discord_username, primary_position").eq("discord_user_id", discordUserId).maybeSingle(),
  ]);

  const rating = ratingData.data;
  const streak = streakData.data;
  const achievements = achievementData.data || [];
  const reliability = reliabilityData.data;
  const wins = winsData.data || [];
  const profile = profileData.data;

  // Calculate streak info
  const currentStreak = streak?.current_win_streak || -(streak?.current_loss_streak || 0);
  const streakType = currentStreak > 2 ? "hot" : currentStreak < -2 ? "cold" : "neutral";

  // Count competition wins
  const tournamentWins = wins.filter((w: any) => w.competition_type === "tournament").length;
  const leagueWins = wins.filter((w: any) => w.competition_type === "league").length;
  const majorWins = wins.filter((w: any) => ["major", "div1"].includes(w.tier)).length;

  // Upsert summary
  await supabase
    .from("player_summary")
    .upsert({
      guild_id: guildId,
      discord_user_id: discordUserId,
      discord_username: profile?.discord_username,
      overall_rating: rating?.overall_rating || 50,
      form_rating: streak?.form_rating,
      reliability_score: reliability?.reliability_score || 100,
      games_played: rating?.games_played || 0,
      wins: rating?.wins || 0,
      win_rate: rating?.games_played > 0 ? ((rating.wins / rating.games_played) * 100) : 0,
      goals: rating?.total_goals || 0,
      assists: rating?.total_assists || 0,
      current_streak: currentStreak,
      streak_type: streakType,
      longest_win_streak: streak?.longest_win_streak || 0,
      achievement_count: achievements.length,
      top_achievements: achievements.map((a: any) => a.achievement_icon),
      tournament_wins: tournamentWins,
      league_wins: leagueWins,
      major_wins: majorWins,
      primary_position: profile?.primary_position,
      last_active_at: rating?.last_game_at,
    }, { onConflict: "guild_id,discord_user_id" });
}
