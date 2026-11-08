-- Decode EA match_event_aggregate codes with the confirmed FC27 mappings from
-- https://github.com/Interactive-63/eafc-pro-clubs-api-research (same codes as
-- supabase/functions/_shared/ea-events.ts and public/spotbot/ea-events.cjs).
-- The old mapping mislabelled most codes (e.g. 32 is backward passes, not dribbles; 176 is an
-- in-game feedback popup, not possession won). This runs hourly from the bot scheduler, so it
-- also rewrites every past player_stats row that still has its EA match data.
-- Stats with no confirmed event are set to 0 (or EA's own named field where one exists).
CREATE OR REPLACE FUNCTION public.backfill_advanced_player_stats()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE n integer;
BEGIN
  WITH ev AS (
    SELECT cm.ea_match_id, lower(v->>'playername') pn, ea_event_counts(v) c,
      coalesce(nullif(v->>'interceptions','')::int, 0) named_int,
      coalesce(nullif(v->>'clearances','')::int, 0) named_clr
    FROM club_matches cm, jsonb_each(cm.match_data::jsonb->'players') cl(cid,cv), jsonb_each(cv) x(k,v)
    WHERE jsonb_typeof(cv)='object' AND v ? 'playername'
  ), e AS (
    SELECT ea_match_id, pn, named_clr,
      coalesce(nullif((c->>'6')::int, 0), named_int) interceptions,
      coalesce((c->>'115')::int,0) second_assists,
      coalesce((c->>'152')::int,0) through_balls,
      coalesce((c->>'174')::int,0) dribbles,
      coalesce((c->>'97')::int,0) carries,
      coalesce((c->>'108')::int,0) + coalesce((c->>'109')::int,0) + coalesce((c->>'110')::int,0) won,
      coalesce((c->>'105')::int,0) + coalesce((c->>'106')::int,0) + coalesce((c->>'107')::int,0) lost,
      coalesce((c->>'0')::int,0) tackles_won,
      coalesce((c->>'217')::int,0) on_target,
      coalesce((c->>'218')::int,0) off_target,
      coalesce((c->>'215')::int,0) passes_completed,
      coalesce((c->>'30')::int,0) forward_passes
    FROM ev
  ), j AS (
    SELECT ps.id, e.* FROM player_stats ps
    JOIN profiles pr ON pr.discord_user_id = ps.discord_user_id
    JOIN e ON e.ea_match_id = ps.ea_match_id AND e.pn = lower(pr.ea_username)
  )
  UPDATE player_stats ps SET
    interceptions = j.interceptions,
    clearances = j.named_clr,
    second_assists = j.second_assists,
    hockey_assists = j.second_assists,
    chances_created = 0,
    through_balls = j.through_balls,
    dribbles = j.dribbles,
    dribble_success = j.dribbles,
    take_on_attempts = 0,
    progressive_carries = j.carries,
    possession_gains = j.won,
    ball_recoveries = j.won,
    possessions_lost = j.lost,
    blocks = 0,
    tackle_success = j.tackles_won,
    defensive_actions = j.tackles_won + j.interceptions,
    shots_on_target = j.on_target,
    shots_off_target = j.off_target,
    passes_completed = j.passes_completed,
    forward_passes = j.forward_passes,
    touches_in_box = 0,
    pressing_actions = 0,
    big_chances = 0,
    forward_runs = 0,
    offensive_duels = 0,
    defensive_duels = 0,
    gk_claims = 0,
    goals_inside_box = 0
  FROM j WHERE ps.id = j.id;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

COMMENT ON COLUMN public.player_season_archive.second_assists IS 'EA event 115 (second assists)';
COMMENT ON COLUMN public.player_season_archive.hockey_assists IS 'Same as second_assists (EA event 115)';
COMMENT ON COLUMN public.player_season_archive.possessions_lost IS 'EA events 105-107 (possession lost by third)';
COMMENT ON COLUMN public.player_season_archive.blocks IS 'Not available: no confirmed EA event';
COMMENT ON COLUMN public.player_season_archive.chances_created IS 'Not available: no confirmed EA event';
