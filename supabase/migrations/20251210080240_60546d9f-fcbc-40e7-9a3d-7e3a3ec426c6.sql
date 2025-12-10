
-- =============================================
-- PHASE 1: COMPLETE DATABASE SCHEMA
-- Draft + Rating + Lineup + Availability System
-- =============================================

-- =============================================
-- ENUMS
-- =============================================

CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'captain', 'manager', 'scout', 'player');
CREATE TYPE public.draft_status AS ENUM ('pending', 'picking', 'completed', 'cancelled');
CREATE TYPE public.result_status AS ENUM ('pending', 'confirmed', 'disputed');
CREATE TYPE public.availability_response AS ENUM ('yes', 'no', 'maybe', 'no_response');
CREATE TYPE public.competition_type AS ENUM ('tournament', 'league');
CREATE TYPE public.competition_tier AS ENUM ('major', 'minor', 'community', 'div1', 'div2', 'div3', 'div4');
CREATE TYPE public.verification_status AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE public.feedback_status AS ENUM ('pending', 'completed', 'expired');

-- =============================================
-- PROFILES (Discord Users)
-- =============================================

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  discord_user_id TEXT NOT NULL UNIQUE,
  discord_username TEXT,
  discord_avatar TEXT,
  ea_username TEXT,
  primary_position TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read on profiles" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Allow public insert on profiles" ON public.profiles FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on profiles" ON public.profiles FOR UPDATE USING (true);
CREATE POLICY "Allow public delete on profiles" ON public.profiles FOR DELETE USING (true);

-- =============================================
-- USER ROLES (Permission System)
-- =============================================

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id TEXT NOT NULL,
  discord_user_id TEXT NOT NULL,
  role app_role NOT NULL,
  granted_by TEXT,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (guild_id, discord_user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read on user_roles" ON public.user_roles FOR SELECT USING (true);
CREATE POLICY "Allow public insert on user_roles" ON public.user_roles FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on user_roles" ON public.user_roles FOR UPDATE USING (true);
CREATE POLICY "Allow public delete on user_roles" ON public.user_roles FOR DELETE USING (true);

-- Security definer function for role checks
CREATE OR REPLACE FUNCTION public.has_role(_guild_id TEXT, _discord_user_id TEXT, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE guild_id = _guild_id
      AND discord_user_id = _discord_user_id
      AND role = _role
  )
$$;

-- Check if user has any of multiple roles
CREATE OR REPLACE FUNCTION public.has_any_role(_guild_id TEXT, _discord_user_id TEXT, _roles app_role[])
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE guild_id = _guild_id
      AND discord_user_id = _discord_user_id
      AND role = ANY(_roles)
  )
$$;

-- =============================================
-- DRAFTS
-- =============================================

CREATE TABLE public.drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id TEXT NOT NULL,
  voice_channel_id TEXT,
  status draft_status NOT NULL DEFAULT 'pending',
  captain_a_discord_id TEXT NOT NULL,
  captain_b_discord_id TEXT NOT NULL,
  team_a_player_ids TEXT[] NOT NULL DEFAULT '{}',
  team_b_player_ids TEXT[] NOT NULL DEFAULT '{}',
  available_player_ids TEXT[] NOT NULL DEFAULT '{}',
  current_picker TEXT, -- 'a' or 'b'
  pick_number INTEGER NOT NULL DEFAULT 0,
  team_a_vc_id TEXT,
  team_b_vc_id TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read on drafts" ON public.drafts FOR SELECT USING (true);
CREATE POLICY "Allow public insert on drafts" ON public.drafts FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on drafts" ON public.drafts FOR UPDATE USING (true);
CREATE POLICY "Allow public delete on drafts" ON public.drafts FOR DELETE USING (true);

CREATE INDEX idx_drafts_guild ON public.drafts(guild_id);
CREATE INDEX idx_drafts_status ON public.drafts(status);

-- =============================================
-- DRAFT PICKS (Pick History)
-- =============================================

CREATE TABLE public.draft_picks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id UUID NOT NULL REFERENCES public.drafts(id) ON DELETE CASCADE,
  pick_number INTEGER NOT NULL,
  captain_discord_id TEXT NOT NULL,
  picked_player_discord_id TEXT NOT NULL,
  team TEXT NOT NULL, -- 'a' or 'b'
  picked_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.draft_picks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read on draft_picks" ON public.draft_picks FOR SELECT USING (true);
CREATE POLICY "Allow public insert on draft_picks" ON public.draft_picks FOR INSERT WITH CHECK (true);

CREATE INDEX idx_draft_picks_draft ON public.draft_picks(draft_id);

-- =============================================
-- DRAFT RESULTS (Game Outcomes)
-- =============================================

CREATE TABLE public.draft_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id UUID NOT NULL REFERENCES public.drafts(id) ON DELETE CASCADE,
  team_a_score INTEGER,
  team_b_score INTEGER,
  winning_team TEXT, -- 'a', 'b', or 'draw'
  status result_status NOT NULL DEFAULT 'pending',
  reported_by TEXT[] NOT NULL DEFAULT '{}',
  confirmed_by TEXT[] NOT NULL DEFAULT '{}',
  disputed_by TEXT[] NOT NULL DEFAULT '{}',
  ea_match_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  confirmed_at TIMESTAMPTZ
);

ALTER TABLE public.draft_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read on draft_results" ON public.draft_results FOR SELECT USING (true);
CREATE POLICY "Allow public insert on draft_results" ON public.draft_results FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on draft_results" ON public.draft_results FOR UPDATE USING (true);

CREATE INDEX idx_draft_results_draft ON public.draft_results(draft_id);

-- =============================================
-- PLAYER STATS (Per-Game Stats)
-- =============================================

CREATE TABLE public.player_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id TEXT NOT NULL,
  discord_user_id TEXT NOT NULL,
  draft_id UUID REFERENCES public.drafts(id) ON DELETE SET NULL,
  match_type TEXT NOT NULL DEFAULT 'draft', -- 'draft', 'club', 'tournament', 'league'
  position_played TEXT,
  goals INTEGER NOT NULL DEFAULT 0,
  assists INTEGER NOT NULL DEFAULT 0,
  clean_sheet BOOLEAN DEFAULT false,
  ea_match_rating DECIMAL(3,1),
  man_of_match BOOLEAN DEFAULT false,
  won BOOLEAN,
  team TEXT, -- 'a' or 'b' for drafts
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.player_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read on player_stats" ON public.player_stats FOR SELECT USING (true);
CREATE POLICY "Allow public insert on player_stats" ON public.player_stats FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on player_stats" ON public.player_stats FOR UPDATE USING (true);

CREATE INDEX idx_player_stats_user ON public.player_stats(discord_user_id);
CREATE INDEX idx_player_stats_guild ON public.player_stats(guild_id);
CREATE INDEX idx_player_stats_draft ON public.player_stats(draft_id);

-- =============================================
-- PLAYER RATINGS (Composite Ratings)
-- =============================================

CREATE TABLE public.player_ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id TEXT NOT NULL,
  discord_user_id TEXT NOT NULL,
  overall_rating DECIMAL(4,1) NOT NULL DEFAULT 50.0,
  draft_performance_rating DECIMAL(4,1) DEFAULT 50.0,
  club_performance_rating DECIMAL(4,1) DEFAULT 50.0,
  peer_rating DECIMAL(4,1) DEFAULT 50.0,
  build_quality_rating DECIMAL(4,1) DEFAULT 50.0,
  games_played INTEGER NOT NULL DEFAULT 0,
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  draws INTEGER NOT NULL DEFAULT 0,
  total_goals INTEGER NOT NULL DEFAULT 0,
  total_assists INTEGER NOT NULL DEFAULT 0,
  total_clean_sheets INTEGER NOT NULL DEFAULT 0,
  total_motm INTEGER NOT NULL DEFAULT 0,
  last_game_at TIMESTAMPTZ,
  last_calculated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (guild_id, discord_user_id)
);

ALTER TABLE public.player_ratings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read on player_ratings" ON public.player_ratings FOR SELECT USING (true);
CREATE POLICY "Allow public insert on player_ratings" ON public.player_ratings FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on player_ratings" ON public.player_ratings FOR UPDATE USING (true);

CREATE INDEX idx_player_ratings_guild ON public.player_ratings(guild_id);
CREATE INDEX idx_player_ratings_overall ON public.player_ratings(overall_rating DESC);

-- =============================================
-- PLAYER POSITION RATINGS (Position Breakdown)
-- =============================================

CREATE TABLE public.player_position_ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id TEXT NOT NULL,
  discord_user_id TEXT NOT NULL,
  position TEXT NOT NULL,
  rating DECIMAL(4,1) NOT NULL DEFAULT 50.0,
  games_at_position INTEGER NOT NULL DEFAULT 0,
  goals_at_position INTEGER NOT NULL DEFAULT 0,
  assists_at_position INTEGER NOT NULL DEFAULT 0,
  avg_match_rating DECIMAL(3,1),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (guild_id, discord_user_id, position)
);

ALTER TABLE public.player_position_ratings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read on player_position_ratings" ON public.player_position_ratings FOR SELECT USING (true);
CREATE POLICY "Allow public insert on player_position_ratings" ON public.player_position_ratings FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on player_position_ratings" ON public.player_position_ratings FOR UPDATE USING (true);

-- =============================================
-- PLAYER BUILD PROFILES (Pro Builds)
-- =============================================

CREATE TABLE public.player_build_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id TEXT NOT NULL,
  discord_user_id TEXT NOT NULL,
  position TEXT NOT NULL,
  height_cm INTEGER,
  weight_kg INTEGER,
  playstyles TEXT[],
  playstyles_plus TEXT[],
  screenshot_url TEXT,
  build_rating DECIMAL(4,1),
  verified BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (guild_id, discord_user_id, position)
);

ALTER TABLE public.player_build_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read on player_build_profiles" ON public.player_build_profiles FOR SELECT USING (true);
CREATE POLICY "Allow public insert on player_build_profiles" ON public.player_build_profiles FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on player_build_profiles" ON public.player_build_profiles FOR UPDATE USING (true);

-- =============================================
-- PEER EVALUATIONS
-- =============================================

CREATE TABLE public.peer_evaluations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id TEXT NOT NULL,
  evaluator_discord_id TEXT NOT NULL,
  evaluated_discord_id TEXT NOT NULL,
  draft_id UUID REFERENCES public.drafts(id) ON DELETE SET NULL,
  technical_skill INTEGER CHECK (technical_skill BETWEEN 1 AND 5),
  game_iq INTEGER CHECK (game_iq BETWEEN 1 AND 5),
  work_ethic INTEGER CHECK (work_ethic BETWEEN 1 AND 5),
  communication INTEGER CHECK (communication BETWEEN 1 AND 5),
  consistency INTEGER CHECK (consistency BETWEEN 1 AND 5),
  clutch_factor INTEGER CHECK (clutch_factor BETWEEN 1 AND 5),
  overall_score DECIMAL(3,1),
  trust_weighted_score DECIMAL(3,1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.peer_evaluations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read on peer_evaluations" ON public.peer_evaluations FOR SELECT USING (true);
CREATE POLICY "Allow public insert on peer_evaluations" ON public.peer_evaluations FOR INSERT WITH CHECK (true);

CREATE INDEX idx_peer_evaluations_evaluated ON public.peer_evaluations(evaluated_discord_id);
CREATE INDEX idx_peer_evaluations_guild ON public.peer_evaluations(guild_id);

-- =============================================
-- EVALUATOR TRUST SCORES
-- =============================================

CREATE TABLE public.evaluator_trust_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id TEXT NOT NULL,
  discord_user_id TEXT NOT NULL,
  trust_score DECIMAL(3,2) NOT NULL DEFAULT 1.0, -- 0.5 to 2.0
  evaluations_given INTEGER NOT NULL DEFAULT 0,
  accuracy_score DECIMAL(3,2), -- How accurate their evaluations are
  tenure_months INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (guild_id, discord_user_id)
);

ALTER TABLE public.evaluator_trust_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read on evaluator_trust_scores" ON public.evaluator_trust_scores FOR SELECT USING (true);
CREATE POLICY "Allow public insert on evaluator_trust_scores" ON public.evaluator_trust_scores FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on evaluator_trust_scores" ON public.evaluator_trust_scores FOR UPDATE USING (true);

-- =============================================
-- PLAYER ACHIEVEMENTS (Badges)
-- =============================================

CREATE TABLE public.player_achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id TEXT NOT NULL,
  discord_user_id TEXT NOT NULL,
  achievement_key TEXT NOT NULL, -- e.g., 'draft_champion', 'sniper', 'the_wall'
  achievement_name TEXT NOT NULL,
  achievement_icon TEXT NOT NULL,
  earned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  context JSONB, -- Extra data like "5 goals in match vs Team X"
  UNIQUE (guild_id, discord_user_id, achievement_key)
);

ALTER TABLE public.player_achievements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read on player_achievements" ON public.player_achievements FOR SELECT USING (true);
CREATE POLICY "Allow public insert on player_achievements" ON public.player_achievements FOR INSERT WITH CHECK (true);

CREATE INDEX idx_player_achievements_user ON public.player_achievements(discord_user_id);

-- =============================================
-- PLAYER STREAKS
-- =============================================

CREATE TABLE public.player_streaks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id TEXT NOT NULL,
  discord_user_id TEXT NOT NULL,
  current_win_streak INTEGER NOT NULL DEFAULT 0,
  current_loss_streak INTEGER NOT NULL DEFAULT 0,
  current_goal_streak INTEGER NOT NULL DEFAULT 0,
  current_clean_sheet_streak INTEGER NOT NULL DEFAULT 0,
  longest_win_streak INTEGER NOT NULL DEFAULT 0,
  longest_loss_streak INTEGER NOT NULL DEFAULT 0,
  longest_goal_streak INTEGER NOT NULL DEFAULT 0,
  longest_clean_sheet_streak INTEGER NOT NULL DEFAULT 0,
  last_5_results TEXT[] NOT NULL DEFAULT '{}', -- ['W', 'W', 'L', 'W', 'D']
  last_10_results TEXT[] NOT NULL DEFAULT '{}',
  form_rating DECIMAL(3,1), -- Based on recent performance
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (guild_id, discord_user_id)
);

ALTER TABLE public.player_streaks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read on player_streaks" ON public.player_streaks FOR SELECT USING (true);
CREATE POLICY "Allow public insert on player_streaks" ON public.player_streaks FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on player_streaks" ON public.player_streaks FOR UPDATE USING (true);

-- =============================================
-- MONTHLY SNAPSHOTS (Leaderboard History)
-- =============================================

CREATE TABLE public.monthly_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id TEXT NOT NULL,
  discord_user_id TEXT NOT NULL,
  month_year TEXT NOT NULL, -- '2025-01'
  overall_rating DECIMAL(4,1) NOT NULL,
  rank_position INTEGER,
  games_played INTEGER NOT NULL DEFAULT 0,
  wins INTEGER NOT NULL DEFAULT 0,
  goals INTEGER NOT NULL DEFAULT 0,
  assists INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (guild_id, discord_user_id, month_year)
);

ALTER TABLE public.monthly_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read on monthly_snapshots" ON public.monthly_snapshots FOR SELECT USING (true);
CREATE POLICY "Allow public insert on monthly_snapshots" ON public.monthly_snapshots FOR INSERT WITH CHECK (true);

-- =============================================
-- TEAMS (Comp/Tournament Teams)
-- =============================================

CREATE TABLE public.teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id TEXT NOT NULL,
  name TEXT NOT NULL,
  tag TEXT, -- Short team tag like [ABC]
  logo_url TEXT,
  captain_discord_id TEXT,
  manager_discord_ids TEXT[] NOT NULL DEFAULT '{}',
  team_type TEXT NOT NULL DEFAULT 'comp', -- 'comp', 'tournament', 'casual'
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read on teams" ON public.teams FOR SELECT USING (true);
CREATE POLICY "Allow public insert on teams" ON public.teams FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on teams" ON public.teams FOR UPDATE USING (true);
CREATE POLICY "Allow public delete on teams" ON public.teams FOR DELETE USING (true);

CREATE INDEX idx_teams_guild ON public.teams(guild_id);

-- =============================================
-- TEAM ROSTERS (Permanent Roster)
-- =============================================

CREATE TABLE public.team_rosters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  discord_user_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'player', -- 'captain', 'manager', 'player', 'sub'
  primary_position TEXT,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (team_id, discord_user_id)
);

ALTER TABLE public.team_rosters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read on team_rosters" ON public.team_rosters FOR SELECT USING (true);
CREATE POLICY "Allow public insert on team_rosters" ON public.team_rosters FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on team_rosters" ON public.team_rosters FOR UPDATE USING (true);
CREATE POLICY "Allow public delete on team_rosters" ON public.team_rosters FOR DELETE USING (true);

-- =============================================
-- AVAILABILITY EVENTS
-- =============================================

CREATE TABLE public.availability_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id TEXT NOT NULL,
  team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  event_type TEXT NOT NULL DEFAULT 'match', -- 'match', 'practice', 'tournament', 'draft'
  scheduled_at TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER DEFAULT 90,
  created_by_discord_id TEXT NOT NULL,
  channel_id TEXT,
  message_id TEXT,
  reminder_24h_sent BOOLEAN NOT NULL DEFAULT false,
  reminder_2h_sent BOOLEAN NOT NULL DEFAULT false,
  closed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.availability_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read on availability_events" ON public.availability_events FOR SELECT USING (true);
CREATE POLICY "Allow public insert on availability_events" ON public.availability_events FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on availability_events" ON public.availability_events FOR UPDATE USING (true);
CREATE POLICY "Allow public delete on availability_events" ON public.availability_events FOR DELETE USING (true);

CREATE INDEX idx_availability_events_guild ON public.availability_events(guild_id);
CREATE INDEX idx_availability_events_scheduled ON public.availability_events(scheduled_at);

-- =============================================
-- PLAYER AVAILABILITY (Responses)
-- =============================================

CREATE TABLE public.player_availability (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.availability_events(id) ON DELETE CASCADE,
  discord_user_id TEXT NOT NULL,
  response availability_response NOT NULL DEFAULT 'no_response',
  responded_at TIMESTAMPTZ,
  auto_marked BOOLEAN NOT NULL DEFAULT false, -- true if auto-marked as no after reminder
  UNIQUE (event_id, discord_user_id)
);

ALTER TABLE public.player_availability ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read on player_availability" ON public.player_availability FOR SELECT USING (true);
CREATE POLICY "Allow public insert on player_availability" ON public.player_availability FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on player_availability" ON public.player_availability FOR UPDATE USING (true);

-- =============================================
-- LINEUPS
-- =============================================

CREATE TABLE public.lineups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id TEXT NOT NULL,
  event_id UUID REFERENCES public.availability_events(id) ON DELETE SET NULL,
  team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL,
  name TEXT,
  formation TEXT NOT NULL DEFAULT '4-3-3',
  created_by_discord_id TEXT NOT NULL,
  channel_id TEXT,
  message_id TEXT,
  image_url TEXT,
  share_code TEXT UNIQUE,
  team_avg_rating DECIMAL(4,1),
  win_probability DECIMAL(4,1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.lineups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read on lineups" ON public.lineups FOR SELECT USING (true);
CREATE POLICY "Allow public insert on lineups" ON public.lineups FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on lineups" ON public.lineups FOR UPDATE USING (true);
CREATE POLICY "Allow public delete on lineups" ON public.lineups FOR DELETE USING (true);

CREATE INDEX idx_lineups_guild ON public.lineups(guild_id);
CREATE INDEX idx_lineups_share ON public.lineups(share_code);

-- =============================================
-- LINEUP SLOTS (Player Assignments)
-- =============================================

CREATE TABLE public.lineup_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lineup_id UUID NOT NULL REFERENCES public.lineups(id) ON DELETE CASCADE,
  discord_user_id TEXT NOT NULL,
  position TEXT NOT NULL,
  slot_index INTEGER NOT NULL, -- Order in formation
  is_substitute BOOLEAN NOT NULL DEFAULT false,
  UNIQUE (lineup_id, slot_index)
);

ALTER TABLE public.lineup_slots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read on lineup_slots" ON public.lineup_slots FOR SELECT USING (true);
CREATE POLICY "Allow public insert on lineup_slots" ON public.lineup_slots FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on lineup_slots" ON public.lineup_slots FOR UPDATE USING (true);
CREATE POLICY "Allow public delete on lineup_slots" ON public.lineup_slots FOR DELETE USING (true);

-- =============================================
-- ATTENDANCE RECORDS
-- =============================================

CREATE TABLE public.attendance_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id TEXT NOT NULL,
  event_id UUID REFERENCES public.availability_events(id) ON DELETE SET NULL,
  discord_user_id TEXT NOT NULL,
  said_available BOOLEAN NOT NULL,
  actually_showed BOOLEAN,
  recorded_by_discord_id TEXT,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read on attendance_records" ON public.attendance_records FOR SELECT USING (true);
CREATE POLICY "Allow public insert on attendance_records" ON public.attendance_records FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on attendance_records" ON public.attendance_records FOR UPDATE USING (true);

CREATE INDEX idx_attendance_records_user ON public.attendance_records(discord_user_id);

-- =============================================
-- PLAYER RELIABILITY (Attendance Stats)
-- =============================================

CREATE TABLE public.player_reliability (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id TEXT NOT NULL,
  discord_user_id TEXT NOT NULL,
  total_events INTEGER NOT NULL DEFAULT 0,
  events_available INTEGER NOT NULL DEFAULT 0,
  events_showed INTEGER NOT NULL DEFAULT 0,
  events_no_showed INTEGER NOT NULL DEFAULT 0,
  reliability_score DECIMAL(4,1) NOT NULL DEFAULT 100.0, -- 0-100
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (guild_id, discord_user_id)
);

ALTER TABLE public.player_reliability ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read on player_reliability" ON public.player_reliability FOR SELECT USING (true);
CREATE POLICY "Allow public insert on player_reliability" ON public.player_reliability FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on player_reliability" ON public.player_reliability FOR UPDATE USING (true);

-- =============================================
-- COMPETITION WINS (Tournament/League Wins)
-- =============================================

CREATE TABLE public.competition_wins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id TEXT NOT NULL,
  discord_user_id TEXT NOT NULL,
  competition_type competition_type NOT NULL,
  tier competition_tier NOT NULL,
  competition_name TEXT NOT NULL,
  team_name TEXT,
  placed_at DATE,
  verified BOOLEAN NOT NULL DEFAULT false,
  verified_by_discord_id TEXT,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.competition_wins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read on competition_wins" ON public.competition_wins FOR SELECT USING (true);
CREATE POLICY "Allow public insert on competition_wins" ON public.competition_wins FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on competition_wins" ON public.competition_wins FOR UPDATE USING (true);

CREATE INDEX idx_competition_wins_user ON public.competition_wins(discord_user_id);
CREATE INDEX idx_competition_wins_verified ON public.competition_wins(verified);

-- =============================================
-- PENDING WIN CLAIMS (Verification Queue)
-- =============================================

CREATE TABLE public.pending_win_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id TEXT NOT NULL,
  claimed_by_discord_id TEXT NOT NULL,
  competition_type competition_type NOT NULL,
  tier competition_tier NOT NULL,
  competition_name TEXT NOT NULL,
  team_name TEXT,
  placed_at DATE,
  proof_url TEXT,
  status verification_status NOT NULL DEFAULT 'pending',
  reviewed_by_discord_id TEXT,
  reviewed_at TIMESTAMPTZ,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.pending_win_claims ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read on pending_win_claims" ON public.pending_win_claims FOR SELECT USING (true);
CREATE POLICY "Allow public insert on pending_win_claims" ON public.pending_win_claims FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on pending_win_claims" ON public.pending_win_claims FOR UPDATE USING (true);

-- =============================================
-- PLAYER CHEMISTRY (Pair Performance)
-- =============================================

CREATE TABLE public.player_chemistry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id TEXT NOT NULL,
  player_a_discord_id TEXT NOT NULL,
  player_b_discord_id TEXT NOT NULL,
  games_together INTEGER NOT NULL DEFAULT 0,
  wins_together INTEGER NOT NULL DEFAULT 0,
  losses_together INTEGER NOT NULL DEFAULT 0,
  draws_together INTEGER NOT NULL DEFAULT 0,
  win_rate DECIMAL(4,1) NOT NULL DEFAULT 0.0,
  synergy_score DECIMAL(4,1), -- Calculated based on combined performance
  last_played_together TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (guild_id, player_a_discord_id, player_b_discord_id)
);

ALTER TABLE public.player_chemistry ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read on player_chemistry" ON public.player_chemistry FOR SELECT USING (true);
CREATE POLICY "Allow public insert on player_chemistry" ON public.player_chemistry FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on player_chemistry" ON public.player_chemistry FOR UPDATE USING (true);

CREATE INDEX idx_player_chemistry_a ON public.player_chemistry(player_a_discord_id);
CREATE INDEX idx_player_chemistry_b ON public.player_chemistry(player_b_discord_id);

-- =============================================
-- DM FEEDBACK REQUESTS
-- =============================================

CREATE TABLE public.dm_feedback_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id TEXT NOT NULL,
  draft_id UUID REFERENCES public.drafts(id) ON DELETE CASCADE,
  evaluator_discord_id TEXT NOT NULL,
  teammates_to_evaluate TEXT[] NOT NULL DEFAULT '{}',
  status feedback_status NOT NULL DEFAULT 'pending',
  dm_sent_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.dm_feedback_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read on dm_feedback_requests" ON public.dm_feedback_requests FOR SELECT USING (true);
CREATE POLICY "Allow public insert on dm_feedback_requests" ON public.dm_feedback_requests FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on dm_feedback_requests" ON public.dm_feedback_requests FOR UPDATE USING (true);

-- =============================================
-- PLAYER SUMMARY (Denormalized for Fast Lookups)
-- =============================================

CREATE TABLE public.player_summary (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id TEXT NOT NULL,
  discord_user_id TEXT NOT NULL,
  discord_username TEXT,
  -- Ratings
  overall_rating DECIMAL(4,1) NOT NULL DEFAULT 50.0,
  form_rating DECIMAL(3,1),
  reliability_score DECIMAL(4,1) DEFAULT 100.0,
  -- Stats
  games_played INTEGER NOT NULL DEFAULT 0,
  wins INTEGER NOT NULL DEFAULT 0,
  win_rate DECIMAL(4,1) NOT NULL DEFAULT 0.0,
  goals INTEGER NOT NULL DEFAULT 0,
  assists INTEGER NOT NULL DEFAULT 0,
  -- Streaks
  current_streak INTEGER NOT NULL DEFAULT 0, -- Positive = win streak, negative = loss
  streak_type TEXT, -- 'hot', 'cold', 'neutral'
  longest_win_streak INTEGER NOT NULL DEFAULT 0,
  -- Achievements
  achievement_count INTEGER NOT NULL DEFAULT 0,
  top_achievements TEXT[] NOT NULL DEFAULT '{}', -- Top 3 achievement icons
  -- Competition wins
  tournament_wins INTEGER NOT NULL DEFAULT 0,
  league_wins INTEGER NOT NULL DEFAULT 0,
  major_wins INTEGER NOT NULL DEFAULT 0,
  -- Primary position
  primary_position TEXT,
  -- Timestamps
  last_active_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (guild_id, discord_user_id)
);

ALTER TABLE public.player_summary ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read on player_summary" ON public.player_summary FOR SELECT USING (true);
CREATE POLICY "Allow public insert on player_summary" ON public.player_summary FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on player_summary" ON public.player_summary FOR UPDATE USING (true);

CREATE INDEX idx_player_summary_guild ON public.player_summary(guild_id);
CREATE INDEX idx_player_summary_rating ON public.player_summary(overall_rating DESC);

-- =============================================
-- TRIGGERS FOR updated_at
-- =============================================

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_drafts_updated_at BEFORE UPDATE ON public.drafts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_player_ratings_updated_at BEFORE UPDATE ON public.player_ratings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_player_streaks_updated_at BEFORE UPDATE ON public.player_streaks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_teams_updated_at BEFORE UPDATE ON public.teams
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_availability_events_updated_at BEFORE UPDATE ON public.availability_events
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_lineups_updated_at BEFORE UPDATE ON public.lineups
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_player_summary_updated_at BEFORE UPDATE ON public.player_summary
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_player_build_profiles_updated_at BEFORE UPDATE ON public.player_build_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_player_reliability_updated_at BEFORE UPDATE ON public.player_reliability
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_evaluator_trust_scores_updated_at BEFORE UPDATE ON public.evaluator_trust_scores
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_player_chemistry_updated_at BEFORE UPDATE ON public.player_chemistry
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_player_position_ratings_updated_at BEFORE UPDATE ON public.player_position_ratings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
