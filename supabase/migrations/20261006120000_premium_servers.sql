-- GafferBot Premium: servers the bot owner has switched Premium on for, and each server's
-- secret for the OBS overlay URL. Discord App Subscriptions are checked live by the bot,
-- so they need no row here. Additive only.

CREATE TABLE IF NOT EXISTS public.premium_servers (
  guild_id TEXT PRIMARY KEY,
  enabled BOOLEAN NOT NULL DEFAULT false,
  plan TEXT NOT NULL DEFAULT 'premium',
  expires_at TIMESTAMPTZ,
  note TEXT,
  granted_by TEXT,
  overlay_token TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Only the bot and edge functions (service role) read or write this table: no public policies
ALTER TABLE public.premium_servers ENABLE ROW LEVEL SECURITY;
