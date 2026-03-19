-- Drop existing restrictive policies
DROP POLICY IF EXISTS "Allowed users can view items" ON public.items;
DROP POLICY IF EXISTS "Allowed users can view apartments" ON public.apartments;
DROP POLICY IF EXISTS "Allowed users can view floors" ON public.floors;
DROP POLICY IF EXISTS "Allowed users can view labels" ON public.labels;
DROP POLICY IF EXISTS "Allowed users can view scans" ON public.scans;

-- Create new policies that allow all allowed users to view data
CREATE POLICY "Allowed users can view items" 
ON public.items 
FOR SELECT 
USING (is_email_allowed());

CREATE POLICY "Allowed users can view apartments" 
ON public.apartments 
FOR SELECT 
USING (is_email_allowed());

CREATE POLICY "Allowed users can view floors" 
ON public.floors 
FOR SELECT 
USING (is_email_allowed());

CREATE POLICY "Allowed users can view labels" 
ON public.labels 
FOR SELECT 
USING (is_email_allowed());

CREATE POLICY "Allowed users can view scans" 
ON public.scans 
FOR SELECT 
USING (is_email_allowed());