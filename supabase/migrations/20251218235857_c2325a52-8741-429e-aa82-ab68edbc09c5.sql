-- Add second_assists and dribble_attempts columns to player_stats
ALTER TABLE public.player_stats ADD COLUMN IF NOT EXISTS second_assists integer DEFAULT 0;
ALTER TABLE public.player_stats ADD COLUMN IF NOT EXISTS dribble_attempts integer DEFAULT 0;

-- Add to player_summary
ALTER TABLE public.player_summary ADD COLUMN IF NOT EXISTS second_assists integer DEFAULT 0;
ALTER TABLE public.player_summary ADD COLUMN IF NOT EXISTS dribble_attempts integer DEFAULT 0;

-- Add to player_ratings
ALTER TABLE public.player_ratings ADD COLUMN IF NOT EXISTS total_second_assists integer DEFAULT 0;
ALTER TABLE public.player_ratings ADD COLUMN IF NOT EXISTS dribble_attempts integer DEFAULT 0;

-- Add to player_club_stats
ALTER TABLE public.player_club_stats ADD COLUMN IF NOT EXISTS second_assists integer DEFAULT 0;
ALTER TABLE public.player_club_stats ADD COLUMN IF NOT EXISTS dribble_attempts integer DEFAULT 0;

-- Add to scouted_players for opponent tracking
ALTER TABLE public.scouted_players ADD COLUMN IF NOT EXISTS second_assists integer DEFAULT 0;
ALTER TABLE public.scouted_players ADD COLUMN IF NOT EXISTS dribble_attempts integer DEFAULT 0;