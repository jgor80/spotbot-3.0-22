CREATE TABLE public.ea_seasons (
  code text PRIMARY KEY,
  label text NOT NULL,
  starts_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ea_seasons TO anon, authenticated;
GRANT ALL ON public.ea_seasons TO service_role;
ALTER TABLE public.ea_seasons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Seasons are public" ON public.ea_seasons FOR SELECT USING (true);

INSERT INTO public.ea_seasons (code, label, starts_at) VALUES
 ('fc24','EA FC 24','2023-09-22T00:00:00Z'),
 ('fc25','EA FC 25','2024-09-20T00:00:00Z'),
 ('fc26','EA FC 26','2025-09-19T00:00:00Z'),
 ('fc27','EA FC 27','2026-09-25T00:00:00Z');

CREATE TABLE public.player_season_archive (
  guild_id text NOT NULL,
  discord_user_id text NOT NULL,
  season_code text NOT NULL REFERENCES public.ea_seasons(code),
  matches integer NOT NULL DEFAULT 0,
  wins integer NOT NULL DEFAULT 0,
  goals integer NOT NULL DEFAULT 0,
  assists integer NOT NULL DEFAULT 0,
  clean_sheets integer NOT NULL DEFAULT 0,
  tackles integer NOT NULL DEFAULT 0,
  interceptions integer NOT NULL DEFAULT 0,
  saves integer NOT NULL DEFAULT 0,
  motm integer NOT NULL DEFAULT 0,
  avg_rating numeric(4,2),
  first_match_at timestamptz,
  last_match_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (guild_id, discord_user_id, season_code)
);
GRANT SELECT ON public.player_season_archive TO anon, authenticated;
GRANT ALL ON public.player_season_archive TO service_role;
ALTER TABLE public.player_season_archive ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Season archive is public" ON public.player_season_archive FOR SELECT USING (true);

-- Rebuilds season rows from the permanent per-match records. Only adds/refreshes; never deletes a season row.
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
      min(coalesce(ps.recorded_at,ps.created_at)) f, max(coalesce(ps.recorded_at,ps.created_at)) l
    FROM player_stats ps
    JOIN s ON coalesce(ps.recorded_at,ps.created_at) >= s.starts_at
          AND (s.ends_at IS NULL OR coalesce(ps.recorded_at,ps.created_at) < s.ends_at)
    WHERE ps.discord_user_id IS NOT NULL
    GROUP BY 1,2,3
  )
  INSERT INTO player_season_archive AS p (guild_id, discord_user_id, season_code, matches, wins, goals, assists, clean_sheets, tackles, interceptions, saves, motm, avg_rating, first_match_at, last_match_at, updated_at)
  SELECT guild_id, discord_user_id, code, m, w, g, a, cs, t, i, sv, motm, r, f, l, now() FROM agg
  ON CONFLICT (guild_id, discord_user_id, season_code) DO UPDATE SET
    matches=GREATEST(p.matches, EXCLUDED.matches), wins=EXCLUDED.wins, goals=EXCLUDED.goals, assists=EXCLUDED.assists,
    clean_sheets=EXCLUDED.clean_sheets, tackles=EXCLUDED.tackles, interceptions=EXCLUDED.interceptions, saves=EXCLUDED.saves,
    motm=EXCLUDED.motm, avg_rating=EXCLUDED.avg_rating, first_match_at=EXCLUDED.first_match_at, last_match_at=EXCLUDED.last_match_at, updated_at=now()
  WHERE EXCLUDED.matches >= p.matches;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;
REVOKE EXECUTE ON FUNCTION public.refresh_player_season_archive() FROM PUBLIC, anon, authenticated;

-- Competitive match history is permanent: remove the one-year purge helper.
DROP FUNCTION IF EXISTS public.archive_old_club_matches();