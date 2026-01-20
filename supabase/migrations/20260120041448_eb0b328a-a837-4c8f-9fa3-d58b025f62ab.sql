-- Tournament system for BYOT (Bring Your Own Team) competitions
-- Supports flexible team counts (8-64), group stages, and knockout rounds

-- Main tournaments table
CREATE TABLE public.tournaments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  guild_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  format TEXT NOT NULL DEFAULT 'group_knockout', -- 'group_knockout', 'single_elimination', 'double_elimination'
  status TEXT NOT NULL DEFAULT 'draft', -- 'draft', 'registration', 'group_stage', 'knockout', 'completed', 'cancelled'
  
  -- Team configuration
  max_teams INTEGER NOT NULL DEFAULT 32,
  min_teams INTEGER NOT NULL DEFAULT 8,
  teams_per_group INTEGER NOT NULL DEFAULT 4,
  group_matches_per_team INTEGER NOT NULL DEFAULT 3,
  
  -- Scheduling
  time_slot TEXT, -- 'daytime', 'early_bird', 'prime_time', 'after_hours'
  registration_opens_at TIMESTAMPTZ,
  registration_closes_at TIMESTAMPTZ,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  
  -- Organizer
  created_by_discord_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Settings
  platform TEXT, -- 'ps', 'xbox', 'pc' - null means cross-platform
  elo_range_min INTEGER,
  elo_range_max INTEGER,
  rules TEXT,
  prize_description TEXT
);

-- Tournament teams (registered/invited clubs)
CREATE TABLE public.tournament_teams (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tournament_id UUID NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  club_id UUID NOT NULL REFERENCES public.global_league_clubs(id) ON DELETE CASCADE,
  
  -- Registration
  status TEXT NOT NULL DEFAULT 'invited', -- 'invited', 'accepted', 'declined', 'withdrawn', 'eliminated'
  invited_by_discord_id TEXT,
  invited_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  responded_at TIMESTAMPTZ,
  
  -- Group assignment
  group_name TEXT, -- 'A', 'B', 'C', etc.
  seed INTEGER,
  
  -- Final placement
  final_position INTEGER,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  UNIQUE(tournament_id, club_id)
);

-- Tournament matches
CREATE TABLE public.tournament_matches (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tournament_id UUID NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  
  -- Stage info
  stage TEXT NOT NULL DEFAULT 'group', -- 'group', 'round_of_64', 'round_of_32', 'round_of_16', 'quarter_final', 'semi_final', 'third_place', 'final'
  group_name TEXT, -- For group stage matches
  round_number INTEGER, -- For knockout matches (1 = first knockout round)
  match_number INTEGER, -- Order within stage/round
  
  -- Teams
  home_team_id UUID REFERENCES public.tournament_teams(id) ON DELETE SET NULL,
  away_team_id UUID REFERENCES public.tournament_teams(id) ON DELETE SET NULL,
  
  -- Scheduling
  scheduled_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  
  -- Result
  home_score INTEGER,
  away_score INTEGER,
  winner_team_id UUID REFERENCES public.tournament_teams(id) ON DELETE SET NULL,
  
  -- Result source
  result_source TEXT DEFAULT 'pending', -- 'pending', 'auto_detected', 'manual', 'disputed'
  ea_match_id TEXT,
  reported_by_discord_id TEXT,
  confirmed_by_discord_id TEXT,
  
  -- Bracket progression (for knockout)
  next_match_id UUID REFERENCES public.tournament_matches(id) ON DELETE SET NULL,
  next_match_position TEXT, -- 'home' or 'away' - where winner goes in next match
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Group stage standings (calculated)
CREATE TABLE public.tournament_standings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tournament_id UUID NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES public.tournament_teams(id) ON DELETE CASCADE,
  group_name TEXT NOT NULL,
  
  -- Stats
  played INTEGER NOT NULL DEFAULT 0,
  wins INTEGER NOT NULL DEFAULT 0,
  draws INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  goals_for INTEGER NOT NULL DEFAULT 0,
  goals_against INTEGER NOT NULL DEFAULT 0,
  goal_difference INTEGER NOT NULL DEFAULT 0,
  points INTEGER NOT NULL DEFAULT 0,
  
  -- Position
  position INTEGER,
  qualified BOOLEAN DEFAULT false, -- Advanced to knockout
  
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  UNIQUE(tournament_id, team_id)
);

-- Indexes for performance
CREATE INDEX idx_tournaments_guild_id ON public.tournaments(guild_id);
CREATE INDEX idx_tournaments_status ON public.tournaments(status);
CREATE INDEX idx_tournament_teams_tournament_id ON public.tournament_teams(tournament_id);
CREATE INDEX idx_tournament_teams_club_id ON public.tournament_teams(club_id);
CREATE INDEX idx_tournament_matches_tournament_id ON public.tournament_matches(tournament_id);
CREATE INDEX idx_tournament_matches_stage ON public.tournament_matches(stage);
CREATE INDEX idx_tournament_standings_tournament_id ON public.tournament_standings(tournament_id);

-- Enable RLS
ALTER TABLE public.tournaments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_standings ENABLE ROW LEVEL SECURITY;

-- RLS Policies - tournaments are publicly readable
CREATE POLICY "Tournaments are viewable by everyone" ON public.tournaments FOR SELECT USING (true);
CREATE POLICY "Tournament teams are viewable by everyone" ON public.tournament_teams FOR SELECT USING (true);
CREATE POLICY "Tournament matches are viewable by everyone" ON public.tournament_matches FOR SELECT USING (true);
CREATE POLICY "Tournament standings are viewable by everyone" ON public.tournament_standings FOR SELECT USING (true);

-- Write operations go through edge functions with service role
CREATE POLICY "Service role can manage tournaments" ON public.tournaments FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role can manage tournament teams" ON public.tournament_teams FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role can manage tournament matches" ON public.tournament_matches FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role can manage tournament standings" ON public.tournament_standings FOR ALL USING (true) WITH CHECK (true);

-- Trigger for updated_at
CREATE TRIGGER update_tournaments_updated_at BEFORE UPDATE ON public.tournaments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_tournament_teams_updated_at BEFORE UPDATE ON public.tournament_teams FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_tournament_matches_updated_at BEFORE UPDATE ON public.tournament_matches FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_tournament_standings_updated_at BEFORE UPDATE ON public.tournament_standings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();