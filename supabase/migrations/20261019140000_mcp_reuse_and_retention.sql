-- MCP refresh token reuse detection: the token a rotation replaced, so presenting it again turns the grant off.
ALTER TABLE public.mcp_access_tokens ADD COLUMN IF NOT EXISTS previous_refresh_hash text;
CREATE INDEX IF NOT EXISTS mcp_access_tokens_previous_refresh ON public.mcp_access_tokens (previous_refresh_hash) WHERE previous_refresh_hash IS NOT NULL;

-- Monthly tidy-up (scheduler.cjs): also drops personal tokens that expired or were revoked a month ago.
CREATE OR REPLACE FUNCTION public.cleanup_mcp_oauth()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.mcp_oauth_requests WHERE created_at < now() - interval '1 day';
  DELETE FROM public.mcp_access_tokens
    WHERE oauth_client_id IS NOT NULL
      AND (revoked_at < now() - interval '30 days' OR refresh_expires_at < now() - interval '30 days');
  DELETE FROM public.mcp_access_tokens
    WHERE oauth_client_id IS NULL
      AND (revoked_at < now() - interval '30 days' OR expires_at < now() - interval '30 days');
  DELETE FROM public.mcp_oauth_clients c
    WHERE c.created_at < now() - interval '30 days'
      AND NOT EXISTS (SELECT 1 FROM public.mcp_access_tokens t WHERE t.oauth_client_id = c.client_id);
  DELETE FROM public.mcp_action_log WHERE created_at < now() - interval '365 days';
$$;
REVOKE ALL ON FUNCTION public.cleanup_mcp_oauth() FROM PUBLIC, anon, authenticated;

-- Personal tokens made before expiry existed get a year from now.
UPDATE public.mcp_access_tokens SET expires_at = now() + interval '365 days'
  WHERE oauth_client_id IS NULL AND expires_at IS NULL AND revoked_at IS NULL;

-- Logs that otherwise grow forever: Xbox status text (a debugging aid) for 30 days, AI render costs for
-- 13 months (a full year of billing comparisons). Runs with the monthly cleanup.
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
END $$;
REVOKE ALL ON FUNCTION public.cleanup_logs() FROM PUBLIC, anon, authenticated;
