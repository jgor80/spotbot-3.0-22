-- Website access for everyone who is really in a server, not only players with recorded matches.
-- user_has_guild_access and my_guild_ids counted a server only where one of the user's verified Discord
-- accounts had player_stats rows, while the functions (requireGuildAccess / guildAccessLevel) also accept
-- current Discord members and leaders. Server owners, non-playing managers and new members therefore saw
-- no server on the website: GuildContext reads guild_settings through these policies.
--
-- The bot keeps guild_members current (public/spotbot/guild-members.cjs: full sync per server at startup,
-- then joins, leaves and the bot leaving). Only ids are stored. Service role only, like the other bot tables.
-- purge_data covers it: guild_id rows go with a server, discord_user_id rows with a player.

CREATE TABLE IF NOT EXISTS public.guild_members (
  guild_id text NOT NULL,
  discord_user_id text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (guild_id, discord_user_id)
);
CREATE INDEX IF NOT EXISTS guild_members_user ON public.guild_members (discord_user_id);
ALTER TABLE public.guild_members ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.guild_members FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.user_has_guild_access(check_guild_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    EXISTS (SELECT 1 FROM public.web_admins WHERE auth_user_id = auth.uid())
    OR
    EXISTS (
      SELECT 1
      FROM public.player_stats ps
      JOIN public.user_discord_links udl ON udl.discord_user_id = ps.discord_user_id
      WHERE udl.auth_user_id = auth.uid()
        AND udl.verified IS TRUE
        AND ps.guild_id = check_guild_id
    )
    OR
    EXISTS (
      SELECT 1
      FROM public.guild_members gm
      JOIN public.user_discord_links udl ON udl.discord_user_id = gm.discord_user_id
      WHERE udl.auth_user_id = auth.uid()
        AND udl.verified IS TRUE
        AND gm.guild_id = check_guild_id
    )
$$;

CREATE OR REPLACE FUNCTION public.my_guild_ids()
RETURNS SETOF text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT gs.guild_id FROM public.guild_settings gs
   WHERE EXISTS (SELECT 1 FROM public.web_admins WHERE auth_user_id = auth.uid())
  UNION
  SELECT DISTINCT ps.guild_id
    FROM public.player_stats ps
    JOIN public.user_discord_links udl ON udl.discord_user_id = ps.discord_user_id
   WHERE udl.auth_user_id = auth.uid()
     AND udl.verified IS TRUE
  UNION
  SELECT gm.guild_id
    FROM public.guild_members gm
    JOIN public.user_discord_links udl ON udl.discord_user_id = gm.discord_user_id
   WHERE udl.auth_user_id = auth.uid()
     AND udl.verified IS TRUE
$$;
