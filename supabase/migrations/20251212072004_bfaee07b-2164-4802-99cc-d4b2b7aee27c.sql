-- Add name column to guild_settings for Discord server name
ALTER TABLE public.guild_settings 
ADD COLUMN IF NOT EXISTS name text;

-- Update existing rows to use a reasonable default
UPDATE public.guild_settings 
SET name = 'Server ' || substring(guild_id from length(guild_id)-5)
WHERE name IS NULL;