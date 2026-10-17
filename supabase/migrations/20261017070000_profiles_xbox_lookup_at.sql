-- When the bot last tried to find this player's Xbox account, so misses aren't retried every run
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS xbox_lookup_at timestamptz;
