-- Add INSERT policy for manager_evaluations (edge function uses service role, but adding for completeness)
CREATE POLICY "Allow insert for manager evaluations"
ON public.manager_evaluations
FOR INSERT
WITH CHECK (true);