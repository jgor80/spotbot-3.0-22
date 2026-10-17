-- GafferBot Network fixtures: friendly invites between clubs on different servers (and, later, hosted
-- BYOT games). The result fills in from the EA match sync when the two clubs play each other.
-- Additive only. RLS on with no public policies (bot service role only).

CREATE TABLE IF NOT EXISTS public.network_fixtures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind TEXT NOT NULL DEFAULT 'friendly' CHECK (kind IN ('friendly', 'byot')),
  from_guild_id TEXT NOT NULL,
  from_club_key TEXT NOT NULL,
  from_club_name TEXT,
  from_ea_club_id TEXT,
  to_guild_id TEXT,                         -- null while an open invite has no taker
  to_club_key TEXT,
  to_club_name TEXT,
  to_ea_club_id TEXT,
  platform TEXT,
  kickoff_at TIMESTAMPTZ NOT NULL,
  note TEXT,
  is_open BOOLEAN NOT NULL DEFAULT false,   -- posted to every network server, first club to accept plays
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'accepted', 'declined', 'cancelled', 'expired', 'played')),
  created_by_discord_id TEXT NOT NULL,
  accepted_by_discord_id TEXT,
  posts JSONB NOT NULL DEFAULT '[]'::jsonb,  -- [{guild_id, channel_id, message_id}]
  ea_match_id TEXT,
  score_from INTEGER,
  score_to INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  responded_at TIMESTAMPTZ,
  played_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_network_fixtures_from ON public.network_fixtures(from_guild_id, status, kickoff_at);
CREATE INDEX IF NOT EXISTS idx_network_fixtures_to ON public.network_fixtures(to_guild_id, status, kickoff_at);
ALTER TABLE public.network_fixtures ENABLE ROW LEVEL SECURITY;
