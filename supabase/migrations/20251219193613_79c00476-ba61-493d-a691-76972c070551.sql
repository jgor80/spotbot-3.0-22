-- Add RLS policies for peer_evaluations table
ALTER TABLE public.peer_evaluations ENABLE ROW LEVEL SECURITY;

-- Allow public read on peer_evaluations
CREATE POLICY "Allow public read on peer_evaluations" 
ON public.peer_evaluations 
FOR SELECT 
USING (true);

-- Allow public insert on peer_evaluations (Discord bot inserts via service role, but this allows anon too)
CREATE POLICY "Allow public insert on peer_evaluations" 
ON public.peer_evaluations 
FOR INSERT 
WITH CHECK (true);

-- Allow public update on peer_evaluations
CREATE POLICY "Allow public update on peer_evaluations" 
ON public.peer_evaluations 
FOR UPDATE 
USING (true)
WITH CHECK (true);