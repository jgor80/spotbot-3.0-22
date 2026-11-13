-- Social Hub settings (public/spotbot/social-hub.cjs): on, lobby club keys, category, and the live
-- who's-playing-where board's channel and message. Empty means the server has no hub.
ALTER TABLE public.guild_settings ADD COLUMN IF NOT EXISTS social_hub jsonb NOT NULL DEFAULT '{}'::jsonb;
