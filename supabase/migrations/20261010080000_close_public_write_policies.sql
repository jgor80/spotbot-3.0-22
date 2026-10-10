-- These policies were named "Service role can ..." but granted the public role, so anyone holding
-- the website's public key could insert, edit or delete these rows directly. The service role
-- (bot-proxy, sync and backend functions) bypasses RLS, so dropping them changes nothing for GafferBot.
DROP POLICY IF EXISTS "Service role can manage game sessions" ON public.active_game_sessions;
DROP POLICY IF EXISTS "Service role can insert club_stats" ON public.club_stats;
DROP POLICY IF EXISTS "Service role can update club_stats" ON public.club_stats;
DROP POLICY IF EXISTS "Service role can manage global league challenges" ON public.global_league_challenges;
DROP POLICY IF EXISTS "Service role can manage global league clubs" ON public.global_league_clubs;
DROP POLICY IF EXISTS "Service role can manage global league matches" ON public.global_league_matches;
DROP POLICY IF EXISTS "Allow all operations on link_suggestions" ON public.link_suggestions;
DROP POLICY IF EXISTS "Allow insert for manager evaluations" ON public.manager_evaluations;
DROP POLICY IF EXISTS "Service role can insert player_club_stats" ON public.player_club_stats;
DROP POLICY IF EXISTS "Service role can update player_club_stats" ON public.player_club_stats;
DROP POLICY IF EXISTS "Service role can delete profiles" ON public.profiles;
DROP POLICY IF EXISTS "Service role can insert profiles" ON public.profiles;
DROP POLICY IF EXISTS "Service role can update profiles" ON public.profiles;
DROP POLICY IF EXISTS "Captains can manage their own scouting lists" ON public.scouting_lists;
DROP POLICY IF EXISTS "Service role can manage tournament matches" ON public.tournament_matches;
DROP POLICY IF EXISTS "Service role can manage tournament standings" ON public.tournament_standings;
DROP POLICY IF EXISTS "Service role can manage tournament teams" ON public.tournament_teams;
DROP POLICY IF EXISTS "Service role can manage tournaments" ON public.tournaments;
DROP POLICY IF EXISTS "Allow all operations for service role" ON public.twitch_notifications;
DROP POLICY IF EXISTS "Service role can manage all links" ON public.user_discord_links;
DROP POLICY IF EXISTS "Service role can manage xbox sessions" ON public.xbox_detected_sessions;

-- Signed-in users may still request a link to a Discord account, but only Discord sign-in
-- (auth-discord, service role) can mark a link verified. Verified links grant manager rights.
DROP POLICY IF EXISTS "Users can create their own discord link" ON public.user_discord_links;
CREATE POLICY "Users can create their own discord link" ON public.user_discord_links
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = auth_user_id AND verified IS NOT TRUE);
DROP POLICY IF EXISTS "Users can update their own discord link" ON public.user_discord_links;
