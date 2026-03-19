-- Add RLS policy to scans table to prevent unauthorized inserts
-- Only the service role (edge functions) can insert scans

CREATE POLICY "Only edge functions can create scans"
ON public.scans
FOR INSERT
WITH CHECK (false);

-- Note: Edge functions use the service role key which bypasses RLS,
-- so they can still insert. This policy prevents direct client inserts.