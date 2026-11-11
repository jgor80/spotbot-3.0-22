-- Helper keys can be shown again on the owner's profile: the key is kept AES-GCM encrypted with a server secret
-- (HELPER_KEY_SECRET, else the service role key) and tied to the user. Older keys stay hash-only (shown once).
ALTER TABLE fut.helper_keys ADD COLUMN IF NOT EXISTS key_encrypted TEXT;
NOTIFY pgrst, 'reload schema';
