-- Create scouted_players table for opponent intelligence
CREATE TABLE public.scouted_players (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  guild_id TEXT NOT NULL,
  ea_club_id TEXT NOT NULL,
  ea_club_name TEXT,
  ea_username TEXT NOT NULL,
  ea_platform TEXT,
  games_played INTEGER DEFAULT 0,
  goals INTEGER DEFAULT 0,
  assists INTEGER DEFAULT 0,
  wins INTEGER DEFAULT 0,
  losses INTEGER DEFAULT 0,
  draws INTEGER DEFAULT 0,
  win_rate NUMERIC DEFAULT 0,
  avg_match_rating NUMERIC,
  clean_sheets INTEGER DEFAULT 0,
  man_of_match INTEGER DEFAULT 0,
  primary_position TEXT,
  archetypeid TEXT,
  shots INTEGER DEFAULT 0,
  tackles INTEGER DEFAULT 0,
  passes_made INTEGER DEFAULT 0,
  pass_attempts INTEGER DEFAULT 0,
  saves INTEGER DEFAULT 0,
  interceptions INTEGER DEFAULT 0,
  clearances INTEGER DEFAULT 0,
  last_scouted_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  first_seen_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  times_faced INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(guild_id, ea_club_id, ea_username)
);

-- Enable RLS
ALTER TABLE public.scouted_players ENABLE ROW LEVEL SECURITY;

-- Allow public read
CREATE POLICY "Allow public read on scouted_players"
ON public.scouted_players
FOR SELECT
USING (true);

-- Create index for quick lookups
CREATE INDEX idx_scouted_players_guild_club ON public.scouted_players(guild_id, ea_club_id);
CREATE INDEX idx_scouted_players_username ON public.scouted_players(ea_username);

-- Add trigger for updated_at
CREATE TRIGGER update_scouted_players_updated_at
BEFORE UPDATE ON public.scouted_players
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();