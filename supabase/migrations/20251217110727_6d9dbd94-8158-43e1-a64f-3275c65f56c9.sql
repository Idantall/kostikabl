
-- Add DELETE policy for label_job_items to allow project owners to delete
CREATE POLICY "Allowed users can delete their job items" 
ON public.label_job_items 
FOR DELETE 
USING (
  is_email_allowed() AND (
    EXISTS (
      SELECT 1 FROM label_jobs
      JOIN projects ON projects.id = label_jobs.project_id
      WHERE label_jobs.id = label_job_items.job_id 
      AND projects.created_by = auth.uid()
    )
  )
);
