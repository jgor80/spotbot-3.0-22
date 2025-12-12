-- Add ea_match_id to player_stats for deduplication
ALTER TABLE public.player_stats
ADD COLUMN IF NOT EXISTS ea_match_id text;

-- Add unique constraint to prevent duplicate player stats per match
CREATE UNIQUE INDEX IF NOT EXISTS idx_player_stats_ea_match_unique 
ON public.player_stats (guild_id, discord_user_id, ea_match_id) 
WHERE ea_match_id IS NOT NULL;

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_player_stats_ea_match_id 
ON public.player_stats (ea_match_id) 
WHERE ea_match_id IS NOT NULL;