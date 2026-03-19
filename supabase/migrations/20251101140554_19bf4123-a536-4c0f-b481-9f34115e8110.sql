-- Create label_job_items table (label_jobs already exists)
CREATE TABLE IF NOT EXISTS public.label_job_items (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  job_id BIGINT REFERENCES public.label_jobs(id) ON DELETE CASCADE,
  ord INT NOT NULL,
  item_id BIGINT NOT NULL,
  subpart_code TEXT NOT NULL,
  scan_url TEXT NOT NULL,
  token_plain TEXT NOT NULL,
  rendered BOOLEAN NOT NULL DEFAULT FALSE
);

-- Enable RLS
ALTER TABLE public.label_job_items ENABLE ROW LEVEL SECURITY;

-- RLS policy for label_job_items
CREATE POLICY "Allowed users can view their job items"
ON public.label_job_items
FOR SELECT
USING (
  is_email_allowed() AND EXISTS (
    SELECT 1 FROM label_jobs
    JOIN projects ON projects.id = label_jobs.project_id
    WHERE label_jobs.id = label_job_items.job_id
    AND projects.created_by = auth.uid()
  )
);