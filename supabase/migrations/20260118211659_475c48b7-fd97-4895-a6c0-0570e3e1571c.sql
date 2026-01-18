-- Insert 27 validated event code mappings
INSERT INTO event_code_mappings (event_code, label, category, confidence, notes) VALUES
(25, 'key_touches', 'attacking', 'mid', 'avg 2.54/match, pass_corr: 0.136'),
(26, 'backward_passes', 'passing', 'high', 'avg 5.29/match, pass_corr: 0.533'),
(27, 'short_passes', 'passing', 'mid', 'avg 1.50/match, pass_corr: 0.189'),
(28, 'gk_saves_parry', 'gk', 'high', 'save_corr: 0.228, GK-heavy distribution'),
(31, 'receiving_under_pressure', 'possession', 'mid', 'avg 2.87/match'),
(32, 'dribble_success', 'attacking', 'high', 'goal_corr: 0.332, rating_corr: 0.321'),
(33, 'key_pass_attempts', 'passing', 'mid', 'avg 1.17/match'),
(34, 'progressive_carries', 'attacking', 'high', 'pass_corr: 0.558, rating_corr: 0.097'),
(35, 'through_balls', 'passing', 'high', 'avg 1.85/match, playmaker-heavy'),
(36, 'key_dribbles', 'attacking', 'mid', 'goal_corr: 0.324, rating_corr: 0.332'),
(37, 'pass_into_box', 'attacking', 'mid', 'avg 1.62/match'),
(109, 'successful_challenges', 'defensive', 'high', 'rating_corr: 0.426, tackle_corr: 0.357'),
(112, 'touches_in_box', 'attacking', 'high', 'goal_corr: 0.299, rating_corr: 0.313'),
(114, 'attacking_third_entries', 'attacking', 'high', 'rating_corr: 0.351, assist_corr: 0.248'),
(119, 'final_third_passes', 'passing', 'mid', 'goal_corr: 0.330, rating_corr: 0.279'),
(143, 'ball_pressure', 'defensive', 'high', 'pass_corr: 0.546, high volume'),
(145, 'pressing_actions', 'defensive', 'high', 'goal_corr: 0.301, rating_corr: 0.247'),
(151, 'defensive_touch', 'defensive', 'mid', 'goal_corr: 0.178'),
(152, 'offensive_duels', 'duels', 'high', 'assist_corr: 0.333, rating_corr: 0.303'),
(157, 'defensive_duels', 'duels', 'mid', 'rating_corr: 0.200'),
(178, 'big_chances', 'attacking', 'high', 'goal_corr: 0.320, rating_corr: 0.278'),
(182, 'possession_touches', 'possession', 'high', 'pass_corr: 0.588, high volume'),
(183, 'chances_created', 'attacking', 'high', 'goal_corr: 0.273, rating_corr: 0.246'),
(212, 'shot_events', 'attacking', 'mid', 'goal_corr: 0.283'),
(219, 'ball_receipts', 'possession', 'high', 'avg 7.14/match, universal'),
(265, 'forward_runs', 'attacking', 'high', 'goal_corr: 0.234, forward-only'),
(266, 'defensive_positioning', 'defensive', 'high', 'tackle_corr: 0.234, defender-only')
ON CONFLICT (event_code) DO UPDATE SET
  label = EXCLUDED.label,
  category = EXCLUDED.category,
  confidence = EXCLUDED.confidence,
  notes = EXCLUDED.notes,
  updated_at = now();

-- Add new columns to player_stats
ALTER TABLE player_stats 
ADD COLUMN IF NOT EXISTS through_balls integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS progressive_carries integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS touches_in_box integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS pressing_actions integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS dribble_success integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS big_chances integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS forward_runs integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS offensive_duels integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS defensive_duels integer DEFAULT 0;

-- Add new columns to player_club_stats
ALTER TABLE player_club_stats
ADD COLUMN IF NOT EXISTS through_balls integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS progressive_carries integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS touches_in_box integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS pressing_actions integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS dribble_success integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS big_chances integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS forward_runs integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS offensive_duels integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS defensive_duels integer DEFAULT 0;

-- Add new columns to player_ratings
ALTER TABLE player_ratings
ADD COLUMN IF NOT EXISTS through_balls integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS progressive_carries integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS touches_in_box integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS pressing_actions integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS dribble_success integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS big_chances integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS forward_runs integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS offensive_duels integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS defensive_duels integer DEFAULT 0;