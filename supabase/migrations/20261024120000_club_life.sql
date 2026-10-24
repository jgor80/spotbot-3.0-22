-- Club life: what the bot prints and awards, saved so the website can show it and the newspaper can
-- remember what it already said.
--   club_press        every Chronicle edition, session edition, match report and Network Wire, with the
--                     headline, lead story and phrase keys the paper uses to avoid repeating itself
--   player_career     running career totals per player per club, updated as matches sync (badges,
--                     milestones in reach and the website's career timeline read it)
--   player_badges     badges a player has unlocked, once each; one can be featured as a card frame
--   trophy_reigns     who held each weekly stat trophy (belt) and for how long
--   club_award_ballots / club_award_votes   Awards Night: nominations, one vote per member per category
--   player_goals      the assistant coach's weekly development goal per player, and how it went
--   player_wrapped    each player's Club Wrapped for a month or season
-- Only the bot and backend functions (service role) write these. Signed-in website users can read all
-- of them except the votes, which stay private (results are copied onto the ballot when it closes).
-- Additive only.

CREATE TABLE IF NOT EXISTS public.club_press (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id TEXT NOT NULL,
  club_key TEXT NOT NULL,
  kind TEXT NOT NULL,                        -- edition | session | match_report | network_wire | special
  printed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  headline TEXT,
  lead_key TEXT,                             -- the story the edition led with, e.g. streak:win:5
  story_keys TEXT[] NOT NULL DEFAULT '{}',   -- every story printed, for callbacks and to avoid reruns
  phrase_keys TEXT[] NOT NULL DEFAULT '{}',  -- pool lines used, so the next edition picks fresh ones
  player_keys TEXT[] NOT NULL DEFAULT '{}',  -- lowercase gamertags mentioned (player profile "In the papers")
  match_id TEXT,
  body JSONB NOT NULL DEFAULT '{}'::jsonb    -- the Discord embed as posted
);
CREATE INDEX IF NOT EXISTS idx_club_press_club ON public.club_press(guild_id, club_key, printed_at DESC);
CREATE INDEX IF NOT EXISTS idx_club_press_players ON public.club_press USING gin (player_keys);

CREATE TABLE IF NOT EXISTS public.player_career (
  guild_id TEXT NOT NULL,
  club_key TEXT NOT NULL,
  player_key TEXT NOT NULL,                  -- lowercase EA gamertag
  player_name TEXT NOT NULL,
  discord_user_id TEXT,
  apps INTEGER NOT NULL DEFAULT 0,
  wins INTEGER NOT NULL DEFAULT 0,
  goals INTEGER NOT NULL DEFAULT 0,
  assists INTEGER NOT NULL DEFAULT 0,
  motm INTEGER NOT NULL DEFAULT 0,
  clean_sheets INTEGER NOT NULL DEFAULT 0,
  braces INTEGER NOT NULL DEFAULT 0,
  hat_tricks INTEGER NOT NULL DEFAULT 0,
  cs_streak INTEGER NOT NULL DEFAULT 0,      -- current run of clean sheets as a keeper or defender
  lines JSONB NOT NULL DEFAULT '{}'::jsonb,  -- appearances per line: GK, DEF, MID, FWD
  best_rating NUMERIC(4,2),
  best_match_id TEXT,
  best_match_at TIMESTAMPTZ,
  first_match_at TIMESTAMPTZ,
  last_match_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (guild_id, club_key, player_key)
);
CREATE INDEX IF NOT EXISTS idx_player_career_user ON public.player_career(guild_id, discord_user_id);

CREATE TABLE IF NOT EXISTS public.player_badges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id TEXT NOT NULL,
  club_key TEXT NOT NULL,
  player_key TEXT NOT NULL,
  player_name TEXT NOT NULL,
  discord_user_id TEXT,
  badge TEXT NOT NULL,
  tier TEXT NOT NULL,                        -- common | rare | epic | legendary
  earned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  match_id TEXT,
  detail TEXT,
  featured BOOLEAN NOT NULL DEFAULT false,   -- shown as the frame on the player's Studio cards
  UNIQUE (guild_id, club_key, player_key, badge)
);
CREATE INDEX IF NOT EXISTS idx_player_badges_user ON public.player_badges(guild_id, discord_user_id);

CREATE TABLE IF NOT EXISTS public.trophy_reigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id TEXT NOT NULL,
  club_key TEXT NOT NULL,
  trophy TEXT NOT NULL,                      -- stat-roles.cjs TROPHIES key: boot, playmaker, glove, ...
  player_key TEXT NOT NULL,
  player_name TEXT NOT NULL,
  discord_user_id TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_trophy_reigns_club ON public.trophy_reigns(guild_id, club_key, trophy, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_trophy_reigns_open ON public.trophy_reigns(guild_id, club_key) WHERE ended_at IS NULL;

CREATE TABLE IF NOT EXISTS public.club_award_ballots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id TEXT NOT NULL,
  club_key TEXT NOT NULL,
  period_key TEXT NOT NULL,                  -- 2026-10 (month), fc27 (season) or custom-<date>
  period_label TEXT NOT NULL,
  kind TEXT NOT NULL,                        -- month | season | custom
  categories JSONB NOT NULL,                 -- [{ key, label, emoji, nominees: [{ key, name, discord_user_id, line, url }] }]
  status TEXT NOT NULL DEFAULT 'open',       -- open | closed
  opens_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closes_at TIMESTAMPTZ NOT NULL,
  closed_at TIMESTAMPTZ,
  channel_id TEXT,
  message_id TEXT,
  results JSONB,                             -- { category: { winner, votes: { nominee: n } } } once closed
  created_by_discord_id TEXT,
  UNIQUE (guild_id, club_key, period_key)
);
CREATE INDEX IF NOT EXISTS idx_club_award_ballots_open ON public.club_award_ballots(status, closes_at);

CREATE TABLE IF NOT EXISTS public.club_award_votes (
  ballot_id UUID NOT NULL REFERENCES public.club_award_ballots(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  discord_user_id TEXT NOT NULL,             -- the voter
  choice TEXT NOT NULL,                      -- nominee key
  voted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (ballot_id, category, discord_user_id)
);

CREATE TABLE IF NOT EXISTS public.player_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id TEXT NOT NULL,
  club_key TEXT NOT NULL,
  player_key TEXT NOT NULL,
  player_name TEXT NOT NULL,
  discord_user_id TEXT,
  week_start DATE NOT NULL,
  metric TEXT NOT NULL,
  label TEXT NOT NULL,                       -- "Complete 80% of your passes"
  target NUMERIC NOT NULL,
  baseline NUMERIC,
  result NUMERIC,
  games INTEGER,
  status TEXT NOT NULL DEFAULT 'open',       -- open | met | missed | no_games
  UNIQUE (guild_id, club_key, player_key, week_start)
);
CREATE INDEX IF NOT EXISTS idx_player_goals_user ON public.player_goals(guild_id, discord_user_id, week_start DESC);

CREATE TABLE IF NOT EXISTS public.player_wrapped (
  guild_id TEXT NOT NULL,
  club_key TEXT NOT NULL,
  period_key TEXT NOT NULL,                  -- 2026-10 or fc27
  period_label TEXT NOT NULL,
  player_key TEXT NOT NULL,
  player_name TEXT NOT NULL,
  discord_user_id TEXT,
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (guild_id, club_key, period_key, player_key)
);
CREATE INDEX IF NOT EXISTS idx_player_wrapped_user ON public.player_wrapped(guild_id, discord_user_id);

-- Reads for signed-in website users, never the anonymous key
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['club_press', 'player_career', 'player_badges', 'trophy_reigns', 'club_award_ballots', 'player_goals', 'player_wrapped'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    EXECUTE format('DROP POLICY IF EXISTS "Signed-in users can read %s" ON public.%I', t, t);
    EXECUTE format('CREATE POLICY "Signed-in users can read %s" ON public.%I FOR SELECT TO authenticated USING (true)', t, t);
  END LOOP;
END $$;

-- Votes are private: service role only
ALTER TABLE public.club_award_votes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.club_award_votes FROM anon, authenticated;
