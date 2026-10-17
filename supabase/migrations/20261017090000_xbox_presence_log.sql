-- Xbox status text of linked players in voice, saved on change, to learn what EA FC shows mid-match
CREATE TABLE IF NOT EXISTS public.xbox_presence_log (
  id BIGSERIAL PRIMARY KEY,
  discord_user_id TEXT NOT NULL,
  guild_id TEXT,
  xbox_xuid TEXT NOT NULL,
  gamertag TEXT,
  presence_state TEXT,
  presence_text TEXT,
  presence_details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_xbox_presence_log_recent ON public.xbox_presence_log(created_at DESC);
ALTER TABLE public.xbox_presence_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.xbox_presence_log FROM anon, authenticated;
