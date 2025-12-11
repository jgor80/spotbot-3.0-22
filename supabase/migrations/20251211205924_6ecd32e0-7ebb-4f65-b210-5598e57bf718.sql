-- Create club_matches table to track processed EA FC matches
CREATE TABLE public.club_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id TEXT NOT NULL,
  club_key TEXT NOT NULL,
  ea_match_id TEXT NOT NULL,
  match_type TEXT NOT NULL DEFAULT 'division', -- 'division', 'cup', 'friendly'
  result TEXT, -- 'win', 'loss', 'draw'
  score_for INTEGER,
  score_against INTEGER,
  opponent_club_name TEXT,
  opponent_club_id TEXT,
  match_data JSONB, -- Full EA response for reference
  player_stats JSONB, -- Array of {ea_username, goals, assists, rating, position, motm}
  processed_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  
  -- Ensure we don't process same match twice
  UNIQUE(guild_id, club_key, ea_match_id)
);

-- Enable RLS
ALTER TABLE public.club_matches ENABLE ROW LEVEL SECURITY;

-- Allow public read access (like other tables)
CREATE POLICY "Allow public read on club_matches"
ON public.club_matches
FOR SELECT
USING (true);

-- Create index for efficient querying
CREATE INDEX idx_club_matches_guild_club ON public.club_matches(guild_id, club_key);
CREATE INDEX idx_club_matches_processed ON public.club_matches(processed_at DESC);