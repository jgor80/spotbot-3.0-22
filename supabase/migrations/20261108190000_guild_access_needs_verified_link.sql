-- Server access from the website only counts a verified Discord link (made by Discord sign-in or a
-- one-time invite). Anyone can insert an unverified link to any Discord ID, so trusting those let a
-- user read another member's servers: billing status, card fronts, photo folders, and every table
-- whose RLS calls this function.
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
$$;
