-- A player's own Twitch channel (login, lowercase), set from /manager → Admin → Import Twitch
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS twitch_username text;

-- One Twitch account belongs to one player: a second profile can never take the same login
CREATE UNIQUE INDEX IF NOT EXISTS profiles_twitch_username_unique
  ON public.profiles (lower(twitch_username))
  WHERE twitch_username IS NOT NULL;
