-- Social Hub refer a friend (public/spotbot/hub-card.cjs): each player's own permanent invite, who
-- joined with whose invite, and when the inviter was rewarded (the invitee's first game). Service role
-- only. hub_players.referrals counts rewarded referrals for the Recruiter / Talent Scout badges.
CREATE TABLE IF NOT EXISTS public.hub_invites (
  guild_id text NOT NULL,
  user_id text NOT NULL,
  code text NOT NULL UNIQUE,
  uses integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (guild_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.hub_referrals (
  guild_id text NOT NULL,
  invitee_id text NOT NULL,
  inviter_id text NOT NULL,
  code text,
  joined_at timestamptz NOT NULL DEFAULT now(),
  rewarded_at timestamptz,
  PRIMARY KEY (guild_id, invitee_id)
);
CREATE INDEX IF NOT EXISTS hub_referrals_inviter_idx ON public.hub_referrals (guild_id, inviter_id);

ALTER TABLE public.hub_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hub_referrals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hub_invites, public.hub_referrals FROM anon, authenticated;

ALTER TABLE public.hub_players ADD COLUMN IF NOT EXISTS referrals integer NOT NULL DEFAULT 0;
