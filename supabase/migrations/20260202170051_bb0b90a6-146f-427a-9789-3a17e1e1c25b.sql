
-- Fix projects SELECT policy to allow all allowed users to view all projects
DROP POLICY IF EXISTS "Allowed users can view projects" ON public.projects;
CREATE POLICY "Allowed users can view projects"
ON public.projects
FOR SELECT
TO authenticated
USING (is_email_allowed());
