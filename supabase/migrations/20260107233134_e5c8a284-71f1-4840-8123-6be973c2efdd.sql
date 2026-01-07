-- Re-enable writes for club_stats (used by sync-ea-stats and Discord bot)
CREATE POLICY "Service role can insert club_stats"
ON public.club_stats FOR INSERT
WITH CHECK (true);

CREATE POLICY "Service role can update club_stats"
ON public.club_stats FOR UPDATE
USING (true)
WITH CHECK (true);

-- Re-enable writes for profiles (used for EA linking)
CREATE POLICY "Service role can insert profiles"
ON public.profiles FOR INSERT
WITH CHECK (true);

CREATE POLICY "Service role can update profiles"
ON public.profiles FOR UPDATE
USING (true)
WITH CHECK (true);

CREATE POLICY "Service role can delete profiles"
ON public.profiles FOR DELETE
USING (true);

-- Re-enable writes for player_club_stats (used by sync-ea-stats)
CREATE POLICY "Service role can insert player_club_stats"
ON public.player_club_stats FOR INSERT
WITH CHECK (true);

CREATE POLICY "Service role can update player_club_stats"
ON public.player_club_stats FOR UPDATE
USING (true)
WITH CHECK (true);

-- Clean up orphaned profile with invalid discord_user_id
DELETE FROM profiles WHERE discord_user_id = 'bigz619';