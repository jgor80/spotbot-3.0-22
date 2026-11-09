-- Club data was readable by anyone. Most per-server tables still carried Lovable-era policies like
-- "Allow public read on player_stats" (FOR SELECT USING (true)), and anon kept its SELECT grant. Permissive
-- policies are OR'd together, so those cancelled the server-scoped policies added since. Anyone holding the
-- public anon key from the web bundle could read every server's availability notes, gamertags, manager
-- ratings, block lists and pro photo links (10-year signed URLs).
--
-- Now:
-- - anon has no access to these tables. The bot and every function use the service role, which skips RLS.
-- - Signed-in users read only rows from servers they can access. That's the same rule as
--   user_has_guild_access, evaluated once per query through my_guild_ids().
-- - profiles: you can read your own profile and the profiles of people in your servers. The website never
--   writes profiles itself (Discord sign-in and the functions use the service role), so the unrestricted
--   "Users update own profile" policy (drizzle 0011) is dropped. It let anyone set their own EA name to
--   another player's gamertag.

-- Servers the signed-in user can see: all of them for web admins, otherwise every server where one of
-- their verified Discord accounts has recorded matches.
CREATE OR REPLACE FUNCTION public.my_guild_ids()
RETURNS SETOF text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT gs.guild_id FROM public.guild_settings gs
   WHERE EXISTS (SELECT 1 FROM public.web_admins WHERE auth_user_id = auth.uid())
  UNION
  SELECT DISTINCT ps.guild_id
    FROM public.player_stats ps
    JOIN public.user_discord_links udl ON udl.discord_user_id = ps.discord_user_id
   WHERE udl.auth_user_id = auth.uid()
     AND udl.verified IS TRUE
$$;

-- Discord IDs (and ea_ placeholders) of the people in those servers: players with matches, a player summary,
-- position tiers or a roster spot.
CREATE OR REPLACE FUNCTION public.my_guild_member_ids()
RETURNS SETOF text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ps.discord_user_id FROM public.player_stats ps WHERE ps.guild_id IN (SELECT public.my_guild_ids())
  UNION
  SELECT sm.discord_user_id FROM public.player_summary sm WHERE sm.guild_id IN (SELECT public.my_guild_ids())
  UNION
  SELECT pp.discord_user_id FROM public.player_positions pp WHERE pp.guild_id IN (SELECT public.my_guild_ids())
  UNION
  SELECT tr.discord_user_id FROM public.team_rosters tr JOIN public.teams t ON t.id = tr.team_id
   WHERE t.guild_id IN (SELECT public.my_guild_ids())
  UNION
  SELECT udl.discord_user_id FROM public.user_discord_links udl
   WHERE udl.auth_user_id = auth.uid() AND udl.verified IS TRUE
$$;

REVOKE ALL ON FUNCTION public.my_guild_ids() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.my_guild_member_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_guild_ids() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.my_guild_member_ids() TO authenticated, service_role;

DO $$
DECLARE
  -- table => how a row finds its server
  scoped constant text[][] := ARRAY[
    ['active_game_sessions',   'guild_id IN (SELECT public.my_guild_ids())'],
    ['attendance_records',     'guild_id IN (SELECT public.my_guild_ids())'],
    ['availability_events',    'guild_id IN (SELECT public.my_guild_ids())'],
    ['blocked_users',          'guild_id IN (SELECT public.my_guild_ids())'],
    ['club_division_history',  'guild_id IN (SELECT public.my_guild_ids())'],
    ['club_matches',           'guild_id IN (SELECT public.my_guild_ids())'],
    ['club_sessions',          'guild_id IN (SELECT public.my_guild_ids())'],
    ['club_stats',             'guild_id IN (SELECT public.my_guild_ids())'],
    ['competition_wins',       'guild_id IN (SELECT public.my_guild_ids())'],
    ['dm_feedback_requests',   'guild_id IN (SELECT public.my_guild_ids())'],
    ['drafts',                 'guild_id IN (SELECT public.my_guild_ids())'],
    ['draft_picks',            'draft_id IN (SELECT d.id FROM public.drafts d WHERE d.guild_id IN (SELECT public.my_guild_ids()))'],
    ['draft_results',          'draft_id IN (SELECT d.id FROM public.drafts d WHERE d.guild_id IN (SELECT public.my_guild_ids()))'],
    ['evaluator_trust_scores', 'guild_id IN (SELECT public.my_guild_ids())'],
    ['event_checkins',         'event_id IN (SELECT e.id FROM public.availability_events e WHERE e.guild_id IN (SELECT public.my_guild_ids()))'],
    ['event_presets',          'guild_id IN (SELECT public.my_guild_ids())'],
    ['event_series',           'guild_id IN (SELECT public.my_guild_ids())'],
    ['guild_queues',           'guild_id IN (SELECT public.my_guild_ids())'],
    ['lineups',                'guild_id IN (SELECT public.my_guild_ids())'],
    ['lineup_slots',           'lineup_id IN (SELECT l.id FROM public.lineups l WHERE l.guild_id IN (SELECT public.my_guild_ids()))'],
    ['manager_evaluations',    'guild_id IN (SELECT public.my_guild_ids())'],
    ['monthly_snapshots',      'guild_id IN (SELECT public.my_guild_ids())'],
    ['peer_evaluations',       'guild_id IN (SELECT public.my_guild_ids())'],
    ['pending_win_claims',     'guild_id IN (SELECT public.my_guild_ids())'],
    ['player_achievements',    'guild_id IN (SELECT public.my_guild_ids())'],
    ['player_availability',    'event_id IN (SELECT e.id FROM public.availability_events e WHERE e.guild_id IN (SELECT public.my_guild_ids()))'],
    ['player_build_profiles',  'guild_id IN (SELECT public.my_guild_ids())'],
    ['player_chemistry',       'guild_id IN (SELECT public.my_guild_ids())'],
    ['player_club_stats',      'guild_id IN (SELECT public.my_guild_ids())'],
    ['player_position_ratings','guild_id IN (SELECT public.my_guild_ids())'],
    ['player_positions',       'guild_id IN (SELECT public.my_guild_ids())'],
    ['player_ratings',         'guild_id IN (SELECT public.my_guild_ids())'],
    ['player_reliability',     'guild_id IN (SELECT public.my_guild_ids())'],
    ['player_stats',           'guild_id IN (SELECT public.my_guild_ids())'],
    ['player_streaks',         'guild_id IN (SELECT public.my_guild_ids())'],
    ['player_summary',         'guild_id IN (SELECT public.my_guild_ids())'],
    ['player_vibe_chemistry',  'guild_id IN (SELECT public.my_guild_ids())'],
    ['position_preferences',   'guild_id IN (SELECT public.my_guild_ids())'],
    ['pro_photos',             'guild_id IN (SELECT public.my_guild_ids())'],
    ['scouted_players',        'guild_id IN (SELECT public.my_guild_ids())'],
    ['scouting_reports',       'guild_id IN (SELECT public.my_guild_ids())'],
    ['sub_requests',           'guild_id IN (SELECT public.my_guild_ids())'],
    ['teams',                  'guild_id IN (SELECT public.my_guild_ids())'],
    ['team_rosters',           'team_id IN (SELECT t.id FROM public.teams t WHERE t.guild_id IN (SELECT public.my_guild_ids()))'],
    ['user_roles',             'guild_id IN (SELECT public.my_guild_ids())'],
    ['xbox_detected_sessions', 'guild_id IN (SELECT public.my_guild_ids())'],
    -- Club Life (signed-in users could read every server's) and the season card archive
    ['club_award_ballots',     'guild_id IN (SELECT public.my_guild_ids())'],
    ['club_press',             'guild_id IN (SELECT public.my_guild_ids())'],
    ['player_badges',          'guild_id IN (SELECT public.my_guild_ids())'],
    ['player_career',          'guild_id IN (SELECT public.my_guild_ids())'],
    ['player_goals',           'guild_id IN (SELECT public.my_guild_ids())'],
    ['player_wrapped',         'guild_id IN (SELECT public.my_guild_ids())'],
    ['trophy_reigns',          'guild_id IN (SELECT public.my_guild_ids())'],
    ['player_season_archive',  'guild_id IN (SELECT public.my_guild_ids())'],
    ['profiles',               'auth_user_id = auth.uid() OR discord_user_id IN (SELECT public.my_guild_member_ids())']
  ];
  t text;
  rule text;
  p record;
  i int;
BEGIN
  FOR i IN 1 .. array_length(scoped, 1) LOOP
    t := scoped[i][1];
    rule := scoped[i][2];
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE NOTICE 'skipping %, not in this database', t;
      CONTINUE;
    END IF;
    -- Drop every read policy that isn't limited to the service role, whatever it was named (Lovable-era
    -- databases carry names this repo never recorded), plus any wide-open FOR ALL policy. Scoped write
    -- policies (FOR ALL with a real condition) stay.
    FOR p IN
      SELECT policyname FROM pg_policies
       WHERE schemaname = 'public' AND tablename = t
         AND NOT (roles = ARRAY['service_role']::name[])
         AND (cmd = 'SELECT' OR (cmd = 'ALL' AND (qual = 'true' OR with_check = 'true')))
    LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', p.policyname, t);
    END LOOP;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
    EXECUTE format('CREATE POLICY "Members of the server can read" ON public.%I FOR SELECT TO authenticated USING (%s)', t, rule);
  END LOOP;
END $$;

-- Profiles are written only through the service role (Discord sign-in in the Worker, link functions)
DROP POLICY IF EXISTS "Users update own profile" ON public.profiles;
REVOKE INSERT, UPDATE, DELETE ON public.profiles FROM authenticated;

-- Settings → Save Preferences and Save Build write from the browser, but these tables had no write policy
-- for signed-in users, so every save failed. A player may save their own rows (any of their verified
-- Discord accounts) in a server they can access.
CREATE OR REPLACE FUNCTION public.my_discord_ids()
RETURNS SETOF text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT discord_user_id FROM public.user_discord_links WHERE auth_user_id = auth.uid() AND verified IS TRUE
$$;
REVOKE ALL ON FUNCTION public.my_discord_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_discord_ids() TO authenticated, service_role;

DROP POLICY IF EXISTS "Players save their own preferences" ON public.position_preferences;
CREATE POLICY "Players save their own preferences" ON public.position_preferences FOR INSERT TO authenticated
  WITH CHECK (user_id IN (SELECT public.my_discord_ids()) AND guild_id IN (SELECT public.my_guild_ids()));
DROP POLICY IF EXISTS "Players update their own preferences" ON public.position_preferences;
CREATE POLICY "Players update their own preferences" ON public.position_preferences FOR UPDATE TO authenticated
  USING (user_id IN (SELECT public.my_discord_ids()))
  WITH CHECK (user_id IN (SELECT public.my_discord_ids()) AND guild_id IN (SELECT public.my_guild_ids()));
GRANT INSERT, UPDATE ON public.position_preferences TO authenticated;

DROP POLICY IF EXISTS "Players save their own builds" ON public.player_build_profiles;
CREATE POLICY "Players save their own builds" ON public.player_build_profiles FOR INSERT TO authenticated
  WITH CHECK (discord_user_id IN (SELECT public.my_discord_ids()) AND guild_id IN (SELECT public.my_guild_ids()));
DROP POLICY IF EXISTS "Players update their own builds" ON public.player_build_profiles;
CREATE POLICY "Players update their own builds" ON public.player_build_profiles FOR UPDATE TO authenticated
  USING (discord_user_id IN (SELECT public.my_discord_ids()))
  WITH CHECK (discord_user_id IN (SELECT public.my_discord_ids()) AND guild_id IN (SELECT public.my_guild_ids()));
GRANT INSERT, UPDATE ON public.player_build_profiles TO authenticated;
