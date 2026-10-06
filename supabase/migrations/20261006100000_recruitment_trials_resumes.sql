-- Recruitment part 2: trialist intake (/apply), tryout invites, post-trial report cards and
-- verified player resumes (/lfc). Additive only; RLS on with no public policies (bot only).

ALTER TABLE public.recruit_settings
  ADD COLUMN IF NOT EXISTS trialist_role_id TEXT;

-- One row per player per club trial, from /apply (or a manager setting roster status to Trial)
CREATE TABLE IF NOT EXISTS public.trialists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id TEXT NOT NULL,
  club_key TEXT,
  discord_user_id TEXT NOT NULL,
  ea_username TEXT,
  platform TEXT,
  positions TEXT[] NOT NULL DEFAULT '{}',
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'trial' CHECK (status IN ('trial', 'promoted', 'released')),
  trial_count INTEGER NOT NULL DEFAULT 1,
  decided_by_discord_id TEXT,
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (guild_id, discord_user_id)
);
ALTER TABLE public.trialists ENABLE ROW LEVEL SECURITY;

-- Which trialists were DMed about which tryout, so nobody is invited twice
CREATE TABLE IF NOT EXISTS public.trial_invites (
  event_id UUID NOT NULL REFERENCES public.availability_events(id) ON DELETE CASCADE,
  discord_user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, discord_user_id)
);
ALTER TABLE public.trial_invites ENABLE ROW LEVEL SECURITY;

-- Report cards go out a while after a tryout closes, once its EA matches have synced
CREATE TABLE IF NOT EXISTS public.trial_reports (
  event_id UUID PRIMARY KEY REFERENCES public.availability_events(id) ON DELETE CASCADE,
  guild_id TEXT NOT NULL,
  due_at TIMESTAMPTZ NOT NULL,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_trial_reports_due ON public.trial_reports(due_at) WHERE sent_at IS NULL;
ALTER TABLE public.trial_reports ENABLE ROW LEVEL SECURITY;

-- Verified resumes: a snapshot of the stats on a /lfc card, checkable by its code
CREATE TABLE IF NOT EXISTS public.player_resumes (
  code TEXT PRIMARY KEY,
  discord_user_id TEXT NOT NULL,
  ea_username TEXT,
  stats JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_player_resumes_user ON public.player_resumes(discord_user_id, created_at);
ALTER TABLE public.player_resumes ENABLE ROW LEVEL SECURITY;
