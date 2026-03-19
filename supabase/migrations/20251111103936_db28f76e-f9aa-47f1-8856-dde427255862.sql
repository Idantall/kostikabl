-- Drop the restrictive policy that only allows project creators to see scan events
DROP POLICY IF EXISTS "scan_events read for allowed users" ON public.scan_events;

-- Create new policy that allows all allowed users to view scan events
CREATE POLICY "Allowed users can view scan events"
ON public.scan_events
FOR SELECT
USING (is_email_allowed());

-- Keep the write restriction policy as-is
-- (scan_events no write for clients already exists)