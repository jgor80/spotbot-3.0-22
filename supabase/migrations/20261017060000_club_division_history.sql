-- Division progress: one snapshot per club per day of what EA reports about the club's division,
-- skill rating and leaderboard rank, so the bot and website can show progress and a trend.
-- The EA sync (sync-ea-stats) upserts today's row on every run; earlier days are never changed.
-- Additive only.

CREATE TABLE IF NOT EXISTS public.club_division_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id TEXT NOT NULL,
  club_key TEXT NOT NULL,
  ea_club_id TEXT,
  ea_platform TEXT,
  captured_on DATE NOT NULL DEFAULT (now() AT TIME ZONE 'utc')::date,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  current_division INTEGER,                 -- EA division number, 1 is the top
  best_division INTEGER,
  skill_rating INTEGER,
  promotions INTEGER,                       -- EA's all-time counts
  relegations INTEGER,
  season_points INTEGER,                    -- only when EA sends division points for the season
  season_wins INTEGER,
  season_draws INTEGER,
  season_losses INTEGER,
  season_rank INTEGER,                      -- position on EA's season leaderboard (top 100 only)
  alltime_rank INTEGER,                     -- position on EA's all-time leaderboard (top 100 only)
  leaderboard_checked BOOLEAN NOT NULL DEFAULT false, -- EA's leaderboards answered, so a null rank means outside the top 100
  ea_fields JSONB,                          -- the division-related fields EA sent, kept for later use
  UNIQUE (guild_id, club_key, captured_on)
);
CREATE INDEX IF NOT EXISTS idx_club_division_history_club ON public.club_division_history(guild_id, club_key, captured_on DESC);

-- Same visibility as club_stats (public EA club info); only the service role writes it
ALTER TABLE public.club_division_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public read on club_division_history" ON public.club_division_history;
CREATE POLICY "Allow public read on club_division_history" ON public.club_division_history
  FOR SELECT USING (true);
