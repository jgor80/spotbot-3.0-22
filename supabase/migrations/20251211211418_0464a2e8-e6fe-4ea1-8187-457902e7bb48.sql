-- Add INSERT policy for profiles table
CREATE POLICY "Allow public insert on profiles"
ON public.profiles
FOR INSERT
WITH CHECK (true);

-- Add UPDATE policy for profiles table  
CREATE POLICY "Allow public update on profiles"
ON public.profiles
FOR UPDATE
USING (true)
WITH CHECK (true);