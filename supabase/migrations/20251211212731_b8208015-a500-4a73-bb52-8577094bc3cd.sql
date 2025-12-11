-- Add INSERT policy for guild_settings table
CREATE POLICY "Allow public insert on guild_settings"
ON public.guild_settings
FOR INSERT
WITH CHECK (true);

-- Add UPDATE policy for guild_settings table
CREATE POLICY "Allow public update on guild_settings"
ON public.guild_settings
FOR UPDATE
USING (true)
WITH CHECK (true);