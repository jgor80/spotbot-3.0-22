-- Social Hub XP (public/spotbot/hub-xp.cjs): one row per player per server, across every lobby and
-- team. The bot writes with the service role; signed-in members read their own servers' rows for the
-- website's Hub page (my_guild_ids, as in 20261109120000).
CREATE TABLE IF NOT EXISTS public.hub_players (
  guild_id text NOT NULL,
  discord_user_id text NOT NULL,
  xp integer NOT NULL DEFAULT 0,
  level integer NOT NULL DEFAULT 1,
  games integer NOT NULL DEFAULT 0,
  wins integer NOT NULL DEFAULT 0,
  goals integer NOT NULL DEFAULT 0,
  assists integer NOT NULL DEFAULT 0,
  voice_minutes integer NOT NULL DEFAULT 0,
  calls integer NOT NULL DEFAULT 0,
  mates jsonb NOT NULL DEFAULT '[]'::jsonb,
  lobbies jsonb NOT NULL DEFAULT '[]'::jsonb,
  badges jsonb NOT NULL DEFAULT '[]'::jsonb,
  streak integer NOT NULL DEFAULT 0,
  best_streak integer NOT NULL DEFAULT 0,
  last_day date,
  week_key date,
  week_xp integer NOT NULL DEFAULT 0,
  week jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (guild_id, discord_user_id)
);

CREATE INDEX IF NOT EXISTS hub_players_week_idx ON public.hub_players (guild_id, week_key, week_xp DESC);
CREATE INDEX IF NOT EXISTS hub_players_xp_idx ON public.hub_players (guild_id, xp DESC);

ALTER TABLE public.hub_players ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hub_players FROM anon;
GRANT SELECT ON public.hub_players TO authenticated;
DROP POLICY IF EXISTS "Members of the server can read" ON public.hub_players;
CREATE POLICY "Members of the server can read" ON public.hub_players FOR SELECT TO authenticated USING (guild_id IN (SELECT public.my_guild_ids()));
