-- Your own Claude API key (profile): XI Lab's AI features call Claude with it instead of the server's key.
-- Stored AES-GCM encrypted with a server secret (AI_KEY_SECRET, else HELPER_KEY_SECRET, else the service role key)
-- and tied to the user; only fut-api (service role) reads it. One key per user.
CREATE TABLE IF NOT EXISTS fut.user_ai_keys (
  user_id       UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  key_encrypted TEXT NOT NULL,
  key_hint      TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT ALL ON fut.user_ai_keys TO service_role;
ALTER TABLE fut.user_ai_keys ENABLE ROW LEVEL SECURITY;
-- No policies for anon/authenticated: service role only.
NOTIFY pgrst, 'reload schema';
