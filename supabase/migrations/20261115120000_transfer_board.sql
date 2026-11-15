-- Transfer board and transfer news (gafferbot.app/transfers).
-- Additive only. RLS is on with no public policies: the bot and the transfer-board function (service
-- role) read and write these, and the function only ever returns opted-in, Discord-ID-free fields.

-- Free agents choose separately whether their listing also shows on the public web board
ALTER TABLE public.free_agents ADD COLUMN IF NOT EXISTS public_board BOOLEAN NOT NULL DEFAULT false;

-- Clubs recruiting: the latest recruitment poster a club put on the public board (/manager → Recruiting → Recruitment Poster)
CREATE TABLE IF NOT EXISTS public.club_wanted (
  guild_id TEXT NOT NULL,
  club_key TEXT NOT NULL,
  club_name TEXT NOT NULL,
  ea_club_id TEXT,
  ea_platform TEXT,
  crest_url TEXT,
  positions TEXT NOT NULL,
  notes TEXT,
  record TEXT,
  division TEXT,
  invite_url TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (guild_id, club_key)
);
CREATE INDEX IF NOT EXISTS idx_club_wanted_live ON public.club_wanted(expires_at);
ALTER TABLE public.club_wanted ENABLE ROW LEVEL SECURITY;

-- Who EA lists in which club, as seen by the EA sync and public club lookups
CREATE TABLE IF NOT EXISTS public.ea_club_members (
  platform TEXT NOT NULL,
  ea_club_id TEXT NOT NULL,
  ea_key TEXT NOT NULL,              -- lower-cased gamertag
  ea_username TEXT NOT NULL,
  club_name TEXT,
  first_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (platform, ea_club_id, ea_key)
);
CREATE INDEX IF NOT EXISTS idx_ea_club_members_key ON public.ea_club_members(platform, ea_key, last_seen);
ALTER TABLE public.ea_club_members ENABLE ROW LEVEL SECURITY;

-- Moves: a gamertag newly in a club's EA member list after being seen in another club's
CREATE TABLE IF NOT EXISTS public.transfer_moves (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform TEXT NOT NULL,
  ea_key TEXT NOT NULL,
  ea_username TEXT NOT NULL,
  from_club_id TEXT NOT NULL,
  from_club_name TEXT,
  to_club_id TEXT NOT NULL,
  to_club_name TEXT,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (platform, ea_key, from_club_id, to_club_id)
);
CREATE INDEX IF NOT EXISTS idx_transfer_moves_recent ON public.transfer_moves(detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_transfer_moves_from ON public.transfer_moves(from_club_id, detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_transfer_moves_to ON public.transfer_moves(to_club_id, detected_at DESC);
ALTER TABLE public.transfer_moves ENABLE ROW LEVEL SECURITY;
