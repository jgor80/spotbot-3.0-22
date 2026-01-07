-- Remove overly permissive public write policies from critical tables
-- This migration secures tables by removing direct client write access

-- 1. Profiles table - remove public insert/update
DROP POLICY IF EXISTS "Allow public insert on profiles" ON public.profiles;
DROP POLICY IF EXISTS "Allow public update on profiles" ON public.profiles;

-- 2. Guild settings table - remove public insert/update (keep read for client display)
DROP POLICY IF EXISTS "Allow public insert on guild_settings" ON public.guild_settings;
DROP POLICY IF EXISTS "Allow public update on guild_settings" ON public.guild_settings;

-- 3. Position preferences table - remove public insert/update
DROP POLICY IF EXISTS "Allow public insert on position_preferences" ON public.position_preferences;
DROP POLICY IF EXISTS "Allow public update on position_preferences" ON public.position_preferences;

-- 4. Club stats table - remove public insert/update
DROP POLICY IF EXISTS "Allow public insert on club_stats" ON public.club_stats;
DROP POLICY IF EXISTS "Allow public update on club_stats" ON public.club_stats;

-- 5. Scouting reports table - remove public insert/update
DROP POLICY IF EXISTS "Allow public insert on scouting_reports" ON public.scouting_reports;
DROP POLICY IF EXISTS "Allow public update on scouting_reports" ON public.scouting_reports;

-- 6. Teams table - remove public write policies
DROP POLICY IF EXISTS "Allow public insert on teams" ON public.teams;
DROP POLICY IF EXISTS "Allow public update on teams" ON public.teams;
DROP POLICY IF EXISTS "Allow public delete on teams" ON public.teams;

-- 7. Team rosters table - remove public write policies
DROP POLICY IF EXISTS "Allow public insert on team_rosters" ON public.team_rosters;
DROP POLICY IF EXISTS "Allow public update on team_rosters" ON public.team_rosters;
DROP POLICY IF EXISTS "Allow public delete on team_rosters" ON public.team_rosters;

-- 8. Scouting lists table - remove public write policies
DROP POLICY IF EXISTS "Allow public insert on scouting_lists" ON public.scouting_lists;
DROP POLICY IF EXISTS "Allow public update on scouting_lists" ON public.scouting_lists;
DROP POLICY IF EXISTS "Allow public delete on scouting_lists" ON public.scouting_lists;

-- 9. Pending win claims table - remove public insert/update
DROP POLICY IF EXISTS "Allow public insert on pending_win_claims" ON public.pending_win_claims;
DROP POLICY IF EXISTS "Allow public update on pending_win_claims" ON public.pending_win_claims;

-- 10. Competition wins table - remove public insert
DROP POLICY IF EXISTS "Allow public insert on competition_wins" ON public.competition_wins;
DROP POLICY IF EXISTS "Allow public update on competition_wins" ON public.competition_wins;

-- 11. Link suggestions table - remove public update
DROP POLICY IF EXISTS "Allow public update on link_suggestions" ON public.link_suggestions;