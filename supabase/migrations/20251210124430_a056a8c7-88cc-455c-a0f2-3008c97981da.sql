-- Drop existing RLS policies on load_issues
DROP POLICY IF EXISTS "load_issues_select" ON public.load_issues;
DROP POLICY IF EXISTS "load_issues_insert" ON public.load_issues;
DROP POLICY IF EXISTS "Allowed users can view load issues" ON public.load_issues;
DROP POLICY IF EXISTS "Service role can insert load issues" ON public.load_issues;

-- Create new policies that allow all allowed users to view load issues (matching the pattern from memories)
CREATE POLICY "Allowed users can view load issues" ON public.load_issues
FOR SELECT USING (is_email_allowed());

-- Service role/edge function inserts (no user can insert directly)
CREATE POLICY "Service role can insert load issues" ON public.load_issues
FOR INSERT WITH CHECK (false);