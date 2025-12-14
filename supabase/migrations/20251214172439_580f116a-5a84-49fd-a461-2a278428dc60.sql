-- Change teammates_to_evaluate to JSONB to store both discord_user_id and position_played
-- First add the new column
ALTER TABLE public.dm_feedback_requests 
ADD COLUMN IF NOT EXISTS teammates_data JSONB DEFAULT '[]'::jsonb;

-- Add comment explaining the structure
COMMENT ON COLUMN public.dm_feedback_requests.teammates_data IS 'Array of {discord_user_id, position_played, ea_username} objects for teammates to evaluate';