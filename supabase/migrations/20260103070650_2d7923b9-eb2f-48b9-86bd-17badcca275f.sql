-- Create manager_evaluations table for detailed performance ratings
CREATE TABLE public.manager_evaluations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  guild_id TEXT NOT NULL,
  evaluator_discord_id TEXT NOT NULL,
  evaluated_discord_id TEXT NOT NULL,
  position_played TEXT NOT NULL,
  evaluator_role TEXT NOT NULL CHECK (evaluator_role IN ('captain', 'manager', 'owner')),
  draft_id UUID REFERENCES public.drafts(id),
  club_match_id UUID REFERENCES public.club_matches(id),
  
  -- Offensive ratings (1-5 scale)
  shooting INTEGER CHECK (shooting >= 1 AND shooting <= 5),
  passing INTEGER CHECK (passing >= 1 AND passing <= 5),
  dribbling INTEGER CHECK (dribbling >= 1 AND dribbling <= 5),
  pace INTEGER CHECK (pace >= 1 AND pace <= 5),
  creativity INTEGER CHECK (creativity >= 1 AND creativity <= 5),
  off_ball_movement INTEGER CHECK (off_ball_movement >= 1 AND off_ball_movement <= 5),
  
  -- Defensive ratings (1-5 scale)
  tackling INTEGER CHECK (tackling >= 1 AND tackling <= 5),
  defensive_positioning INTEGER CHECK (defensive_positioning >= 1 AND defensive_positioning <= 5),
  marking INTEGER CHECK (marking >= 1 AND marking <= 5),
  aerial_ability INTEGER CHECK (aerial_ability >= 1 AND aerial_ability <= 5),
  strength INTEGER CHECK (strength >= 1 AND strength <= 5),
  defensive_awareness INTEGER CHECK (defensive_awareness >= 1 AND defensive_awareness <= 5),
  
  -- Goalkeeper ratings (1-5 scale)
  shot_stopping INTEGER CHECK (shot_stopping >= 1 AND shot_stopping <= 5),
  gk_positioning INTEGER CHECK (gk_positioning >= 1 AND gk_positioning <= 5),
  handling INTEGER CHECK (handling >= 1 AND handling <= 5),
  distribution INTEGER CHECK (distribution >= 1 AND distribution <= 5),
  command_of_area INTEGER CHECK (command_of_area >= 1 AND command_of_area <= 5),
  one_on_ones INTEGER CHECK (one_on_ones >= 1 AND one_on_ones <= 5),
  
  -- Overall assessment
  overall_performance INTEGER NOT NULL CHECK (overall_performance >= 1 AND overall_performance <= 5),
  notes TEXT,
  weighted_score NUMERIC,
  trust_weight NUMERIC DEFAULT 1.0,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add indexes for performance
CREATE INDEX idx_manager_evaluations_guild ON public.manager_evaluations(guild_id);
CREATE INDEX idx_manager_evaluations_evaluated ON public.manager_evaluations(evaluated_discord_id);
CREATE INDEX idx_manager_evaluations_evaluator ON public.manager_evaluations(evaluator_discord_id);
CREATE INDEX idx_manager_evaluations_created ON public.manager_evaluations(created_at DESC);

-- Enable RLS
ALTER TABLE public.manager_evaluations ENABLE ROW LEVEL SECURITY;

-- RLS policies - allow read for all (public leaderboard data)
CREATE POLICY "Manager evaluations are viewable by everyone"
ON public.manager_evaluations
FOR SELECT
USING (true);

-- Add manager_rating column to player_ratings
ALTER TABLE public.player_ratings 
ADD COLUMN IF NOT EXISTS manager_rating NUMERIC DEFAULT 50.0;

-- Add manager_rating column to player_summary
ALTER TABLE public.player_summary 
ADD COLUMN IF NOT EXISTS manager_rating NUMERIC DEFAULT 50.0;