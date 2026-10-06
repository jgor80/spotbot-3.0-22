-- Recruitment: an opt-in free agent pool shared across every server the bot is in, reach-outs that
-- go through the bot (no Discord handles are shown until the player says yes), a scouting
-- watchlist, and per-server recruitment settings.
-- Additive only. RLS is on with no public policies: only the bot (service role) reads these,
-- so a player's listing is never readable from the browser.

-- Per-server recruitment settings
CREATE TABLE IF NOT EXISTS public.recruit_settings (
  guild_id TEXT PRIMARY KEY,
  channel_id TEXT,                         -- where scouting alerts and reach-out replies are posted
  invite_channel_id TEXT,                  -- channel invites from "Reach Out" point at
  alerts_enabled BOOLEAN NOT NULL DEFAULT true,
  alert_min_rating NUMERIC(3,1) NOT NULL DEFAULT 8.0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.recruit_settings ENABLE ROW LEVEL SECURITY;

-- Free agents: one listing per player, visible to every server while status is looking or open
CREATE TABLE IF NOT EXISTS public.free_agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  discord_user_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'looking' CHECK (status IN ('looking', 'open', 'off')),
  position TEXT NOT NULL,
  secondary_position TEXT,
  timezone TEXT,
  platform TEXT,
  ea_username TEXT,
  ea_verified BOOLEAN NOT NULL DEFAULT false,  -- gamertag matches the player's linked EA account
  notes TEXT,
  home_guild_id TEXT,
  no_contact BOOLEAN NOT NULL DEFAULT false,   -- player asked not to be contacted at all
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_free_agents_listed ON public.free_agents(status, position, updated_at);
CREATE INDEX IF NOT EXISTS idx_free_agents_ea ON public.free_agents(lower(ea_username));
ALTER TABLE public.free_agents ENABLE ROW LEVEL SECURITY;

-- Reach-outs: a manager asks the bot to contact a player; the player answers in DMs
CREATE TABLE IF NOT EXISTS public.recruit_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id TEXT NOT NULL,
  club_key TEXT,
  club_name TEXT,
  manager_discord_id TEXT NOT NULL,
  player_discord_id TEXT NOT NULL,
  free_agent_id UUID REFERENCES public.free_agents(id) ON DELETE SET NULL,
  position TEXT,
  message TEXT,
  status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'accepted', 'declined', 'failed')),
  invite_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  responded_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_recruit_contacts_pair ON public.recruit_contacts(guild_id, player_discord_id, created_at);
ALTER TABLE public.recruit_contacts ENABLE ROW LEVEL SECURITY;

-- Scouting watchlist: players a server is keeping an eye on, by EA gamertag
CREATE TABLE IF NOT EXISTS public.scout_watchlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id TEXT NOT NULL,
  club_key TEXT,
  ea_username TEXT NOT NULL,
  ea_key TEXT NOT NULL,                    -- lower-cased gamertag for matching
  discord_user_id TEXT,                    -- when the gamertag belongs to a linked GafferBot user
  last_known_club_id TEXT,
  last_known_club_name TEXT,
  position TEXT,
  note TEXT,
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'opponent', 'free_agent')),
  source_match_id TEXT,
  added_by_discord_id TEXT NOT NULL,
  last_alert_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (guild_id, ea_key)
);
CREATE INDEX IF NOT EXISTS idx_scout_watchlist_key ON public.scout_watchlist(ea_key);
ALTER TABLE public.scout_watchlist ENABLE ROW LEVEL SECURITY;

-- Standout-opponent scan: matches are marked once the bot has looked at them
ALTER TABLE public.club_matches
  ADD COLUMN IF NOT EXISTS recruit_scanned_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_club_matches_recruit_scan ON public.club_matches(created_at) WHERE recruit_scanned_at IS NULL;
