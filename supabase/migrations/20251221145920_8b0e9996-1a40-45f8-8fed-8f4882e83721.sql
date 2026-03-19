-- Update label_jobs SELECT policy to match projects access pattern
DROP POLICY IF EXISTS "Allowed users can view their jobs" ON public.label_jobs;
DROP POLICY IF EXISTS "Users can view their own label jobs" ON public.label_jobs;

CREATE POLICY "Allowed users can view their jobs" 
ON public.label_jobs 
FOR SELECT 
USING (
  is_email_allowed() AND (
    EXISTS (
      SELECT 1 FROM projects 
      WHERE projects.id = label_jobs.project_id 
      AND projects.created_by = auth.uid()
    )
    OR (
      auth.email() = 'yossi@kostika.biz' 
      AND EXISTS (
        SELECT 1 FROM projects 
        WHERE projects.id = label_jobs.project_id 
        AND projects.status = 'measurement'
      )
    )
  )
);

-- Update label_job_items SELECT policy
DROP POLICY IF EXISTS "Allowed users can view their job items" ON public.label_job_items;

CREATE POLICY "Allowed users can view their job items" 
ON public.label_job_items 
FOR SELECT 
USING (
  is_email_allowed() AND (
    EXISTS (
      SELECT 1 FROM label_jobs
      JOIN projects ON projects.id = label_jobs.project_id
      WHERE label_jobs.id = label_job_items.job_id 
      AND projects.created_by = auth.uid()
    )
    OR (
      auth.email() = 'yossi@kostika.biz' 
      AND EXISTS (
        SELECT 1 FROM label_jobs
        JOIN projects ON projects.id = label_jobs.project_id
        WHERE label_jobs.id = label_job_items.job_id 
        AND projects.status = 'measurement'
      )
    )
  )
);

-- Update label_job_items DELETE policy
DROP POLICY IF EXISTS "Allowed users can delete their job items" ON public.label_job_items;

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
    OR (
      auth.email() = 'yossi@kostika.biz' 
      AND EXISTS (
        SELECT 1 FROM label_jobs
        JOIN projects ON projects.id = label_jobs.project_id
        WHERE label_jobs.id = label_job_items.job_id 
        AND projects.status = 'measurement'
      )
    )
  )
);