-- Brings the schema that only ever lived in drizzle/migrations (0000-0011, applied by hand in the Lovable era)
-- into supabase/migrations, which is the only folder auto-deploy applies. Without it a fresh database built
-- from this repo stopped at 20261108030000 (it comments on player_season_archive, which only drizzle/0004
-- created) and lacked link_invites, pro_photo_assets, ea_seasons, the lineup confirmation columns and the
-- profile sign-in columns that the code depends on.
--
-- Every statement is a no-op where the object already exists, so it's safe on production (which got these
-- by hand) and runs after the later migrations there without overwriting them: functions are only created
-- when missing. Left out on purpose:
-- - 0002 (one server's kit colours, which is data rather than schema)
-- - 0005/0007/0008 (pg_cron jobs and one-off backfills; the bot scheduler runs these jobs)
-- - 0006/0009/0010's backfill_advanced_player_stats (20261108030000 replaces it)

-- 0000: one-time account link invites
CREATE TABLE IF NOT EXISTS public.link_invites (
  token text PRIMARY KEY,
  discord_user_id text NOT NULL,
  discord_username text,
  guild_id text NOT NULL,
  expires_at timestamptz NOT NULL DEFAULT now() + interval '7 days',
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.link_invites TO service_role;
ALTER TABLE public.link_invites ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS link_invites_user_idx ON public.link_invites(discord_user_id);

-- 0001: event lineup confirmations and voice invites
ALTER TABLE public.availability_events
  ADD COLUMN IF NOT EXISTS formation text,
  ADD COLUMN IF NOT EXISTS vc_invite_30_sent boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS vc_invite_0_sent boolean NOT NULL DEFAULT false;
ALTER TABLE public.lineup_slots
  ADD COLUMN IF NOT EXISTS confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS declined_at timestamptz;

-- 0003: every accepted pro photo upload (pro_photos stays the latest-photo record)
DO $$
BEGIN
  IF to_regclass('public.pro_photo_assets') IS NULL THEN
    CREATE TABLE public.pro_photo_assets (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      discord_user_id text NOT NULL,
      guild_id text NOT NULL,
      submitted_by text,
      image_url text NOT NULL,
      storage_path text,
      source_key text NOT NULL,
      source_kind text NOT NULL DEFAULT 'upload',
      graphic_kind text,
      pose text,
      analysis jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (discord_user_id, source_key)
    );
    -- Only a brand-new table gets the legacy copy, so photos a player deleted never come back
    INSERT INTO public.pro_photo_assets (discord_user_id, guild_id, submitted_by, image_url, source_key, analysis, created_at)
    SELECT discord_user_id, guild_id, submitted_by, image_url, 'legacy:' || id::text, COALESCE(analysis, '{}'::jsonb), created_at
      FROM public.pro_photos
     WHERE discord_user_id IS NOT NULL AND guild_id IS NOT NULL AND image_url IS NOT NULL
    ON CONFLICT DO NOTHING;
  END IF;
END $$;
GRANT ALL ON public.pro_photo_assets TO service_role;
ALTER TABLE public.pro_photo_assets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service access only" ON public.pro_photo_assets;
CREATE POLICY "Service access only" ON public.pro_photo_assets FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS pro_photo_assets_player_pose_idx ON public.pro_photo_assets (discord_user_id, pose, created_at DESC);
COMMENT ON TABLE public.pro_photo_assets IS 'Append-only player photo and generated artwork collection; pro_photos remains the latest uploaded photo for existing consumers.';

-- 0004/0006/0010: EA seasons and the permanent per-season card archive
CREATE TABLE IF NOT EXISTS public.ea_seasons (
  code text PRIMARY KEY,
  label text NOT NULL,
  starts_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ea_seasons TO anon, authenticated;
GRANT ALL ON public.ea_seasons TO service_role;
ALTER TABLE public.ea_seasons ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Seasons are public" ON public.ea_seasons;
CREATE POLICY "Seasons are public" ON public.ea_seasons FOR SELECT USING (true);
INSERT INTO public.ea_seasons (code, label, starts_at) VALUES
 ('fc24','EA FC 24','2023-09-22T00:00:00Z'),
 ('fc25','EA FC 25','2024-09-20T00:00:00Z'),
 ('fc26','EA FC 26','2025-09-19T00:00:00Z'),
 ('fc27','EA FC 27','2026-09-25T00:00:00Z')
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.player_season_archive (
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
ALTER TABLE public.player_season_archive
  ADD COLUMN IF NOT EXISTS second_assists integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS dribbles integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS possessions_won integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS possessions_lost integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS blocks integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS clearances integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS shots integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS chances_created integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS hockey_assists integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS take_on_attempts integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ball_recoveries integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS defensive_stops integer DEFAULT 0;
GRANT ALL ON public.player_season_archive TO service_role;
ALTER TABLE public.player_season_archive ENABLE ROW LEVEL SECURITY;
-- drizzle/0004 made the archive readable by anyone (anon included); it's server data like player_stats
DROP POLICY IF EXISTS "Season archive is public" ON public.player_season_archive;
REVOKE ALL ON public.player_season_archive FROM anon;
GRANT SELECT ON public.player_season_archive TO authenticated;
DROP POLICY IF EXISTS "Members of the server can read" ON public.player_season_archive;
CREATE POLICY "Members of the server can read" ON public.player_season_archive
  FOR SELECT TO authenticated USING (public.user_has_guild_access(guild_id));

ALTER TABLE public.player_stats
  ADD COLUMN IF NOT EXISTS second_assists integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS dribbles integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS possession_gains integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS possessions_lost integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS blocks integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS clearances integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS shots integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS chances_created integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS hockey_assists integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS take_on_attempts integer DEFAULT 0;

-- Only created where missing: production already has these (possibly newer) versions
DO $fn$
BEGIN
  IF to_regprocedure('public.ea_event_counts(jsonb)') IS NULL THEN
    EXECUTE $sql$
      CREATE FUNCTION public.ea_event_counts(p jsonb)
      RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path TO 'public' AS $body$
        SELECT coalesce(jsonb_object_agg(code, n), '{}'::jsonb) FROM (
          SELECT split_part(kv,':',1) code, sum(nullif(split_part(kv,':',2),'')::int) n
          FROM unnest(ARRAY[p->>'match_event_aggregate_0',p->>'match_event_aggregate_1',p->>'match_event_aggregate_2',p->>'match_event_aggregate_3']) s,
               unnest(string_to_array(coalesce(s,''), ',')) kv
          WHERE kv ~ '^\d+:\d+$' GROUP BY 1) t
      $body$
    $sql$;
  END IF;

  IF to_regprocedure('public.refresh_player_season_archive()') IS NULL THEN
    EXECUTE $sql$
      CREATE FUNCTION public.refresh_player_season_archive()
      RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $body$
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
      END $body$
    $sql$;
  END IF;
END $fn$;
REVOKE EXECUTE ON FUNCTION public.refresh_player_season_archive() FROM PUBLIC, anon, authenticated;
-- Competitive match history is permanent: no one-year purge helper
DROP FUNCTION IF EXISTS public.archive_old_club_matches();

-- 0011: profiles for any sign-in method (Discord, Google, email)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS auth_user_id uuid UNIQUE,
  ADD COLUMN IF NOT EXISTS display_name text,
  ADD COLUMN IF NOT EXISTS avatar_url text,
  ADD COLUMN IF NOT EXISTS psn_id text,
  ADD COLUMN IF NOT EXISTS sign_in_provider text;
ALTER TABLE public.profiles ALTER COLUMN discord_user_id DROP NOT NULL;

DO $fn$
BEGIN
  IF to_regprocedure('public.handle_new_auth_profile()') IS NULL THEN
    EXECUTE $sql$
      CREATE FUNCTION public.handle_new_auth_profile()
      RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $body$
      BEGIN
        -- Discord accounts are created by the Discord sign-in function, which writes the profile itself.
        IF NEW.email LIKE 'discord\_%@users.gafferbot.app' THEN RETURN NEW; END IF;
        INSERT INTO public.profiles (auth_user_id, display_name, avatar_url, sign_in_provider)
        VALUES (NEW.id,
          coalesce(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email,'@',1)),
          NEW.raw_user_meta_data->>'avatar_url',
          coalesce(NEW.raw_app_meta_data->>'provider','email'))
        ON CONFLICT (auth_user_id) DO NOTHING;
        RETURN NEW;
      EXCEPTION WHEN others THEN RETURN NEW;
      END $body$
    $sql$;
  END IF;
  IF to_regclass('auth.users') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'on_auth_user_created_profile' AND tgrelid = 'auth.users'::regclass
  ) THEN
    CREATE TRIGGER on_auth_user_created_profile AFTER INSERT ON auth.users
      FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_profile();
  END IF;
END $fn$;
-- drizzle/0011's "Users update own profile" policy is not ported: it let anyone rewrite their own EA name.
-- Profiles are written only through the service role (see 20261109120000).

-- 0005/0008 scheduled these with pg_cron; the bot scheduler (scheduler.cjs) now runs the same jobs, so a
-- database that still has them would run each job twice
DO $$
BEGIN
  IF to_regclass('cron.job') IS NOT NULL THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname IN ('season-card-archive-nightly', 'advanced-stats-refresh');
  END IF;
END $$;
