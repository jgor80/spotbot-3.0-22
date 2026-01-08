-- Add club-level form tracking and metadata columns to club_stats
ALTER TABLE public.club_stats 
ADD COLUMN IF NOT EXISTS unbeaten_streak integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS win_streak integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS loss_streak integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS league_games integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS cup_games integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS friendly_games integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_5_results text[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS last_10_results text[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS stadium_name text,
ADD COLUMN IF NOT EXISTS region text,
ADD COLUMN IF NOT EXISTS reputation_tier text;