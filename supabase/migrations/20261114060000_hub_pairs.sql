-- Social Hub chemistry (public/spotbot/hub-chemistry.cjs): one row per pair of players per server
-- (user_a < user_b): games and minutes together, results of EA games together and a 0-100 score.
-- The bot writes with the service role; signed-in members read their own servers' rows.
CREATE TABLE IF NOT EXISTS public.hub_pairs (
  guild_id text NOT NULL,
  user_a text NOT NULL,
  user_b text NOT NULL,
  games integer NOT NULL DEFAULT 0,
  rated_games integer NOT NULL DEFAULT 0,
  wins integer NOT NULL DEFAULT 0,
  minutes integer NOT NULL DEFAULT 0,
  score integer NOT NULL DEFAULT 0,
  last_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (guild_id, user_a, user_b),
  CHECK (user_a < user_b)
);

CREATE INDEX IF NOT EXISTS hub_pairs_b_idx ON public.hub_pairs (guild_id, user_b);
CREATE INDEX IF NOT EXISTS hub_pairs_score_idx ON public.hub_pairs (guild_id, score DESC);

ALTER TABLE public.hub_pairs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hub_pairs FROM anon;
GRANT SELECT ON public.hub_pairs TO authenticated;
DROP POLICY IF EXISTS "Members of the server can read" ON public.hub_pairs;
CREATE POLICY "Members of the server can read" ON public.hub_pairs FOR SELECT TO authenticated USING (guild_id IN (SELECT public.my_guild_ids()));
