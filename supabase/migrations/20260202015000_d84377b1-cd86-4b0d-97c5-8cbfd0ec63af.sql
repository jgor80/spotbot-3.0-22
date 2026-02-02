-- Add indexes for efficient friendly-to-draft matching queries

-- Index for finding recent friendly matches by guild
CREATE INDEX IF NOT EXISTS idx_club_matches_friendly_lookup 
ON club_matches(guild_id, match_type, created_at DESC) 
WHERE match_type = 'friendly';

-- Index for finding draft results by ea_match_id
CREATE INDEX IF NOT EXISTS idx_draft_results_ea_match 
ON draft_results(ea_match_id) 
WHERE ea_match_id IS NOT NULL;