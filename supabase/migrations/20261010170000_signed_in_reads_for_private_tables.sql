-- 20261010080000 dropped the open "manage" policies on link_suggestions and scouting_lists, which were
-- also the only read access to pending suggestions and non-public lists. The signed-in Settings and
-- Scouting pages read both directly, so give signed-in users read access back. Writes stay in the
-- manage-link-suggestions and manage-scouting-lists functions (service role).
DROP POLICY IF EXISTS "Signed-in users can read link suggestions" ON public.link_suggestions;
CREATE POLICY "Signed-in users can read link suggestions" ON public.link_suggestions
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Signed-in users can read scouting lists" ON public.scouting_lists;
CREATE POLICY "Signed-in users can read scouting lists" ON public.scouting_lists
  FOR SELECT TO authenticated USING (true);

-- These tables hold moderation, feedback and trust data. Only the bot, backend functions and the
-- signed-in website use them (every website route sits behind ProtectedRoute), so the anonymous
-- public key gets no access at all, whatever the table's policies say.
REVOKE ALL ON public.blocked_users FROM anon;
REVOKE ALL ON public.dm_feedback_requests FROM anon;
REVOKE ALL ON public.evaluator_trust_scores FROM anon;
REVOKE ALL ON public.peer_evaluations FROM anon;
REVOKE ALL ON public.pending_win_claims FROM anon;
REVOKE ALL ON public.sub_requests FROM anon;
REVOKE ALL ON public.user_roles FROM anon;
