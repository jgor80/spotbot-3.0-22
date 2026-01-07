-- Remove overly permissive RLS policies on peer_evaluations
-- These were incorrectly added in migration 20251219193613 and expose sensitive evaluation data

-- Drop the public access policies
DROP POLICY IF EXISTS "Allow public read on peer_evaluations" ON public.peer_evaluations;
DROP POLICY IF EXISTS "Allow public insert on peer_evaluations" ON public.peer_evaluations;
DROP POLICY IF EXISTS "Allow public update on peer_evaluations" ON public.peer_evaluations;

-- The table retains RLS enabled, but with no public policies
-- Only service role (Discord bot) can access peer_evaluations directly
-- Web dashboard should use aggregated data from player_summary and player_vibe_chemistry