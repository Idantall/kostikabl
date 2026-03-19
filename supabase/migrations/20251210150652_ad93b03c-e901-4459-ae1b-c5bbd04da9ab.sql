-- Allow users to delete load issues
CREATE POLICY "Allowed users can delete load issues"
ON public.load_issues
FOR DELETE
USING (is_email_allowed());