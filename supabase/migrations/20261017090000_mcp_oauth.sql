-- GafferBot MCP: Discord sign-in for AI apps (OAuth 2.1 with PKCE, run by the Worker), token scopes,
-- and a log of every change an AI app makes. Only hashes of codes and tokens are stored. Backend code
-- uses the service role; RLS is on with no policies so the anon and authenticated roles can't touch it.

-- clubs:read for personal /me tokens; OAuth grants may add clubs:manage. A grant row holds the current
-- access token (short-lived, expires_at) and its refresh token, both rotated on every refresh.
ALTER TABLE public.mcp_access_tokens
  ADD COLUMN IF NOT EXISTS scopes text[] NOT NULL DEFAULT '{clubs:read}',
  ADD COLUMN IF NOT EXISTS oauth_client_id text,
  ADD COLUMN IF NOT EXISTS refresh_hash text UNIQUE,
  ADD COLUMN IF NOT EXISTS refresh_expires_at timestamptz;

-- AI apps that registered themselves (OAuth dynamic client registration). Public clients, no secret.
CREATE TABLE IF NOT EXISTS public.mcp_oauth_clients (
  client_id text PRIMARY KEY,
  client_name text NOT NULL DEFAULT 'AI app',
  redirect_uris text[] NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz
);

-- One sign-in attempt: created at /oauth/authorize, tied to a Discord user after Discord sign-in,
-- turned into a one-time code when the player allows it.
CREATE TABLE IF NOT EXISTS public.mcp_oauth_requests (
  id text PRIMARY KEY,
  client_id text NOT NULL REFERENCES public.mcp_oauth_clients(client_id) ON DELETE CASCADE,
  redirect_uri text NOT NULL,
  code_challenge text NOT NULL,
  state text,
  scopes text[] NOT NULL DEFAULT '{clubs:read}',
  discord_user_id text,
  consent_hash text,
  code_hash text UNIQUE,
  code_expires_at timestamptz,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS mcp_oauth_requests_created_idx ON public.mcp_oauth_requests (created_at);

-- Every change an AI app made (or tried): who, where, what, and how it went. Also used for write limits.
CREATE TABLE IF NOT EXISTS public.mcp_action_log (
  id bigserial PRIMARY KEY,
  token_id uuid,
  discord_user_id text NOT NULL,
  guild_id text,
  tool text NOT NULL,
  target text,
  detail jsonb,
  ok boolean NOT NULL DEFAULT true,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS mcp_action_log_user_idx ON public.mcp_action_log (discord_user_id, created_at DESC);

ALTER TABLE public.mcp_oauth_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mcp_oauth_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mcp_action_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mcp_oauth_clients FROM anon, authenticated;
REVOKE ALL ON public.mcp_oauth_requests FROM anon, authenticated;
REVOKE ALL ON public.mcp_action_log FROM anon, authenticated;
REVOKE ALL ON SEQUENCE public.mcp_action_log_id_seq FROM anon, authenticated;

-- Monthly tidy-up (scheduler.cjs): finished or abandoned sign-ins, dead grants and year-old log rows.
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
  DELETE FROM public.mcp_oauth_clients c
    WHERE c.created_at < now() - interval '30 days'
      AND NOT EXISTS (SELECT 1 FROM public.mcp_access_tokens t WHERE t.oauth_client_id = c.client_id);
  DELETE FROM public.mcp_action_log WHERE created_at < now() - interval '365 days';
$$;
REVOKE ALL ON FUNCTION public.cleanup_mcp_oauth() FROM PUBLIC, anon, authenticated;
