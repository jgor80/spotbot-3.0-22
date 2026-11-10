-- Matchday Picks (matchday-picks.cjs) and rivalries (rivalries.cjs). The bot writes with the service role;
-- signed-in members read their own servers' rows (my_guild_ids, as in 20261109120000). Player of the Night
-- votes stay private: service role only.

CREATE TABLE IF NOT EXISTS public.matchday_rounds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id TEXT NOT NULL,
  club_key TEXT NOT NULL,
  season_key TEXT NOT NULL,                  -- EA season code (ea_seasons) or YYYY-MM when none is known
  season_label TEXT,
  status TEXT NOT NULL DEFAULT 'open',       -- open | locked | scoring | voting | closed | void
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  locks_at TIMESTAMPTZ,                      -- picks made after this don't score
  closed_at TIMESTAMPTZ,
  candidates JSONB NOT NULL DEFAULT '[]'::jsonb,   -- [{ key, name }] players on the card
  outcome JSONB,                             -- the night: record, verdict, top scorers, per-player lines
  potn_options JSONB,                        -- [{ key, name, line }]
  potn_closes_at TIMESTAMPTZ,
  potn_winner TEXT,
  potn_counts JSONB,
  channel_id TEXT,
  message_id TEXT,
  potn_message_id TEXT,
  created_by_discord_id TEXT
);
CREATE INDEX IF NOT EXISTS idx_matchday_rounds_club ON public.matchday_rounds(guild_id, club_key, opened_at DESC);
CREATE INDEX IF NOT EXISTS idx_matchday_rounds_status ON public.matchday_rounds(status, potn_closes_at);

CREATE TABLE IF NOT EXISTS public.matchday_picks (
  round_id UUID NOT NULL REFERENCES public.matchday_rounds(id) ON DELETE CASCADE,
  discord_user_id TEXT NOT NULL,
  verdict TEXT,                              -- win | even | loss
  scorer TEXT,                               -- player key (lowercase gamertag)
  captain TEXT,
  picked_at TIMESTAMPTZ,
  points INTEGER NOT NULL DEFAULT 0,
  breakdown JSONB NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (round_id, discord_user_id)
);

CREATE TABLE IF NOT EXISTS public.matchday_potn_votes (
  round_id UUID NOT NULL REFERENCES public.matchday_rounds(id) ON DELETE CASCADE,
  discord_user_id TEXT NOT NULL,
  choice TEXT NOT NULL,
  voted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (round_id, discord_user_id)
);

CREATE TABLE IF NOT EXISTS public.club_rivalries (
  guild_id TEXT NOT NULL,
  club_key TEXT NOT NULL,
  opponent TEXT NOT NULL,
  level TEXT NOT NULL,                       -- rival (3+ meetings) | derby (10+)
  games INTEGER NOT NULL,
  wins INTEGER NOT NULL,
  draws INTEGER NOT NULL,
  losses INTEGER NOT NULL,
  goals_for INTEGER NOT NULL,
  goals_against INTEGER NOT NULL,
  form TEXT,                                 -- last five, oldest first: WDLWW
  streak JSONB,                              -- { result, count }
  biggest_win JSONB,                         -- { margin, score, at }
  last_result JSONB,                         -- { result, score, at, id }
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (guild_id, club_key, opponent)
);

ALTER TABLE public.matchday_rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matchday_picks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matchday_potn_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.club_rivalries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.matchday_rounds, public.matchday_picks, public.club_rivalries FROM anon;
REVOKE ALL ON public.matchday_potn_votes FROM anon, authenticated;
GRANT SELECT ON public.matchday_rounds, public.matchday_picks, public.club_rivalries TO authenticated;

DROP POLICY IF EXISTS "Members of the server can read" ON public.matchday_rounds;
CREATE POLICY "Members of the server can read" ON public.matchday_rounds FOR SELECT TO authenticated USING (guild_id IN (SELECT public.my_guild_ids()));
DROP POLICY IF EXISTS "Members of the server can read" ON public.club_rivalries;
CREATE POLICY "Members of the server can read" ON public.club_rivalries FOR SELECT TO authenticated USING (guild_id IN (SELECT public.my_guild_ids()));
DROP POLICY IF EXISTS "Members of the server can read" ON public.matchday_picks;
CREATE POLICY "Members of the server can read" ON public.matchday_picks FOR SELECT TO authenticated
  USING (round_id IN (SELECT r.id FROM public.matchday_rounds r WHERE r.guild_id IN (SELECT public.my_guild_ids())));
