-- Create table to link Supabase auth users to their Discord accounts
CREATE TABLE public.user_discord_links (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  auth_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  discord_user_id TEXT NOT NULL,
  verified BOOLEAN DEFAULT false,
  verification_code TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(auth_user_id),
  UNIQUE(discord_user_id)
);

-- Enable RLS
ALTER TABLE public.user_discord_links ENABLE ROW LEVEL SECURITY;

-- Users can read their own links
CREATE POLICY "Users can view their own discord link"
ON public.user_discord_links FOR SELECT
USING (auth.uid() = auth_user_id);

-- Users can insert their own links
CREATE POLICY "Users can create their own discord link"
ON public.user_discord_links FOR INSERT
WITH CHECK (auth.uid() = auth_user_id);

-- Users can update their own links
CREATE POLICY "Users can update their own discord link"
ON public.user_discord_links FOR UPDATE
USING (auth.uid() = auth_user_id);

-- Users can delete their own links
CREATE POLICY "Users can delete their own discord link"
ON public.user_discord_links FOR DELETE
USING (auth.uid() = auth_user_id);

-- Service role can manage all links (for verification)
CREATE POLICY "Service role can manage all links"
ON public.user_discord_links FOR ALL
USING (true)
WITH CHECK (true);

-- Create trigger for updated_at
CREATE TRIGGER update_user_discord_links_updated_at
BEFORE UPDATE ON public.user_discord_links
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();