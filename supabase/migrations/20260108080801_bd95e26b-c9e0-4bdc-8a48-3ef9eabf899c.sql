-- Add read policy for peer_evaluations (anonymized - no user identifiers exposed to frontend)
CREATE POLICY "Authenticated users can read peer evaluations"
ON public.peer_evaluations
FOR SELECT
TO authenticated
USING (true);

-- Also add policy for evaluator_trust_scores
CREATE POLICY "Authenticated users can read evaluator trust scores"
ON public.evaluator_trust_scores  
FOR SELECT
TO authenticated
USING (true);