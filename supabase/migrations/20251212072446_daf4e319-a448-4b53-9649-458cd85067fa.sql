-- Add extended stats columns to player_ratings for EA career data
ALTER TABLE public.player_ratings 
ADD COLUMN IF NOT EXISTS shots integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS tackles integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS passes_made integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS pass_attempts integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS saves integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS interceptions integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS clearances integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS avg_match_rating numeric DEFAULT 0;

-- Add extended stats to player_summary for display
ALTER TABLE public.player_summary
ADD COLUMN IF NOT EXISTS shots integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS tackles integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS passes_made integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS pass_attempts integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS saves integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS avg_match_rating numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS clean_sheets integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS man_of_match integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS losses integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS draws integer DEFAULT 0;