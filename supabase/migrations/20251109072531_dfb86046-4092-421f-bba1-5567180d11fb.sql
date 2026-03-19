-- Add RLS policy for label_jobs table to allow authenticated users to read their own jobs
CREATE POLICY "Users can view their own label jobs"
  ON public.label_jobs
  FOR SELECT
  TO authenticated
  USING (
    project_id IN (
      SELECT id FROM public.projects WHERE id = label_jobs.project_id
    )
  );