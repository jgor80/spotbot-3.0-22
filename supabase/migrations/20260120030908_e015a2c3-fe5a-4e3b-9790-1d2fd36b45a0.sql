-- Add LFG (Looking for Game) columns to global_league_clubs table
ALTER TABLE public.global_league_clubs 
ADD COLUMN IF NOT EXISTS lfg_status TEXT DEFAULT 'offline' CHECK (lfg_status IN ('offline', 'looking', 'ready', 'in_match')),
ADD COLUMN IF NOT EXISTS lfg_updated_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS lfg_expires_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS lfg_message TEXT;

-- Create an index for efficient LFG queries
CREATE INDEX IF NOT EXISTS idx_global_league_clubs_lfg_status ON public.global_league_clubs(lfg_status) WHERE lfg_status != 'offline';

-- Create an index for LFG expiry filtering
CREATE INDEX IF NOT EXISTS idx_global_league_clubs_lfg_expires ON public.global_league_clubs(lfg_expires_at) WHERE lfg_expires_at IS NOT NULL;