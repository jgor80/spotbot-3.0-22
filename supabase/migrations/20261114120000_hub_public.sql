-- Public Social Hub pages (gafferbot.app/play/<slug>, public/spotbot/social-hub.cjs publish): a server
-- admin opts in, and the bot keeps a small snapshot here (lobby counts and open positions, never who is
-- in a lobby; the weekly leaderboard by display name; the Join invite). Anyone can read it.
CREATE TABLE IF NOT EXISTS public.hub_public (
  guild_id text PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  icon_url text,
  invite_code text,
  members integer,
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.hub_public ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.hub_public TO anon, authenticated;
DROP POLICY IF EXISTS "Anyone can read public hubs" ON public.hub_public;
CREATE POLICY "Anyone can read public hubs" ON public.hub_public FOR SELECT TO anon, authenticated USING (true);
