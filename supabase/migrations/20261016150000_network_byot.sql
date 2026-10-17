-- GafferBot-hosted BYOT tournaments: clubs from any network server sign up, the bot draws a knockout
-- bracket seeded by EA skill rating, games are network_fixtures (kind 'byot') whose results come from
-- the EA sync, and draws or missing games go to the host. Additive only; RLS on, no public policies.

CREATE TABLE IF NOT EXISTS public.network_tournaments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  platform TEXT NOT NULL,
  max_teams INTEGER NOT NULL DEFAULT 16,
  starts_at TIMESTAMPTZ NOT NULL,           -- round 1 kick-off; sign-ups close then
  round_minutes INTEGER NOT NULL DEFAULT 45,
  rounds INTEGER,                           -- fixed when the bracket is drawn
  status TEXT NOT NULL DEFAULT 'signup' CHECK (status IN ('signup', 'running', 'finished', 'cancelled')),
  champion_entry_id UUID,
  posts JSONB NOT NULL DEFAULT '[]'::jsonb,  -- announcement cards in network channels
  created_by_discord_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ
);
ALTER TABLE public.network_tournaments ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.network_tournament_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID NOT NULL REFERENCES public.network_tournaments(id) ON DELETE CASCADE,
  guild_id TEXT NOT NULL,
  club_key TEXT NOT NULL,
  club_name TEXT NOT NULL,
  ea_club_id TEXT NOT NULL,
  skill_rating INTEGER,
  seed INTEGER,
  status TEXT NOT NULL DEFAULT 'entered' CHECK (status IN ('entered', 'withdrawn', 'out', 'champion')),
  entered_by_discord_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tournament_id, ea_club_id)
);
CREATE INDEX IF NOT EXISTS idx_network_entries_tournament ON public.network_tournament_entries(tournament_id, status);
ALTER TABLE public.network_tournament_entries ENABLE ROW LEVEL SECURITY;

-- Bracket position and outcome on the shared fixtures table
ALTER TABLE public.network_fixtures ADD COLUMN IF NOT EXISTS tournament_id UUID REFERENCES public.network_tournaments(id) ON DELETE CASCADE;
ALTER TABLE public.network_fixtures ADD COLUMN IF NOT EXISTS round INTEGER;
ALTER TABLE public.network_fixtures ADD COLUMN IF NOT EXISTS slot INTEGER;
ALTER TABLE public.network_fixtures ADD COLUMN IF NOT EXISTS from_entry_id UUID;
ALTER TABLE public.network_fixtures ADD COLUMN IF NOT EXISTS to_entry_id UUID;
ALTER TABLE public.network_fixtures ADD COLUMN IF NOT EXISTS winner_side TEXT CHECK (winner_side IN ('from', 'to'));
ALTER TABLE public.network_fixtures ADD COLUMN IF NOT EXISTS flagged_at TIMESTAMPTZ;  -- sent to the host (draw or no game)
CREATE INDEX IF NOT EXISTS idx_network_fixtures_tournament ON public.network_fixtures(tournament_id, round, slot);
-- One fixture per bracket slot, so two results landing at once can't both create the next round's game
CREATE UNIQUE INDEX IF NOT EXISTS uq_network_fixtures_bracket_slot ON public.network_fixtures(tournament_id, round, slot) WHERE tournament_id IS NOT NULL;
