-- Phase 5: Data Partitioning Preparation

-- 5.1 Create archive table for old global league matches
CREATE TABLE IF NOT EXISTS public.global_league_matches_archive (
  LIKE public.global_league_matches INCLUDING ALL
);

-- Add partition by date for the archive (future use)
COMMENT ON TABLE public.global_league_matches_archive IS 'Archive table for Global League matches older than 6 months. Used to keep main table performant.';

-- 5.2 Create function to archive old matches
CREATE OR REPLACE FUNCTION public.archive_old_global_league_matches()
RETURNS integer
LANGUAGE plpgsql
SET search_path = 'public'
AS $$
DECLARE
  archived_count integer;
BEGIN
  -- Move matches older than 6 months to archive
  WITH moved_matches AS (
    DELETE FROM global_league_matches
    WHERE completed_at < now() - interval '6 months'
    AND status = 'completed'
    RETURNING *
  )
  INSERT INTO global_league_matches_archive
  SELECT * FROM moved_matches;
  
  GET DIAGNOSTICS archived_count = ROW_COUNT;
  RETURN archived_count;
END;
$$;

-- 5.3 Create function to archive old club matches (main match history)
CREATE OR REPLACE FUNCTION public.archive_old_club_matches()
RETURNS integer
LANGUAGE plpgsql
SET search_path = 'public'
AS $$
DECLARE
  archived_count integer;
BEGIN
  -- Delete matches older than 1 year (keeping aggregated stats)
  DELETE FROM club_matches
  WHERE created_at < now() - interval '1 year';
  
  GET DIAGNOSTICS archived_count = ROW_COUNT;
  RETURN archived_count;
END;
$$;

-- 5.4 Create function to cleanup old event code occurrences
CREATE OR REPLACE FUNCTION public.cleanup_old_event_occurrences()
RETURNS integer
LANGUAGE plpgsql
SET search_path = 'public'
AS $$
DECLARE
  deleted_count integer;
BEGIN
  -- Delete event occurrences older than 6 months
  -- Stats are already aggregated in player_club_stats
  DELETE FROM event_code_occurrences
  WHERE created_at < now() - interval '6 months';
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

-- 5.5 Add indexes for platform-based querying (preparation for potential partitioning)
CREATE INDEX IF NOT EXISTS idx_global_league_clubs_platform_elo 
  ON global_league_clubs(ea_platform, elo_rating DESC);

CREATE INDEX IF NOT EXISTS idx_global_league_clubs_platform_status 
  ON global_league_clubs(ea_platform, status) 
  WHERE status = 'active';

-- 5.6 Add index on completed_at for archive queries
CREATE INDEX IF NOT EXISTS idx_global_league_matches_completed_at 
  ON global_league_matches(completed_at) 
  WHERE status = 'completed';

-- 5.7 Schedule monthly cleanup job (runs on 1st of each month at 3 AM)
SELECT cron.schedule(
  'monthly-archive-cleanup',
  '0 3 1 * *',
  $$
    SELECT public.archive_old_global_league_matches();
    SELECT public.cleanup_old_event_occurrences();
  $$
);

-- 5.8 Enable RLS on archive table
ALTER TABLE public.global_league_matches_archive ENABLE ROW LEVEL SECURITY;

-- Allow authenticated read access to archive
CREATE POLICY "Archive matches readable by authenticated users"
  ON public.global_league_matches_archive
  FOR SELECT
  TO authenticated
  USING (true);