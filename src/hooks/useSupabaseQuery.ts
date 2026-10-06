import { supabase } from "@/integrations/supabase/client";
import { LeaderboardPlayer, PlayerProfile } from "@/types/player";

// Edge functions reject anonymous calls, so go through the client: it sends the signed-in user's token.
async function callFunction<T = any>(name: string, body: Record<string, unknown>, failure: string): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) throw new Error(failure);
  return data as T;
}

export async function fetchPlayerProfile(
  guildId: string,
  discordUserId: string,
  options?: { 
    includePositionBreakdown?: boolean; 
    includeChemistry?: boolean; 
    includeVibeChemistry?: boolean;
    includeRecentGames?: boolean 
  }
): Promise<PlayerProfile | null> {
  const data = await callFunction("get-player-profile", {
      guild_id: guildId,
      discord_user_id: discordUserId,
      include_position_breakdown: options?.includePositionBreakdown ?? true,
      include_chemistry: options?.includeChemistry ?? true,
      include_vibe_chemistry: options?.includeVibeChemistry ?? true,
      include_recent_games: options?.includeRecentGames ?? true,
    }, "Failed to fetch player profile");
  
  // Map the API response to match frontend types
  const player = data.player;
  if (!player) return null;
  
  return {
    discord_user_id: player.discord_user_id,
    discord_username: player.discord_username,
    discord_avatar: player.discord_avatar,
    primary_position: player.primary_position,
    overall_rating: player.overall_rating,
    games_played: player.games_played,
    wins: player.wins,
    losses: player.losses,
    draws: player.draws,
    win_rate: parseFloat(player.win_rate) || 0,
    goals: player.goals,
    assists: player.assists,
    form_rating: player.form?.form_rating || null,
    reliability_score: player.reliability?.score || null,
    current_streak: player.form?.current_win_streak || player.form?.current_loss_streak || 0,
    streak_type: player.form?.current_win_streak > 0 ? "win" : player.form?.current_loss_streak > 0 ? "loss" : null,
    longest_win_streak: player.form?.longest_win_streak || 0,
    achievements: player.achievements || [],
    competition_wins: [
      ...(player.competition_wins?.tournaments || []),
      ...(player.competition_wins?.leagues || []),
    ],
    position_breakdown: player.position_breakdown?.map((p: any) => ({
      position: p.position,
      rating: p.rating,
      games_at_position: p.games_at_position,
      goals_at_position: p.goals_at_position,
      assists_at_position: p.assists_at_position,
    })) || [],
    chemistry: player.top_chemistry?.map((c: any) => ({
      partner_id: c.partner_discord_id,
      partner_username: c.partner_username || null,
      games_together: c.games_together,
      wins_together: c.wins_together,
      win_rate: c.win_rate / 100, // Convert percentage to decimal
      synergy_score: c.synergy_score,
    })) || [],
    vibe_chemistry: player.vibe_chemistry?.map((v: any) => ({
      partner_id: v.partner_discord_id,
      partner_username: v.partner_username || null,
      games_together: v.games_together,
      vibe_score: v.vibe_score,
      vibe_status: v.vibe_status,
      prefer_count: v.prefer_count,
      neutral_count: v.neutral_count,
      avoid_count: v.avoid_count,
      avg_enjoyment: v.avg_enjoyment,
      avg_team_energy: v.avg_team_energy,
      last_played_together: v.last_played_together,
    })) || [],
    recent_games: player.recent_games || [],
    rating_tier: player.rating_tier,
    baseline_synced: player.baseline_synced,
  };
}

export async function fetchLeaderboard(
  guildId: string,
  type: string = "overall",
  position?: string,
  limit: number = 50,
  timePeriod?: string,
  clubKey?: string,
  statsSource?: "all" | "members" | "games",
  matchType?: string
): Promise<LeaderboardPlayer[]> {
  const data = await callFunction("get-leaderboard", {
      guild_id: guildId,
      type,
      position,
      limit,
      time_period: timePeriod,
      club_key: clubKey,
      stats_source: statsSource,
      match_type: matchType === "all" ? undefined : matchType,
    }, "Failed to fetch leaderboard");
  // Map entries to expected format (API returns 'entries' not 'leaderboard')
  return (data.entries || data.leaderboard || []).map((player: any) => ({
    ...player,
    ea_username: player.ea_username || null,
    draws: player.draws || 0,
    losses: player.losses || 0,
  }));
}

export async function fetchAvailablePlayers(guildId: string): Promise<LeaderboardPlayer[]> {
  // Use the leaderboard function with stats_source=games for unified tracked game stats
  const data = await callFunction("get-leaderboard", {
      guild_id: guildId,
      type: "overall",
      limit: 500,
      stats_source: "games", // Use tracked games for unified stats
    }, "Failed to fetch available players");
  return (data.entries || data.leaderboard || []).map((player: any, index: number) => ({
    discord_user_id: player.discord_user_id,
    discord_username: player.discord_username,
    ea_username: player.ea_username || null,
    overall_rating: player.overall_rating,
    games_played: player.games_played,
    tracked_games: player.tracked_games || 0,
    wins: player.wins,
    losses: player.losses || 0,
    draws: player.draws || 0,
    win_rate: player.win_rate || 0,
    goals: player.goals,
    assists: player.assists,
    clean_sheets: player.clean_sheets || 0,
    man_of_match: player.man_of_match || 0,
    avg_match_rating: player.avg_match_rating,
    shots: player.shots || 0,
    tackles: player.tackles || 0,
    tackle_attempts: player.tackle_attempts || 0,
    passes_made: player.passes_made || 0,
    pass_attempts: player.pass_attempts || 0,
    saves: player.saves || 0,
    saves_diving: player.saves_diving || 0,
    saves_reflex: player.saves_reflex || 0,
    saves_parry: player.saves_parry || 0,
    saves_cross: player.saves_cross || 0,
    saves_punch: player.saves_punch || 0,
    goals_conceded: player.goals_conceded || 0,
    interceptions: player.interceptions || 0,
    clearances: player.clearances || 0,
    dribbles: player.dribbles || 0,
    fouls: player.fouls || 0,
    offsides: player.offsides || 0,
    seconds_played: player.seconds_played || 0,
    form_rating: player.form_rating,
    reliability_score: player.reliability_score,
    primary_position: player.primary_position,
    rank: player.rank || index + 1,
    rating_tier: player.rating_tier || getRatingTier(player.overall_rating),
  }));
}

export async function createLineup(
  guildId: string,
  createdBy: string,
  formation: string,
  slots: { slot_index: number; position: string; discord_user_id: string; is_substitute: boolean }[],
  name?: string,
  eventId?: string
) {
  return callFunction("create-lineup", {
      guild_id: guildId,
      created_by_discord_id: createdBy,
      formation,
      slots,
      name,
      event_id: eventId,
    }, "Failed to create lineup");
}

export async function suggestOptimalLineup(
  guildId: string,
  availablePlayerIds: string[],
  formation: string,
  priority: "balanced" | "rating" | "form" | "chemistry" = "balanced"
) {
  return callFunction("suggest-optimal-lineup", {
      guild_id: guildId,
      available_player_ids: availablePlayerIds,
      formation,
      priority,
    }, "Failed to get lineup suggestion");
}

function getRatingTier(rating: number): { name: string; icon: string } {
  if (rating >= 85) return { name: "Elite", icon: "🏆" };
  if (rating >= 75) return { name: "Gold", icon: "🥇" };
  if (rating >= 60) return { name: "Silver", icon: "🥈" };
  if (rating >= 45) return { name: "Bronze", icon: "🥉" };
  return { name: "Unranked", icon: "⚪" };
}
