-- Add baseline_synced column to track one-time EA aggregate stats pull
ALTER TABLE player_ratings ADD COLUMN IF NOT EXISTS baseline_synced BOOLEAN DEFAULT false;
ALTER TABLE player_summary ADD COLUMN IF NOT EXISTS baseline_synced BOOLEAN DEFAULT false;

-- Mark all existing players with stats as already synced to prevent overwrites
UPDATE player_ratings SET baseline_synced = true WHERE games_played > 0;
UPDATE player_summary SET baseline_synced = true WHERE games_played > 0;