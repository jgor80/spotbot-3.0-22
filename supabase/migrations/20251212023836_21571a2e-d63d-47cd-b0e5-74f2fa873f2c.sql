-- Add new columns to player_stats table for expanded stat capture
ALTER TABLE public.player_stats
ADD COLUMN IF NOT EXISTS shots integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS tackles integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS passes_made integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS pass_attempts integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS red_cards boolean DEFAULT false;

-- Create club_stats table to cache club-level data from EA API
CREATE TABLE IF NOT EXISTS public.club_stats (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  guild_id text NOT NULL,
  club_key text NOT NULL,
  ea_club_id text NOT NULL,
  ea_platform text NOT NULL,
  skill_rating integer,
  wins integer DEFAULT 0,
  draws integer DEFAULT 0,
  losses integer DEFAULT 0,
  goals_scored integer DEFAULT 0,
  goals_conceded integer DEFAULT 0,
  total_members integer DEFAULT 0,
  best_division text,
  club_name text,
  last_synced_at timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(guild_id, club_key)
);

-- Enable RLS on club_stats
ALTER TABLE public.club_stats ENABLE ROW LEVEL SECURITY;

-- Create read policy for club_stats
CREATE POLICY "Allow public read on club_stats" 
ON public.club_stats 
FOR SELECT 
USING (true);

-- Create trigger for updated_at on club_stats
CREATE TRIGGER update_club_stats_updated_at
BEFORE UPDATE ON public.club_stats
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();