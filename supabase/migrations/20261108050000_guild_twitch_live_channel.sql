-- Where live cards for linked players are posted (/manager → Admin → Player Live Cards); null is off
ALTER TABLE public.guild_settings ADD COLUMN IF NOT EXISTS twitch_live_channel_id text;
