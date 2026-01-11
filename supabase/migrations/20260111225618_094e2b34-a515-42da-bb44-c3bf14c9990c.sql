-- Event Code Discovery System Tables

-- Table to store normalized event code occurrences per player per match
CREATE TABLE public.event_code_occurrences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ea_match_id TEXT NOT NULL,
  guild_id TEXT NOT NULL,
  discord_user_id TEXT,
  ea_username TEXT NOT NULL,
  position_played TEXT,
  event_code INTEGER NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  -- Known boxscore stats for correlation
  goals INTEGER,
  assists INTEGER,
  shots INTEGER,
  tackles INTEGER,
  saves INTEGER,
  passes_made INTEGER,
  pass_attempts INTEGER,
  rating NUMERIC,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for efficient querying
CREATE INDEX idx_event_code_occurrences_code ON public.event_code_occurrences(event_code);
CREATE INDEX idx_event_code_occurrences_position ON public.event_code_occurrences(position_played);
CREATE INDEX idx_event_code_occurrences_match ON public.event_code_occurrences(ea_match_id);
CREATE INDEX idx_event_code_occurrences_guild ON public.event_code_occurrences(guild_id);
CREATE UNIQUE INDEX idx_event_code_occurrences_unique ON public.event_code_occurrences(ea_match_id, ea_username, event_code);

-- Event code mappings table (the Rosetta Stone)
CREATE TABLE public.event_code_mappings (
  event_code INTEGER PRIMARY KEY,
  label TEXT NOT NULL,
  confidence TEXT NOT NULL CHECK (confidence IN ('high', 'mid', 'low')),
  derive BOOLEAN DEFAULT false,
  category TEXT,
  notes TEXT,
  correlation_stats JSONB,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.event_code_occurrences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_code_mappings ENABLE ROW LEVEL SECURITY;

-- RLS policies - allow read for authenticated users with guild access
CREATE POLICY "Users can view event occurrences for their guilds"
ON public.event_code_occurrences
FOR SELECT
USING (public.user_has_guild_access(guild_id));

CREATE POLICY "Users can view event code mappings"
ON public.event_code_mappings
FOR SELECT
USING (true);

-- Seed high-confidence event code mappings
INSERT INTO public.event_code_mappings (event_code, label, confidence, derive, category, notes) VALUES
  (1, 'passes', 'high', true, 'passing', 'Pass events - validated against pass counts'),
  (3, 'take_ons', 'high', true, 'attacking', 'Dribble/take-on attempts'),
  (6, 'clearances', 'high', true, 'defensive', 'Clearances - confirmed for defenders'),
  (7, 'tackle_events', 'high', true, 'defensive', 'Tackle events (may differ from tacklesmade)'),
  (8, 'interceptions', 'high', true, 'defensive', 'Interceptions - validated'),
  (10, 'saves_standard', 'high', true, 'gk', 'GK saves (standard type, part of total)'),
  (13, 'shots', 'high', true, 'attacking', 'Shot attempts - validated vs boxscore'),
  (16, 'goals', 'high', true, 'attacking', 'Goal events'),
  (44, 'aerial_duels', 'high', true, 'duels', 'Aerial duel events'),
  (49, 'ball_recoveries', 'high', true, 'defensive', 'Ball recovery events'),
  (50, 'saves_diving', 'high', true, 'gk', 'GK diving saves (subtype) - NOT second_assists'),
  (61, 'blocks', 'high', true, 'defensive', 'Block events'),
  (113, 'match_played', 'high', false, 'meta', 'Always 1 - indicates player appeared'),
  (267, 'good_direction_saves', 'high', true, 'gk', 'GK good direction saves - matches goodDirectionSaves field'),
  -- Medium confidence codes
  (100, 'ground_duels_total', 'mid', false, 'duels', 'Ground duels total - needs validation'),
  (101, 'ground_duels_won', 'mid', true, 'duels', 'Ground duels won - needs position correlation'),
  (102, 'ground_duels_lost', 'mid', false, 'duels', 'Ground duels lost'),
  (105, 'aerial_duels_total', 'mid', false, 'duels', 'Aerial duels total'),
  (106, 'aerial_duels_won', 'mid', true, 'duels', 'Aerial duels won - needs position correlation'),
  (107, 'loose_ball_duels', 'mid', false, 'duels', 'Loose ball duels'),
  (108, 'challenges', 'mid', false, 'duels', 'Challenges'),
  (202, 'chances_created', 'mid', true, 'attacking', 'Chances created - needs assist correlation'),
  (211, 'key_passes', 'mid', true, 'attacking', 'Key passes - needs assist correlation'),
  -- Low confidence / unknown codes to track
  (97, 'event_97_unknown', 'low', false, 'unknown', 'Possibly touches'),
  (111, 'event_111_unknown', 'low', false, 'unknown', 'Possibly total actions'),
  (174, 'event_174_unknown', 'low', false, 'unknown', 'Possibly forward/progressive passes'),
  (175, 'event_175_unknown', 'low', false, 'unknown', 'Possibly lateral/backward passes'),
  (215, 'event_215_unknown', 'low', false, 'unknown', 'Possibly pass attempts'),
  (216, 'event_216_unknown', 'low', false, 'unknown', 'Possibly long passes')
ON CONFLICT (event_code) DO NOTHING;