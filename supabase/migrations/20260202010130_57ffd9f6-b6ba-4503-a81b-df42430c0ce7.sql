-- Add captain confirmation columns to drafts table for the new confirmation flow
ALTER TABLE public.drafts 
ADD COLUMN IF NOT EXISTS captain_a_confirmed boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS captain_b_confirmed boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS confirmation_expires_at timestamptz,
ADD COLUMN IF NOT EXISTS confirmation_message_id text;

-- Add comment explaining the new flow
COMMENT ON COLUMN public.drafts.captain_a_confirmed IS 'Whether captain A has accepted their role before draft begins';
COMMENT ON COLUMN public.drafts.captain_b_confirmed IS 'Whether captain B has accepted their role before draft begins';
COMMENT ON COLUMN public.drafts.confirmation_expires_at IS 'When the captain confirmation period expires (60s after draft creation)';
COMMENT ON COLUMN public.drafts.confirmation_message_id IS 'Discord message ID of the confirmation embed, for updating';