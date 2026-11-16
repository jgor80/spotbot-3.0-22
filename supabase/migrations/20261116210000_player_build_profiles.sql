-- A member's own Virtual Pro masteries (level per archetype) and club facility boosts, saved once from
-- gafferbot.app/build and applied to every build: on the website and on Graphics Studio build cards.
-- Written only through the player-cards function (the signed-in member's verified Discord link). Service role only.
CREATE TABLE IF NOT EXISTS public.player_build_profiles (
  discord_user_id text PRIMARY KEY,
  mastery_levels jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(mastery_levels) = 'object'),
  boosts jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(boosts) = 'object'),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.player_build_profiles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.player_build_profiles FROM anon, authenticated;
