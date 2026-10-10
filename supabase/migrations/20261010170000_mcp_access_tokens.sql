-- Personal access tokens for the GafferBot MCP server (/mcp). Each token acts as one Discord user and
-- only sees servers that user can see. Only the SHA-256 hash is stored. Backend functions use the
-- service role; RLS is on with no policies so the anon and authenticated roles can't read or write it.
CREATE TABLE IF NOT EXISTS public.mcp_access_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  discord_user_id text NOT NULL,
  label text NOT NULL DEFAULT 'AI assistant',
  token_hash text NOT NULL UNIQUE,
  token_hint text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz
);

CREATE INDEX IF NOT EXISTS mcp_access_tokens_user_idx ON public.mcp_access_tokens (discord_user_id) WHERE revoked_at IS NULL;

ALTER TABLE public.mcp_access_tokens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mcp_access_tokens FROM anon, authenticated;
