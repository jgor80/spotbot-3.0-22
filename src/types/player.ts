export interface PlayerProfile {
  discord_user_id: string;
  discord_username: string | null;
  discord_avatar: string | null;
  primary_position: string | null;
  overall_rating: number;
  games_played: number;
  wins: number;
  losses: number;
  draws: number;
  win_rate: number;
  goals: number;
  assists: number;
  form_rating: number | null;
  reliability_score: number | null;
  current_streak: number;
  streak_type: string | null;
  longest_win_streak: number;
  achievements: PlayerAchievement[];
  competition_wins: CompetitionWin[];
  position_breakdown?: PositionRating[];
  chemistry?: PlayerChemistry[];
  recent_games?: RecentGame[];
  rating_tier: {
    name: string;
    icon: string;
  };
  baseline_synced?: boolean;
}

export interface PlayerAchievement {
  id: string;
  achievement_key: string;
  achievement_name: string;
  achievement_icon: string;
  earned_at: string;
  context?: Record<string, unknown>;
}

export interface CompetitionWin {
  id: string;
  competition_name: string;
  competition_type: 'tournament' | 'league';
  tier: string;
  team_name: string | null;
  placed_at: string | null;
  verified: boolean;
}

export interface PositionRating {
  position: string;
  rating: number;
  games_at_position: number;
  goals_at_position: number;
  assists_at_position: number;
}

export interface PlayerChemistry {
  partner_id: string;
  partner_username: string | null;
  games_together: number;
  wins_together: number;
  win_rate: number;
  synergy_score: number | null;
}

export interface RecentGame {
  id: string;
  recorded_at: string;
  goals: number;
  assists: number;
  won: boolean | null;
  position_played: string | null;
  match_type: string;
}

export interface LeaderboardPlayer {
  discord_user_id: string;
  discord_username: string | null;
  ea_username: string | null;
  overall_rating: number;
  games_played: number;
  wins: number;
  losses: number;
  draws: number;
  win_rate: number;
  goals: number;
  assists: number;
  clean_sheets: number;
  man_of_match: number;
  avg_match_rating: number | null;
  shots: number;
  tackles: number;
  passes_made: number;
  pass_attempts: number;
  saves: number;
  form_rating: number | null;
  reliability_score: number | null;
  primary_position: string | null;
  rank: number;
  rating_tier: {
    name: string;
    icon: string;
  };
}

export interface LineupSlot {
  slot_index: number;
  position: string;
  discord_user_id: string;
  discord_username?: string;
  ea_username?: string;
  rating?: number;
  is_substitute: boolean;
}

export interface Lineup {
  id: string;
  name: string | null;
  formation: string;
  guild_id: string;
  created_by_discord_id: string;
  team_avg_rating: number | null;
  win_probability: number | null;
  share_code: string | null;
  slots: LineupSlot[];
  created_at: string;
}

export type FormationType = '4-3-3' | '4-4-2' | '3-5-2' | '4-2-3-1' | '5-3-2' | '4-1-4-1';

export interface FormationPosition {
  position: string;
  x: number;
  y: number;
}
