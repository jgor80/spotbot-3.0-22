-- Game nights (Jeff, 2026-11-17: "make it easier to schedule 2-3 games at different times on the same night ...
-- like say there's 2-3 games in a row"). Each game stays its own availability event (board, answers, lineup,
-- check-in); the games of one night share night_id so the night pings once, reminds each player once and
-- lineups can be copied or auto-filled across it (public/spotbot/event-night.cjs).
ALTER TABLE public.availability_events
  ADD COLUMN IF NOT EXISTS night_id UUID,
  ADD COLUMN IF NOT EXISTS night_game SMALLINT;
CREATE INDEX IF NOT EXISTS idx_availability_events_night ON public.availability_events(night_id) WHERE night_id IS NOT NULL;
