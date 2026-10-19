-- GafferBot Network spam limits: per-player daily caps need to know who sent each request, and
-- the activity log only needs a day of history for its limits (kept 30 days for review).
ALTER TABLE public.network_activity ADD COLUMN IF NOT EXISTS discord_user_id TEXT;
CREATE INDEX IF NOT EXISTS idx_network_activity_user ON public.network_activity(discord_user_id, kind, created_at) WHERE discord_user_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.cleanup_logs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF to_regclass('public.xbox_presence_log') IS NOT NULL THEN
    DELETE FROM public.xbox_presence_log WHERE created_at < now() - interval '30 days';
  END IF;
  IF to_regclass('public.ai_image_renders') IS NOT NULL THEN
    DELETE FROM public.ai_image_renders WHERE created_at < now() - interval '13 months';
  END IF;
  IF to_regclass('public.network_activity') IS NOT NULL THEN
    DELETE FROM public.network_activity WHERE created_at < now() - interval '30 days';
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.cleanup_logs() FROM PUBLIC, anon, authenticated;
