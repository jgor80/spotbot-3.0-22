import { supabase } from "@/integrations/supabase/client";
import { LeaderboardPlayer, PlayerProfile } from "@/types/player";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

export async function fetchPlayerProfile(
  guildId: string,
  discordUserId: string,
  options?: { includePositionBreakdown?: boolean; includeChemistry?: boolean; includeRecentGames?: boolean }
): Promise<PlayerProfile | null> {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/get-player-profile`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      guild_id: guildId,
      discord_user_id: discordUserId,
      include_position_breakdown: options?.includePositionBreakdown ?? true,
      include_chemistry: options?.includeChemistry ?? true,
      include_recent_games: options?.includeRecentGames ?? true,
    }),
  });

  if (!response.ok) {
    throw new Error("Failed to fetch player profile");
  }

  const data = await response.json();
  return data.player;
}

export async function fetchLeaderboard(
  guildId: string,
  type: string = "overall",
  position?: string,
  limit: number = 50,
  monthYear?: string,
  clubKey?: string,
  statsSource?: "all" | "members" | "games"
): Promise<LeaderboardPlayer[]> {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/get-leaderboard`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      guild_id: guildId,
      type,
      position,
      limit,
      month_year: monthYear,
      club_key: clubKey,
      stats_source: statsSource,
    }),
  });

  if (!response.ok) {
    throw new Error("Failed to fetch leaderboard");
  }

  const data = await response.json();
  // Map entries to expected format (API returns 'entries' not 'leaderboard')
  return (data.entries || data.leaderboard || []).map((player: any) => ({
    ...player,
    ea_username: player.ea_username || null,
  }));
}

export async function fetchAvailablePlayers(guildId: string): Promise<LeaderboardPlayer[]> {
  // First get player summaries
  const { data: summaryData, error: summaryError } = await supabase
    .from("player_summary")
    .select("*")
    .eq("guild_id", guildId)
    .order("overall_rating", { ascending: false });

  if (summaryError) throw summaryError;

  // Get EA usernames from profiles table
  const discordIds = (summaryData || []).map(p => p.discord_user_id);
  const { data: profilesData } = await supabase
    .from("profiles")
    .select("discord_user_id, ea_username")
    .in("discord_user_id", discordIds);

  const eaUsernameMap = new Map(
    (profilesData || []).map(p => [p.discord_user_id, p.ea_username])
  );

  return (summaryData || []).map((player, index) => ({
    discord_user_id: player.discord_user_id,
    discord_username: player.discord_username,
    ea_username: eaUsernameMap.get(player.discord_user_id) || null,
    overall_rating: player.overall_rating,
    games_played: player.games_played,
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
    passes_made: player.passes_made || 0,
    pass_attempts: player.pass_attempts || 0,
    saves: player.saves || 0,
    form_rating: player.form_rating,
    reliability_score: player.reliability_score,
    primary_position: player.primary_position,
    rank: index + 1,
    rating_tier: getRatingTier(player.overall_rating),
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
  const response = await fetch(`${SUPABASE_URL}/functions/v1/create-lineup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      guild_id: guildId,
      created_by_discord_id: createdBy,
      formation,
      slots,
      name,
      event_id: eventId,
    }),
  });

  if (!response.ok) {
    throw new Error("Failed to create lineup");
  }

  return response.json();
}

export async function suggestOptimalLineup(
  guildId: string,
  availablePlayerIds: string[],
  formation: string,
  priority: "balanced" | "rating" | "form" | "chemistry" = "balanced"
) {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/suggest-optimal-lineup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      guild_id: guildId,
      available_player_ids: availablePlayerIds,
      formation,
      priority,
    }),
  });

  if (!response.ok) {
    throw new Error("Failed to get lineup suggestion");
  }

  return response.json();
}

function getRatingTier(rating: number): { name: string; icon: string } {
  if (rating >= 85) return { name: "Elite", icon: "🏆" };
  if (rating >= 75) return { name: "Gold", icon: "🥇" };
  if (rating >= 60) return { name: "Silver", icon: "🥈" };
  if (rating >= 45) return { name: "Bronze", icon: "🥉" };
  return { name: "Unranked", icon: "⚪" };
}
