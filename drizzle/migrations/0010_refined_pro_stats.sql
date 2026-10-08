ALTER TABLE public.player_stats
  ADD COLUMN IF NOT EXISTS chances_created integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS hockey_assists integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS take_on_attempts integer DEFAULT 0;
ALTER TABLE public.player_season_archive
  ADD COLUMN IF NOT EXISTS chances_created integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS hockey_assists integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS take_on_attempts integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ball_recoveries integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS defensive_stops integer DEFAULT 0;
COMMENT ON COLUMN public.player_season_archive.second_assists IS 'OurProClub-style raw code 118 total (includes passes that were also the assist)';
COMMENT ON COLUMN public.player_season_archive.hockey_assists IS 'Code 118 surplus over official assists: build-up passes not already counted as assists';
COMMENT ON COLUMN public.player_season_archive.possessions_lost IS 'Code 102 estimate (OurProClub mapping); sparse in EA data';
COMMENT ON COLUMN public.player_season_archive.blocks IS 'Code 61 (OurProClub mapping); EA rarely sends it';

CREATE OR REPLACE FUNCTION public.backfill_advanced_player_stats()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE n integer;
BEGIN
  -- OurProClub mapping, refined: 118 raw = second_assists (their label), surplus over assists = hockey_assists,
  -- 118+35 = chances_created, 32/3 = take-ons won/attempted, 176 won, 102 lost, 61 blocks.
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
    second_assists = coalesce((j.c->>'118')::int,0),
    hockey_assists = GREATEST(coalesce((j.c->>'118')::int,0) - coalesce(ps.assists,0), 0),
    chances_created = coalesce((j.c->>'118')::int,0) + coalesce((j.c->>'35')::int,0),
    through_balls = coalesce((j.c->>'35')::int,0),
    dribbles = coalesce((j.c->>'32')::int,0),
    dribble_success = coalesce((j.c->>'32')::int,0),
    take_on_attempts = GREATEST(coalesce((j.c->>'3')::int,0), coalesce((j.c->>'32')::int,0)),
    progressive_carries = coalesce((j.c->>'34')::int,0),
    possession_gains = coalesce((j.c->>'176')::int,0),
    possessions_lost = coalesce((j.c->>'102')::int,0),
    blocks = coalesce((j.c->>'61')::int,0)
  FROM j WHERE ps.id = j.id;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

CREATE OR REPLACE FUNCTION public.refresh_player_season_archive()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE n integer;
BEGIN
  WITH s AS (
    SELECT code, starts_at, lead(starts_at) OVER (ORDER BY starts_at) AS ends_at FROM ea_seasons
  ), agg AS (
    SELECT ps.guild_id, ps.discord_user_id, s.code,
      count(*)::int m, count(*) FILTER (WHERE ps.won)::int w,
      coalesce(sum(ps.goals),0)::int g, coalesce(sum(ps.assists),0)::int a,
      count(*) FILTER (WHERE ps.clean_sheet)::int cs,
      coalesce(sum(ps.tackles),0)::int t, coalesce(sum(ps.interceptions),0)::int i,
      coalesce(sum(coalesce(ps.saves_diving,0)+coalesce(ps.saves_reflex,0)+coalesce(ps.saves_parry,0)+coalesce(ps.saves_cross,0)+coalesce(ps.saves_punch,0)),0)::int sv,
      count(*) FILTER (WHERE ps.man_of_match)::int motm,
      round(avg(nullif(ps.ea_match_rating,0))::numeric,2) r,
      min(coalesce(ps.recorded_at,ps.created_at)) f, max(coalesce(ps.recorded_at,ps.created_at)) l,
      coalesce(sum(ps.second_assists),0)::int sa, coalesce(sum(ps.dribbles),0)::int dr,
      coalesce(sum(ps.possession_gains),0)::int pw, coalesce(sum(ps.possessions_lost),0)::int pl,
      coalesce(sum(ps.blocks),0)::int bl, coalesce(sum(ps.clearances),0)::int cl, coalesce(sum(ps.shots),0)::int sh,
      coalesce(sum(ps.chances_created),0)::int cc, coalesce(sum(ps.hockey_assists),0)::int ha,
      coalesce(sum(ps.take_on_attempts),0)::int toa
    FROM player_stats ps
    JOIN s ON coalesce(ps.recorded_at,ps.created_at) >= s.starts_at
          AND (s.ends_at IS NULL OR coalesce(ps.recorded_at,ps.created_at) < s.ends_at)
    WHERE ps.discord_user_id IS NOT NULL
    GROUP BY 1,2,3
  )
  INSERT INTO player_season_archive AS p (guild_id, discord_user_id, season_code, matches, wins, goals, assists, clean_sheets, tackles, interceptions, saves, motm, avg_rating, first_match_at, last_match_at, updated_at, second_assists, dribbles, possessions_won, possessions_lost, blocks, clearances, shots, chances_created, hockey_assists, take_on_attempts, ball_recoveries, defensive_stops)
  SELECT guild_id, discord_user_id, code, m, w, g, a, cs, t, i, sv, motm, r, f, l, now(), sa, dr, pw, pl, bl, cl, sh, cc, ha, toa, pw + i, t + i + cl + bl FROM agg
  ON CONFLICT (guild_id, discord_user_id, season_code) DO UPDATE SET
    matches=GREATEST(p.matches, EXCLUDED.matches), wins=EXCLUDED.wins, goals=EXCLUDED.goals, assists=EXCLUDED.assists,
    clean_sheets=EXCLUDED.clean_sheets, tackles=EXCLUDED.tackles, interceptions=EXCLUDED.interceptions, saves=EXCLUDED.saves,
    motm=EXCLUDED.motm, avg_rating=EXCLUDED.avg_rating, first_match_at=EXCLUDED.first_match_at, last_match_at=EXCLUDED.last_match_at, updated_at=now(),
    second_assists=EXCLUDED.second_assists, dribbles=EXCLUDED.dribbles,
    possessions_won=EXCLUDED.possessions_won, possessions_lost=EXCLUDED.possessions_lost,
    blocks=EXCLUDED.blocks, clearances=EXCLUDED.clearances, shots=EXCLUDED.shots,
    chances_created=EXCLUDED.chances_created, hockey_assists=EXCLUDED.hockey_assists, take_on_attempts=EXCLUDED.take_on_attempts,
    ball_recoveries=EXCLUDED.ball_recoveries, defensive_stops=EXCLUDED.defensive_stops
  WHERE EXCLUDED.matches >= p.matches;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;