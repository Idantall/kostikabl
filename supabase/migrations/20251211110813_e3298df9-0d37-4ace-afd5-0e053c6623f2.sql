-- Drop the existing restrictive update policy
DROP POLICY IF EXISTS "Allowed users can update items" ON public.items;

-- Create new policy allowing any allowed user to update items
CREATE POLICY "Allowed users can update items" 
ON public.items 
FOR UPDATE 
USING (is_email_allowed())
WITH CHECK (is_email_allowed());