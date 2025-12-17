-- Add vibe rating columns to peer_evaluations table
ALTER TABLE public.peer_evaluations
ADD COLUMN IF NOT EXISTS enjoyment integer CHECK (enjoyment >= 1 AND enjoyment <= 5),
ADD COLUMN IF NOT EXISTS team_energy integer CHECK (team_energy >= 1 AND team_energy <= 5),
ADD COLUMN IF NOT EXISTS play_again text CHECK (play_again IN ('prefer', 'neutral', 'avoid'));

-- Create player_vibe_chemistry table for aggregated vibe chemistry between player pairs
CREATE TABLE IF NOT EXISTS public.player_vibe_chemistry (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  guild_id text NOT NULL,
  player_a_discord_id text NOT NULL,
  player_b_discord_id text NOT NULL,
  games_together integer NOT NULL DEFAULT 0,
  avg_enjoyment numeric DEFAULT NULL,
  avg_team_energy numeric DEFAULT NULL,
  prefer_count integer NOT NULL DEFAULT 0,
  neutral_count integer NOT NULL DEFAULT 0,
  avoid_count integer NOT NULL DEFAULT 0,
  vibe_score numeric DEFAULT NULL,
  vibe_status text DEFAULT 'neutral',
  last_played_together timestamp with time zone DEFAULT NULL,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(guild_id, player_a_discord_id, player_b_discord_id)
);

-- Enable RLS
ALTER TABLE public.player_vibe_chemistry ENABLE ROW LEVEL SECURITY;

-- Create read policy
CREATE POLICY "Allow public read on player_vibe_chemistry"
ON public.player_vibe_chemistry
FOR SELECT
USING (true);

-- Create index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_vibe_chemistry_guild ON public.player_vibe_chemistry(guild_id);
CREATE INDEX IF NOT EXISTS idx_vibe_chemistry_players ON public.player_vibe_chemistry(player_a_discord_id, player_b_discord_id);

-- Add vibe_score to player_summary for overall likability
ALTER TABLE public.player_summary
ADD COLUMN IF NOT EXISTS vibe_score numeric DEFAULT NULL;

-- Add vibe_chemistry_score to lineups for team vibe calculation
ALTER TABLE public.lineups
ADD COLUMN IF NOT EXISTS vibe_chemistry_score numeric DEFAULT NULL;