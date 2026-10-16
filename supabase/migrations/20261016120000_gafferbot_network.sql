-- GafferBot Network: servers that opt in can see each other's clubs and (in later slices) send
-- replacement requests, friendly invites and BYOT sign-ups. Off by default; a server admin turns it on.
-- Only public club info is shared. Additive only. RLS is on with no public policies: only the bot
-- (service role) reads these.

-- One row per server that has ever opened the network settings
CREATE TABLE IF NOT EXISTS public.network_servers (
  guild_id TEXT PRIMARY KEY,
  enabled BOOLEAN NOT NULL DEFAULT false,
  channel_id TEXT,                          -- where requests from other servers land
  show_server_name BOOLEAN NOT NULL DEFAULT false,
  region TEXT,
  enabled_by_discord_id TEXT,
  suspended_at TIMESTAMPTZ,                 -- set by a bot owner; hides the server from the network
  suspended_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_network_servers_listed ON public.network_servers(enabled) WHERE suspended_at IS NULL;
ALTER TABLE public.network_servers ENABLE ROW LEVEL SECURITY;

-- A server blocking another: neither side sees the other's clubs or requests
CREATE TABLE IF NOT EXISTS public.network_blocks (
  guild_id TEXT NOT NULL,
  blocked_guild_id TEXT NOT NULL,
  created_by_discord_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (guild_id, blocked_guild_id)
);
CREATE INDEX IF NOT EXISTS idx_network_blocks_blocked ON public.network_blocks(blocked_guild_id);
ALTER TABLE public.network_blocks ENABLE ROW LEVEL SECURITY;

-- Reports go to the bot owners for review
CREATE TABLE IF NOT EXISTS public.network_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_guild_id TEXT NOT NULL,
  reporter_discord_id TEXT NOT NULL,
  reported_guild_id TEXT NOT NULL,
  context TEXT,                             -- what was reported, e.g. "club card" or a request id
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_network_reports_reported ON public.network_reports(reported_guild_id, created_at);
ALTER TABLE public.network_reports ENABLE ROW LEVEL SECURITY;

-- Everything a server sends into the network, for per-day rate limits
CREATE TABLE IF NOT EXISTS public.network_activity (
  id BIGSERIAL PRIMARY KEY,
  guild_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_network_activity_recent ON public.network_activity(guild_id, kind, created_at);
ALTER TABLE public.network_activity ENABLE ROW LEVEL SECURITY;
