-- Add feedback_enabled toggle to guild_settings
ALTER TABLE public.guild_settings 
ADD COLUMN IF NOT EXISTS feedback_enabled boolean NOT NULL DEFAULT true;

-- Add unique constraint to prevent duplicate feedback requests per player per match
-- First, clean up any existing duplicates (keep the first one created)
DELETE FROM public.dm_feedback_requests a
USING public.dm_feedback_requests b
WHERE a.id > b.id 
  AND a.evaluator_discord_id = b.evaluator_discord_id 
  AND a.club_match_id = b.club_match_id
  AND a.club_match_id IS NOT NULL;

-- Add unique constraint
CREATE UNIQUE INDEX IF NOT EXISTS idx_dm_feedback_unique_player_match 
ON public.dm_feedback_requests (evaluator_discord_id, club_match_id) 
WHERE club_match_id IS NOT NULL;