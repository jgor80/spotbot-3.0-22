CREATE TABLE public.link_invites (
  token text PRIMARY KEY,
  discord_user_id text NOT NULL,
  discord_username text,
  guild_id text NOT NULL,
  expires_at timestamptz NOT NULL DEFAULT now() + interval '7 days',
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.link_invites TO service_role;
ALTER TABLE public.link_invites ENABLE ROW LEVEL SECURITY;
CREATE INDEX link_invites_user_idx ON public.link_invites(discord_user_id);