-- Social Hub seasons (public/spotbot/hub-xp.cjs): season XP resets each calendar month (UTC; levels
-- stay), and on the 1st the top three of last month go into the Hall of Fame. Members read their own
-- servers' rows for the website's Hub page.
ALTER TABLE public.hub_players ADD COLUMN IF NOT EXISTS season_key text;
ALTER TABLE public.hub_players ADD COLUMN IF NOT EXISTS season_xp integer NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS hub_players_season_idx ON public.hub_players (guild_id, season_key, season_xp DESC);

CREATE TABLE IF NOT EXISTS public.hub_hall_of_fame (
  guild_id text NOT NULL,
  season_key text NOT NULL,
  place integer NOT NULL,
  discord_user_id text NOT NULL,
  xp integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (guild_id, season_key, place)
);

ALTER TABLE public.hub_hall_of_fame ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hub_hall_of_fame FROM anon;
GRANT SELECT ON public.hub_hall_of_fame TO authenticated;
DROP POLICY IF EXISTS "Members of the server can read" ON public.hub_hall_of_fame;
CREATE POLICY "Members of the server can read" ON public.hub_hall_of_fame FOR SELECT TO authenticated USING (guild_id IN (SELECT public.my_guild_ids()));
