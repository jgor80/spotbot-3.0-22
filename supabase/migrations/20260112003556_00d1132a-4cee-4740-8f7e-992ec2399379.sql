-- Add new stats columns discovered from EA event codes
ALTER TABLE public.player_stats 
ADD COLUMN IF NOT EXISTS ball_recoveries integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS forward_passes integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS possession_gains integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS shots_off_target integer DEFAULT 0;

-- Also add to player_club_stats for EA member board aggregates
ALTER TABLE public.player_club_stats
ADD COLUMN IF NOT EXISTS ball_recoveries integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS forward_passes integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS possession_gains integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS shots_off_target integer DEFAULT 0;

-- Also add to player_ratings for overall tracking
ALTER TABLE public.player_ratings
ADD COLUMN IF NOT EXISTS ball_recoveries integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS forward_passes integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS possession_gains integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS shots_off_target integer DEFAULT 0;

-- Add index for position-based queries (common filter)
CREATE INDEX IF NOT EXISTS idx_player_stats_position ON public.player_stats (guild_id, position_played);
CREATE INDEX IF NOT EXISTS idx_player_stats_match_id ON public.player_stats (ea_match_id);