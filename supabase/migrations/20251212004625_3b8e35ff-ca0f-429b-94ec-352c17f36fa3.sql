-- Add unique constraint on position_preferences for guild_id + user_id to enable upsert
ALTER TABLE public.position_preferences 
ADD CONSTRAINT position_preferences_guild_user_unique 
UNIQUE (guild_id, user_id);