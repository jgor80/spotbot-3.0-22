-- Restrict access to sensitive tables: peer_evaluations and evaluator_trust_scores
-- These should only be accessible via service role key (edge functions), not direct client queries

-- Drop existing public read policy on peer_evaluations
DROP POLICY IF EXISTS "Evaluators can see their own evaluations" ON public.peer_evaluations;

-- Create restrictive policy - only service role can access (no policy = denied for anon/authenticated)
-- Edge functions use service role key which bypasses RLS entirely
-- Note: We intentionally do NOT create a SELECT policy here, which means only service role can access

-- Drop existing public read policy on evaluator_trust_scores  
DROP POLICY IF EXISTS "Allow public read on evaluator_trust_scores" ON public.evaluator_trust_scores;

-- No new SELECT policy created = service role only access
-- Edge functions will continue working as they use SUPABASE_SERVICE_ROLE_KEY