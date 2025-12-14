-- Add position_played column to peer_evaluations to track what position the rated player was at
ALTER TABLE public.peer_evaluations 
ADD COLUMN IF NOT EXISTS position_played TEXT;

-- Add club_match_id column if not exists (for linking evaluations to club matches)
ALTER TABLE public.peer_evaluations 
ADD COLUMN IF NOT EXISTS club_match_id UUID REFERENCES public.club_matches(id) ON DELETE SET NULL;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_peer_evaluations_position ON public.peer_evaluations(position_played);
CREATE INDEX IF NOT EXISTS idx_peer_evaluations_club_match ON public.peer_evaluations(club_match_id);