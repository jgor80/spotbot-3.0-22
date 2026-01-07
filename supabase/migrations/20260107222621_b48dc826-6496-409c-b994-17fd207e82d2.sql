-- Drop the overly permissive public read policy on profiles
DROP POLICY IF EXISTS "Allow public read on profiles" ON public.profiles;

-- Create a policy that requires authentication to read profiles
CREATE POLICY "Authenticated users can read profiles"
ON public.profiles FOR SELECT
USING (auth.uid() IS NOT NULL);