-- XI Lab helper keys: the browser helper uploads captured prices and club straight to the user's account.
-- A key can only call the upload routes (checked in fut-api). Only the SHA-256 hash is stored. Service role only.
CREATE TABLE fut.helper_keys (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  key_hash     TEXT NOT NULL UNIQUE,
  key_hint     TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ,
  revoked_at   TIMESTAMPTZ
);
CREATE UNIQUE INDEX fut_helper_keys_one_active ON fut.helper_keys (user_id) WHERE revoked_at IS NULL;

GRANT ALL ON fut.helper_keys TO service_role;
ALTER TABLE fut.helper_keys ENABLE ROW LEVEL SECURITY;
-- No policies for anon/authenticated: service role only.
NOTIFY pgrst, 'reload schema';
