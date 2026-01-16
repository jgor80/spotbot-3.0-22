-- Insert 14 newly discovered high-confidence event code mappings
INSERT INTO public.event_code_mappings (event_code, label, confidence, derive, category, notes) VALUES
  (11, 'assist_events', 'high', true, 'attacking', 'Discovered: r=0.943 with assists - likely direct assist events'),
  (12, 'goals_open_play', 'high', true, 'attacking', 'Discovered: r=0.42 with goals - goals scored in open play'),
  (14, 'shots_in_box', 'mid', true, 'attacking', 'Discovered: r=0.60 with shots - shots taken from inside the box'),
  (24, 'passes_completed', 'high', true, 'passing', 'Discovered: r=0.525 with passes_made - successful passes'),
  (30, 'passes_attempted', 'high', true, 'passing', 'Discovered: r=0.477 with passes_made - total pass attempts'),
  (99, 'gk_claims', 'mid', true, 'gk', 'Discovered: r=0.29 (GK correlation) - GK catches/claims'),
  (118, 'assist_chances', 'high', true, 'attacking', 'Discovered: r=0.41 with assists - chances created leading to assists'),
  (121, 'tackle_success', 'high', true, 'defensive', 'Discovered: r=0.698 with tackles - successful tackles made'),
  (131, 'goals_inside_box', 'mid', true, 'attacking', 'Discovered: goals scored from inside the box'),
  (158, 'defensive_actions', 'mid', true, 'defensive', 'Discovered: combined defensive actions metric'),
  (177, 'shots_on_target', 'high', true, 'attacking', 'Discovered: r=0.495 with shots - shots on target'),
  (214, 'goals_direct', 'high', true, 'attacking', 'Discovered: r=0.978 with goals - direct goal events'),
  (218, 'shot_attempts', 'mid', true, 'attacking', 'Discovered: total shot attempt events'),
  (229, 'successful_tackles', 'high', true, 'defensive', 'Discovered: r=0.690 with tackles - mirror of 121')
ON CONFLICT (event_code) DO UPDATE SET
  label = EXCLUDED.label,
  confidence = EXCLUDED.confidence,
  category = EXCLUDED.category,
  notes = EXCLUDED.notes,
  updated_at = now();

-- Add new stat columns to player_stats table
ALTER TABLE public.player_stats 
  ADD COLUMN IF NOT EXISTS passes_completed integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS shots_on_target integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tackle_success integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gk_claims integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS goals_inside_box integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS defensive_actions integer DEFAULT 0;

-- Add new stat columns to player_club_stats table
ALTER TABLE public.player_club_stats 
  ADD COLUMN IF NOT EXISTS passes_completed integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS shots_on_target integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tackle_success integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gk_claims integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS goals_inside_box integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS defensive_actions integer DEFAULT 0;

-- Add new stat columns to player_ratings table
ALTER TABLE public.player_ratings 
  ADD COLUMN IF NOT EXISTS passes_completed integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS shots_on_target integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tackle_success integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gk_claims integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS goals_inside_box integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS defensive_actions integer DEFAULT 0;

-- Add indices for commonly queried new stats
CREATE INDEX IF NOT EXISTS idx_player_stats_shots_on_target ON public.player_stats(shots_on_target) WHERE shots_on_target > 0;
CREATE INDEX IF NOT EXISTS idx_player_stats_tackle_success ON public.player_stats(tackle_success) WHERE tackle_success > 0;
CREATE INDEX IF NOT EXISTS idx_player_stats_passes_completed ON public.player_stats(passes_completed) WHERE passes_completed > 0;