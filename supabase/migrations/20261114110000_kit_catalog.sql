-- Personal Studio kits for Social Hub players (public/spotbot/kit-catalog.cjs): the kit a player picked
-- (profiles.studio_kit) and how often each kit is picked (kit_popularity, the top 50 are shown first).
-- Service role only.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS studio_kit jsonb;

CREATE TABLE IF NOT EXISTS public.kit_popularity (
  kit_key text PRIMARY KEY,
  kit jsonb NOT NULL,
  picks integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS kit_popularity_picks_idx ON public.kit_popularity (picks DESC);
ALTER TABLE public.kit_popularity ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.kit_popularity FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.bump_kit_popularity(p_key text, p_kit jsonb)
RETURNS void
LANGUAGE sql
SET search_path = public
AS $$
  INSERT INTO public.kit_popularity (kit_key, kit, picks, updated_at)
  VALUES (p_key, p_kit, 1, now())
  ON CONFLICT (kit_key) DO UPDATE SET picks = public.kit_popularity.picks + 1, kit = EXCLUDED.kit, updated_at = now();
$$;
REVOKE ALL ON FUNCTION public.bump_kit_popularity(text, jsonb) FROM PUBLIC, anon, authenticated;
