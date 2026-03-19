-- Drop the restrictive DELETE policy
DROP POLICY IF EXISTS "Allowed users can delete projects" ON public.projects;

-- Create new DELETE policy that allows any allowed user to delete any project
CREATE POLICY "Allowed users can delete projects" 
ON public.projects 
FOR DELETE 
USING (is_email_allowed());