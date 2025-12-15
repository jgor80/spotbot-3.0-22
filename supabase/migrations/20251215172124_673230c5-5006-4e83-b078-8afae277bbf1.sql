-- Add GK-specific stats columns to player_stats table
ALTER TABLE public.player_stats
ADD COLUMN IF NOT EXISTS saves_diving integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS saves_reflex integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS saves_parry integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS saves_cross integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS saves_punch integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS goals_conceded integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS seconds_played integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS archetypeid text,
ADD COLUMN IF NOT EXISTS tackle_attempts integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS interceptions integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS clearances integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS possession numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS dribbles integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS fouls integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS offsides integer DEFAULT 0;

-- Add same columns to player_ratings for aggregated stats
ALTER TABLE public.player_ratings
ADD COLUMN IF NOT EXISTS saves_diving integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS saves_reflex integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS saves_parry integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS saves_cross integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS saves_punch integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS goals_conceded integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS tackle_attempts integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS dribbles integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS fouls integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS offsides integer DEFAULT 0;

-- Add same columns to player_summary for display
ALTER TABLE public.player_summary
ADD COLUMN IF NOT EXISTS saves_diving integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS saves_reflex integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS saves_parry integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS saves_cross integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS saves_punch integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS goals_conceded integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS interceptions integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS clearances integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS possession numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS dribbles integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS fouls integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS offsides integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS seconds_played integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS archetypeid text,
ADD COLUMN IF NOT EXISTS tackle_attempts integer DEFAULT 0;