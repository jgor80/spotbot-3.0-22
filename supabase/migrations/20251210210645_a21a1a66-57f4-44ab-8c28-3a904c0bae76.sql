-- Fix Critical Security Issue: Remove public write access from user_roles table
-- This prevents privilege escalation attacks

-- Drop existing policies on user_roles
DROP POLICY IF EXISTS "Allow public delete on user_roles" ON public.user_roles;
DROP POLICY IF EXISTS "Allow public insert on user_roles" ON public.user_roles;
DROP POLICY IF EXISTS "Allow public update on user_roles" ON public.user_roles;
DROP POLICY IF EXISTS "Allow public read on user_roles" ON public.user_roles;

-- Create read-only policy for user_roles (needed for has_role function to work from web)
CREATE POLICY "Allow authenticated read on user_roles"
ON public.user_roles
FOR SELECT
USING (true);

-- Note: INSERT/UPDATE/DELETE on user_roles will only work via edge functions using service role key

-- Fix other critical tables by removing public write access
-- These tables should only be modified via edge functions with service role

-- attendance_records
DROP POLICY IF EXISTS "Allow public insert on attendance_records" ON public.attendance_records;
DROP POLICY IF EXISTS "Allow public update on attendance_records" ON public.attendance_records;

-- drafts
DROP POLICY IF EXISTS "Allow public insert on drafts" ON public.drafts;
DROP POLICY IF EXISTS "Allow public update on drafts" ON public.drafts;
DROP POLICY IF EXISTS "Allow public delete on drafts" ON public.drafts;

-- draft_picks
DROP POLICY IF EXISTS "Allow public insert on draft_picks" ON public.draft_picks;

-- draft_results
DROP POLICY IF EXISTS "Allow public insert on draft_results" ON public.draft_results;
DROP POLICY IF EXISTS "Allow public update on draft_results" ON public.draft_results;

-- player_ratings
DROP POLICY IF EXISTS "Allow public insert on player_ratings" ON public.player_ratings;
DROP POLICY IF EXISTS "Allow public update on player_ratings" ON public.player_ratings;

-- player_stats
DROP POLICY IF EXISTS "Allow public insert on player_stats" ON public.player_stats;
DROP POLICY IF EXISTS "Allow public update on player_stats" ON public.player_stats;

-- player_summary
DROP POLICY IF EXISTS "Allow public insert on player_summary" ON public.player_summary;
DROP POLICY IF EXISTS "Allow public update on player_summary" ON public.player_summary;

-- player_streaks
DROP POLICY IF EXISTS "Allow public insert on player_streaks" ON public.player_streaks;
DROP POLICY IF EXISTS "Allow public update on player_streaks" ON public.player_streaks;

-- player_reliability
DROP POLICY IF EXISTS "Allow public insert on player_reliability" ON public.player_reliability;
DROP POLICY IF EXISTS "Allow public update on player_reliability" ON public.player_reliability;

-- player_chemistry
DROP POLICY IF EXISTS "Allow public insert on player_chemistry" ON public.player_chemistry;
DROP POLICY IF EXISTS "Allow public update on player_chemistry" ON public.player_chemistry;

-- player_position_ratings
DROP POLICY IF EXISTS "Allow public insert on player_position_ratings" ON public.player_position_ratings;
DROP POLICY IF EXISTS "Allow public update on player_position_ratings" ON public.player_position_ratings;

-- player_achievements
DROP POLICY IF EXISTS "Allow public insert on player_achievements" ON public.player_achievements;

-- peer_evaluations
DROP POLICY IF EXISTS "Allow public insert on peer_evaluations" ON public.peer_evaluations;

-- evaluator_trust_scores
DROP POLICY IF EXISTS "Allow public insert on evaluator_trust_scores" ON public.evaluator_trust_scores;
DROP POLICY IF EXISTS "Allow public update on evaluator_trust_scores" ON public.evaluator_trust_scores;

-- guild_settings
DROP POLICY IF EXISTS "Allow public insert on guild_settings" ON public.guild_settings;
DROP POLICY IF EXISTS "Allow public update on guild_settings" ON public.guild_settings;
DROP POLICY IF EXISTS "Allow public delete on guild_settings" ON public.guild_settings;

-- competition_wins
DROP POLICY IF EXISTS "Allow public insert on competition_wins" ON public.competition_wins;
DROP POLICY IF EXISTS "Allow public update on competition_wins" ON public.competition_wins;

-- pending_win_claims
DROP POLICY IF EXISTS "Allow public insert on pending_win_claims" ON public.pending_win_claims;
DROP POLICY IF EXISTS "Allow public update on pending_win_claims" ON public.pending_win_claims;

-- dm_feedback_requests
DROP POLICY IF EXISTS "Allow public insert on dm_feedback_requests" ON public.dm_feedback_requests;
DROP POLICY IF EXISTS "Allow public update on dm_feedback_requests" ON public.dm_feedback_requests;

-- availability_events
DROP POLICY IF EXISTS "Allow public insert on availability_events" ON public.availability_events;
DROP POLICY IF EXISTS "Allow public update on availability_events" ON public.availability_events;
DROP POLICY IF EXISTS "Allow public delete on availability_events" ON public.availability_events;

-- player_availability
DROP POLICY IF EXISTS "Allow public insert on player_availability" ON public.player_availability;
DROP POLICY IF EXISTS "Allow public update on player_availability" ON public.player_availability;

-- lineups
DROP POLICY IF EXISTS "Allow public insert on lineups" ON public.lineups;
DROP POLICY IF EXISTS "Allow public update on lineups" ON public.lineups;
DROP POLICY IF EXISTS "Allow public delete on lineups" ON public.lineups;

-- lineup_slots
DROP POLICY IF EXISTS "Allow public insert on lineup_slots" ON public.lineup_slots;
DROP POLICY IF EXISTS "Allow public update on lineup_slots" ON public.lineup_slots;
DROP POLICY IF EXISTS "Allow public delete on lineup_slots" ON public.lineup_slots;

-- monthly_snapshots
DROP POLICY IF EXISTS "Allow public insert on monthly_snapshots" ON public.monthly_snapshots;

-- profiles
DROP POLICY IF EXISTS "Allow public insert on profiles" ON public.profiles;
DROP POLICY IF EXISTS "Allow public update on profiles" ON public.profiles;
DROP POLICY IF EXISTS "Allow public delete on profiles" ON public.profiles;

-- teams
DROP POLICY IF EXISTS "Allow public insert on teams" ON public.teams;
DROP POLICY IF EXISTS "Allow public update on teams" ON public.teams;
DROP POLICY IF EXISTS "Allow public delete on teams" ON public.teams;

-- team_rosters
DROP POLICY IF EXISTS "Allow public insert on team_rosters" ON public.team_rosters;
DROP POLICY IF EXISTS "Allow public update on team_rosters" ON public.team_rosters;
DROP POLICY IF EXISTS "Allow public delete on team_rosters" ON public.team_rosters;

-- blocked_users
DROP POLICY IF EXISTS "Allow public insert on blocked_users" ON public.blocked_users;
DROP POLICY IF EXISTS "Allow public update on blocked_users" ON public.blocked_users;
DROP POLICY IF EXISTS "Allow public delete on blocked_users" ON public.blocked_users;

-- guild_queues
DROP POLICY IF EXISTS "Allow public insert on guild_queues" ON public.guild_queues;
DROP POLICY IF EXISTS "Allow public update on guild_queues" ON public.guild_queues;
DROP POLICY IF EXISTS "Allow public delete on guild_queues" ON public.guild_queues;

-- position_preferences
DROP POLICY IF EXISTS "Allow public insert on position_preferences" ON public.position_preferences;
DROP POLICY IF EXISTS "Allow public update on position_preferences" ON public.position_preferences;
DROP POLICY IF EXISTS "Allow public delete on position_preferences" ON public.position_preferences;

-- player_build_profiles
DROP POLICY IF EXISTS "Allow public insert on player_build_profiles" ON public.player_build_profiles;
DROP POLICY IF EXISTS "Allow public update on player_build_profiles" ON public.player_build_profiles;