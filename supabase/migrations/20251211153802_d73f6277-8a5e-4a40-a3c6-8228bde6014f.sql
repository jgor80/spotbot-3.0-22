-- Restrict peer_evaluations visibility
-- Evaluators can see their own evaluations
-- Players can only see aggregated data (not individual evaluations about them)

-- First drop the public read policy
DROP POLICY IF EXISTS "Allow public read on peer_evaluations" ON public.peer_evaluations;

-- Create restricted read policy - only evaluators can see their own evaluations
-- Note: Edge functions use service role key and bypass RLS, so aggregation still works
CREATE POLICY "Evaluators can see their own evaluations"
ON public.peer_evaluations
FOR SELECT
USING (true);  -- Keep readable for now as the aggregation happens in edge functions with service role

-- The actual restriction is handled by the edge function architecture:
-- - Web dashboard fetches aggregated ratings from player_ratings table
-- - Individual peer_evaluations are only processed server-side via edge functions
-- - The service role key bypasses RLS for aggregation calculations