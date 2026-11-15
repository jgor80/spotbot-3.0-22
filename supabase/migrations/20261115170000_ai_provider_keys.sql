-- Bring your own AI key for images: a player's own OpenAI key (scope 'user', owner = their Discord id) or a
-- server's (scope 'server', owner = guild id, saved by a club leader). Graphics Studio draws on the requester's
-- key, then the server's, and only GafferBot's own key spends the image allowance.
-- Keys are AES-GCM encrypted by the functions (scope, owner and provider are the additional data); only the
-- last 4 characters are ever shown. Service role only: no policies for anon or authenticated.
CREATE TABLE IF NOT EXISTS public.ai_provider_keys (
  scope         TEXT NOT NULL CHECK (scope IN ('user', 'server')),
  owner_id      TEXT NOT NULL,
  provider      TEXT NOT NULL CHECK (provider IN ('openai')),
  key_encrypted TEXT NOT NULL,
  key_hint      TEXT NOT NULL,
  added_by      TEXT,
  last_used_at  TIMESTAMPTZ,
  last_error    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (scope, owner_id, provider)
);

REVOKE ALL ON public.ai_provider_keys FROM anon, authenticated;
GRANT ALL ON public.ai_provider_keys TO service_role;
ALTER TABLE public.ai_provider_keys ENABLE ROW LEVEL SECURITY;

-- Whose key paid for each render: gafferbot (the allowance), yours (the requester's) or server
ALTER TABLE public.ai_image_renders ADD COLUMN IF NOT EXISTS key_source TEXT;

NOTIFY pgrst, 'reload schema';
