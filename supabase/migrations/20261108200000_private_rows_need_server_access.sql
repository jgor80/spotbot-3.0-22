-- 20261010170000 gave every signed-in user read access to all link_suggestions and scouting_lists rows,
-- so anyone could read other servers' Discord IDs, names and gamertags, and rivals' private scouting
-- lists. Reads now need access to that server (same rule the rest of the website uses, which counts
-- only verified Discord links since 20261108190000). Public scouting lists stay readable by anyone signed in.
DROP POLICY IF EXISTS "Signed-in users can read link suggestions" ON public.link_suggestions;
CREATE POLICY "Signed-in users can read link suggestions" ON public.link_suggestions
  FOR SELECT TO authenticated USING (public.user_has_guild_access(guild_id));
DROP POLICY IF EXISTS "Signed-in users can read scouting lists" ON public.scouting_lists;
CREATE POLICY "Signed-in users can read scouting lists" ON public.scouting_lists
  FOR SELECT TO authenticated USING (is_public OR public.user_has_guild_access(guild_id));
-- Older open read policies some databases may still carry from the Lovable era
DROP POLICY IF EXISTS "Allow public select on link_suggestions" ON public.link_suggestions;
DROP POLICY IF EXISTS "Allow public read access on link_suggestions" ON public.link_suggestions;
DROP POLICY IF EXISTS "Allow public select on scouting_lists" ON public.scouting_lists;
DROP POLICY IF EXISTS "Allow public read access on scouting_lists" ON public.scouting_lists;
