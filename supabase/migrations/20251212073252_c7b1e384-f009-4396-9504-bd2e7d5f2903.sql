-- Create table to store AI scouting reports (one per player per guild)
CREATE TABLE public.scouting_reports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  guild_id TEXT NOT NULL,
  discord_user_id TEXT NOT NULL,
  ea_username TEXT,
  report_content TEXT NOT NULL,
  player_data JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by_discord_id TEXT,
  UNIQUE(guild_id, discord_user_id)
);

-- Enable RLS
ALTER TABLE public.scouting_reports ENABLE ROW LEVEL SECURITY;

-- Allow public read
CREATE POLICY "Allow public read on scouting_reports" 
ON public.scouting_reports 
FOR SELECT 
USING (true);

-- Allow public insert (edge function uses service role)
CREATE POLICY "Allow public insert on scouting_reports" 
ON public.scouting_reports 
FOR INSERT 
WITH CHECK (true);

-- Allow public update
CREATE POLICY "Allow public update on scouting_reports" 
ON public.scouting_reports 
FOR UPDATE 
USING (true);

-- Create index for quick lookups
CREATE INDEX idx_scouting_reports_guild_player ON public.scouting_reports(guild_id, discord_user_id);

-- Add trigger for updated_at
CREATE TRIGGER update_scouting_reports_updated_at
BEFORE UPDATE ON public.scouting_reports
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();