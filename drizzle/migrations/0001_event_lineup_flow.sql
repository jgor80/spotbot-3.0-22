ALTER TABLE public.availability_events
  ADD COLUMN IF NOT EXISTS formation text,
  ADD COLUMN IF NOT EXISTS vc_invite_30_sent boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS vc_invite_0_sent boolean NOT NULL DEFAULT false;
ALTER TABLE public.lineup_slots
  ADD COLUMN IF NOT EXISTS confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS declined_at timestamptz;