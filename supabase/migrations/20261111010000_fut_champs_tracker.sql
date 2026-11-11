-- Champs / Rivals tracker: the user's own Ultimate Team games, logged by hand on the website (EA's FC 27 Champs
-- answers aren't known, so nothing is read from EA), grouped into runs (a Champs weekend, a Rivals week). Service role
-- only, like the rest of `fut`.

CREATE TABLE fut.ut_runs (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform       TEXT NOT NULL CHECK (platform IN ('console', 'pc')),
  mode           TEXT NOT NULL CHECK (mode IN ('champs', 'rivals', 'squad_battles', 'other')),
  name           TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
  -- How many games the run allows (Champs weekends have a fixed number) and the user's own goal; both optional.
  games_allowed  SMALLINT CHECK (games_allowed BETWEEN 1 AND 100),
  target_wins    SMALLINT CHECK (target_wins BETWEEN 1 AND 100),
  started_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at    TIMESTAMPTZ
);
CREATE INDEX ut_runs_user_idx ON fut.ut_runs (user_id, platform, started_at DESC);

CREATE TABLE fut.ut_games (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id              UUID NOT NULL REFERENCES fut.ut_runs(id) ON DELETE CASCADE,
  user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  played_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  goals_for           SMALLINT NOT NULL CHECK (goals_for BETWEEN 0 AND 30),
  goals_against       SMALLINT NOT NULL CHECK (goals_against BETWEEN 0 AND 30),
  -- A draw after extra time decided on penalties: who won the shootout.
  penalties           TEXT CHECK (penalties IN ('won', 'lost')),
  extra_time          BOOLEAN NOT NULL DEFAULT false,
  -- The opponent quit or disconnected (counts as the result EA gave).
  opponent_quit       BOOLEAN NOT NULL DEFAULT false,
  opponent_formation  TEXT CHECK (length(opponent_formation) <= 20),
  squad_name          TEXT CHECK (length(squad_name) <= 80),
  notes               TEXT CHECK (length(notes) <= 300)
);
CREATE INDEX ut_games_run_idx ON fut.ut_games (run_id, played_at);
CREATE INDEX ut_games_user_idx ON fut.ut_games (user_id, played_at DESC);

GRANT ALL ON fut.ut_runs, fut.ut_games TO service_role;
ALTER TABLE fut.ut_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE fut.ut_games ENABLE ROW LEVEL SECURITY;
