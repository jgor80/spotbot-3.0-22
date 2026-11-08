-- The EA sync writes club_matches first, then one player_stats row per linked player. If any player row
-- failed, the match used to be skipped on every later sync and the missing rows were never written.
-- The sync now inserts each match with stats_complete = false and sets it true once every player row
-- saved; a false match is retried (player rows only) while EA still lists it.
-- Existing rows stay null, which the sync treats as complete.
ALTER TABLE public.club_matches ADD COLUMN IF NOT EXISTS stats_complete boolean;

COMMENT ON COLUMN public.club_matches.stats_complete IS
  'false while some player_stats rows for this match have not saved yet; null for rows written before this column existed';
