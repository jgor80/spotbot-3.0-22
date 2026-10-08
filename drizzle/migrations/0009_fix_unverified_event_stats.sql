CREATE OR REPLACE FUNCTION public.backfill_advanced_player_stats()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE n integer;
BEGIN
  -- Only codes that pass the data checks: 32 dribbles, 34 carries, 176 possession gains.
  -- 118 is a subset of assists (not second assists); 102 and 61 have no reliable meaning.
  WITH ev AS (
    SELECT cm.ea_match_id, lower(v->>'playername') pn, ea_event_counts(v) c
    FROM club_matches cm, jsonb_each(cm.match_data::jsonb->'players') cl(cid,cv), jsonb_each(cv) x(k,v)
    WHERE jsonb_typeof(cv)='object' AND v ? 'playername'
  ), j AS (
    SELECT ps.id, ev.c FROM player_stats ps
    JOIN profiles pr ON pr.discord_user_id = ps.discord_user_id
    JOIN ev ON ev.ea_match_id = ps.ea_match_id AND ev.pn = lower(pr.ea_username)
  )
  UPDATE player_stats ps SET
    second_assists = 0,
    dribbles = coalesce((j.c->>'32')::int,0),
    dribble_success = coalesce((j.c->>'32')::int,0),
    progressive_carries = coalesce((j.c->>'34')::int,0),
    possession_gains = coalesce((j.c->>'176')::int,0),
    possessions_lost = 0,
    blocks = 0
  FROM j WHERE ps.id = j.id;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;
SELECT public.backfill_advanced_player_stats();
UPDATE public.player_season_archive SET second_assists = 0, possessions_lost = 0, blocks = 0 WHERE second_assists <> 0 OR possessions_lost <> 0 OR blocks <> 0;
COMMENT ON COLUMN public.player_season_archive.second_assists IS 'Not available: EA data has no true second-assist signal';
COMMENT ON COLUMN public.player_season_archive.possessions_lost IS 'Not available: no verified EA event code';
COMMENT ON COLUMN public.player_season_archive.blocks IS 'Not available: EA never sends this event';