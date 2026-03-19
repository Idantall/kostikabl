-- Create label_jobs table for progress tracking
CREATE TABLE IF NOT EXISTS public.label_jobs (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  project_id BIGINT NOT NULL,
  total INT NOT NULL,
  done INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'running',
  pdf_path TEXT,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.label_jobs ENABLE ROW LEVEL SECURITY;

-- Policy: Allowed users can view their jobs
CREATE POLICY "Allowed users can view their jobs"
ON public.label_jobs
FOR SELECT
USING (
  is_email_allowed() AND EXISTS (
    SELECT 1 FROM projects
    WHERE projects.id = label_jobs.project_id
    AND projects.created_by = auth.uid()
  )
);

-- Enable realtime for progress updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.label_jobs;