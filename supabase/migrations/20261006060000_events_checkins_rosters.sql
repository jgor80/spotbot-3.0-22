-- Club events: deadlines and reminders, recurring series, presets, match-night check-ins,
-- sub requests, roster status and per-server branding.
-- Additive only: new columns have defaults and existing rows keep working.

-- Server preferences: the timezone plain dates like "thu 9pm" are read in, and branding
ALTER TABLE public.guild_settings
  ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'UTC',
  ADD COLUMN IF NOT EXISTS branding JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Roster status (active, injured, away, trial, inactive) and a second position
ALTER TABLE public.team_rosters
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS secondary_position TEXT,
  ADD COLUMN IF NOT EXISTS note TEXT;

-- Recurring series: the bot posts each occurrence post_hours_before its kickoff
CREATE TABLE IF NOT EXISTS public.event_series (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id TEXT NOT NULL,
  club_key TEXT,
  title TEXT NOT NULL,
  event_type TEXT NOT NULL DEFAULT 'match',
  description TEXT,
  channel_id TEXT NOT NULL,
  ping_role_id TEXT,
  interval_weeks INTEGER NOT NULL DEFAULT 1 CHECK (interval_weeks BETWEEN 1 AND 4),
  next_at TIMESTAMPTZ NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  duration_minutes INTEGER NOT NULL DEFAULT 90,
  deadline_minutes INTEGER,
  post_hours_before INTEGER NOT NULL DEFAULT 144,
  position_signup BOOLEAN NOT NULL DEFAULT false,
  active BOOLEAN NOT NULL DEFAULT true,
  created_by_discord_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_event_series_due ON public.event_series(active, next_at);
ALTER TABLE public.event_series ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read on event_series" ON public.event_series FOR SELECT USING (true);

ALTER TABLE public.availability_events
  ADD COLUMN IF NOT EXISTS club_key TEXT,
  ADD COLUMN IF NOT EXISTS series_id UUID REFERENCES public.event_series(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS deadline_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ping_role_id TEXT,
  ADD COLUMN IF NOT EXISTS position_signup BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deadline_reminder_sent BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS checkin_message_id TEXT,
  ADD COLUMN IF NOT EXISTS checkin_opened_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_availability_events_open ON public.availability_events(closed, scheduled_at);

-- Position sign-ups (tryouts) and an optional note with each answer
ALTER TABLE public.player_availability
  ADD COLUMN IF NOT EXISTS position TEXT,
  ADD COLUMN IF NOT EXISTS note TEXT;

-- Saved event templates
CREATE TABLE IF NOT EXISTS public.event_presets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id TEXT NOT NULL,
  club_key TEXT,
  name TEXT NOT NULL,
  title TEXT NOT NULL,
  event_type TEXT NOT NULL DEFAULT 'match',
  description TEXT,
  weekday INTEGER CHECK (weekday BETWEEN 0 AND 6),
  time_of_day TEXT,
  duration_minutes INTEGER NOT NULL DEFAULT 90,
  deadline_minutes INTEGER,
  channel_id TEXT,
  ping_role_id TEXT,
  position_signup BOOLEAN NOT NULL DEFAULT false,
  created_by_discord_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (guild_id, name)
);
ALTER TABLE public.event_presets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read on event_presets" ON public.event_presets FOR SELECT USING (true);

-- Match-night check-ins
CREATE TABLE IF NOT EXISTS public.event_checkins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.availability_events(id) ON DELETE CASCADE,
  discord_user_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('in', 'late', 'out')),
  checked_in_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (event_id, discord_user_id)
);
ALTER TABLE public.event_checkins ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read on event_checkins" ON public.event_checkins FOR SELECT USING (true);

-- Sub requests: a manager (or a player who drops out) asks for cover, the first taker fills it
CREATE TABLE IF NOT EXISTS public.sub_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id TEXT NOT NULL,
  event_id UUID REFERENCES public.availability_events(id) ON DELETE CASCADE,
  lineup_id UUID REFERENCES public.lineups(id) ON DELETE SET NULL,
  position TEXT,
  replacing_discord_id TEXT,
  requested_by_discord_id TEXT NOT NULL,
  filled_by_discord_id TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'filled', 'cancelled')),
  channel_id TEXT,
  message_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  filled_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_sub_requests_event ON public.sub_requests(event_id);
ALTER TABLE public.sub_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read on sub_requests" ON public.sub_requests FOR SELECT USING (true);

-- What the last announcement of a lineup showed, so a re-publish can edit it and list changes
ALTER TABLE public.lineups
  ADD COLUMN IF NOT EXISTS announced_slots JSONB;
