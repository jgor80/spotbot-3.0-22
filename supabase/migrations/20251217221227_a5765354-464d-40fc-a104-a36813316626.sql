-- Add position-specific rating columns to peer_evaluations
ALTER TABLE peer_evaluations
ADD COLUMN IF NOT EXISTS passing_skill integer,
ADD COLUMN IF NOT EXISTS goal_scoring integer,
ADD COLUMN IF NOT EXISTS defensive_skill integer;