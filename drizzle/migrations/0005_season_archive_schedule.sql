SELECT cron.schedule('season-card-archive-nightly', '30 6 * * *', $$SELECT public.refresh_player_season_archive();$$);
SELECT public.refresh_player_season_archive();