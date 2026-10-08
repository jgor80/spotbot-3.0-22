GRANT EXECUTE ON FUNCTION public.backfill_advanced_player_stats() TO service_role;
SELECT public.backfill_advanced_player_stats();
SELECT public.refresh_player_season_archive();