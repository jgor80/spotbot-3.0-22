-- Create table for storing EA to Discord link suggestions
CREATE TABLE public.link_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id TEXT NOT NULL,
  temp_profile_id UUID NOT NULL,  -- Reference to the temporary ea_ profile
  ea_username TEXT NOT NULL,
  suggested_discord_id TEXT NOT NULL,
  suggested_discord_name TEXT,
  similarity_score NUMERIC NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',  -- pending, approved, rejected
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by TEXT,
  UNIQUE(guild_id, ea_username, suggested_discord_id)
);

-- Create indexes for efficient querying
CREATE INDEX idx_link_suggestions_guild_status ON public.link_suggestions(guild_id, status);
CREATE INDEX idx_link_suggestions_ea_username ON public.link_suggestions(ea_username);

-- Enable RLS
ALTER TABLE public.link_suggestions ENABLE ROW LEVEL SECURITY;

-- Allow all operations (no auth in this app, uses service role)
CREATE POLICY "Allow all operations on link_suggestions"
  ON public.link_suggestions
  FOR ALL
  USING (true)
  WITH CHECK (true);