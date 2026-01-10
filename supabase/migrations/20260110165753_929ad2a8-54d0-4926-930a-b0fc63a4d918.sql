-- Add position-specific clean sheet columns to player_stats
ALTER TABLE public.player_stats ADD COLUMN IF NOT EXISTS clean_sheet_def BOOLEAN DEFAULT FALSE;
ALTER TABLE public.player_stats ADD COLUMN IF NOT EXISTS clean_sheet_gk BOOLEAN DEFAULT FALSE;

-- Create index for efficient querying by position-specific clean sheets
CREATE INDEX IF NOT EXISTS idx_player_stats_clean_sheet_def ON public.player_stats(clean_sheet_def) WHERE clean_sheet_def = TRUE;
CREATE INDEX IF NOT EXISTS idx_player_stats_clean_sheet_gk ON public.player_stats(clean_sheet_gk) WHERE clean_sheet_gk = TRUE;