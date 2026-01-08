-- Add new columns to club_stats table for complete EA API data
ALTER TABLE club_stats ADD COLUMN IF NOT EXISTS crest_id text;
ALTER TABLE club_stats ADD COLUMN IF NOT EXISTS current_division text;
ALTER TABLE club_stats ADD COLUMN IF NOT EXISTS overall_matches_played integer;
ALTER TABLE club_stats ADD COLUMN IF NOT EXISTS playoff_achievements jsonb;
ALTER TABLE club_stats ADD COLUMN IF NOT EXISTS custom_kit_home jsonb;
ALTER TABLE club_stats ADD COLUMN IF NOT EXISTS region text;

-- Add new columns to profiles table for career stats and preferred position
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS preferred_position text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS career_goals integer;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS career_assists integer;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS career_appearances integer;