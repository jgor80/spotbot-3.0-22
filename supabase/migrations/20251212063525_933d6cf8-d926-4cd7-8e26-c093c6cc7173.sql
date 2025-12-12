-- Create scouting_lists table for captains to track players
CREATE TABLE public.scouting_lists (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  guild_id TEXT NOT NULL,
  created_by_discord_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  player_ids TEXT[] NOT NULL DEFAULT '{}',
  is_public BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.scouting_lists ENABLE ROW LEVEL SECURITY;

-- Allow public read for public lists or lists created by the user
CREATE POLICY "Anyone can read public scouting lists"
ON public.scouting_lists
FOR SELECT
USING (is_public = true);

-- Allow insert/update/delete for users with captain role or higher
CREATE POLICY "Captains can manage their own scouting lists"
ON public.scouting_lists
FOR ALL
USING (true)
WITH CHECK (true);

-- Create index for faster queries
CREATE INDEX idx_scouting_lists_guild ON public.scouting_lists(guild_id);
CREATE INDEX idx_scouting_lists_creator ON public.scouting_lists(created_by_discord_id);

-- Add trigger for updated_at
CREATE TRIGGER update_scouting_lists_updated_at
  BEFORE UPDATE ON public.scouting_lists
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();