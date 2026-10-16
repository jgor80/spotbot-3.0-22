-- GafferBot Network replacements: a manager short a player posts one request; the bot offers it to
-- matching free agents (DM) and to other network servers' network channels until someone is accepted.
-- Additive only. RLS on with no public policies (bot service role only).

CREATE TABLE IF NOT EXISTS public.network_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id TEXT NOT NULL,
  club_key TEXT,
  club_name TEXT,
  platform TEXT,                            -- EA platform (common-gen5 / nx)
  position TEXT NOT NULL,
  kickoff_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  note TEXT,
  reach TEXT NOT NULL DEFAULT 'all' CHECK (reach IN ('all', 'fa')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'filled', 'cancelled', 'expired')),
  created_by_discord_id TEXT NOT NULL,
  filled_by_discord_id TEXT,
  posts JSONB NOT NULL DEFAULT '[]'::jsonb,  -- [{guild_id, channel_id, message_id}] cards in other servers
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_network_requests_guild ON public.network_requests(guild_id, created_at);
ALTER TABLE public.network_requests ENABLE ROW LEVEL SECURITY;

-- Who was asked or offered to play
CREATE TABLE IF NOT EXISTS public.network_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES public.network_requests(id) ON DELETE CASCADE,
  player_discord_id TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('dm', 'server')),
  source_guild_id TEXT,
  status TEXT NOT NULL DEFAULT 'offered' CHECK (status IN ('offered', 'volunteered', 'accepted', 'passed', 'declined')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  responded_at TIMESTAMPTZ,
  UNIQUE (request_id, player_discord_id)
);
CREATE INDEX IF NOT EXISTS idx_network_responses_player ON public.network_responses(player_discord_id, created_at);
ALTER TABLE public.network_responses ENABLE ROW LEVEL SECURITY;
