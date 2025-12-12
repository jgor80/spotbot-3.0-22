-- Add INSERT/UPDATE policies for club_stats (bot writes EA data)
CREATE POLICY "Allow public insert on club_stats"
ON public.club_stats
FOR INSERT
WITH CHECK (true);

CREATE POLICY "Allow public update on club_stats"
ON public.club_stats
FOR UPDATE
USING (true)
WITH CHECK (true);

-- Add INSERT/UPDATE policies for position_preferences (bot syncs from EA)
CREATE POLICY "Allow public insert on position_preferences"
ON public.position_preferences
FOR INSERT
WITH CHECK (true);

CREATE POLICY "Allow public update on position_preferences"
ON public.position_preferences
FOR UPDATE
USING (true)
WITH CHECK (true);