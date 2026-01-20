-- Global League Tables for Cross-Server Competition

-- 1. Registered clubs in the global league
CREATE TABLE public.global_league_clubs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id TEXT NOT NULL,
  club_key TEXT NOT NULL,
  ea_club_id TEXT NOT NULL,
  ea_platform TEXT NOT NULL,
  club_name TEXT NOT NULL,
  elo_rating INTEGER DEFAULT 1200,
  peak_elo INTEGER DEFAULT 1200,
  matches_played INTEGER DEFAULT 0,
  wins INTEGER DEFAULT 0,
  draws INTEGER DEFAULT 0,
  losses INTEGER DEFAULT 0,
  goals_for INTEGER DEFAULT 0,
  goals_against INTEGER DEFAULT 0,
  current_streak INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active',
  registered_by_discord_id TEXT NOT NULL,
  last_match_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(ea_club_id, ea_platform)
);

-- 2. Scheduled and completed matches
CREATE TABLE public.global_league_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  home_club_id UUID REFERENCES public.global_league_clubs(id) ON DELETE CASCADE,
  away_club_id UUID REFERENCES public.global_league_clubs(id) ON DELETE CASCADE,
  scheduled_at TIMESTAMPTZ NOT NULL,
  status TEXT DEFAULT 'scheduled',
  ea_match_id TEXT,
  home_score INTEGER,
  away_score INTEGER,
  winner_club_id UUID REFERENCES public.global_league_clubs(id),
  home_elo_before INTEGER,
  away_elo_before INTEGER,
  home_elo_change INTEGER,
  away_elo_change INTEGER,
  scheduled_by_discord_id TEXT NOT NULL,
  confirmed_by_discord_id TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

-- 3. Match challenges between clubs
CREATE TABLE public.global_league_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  challenger_club_id UUID REFERENCES public.global_league_clubs(id) ON DELETE CASCADE,
  challenged_club_id UUID REFERENCES public.global_league_clubs(id) ON DELETE CASCADE,
  proposed_times JSONB DEFAULT '[]'::jsonb,
  message TEXT,
  status TEXT DEFAULT 'pending',
  accepted_time TIMESTAMPTZ,
  match_id UUID REFERENCES public.global_league_matches(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ DEFAULT (now() + interval '48 hours'),
  responded_at TIMESTAMPTZ
);

-- Enable RLS
ALTER TABLE public.global_league_clubs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.global_league_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.global_league_challenges ENABLE ROW LEVEL SECURITY;

-- RLS Policies for global_league_clubs
CREATE POLICY "Anyone can view global league clubs"
ON public.global_league_clubs FOR SELECT
USING (true);

CREATE POLICY "Service role can manage global league clubs"
ON public.global_league_clubs FOR ALL
USING (true)
WITH CHECK (true);

-- RLS Policies for global_league_matches
CREATE POLICY "Anyone can view global league matches"
ON public.global_league_matches FOR SELECT
USING (true);

CREATE POLICY "Service role can manage global league matches"
ON public.global_league_matches FOR ALL
USING (true)
WITH CHECK (true);

-- RLS Policies for global_league_challenges
CREATE POLICY "Anyone can view global league challenges"
ON public.global_league_challenges FOR SELECT
USING (true);

CREATE POLICY "Service role can manage global league challenges"
ON public.global_league_challenges FOR ALL
USING (true)
WITH CHECK (true);

-- Indexes for performance
CREATE INDEX idx_global_league_clubs_elo ON public.global_league_clubs(elo_rating DESC);
CREATE INDEX idx_global_league_clubs_platform ON public.global_league_clubs(ea_platform);
CREATE INDEX idx_global_league_clubs_status ON public.global_league_clubs(status);
CREATE INDEX idx_global_league_clubs_guild ON public.global_league_clubs(guild_id);
CREATE INDEX idx_global_league_matches_status ON public.global_league_matches(status);
CREATE INDEX idx_global_league_matches_scheduled ON public.global_league_matches(scheduled_at);
CREATE INDEX idx_global_league_challenges_status ON public.global_league_challenges(status);
CREATE INDEX idx_global_league_challenges_expires ON public.global_league_challenges(expires_at);

-- Trigger for updated_at
CREATE TRIGGER update_global_league_clubs_updated_at
BEFORE UPDATE ON public.global_league_clubs
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();