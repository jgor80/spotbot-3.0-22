-- Create web_admins table for site-wide administrators
CREATE TABLE public.web_admins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS on web_admins
ALTER TABLE public.web_admins ENABLE ROW LEVEL SECURITY;

-- Only web admins can read the web_admins table
CREATE POLICY "Web admins can read web_admins"
  ON public.web_admins FOR SELECT
  TO authenticated
  USING (auth.uid() = auth_user_id);

-- Insert jeffgorski80@gmail.com as the first web admin
INSERT INTO public.web_admins (auth_user_id)
SELECT id FROM auth.users WHERE email = 'jeffgorski80@gmail.com';

-- Create helper function to check guild access
CREATE OR REPLACE FUNCTION public.user_has_guild_access(check_guild_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    -- Check if user is a web admin
    EXISTS (SELECT 1 FROM public.web_admins WHERE auth_user_id = auth.uid())
    OR
    -- Check if user has played games in this guild
    EXISTS (
      SELECT 1 
      FROM public.player_stats ps
      JOIN public.user_discord_links udl ON udl.discord_user_id = ps.discord_user_id
      WHERE udl.auth_user_id = auth.uid()
      AND ps.guild_id = check_guild_id
    )
$$;

-- Drop the existing permissive policy on guild_settings
DROP POLICY IF EXISTS "Allow public select on guild_settings" ON public.guild_settings;

-- Create new policy that checks guild access
CREATE POLICY "Users can only see guilds they belong to"
  ON public.guild_settings FOR SELECT
  TO authenticated
  USING (public.user_has_guild_access(guild_id));