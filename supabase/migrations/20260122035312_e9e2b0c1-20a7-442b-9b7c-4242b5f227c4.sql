-- Add guild_name column to global_league_clubs for denormalization
ALTER TABLE global_league_clubs ADD COLUMN IF NOT EXISTS guild_name TEXT;

-- Backfill guild_name from guild_settings
UPDATE global_league_clubs c
SET guild_name = g.name
FROM guild_settings g
WHERE c.guild_id = g.guild_id AND c.guild_name IS NULL;

-- Create function to sync guild_name when guild_settings changes
CREATE OR REPLACE FUNCTION public.sync_guild_name_to_clubs()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  UPDATE global_league_clubs SET guild_name = NEW.name WHERE guild_id = NEW.guild_id;
  RETURN NEW;
END;
$$;

-- Create trigger to keep guild_name in sync
DROP TRIGGER IF EXISTS guild_name_sync ON guild_settings;
CREATE TRIGGER guild_name_sync
AFTER UPDATE OF name ON guild_settings
FOR EACH ROW EXECUTE FUNCTION sync_guild_name_to_clubs();

-- Also sync on insert
DROP TRIGGER IF EXISTS guild_name_sync_insert ON guild_settings;
CREATE TRIGGER guild_name_sync_insert
AFTER INSERT ON guild_settings
FOR EACH ROW EXECUTE FUNCTION sync_guild_name_to_clubs();

-- Create materialized view for Discord standings (pre-computed aggregation)
DROP MATERIALIZED VIEW IF EXISTS global_league_discord_standings;
CREATE MATERIALIZED VIEW global_league_discord_standings AS
SELECT 
  c.guild_id,
  MAX(c.guild_name) as guild_name,
  COUNT(*) as club_count,
  MAX(c.elo_rating) as best_elo,
  ROUND(AVG(c.elo_rating))::integer as avg_elo,
  SUM(c.elo_rating)::integer as total_elo,
  SUM(c.matches_played)::integer as total_matches,
  SUM(c.wins)::integer as wins,
  SUM(c.draws)::integer as draws,
  SUM(c.losses)::integer as losses,
  SUM(c.goals_for)::integer as goals_for,
  SUM(c.goals_against)::integer as goals_against,
  (SELECT c2.club_name FROM global_league_clubs c2 
   WHERE c2.guild_id = c.guild_id AND c2.status = 'active'
   ORDER BY c2.elo_rating DESC LIMIT 1) as best_club_name,
  MAX(c.updated_at) as last_updated
FROM global_league_clubs c
WHERE c.status = 'active'
GROUP BY c.guild_id;

-- Create indexes for fast querying
CREATE UNIQUE INDEX IF NOT EXISTS idx_discord_standings_guild_id ON global_league_discord_standings(guild_id);
CREATE INDEX IF NOT EXISTS idx_discord_standings_best_elo ON global_league_discord_standings(best_elo DESC);
CREATE INDEX IF NOT EXISTS idx_discord_standings_avg_elo ON global_league_discord_standings(avg_elo DESC);

-- Add index on global_league_clubs for faster guild_id lookups
CREATE INDEX IF NOT EXISTS idx_global_league_clubs_guild_id ON global_league_clubs(guild_id);
CREATE INDEX IF NOT EXISTS idx_global_league_clubs_elo ON global_league_clubs(elo_rating DESC) WHERE status = 'active';