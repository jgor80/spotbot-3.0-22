-- Create player_club_stats table to store EA member board stats per club
CREATE TABLE IF NOT EXISTS public.player_club_stats (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  guild_id TEXT NOT NULL,
  discord_user_id TEXT NOT NULL,
  club_key TEXT NOT NULL,
  ea_club_id TEXT,
  discord_username TEXT,
  primary_position TEXT,
  games_played INTEGER DEFAULT 0,
  wins INTEGER DEFAULT 0,
  losses INTEGER DEFAULT 0,
  draws INTEGER DEFAULT 0,
  win_rate NUMERIC DEFAULT 0.0,
  goals INTEGER DEFAULT 0,
  assists INTEGER DEFAULT 0,
  clean_sheets INTEGER DEFAULT 0,
  man_of_match INTEGER DEFAULT 0,
  avg_match_rating NUMERIC,
  shots INTEGER DEFAULT 0,
  tackles INTEGER DEFAULT 0,
  tackle_attempts INTEGER DEFAULT 0,
  passes_made INTEGER DEFAULT 0,
  pass_attempts INTEGER DEFAULT 0,
  saves INTEGER DEFAULT 0,
  saves_diving INTEGER DEFAULT 0,
  saves_reflex INTEGER DEFAULT 0,
  saves_parry INTEGER DEFAULT 0,
  saves_cross INTEGER DEFAULT 0,
  saves_punch INTEGER DEFAULT 0,
  goals_conceded INTEGER DEFAULT 0,
  interceptions INTEGER DEFAULT 0,
  clearances INTEGER DEFAULT 0,
  dribbles INTEGER DEFAULT 0,
  fouls INTEGER DEFAULT 0,
  offsides INTEGER DEFAULT 0,
  seconds_played INTEGER DEFAULT 0,
  archetypeid TEXT,
  baseline_synced BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT idx_player_club_stats_unique UNIQUE (guild_id, discord_user_id, club_key)
);

-- Enable RLS
ALTER TABLE public.player_club_stats ENABLE ROW LEVEL SECURITY;

-- Allow public read
CREATE POLICY "Allow public read on player_club_stats"
  ON public.player_club_stats
  FOR SELECT
  USING (true);

-- Create index for faster lookups
CREATE INDEX idx_player_club_stats_guild_club ON public.player_club_stats(guild_id, club_key);
CREATE INDEX idx_player_club_stats_user ON public.player_club_stats(guild_id, discord_user_id);