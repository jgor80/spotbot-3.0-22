-- Add row-level pending rating columns to prevent race conditions
ALTER TABLE dm_feedback_requests 
ADD COLUMN IF NOT EXISTS pending_player_id text,
ADD COLUMN IF NOT EXISTS pending_performance integer,
ADD COLUMN IF NOT EXISTS pending_enjoyment integer,
ADD COLUMN IF NOT EXISTS pending_energy integer;