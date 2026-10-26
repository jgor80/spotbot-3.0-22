-- A player's own Twitch channel (login, lowercase), set from /manager → Admin → Import Twitch
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS twitch_username text;
