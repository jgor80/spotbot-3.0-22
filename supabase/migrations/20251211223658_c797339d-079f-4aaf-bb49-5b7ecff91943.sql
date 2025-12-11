-- Add EA persona ID and platform to profiles for linking EA accounts to Discord
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS ea_persona_id text,
ADD COLUMN IF NOT EXISTS ea_platform text;

-- Create index for faster EA username lookups
CREATE INDEX IF NOT EXISTS idx_profiles_ea_username ON public.profiles(ea_username);
CREATE INDEX IF NOT EXISTS idx_profiles_ea_persona_id ON public.profiles(ea_persona_id);

-- Add match reference for club feedback tracking
ALTER TABLE public.dm_feedback_requests
ADD COLUMN IF NOT EXISTS club_match_id uuid REFERENCES public.club_matches(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS match_type text DEFAULT 'draft';

-- Create index for pending feedback lookups
CREATE INDEX IF NOT EXISTS idx_dm_feedback_status ON public.dm_feedback_requests(status) WHERE status = 'pending';