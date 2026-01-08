-- Create club_sessions table for tracking gaming sessions
CREATE TABLE public.club_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_key TEXT NOT NULL,
  guild_id TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  player_count INTEGER DEFAULT 0,
  players JSONB DEFAULT '[]'::jsonb,
  match_count INTEGER DEFAULT 0,
  wins INTEGER DEFAULT 0,
  draws INTEGER DEFAULT 0,
  losses INTEGER DEFAULT 0,
  goals_for INTEGER DEFAULT 0,
  goals_against INTEGER DEFAULT 0,
  total_shots INTEGER DEFAULT 0,
  total_shots_on_target INTEGER DEFAULT 0,
  total_passes_made INTEGER DEFAULT 0,
  total_pass_attempts INTEGER DEFAULT 0,
  total_tackles INTEGER DEFAULT 0,
  total_tackle_attempts INTEGER DEFAULT 0,
  total_assists INTEGER DEFAULT 0,
  red_cards INTEGER DEFAULT 0,
  clean_sheets INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Add indexes for efficient querying
CREATE INDEX idx_club_sessions_club_key ON public.club_sessions(club_key);
CREATE INDEX idx_club_sessions_guild_id ON public.club_sessions(guild_id);
CREATE INDEX idx_club_sessions_started_at ON public.club_sessions(started_at DESC);

-- Enable RLS
ALTER TABLE public.club_sessions ENABLE ROW LEVEL SECURITY;

-- Allow read access for authenticated users
CREATE POLICY "Allow read access for authenticated users" 
ON public.club_sessions FOR SELECT 
TO authenticated 
USING (true);

-- Add new columns to club_stats
ALTER TABLE public.club_stats 
ADD COLUMN IF NOT EXISTS promotions INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS relegations INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_clean_sheets INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS previous_division TEXT;

-- Add session_id to club_matches
ALTER TABLE public.club_matches 
ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES public.club_sessions(id);