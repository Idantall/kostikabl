-- Create optimization_jobs table
CREATE TABLE public.optimization_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id bigint NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  source_file_path text NOT NULL,
  source_file_name text NOT NULL,
  status text NOT NULL DEFAULT 'parsed',
  bar_length_mm integer NULL,
  parse_warnings text[] DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Create optimization_patterns table
CREATE TABLE public.optimization_patterns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.optimization_jobs(id) ON DELETE CASCADE,
  profile_code text NOT NULL,
  pattern_index integer NOT NULL,
  rod_count integer NOT NULL,
  segments_mm integer[] NOT NULL,
  used_mm numeric NULL,
  remainder_mm numeric NULL,
  raw_text text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Create optimization_pattern_progress table
CREATE TABLE public.optimization_pattern_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern_id uuid NOT NULL REFERENCES public.optimization_patterns(id) ON DELETE CASCADE,
  worker_id uuid NULL,
  done boolean NOT NULL DEFAULT false,
  done_at timestamptz NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(pattern_id, worker_id)
);

-- Enable RLS
ALTER TABLE public.optimization_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.optimization_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.optimization_pattern_progress ENABLE ROW LEVEL SECURITY;

-- RLS policies for optimization_jobs
CREATE POLICY "Allowed users can view optimization jobs"
  ON public.optimization_jobs FOR SELECT
  USING (is_email_allowed());

CREATE POLICY "Allowed users can create optimization jobs"
  ON public.optimization_jobs FOR INSERT
  WITH CHECK (is_email_allowed() AND (
    EXISTS (SELECT 1 FROM projects WHERE projects.id = optimization_jobs.project_id AND projects.created_by = auth.uid())
    OR is_app_owner()
  ));

CREATE POLICY "Allowed users can update optimization jobs"
  ON public.optimization_jobs FOR UPDATE
  USING (is_email_allowed() AND (
    EXISTS (SELECT 1 FROM projects WHERE projects.id = optimization_jobs.project_id AND projects.created_by = auth.uid())
    OR is_app_owner()
  ));

CREATE POLICY "Allowed users can delete optimization jobs"
  ON public.optimization_jobs FOR DELETE
  USING (is_email_allowed() AND (
    EXISTS (SELECT 1 FROM projects WHERE projects.id = optimization_jobs.project_id AND projects.created_by = auth.uid())
    OR is_app_owner()
  ));

-- RLS policies for optimization_patterns
CREATE POLICY "Allowed users can view optimization patterns"
  ON public.optimization_patterns FOR SELECT
  USING (is_email_allowed());

CREATE POLICY "Allowed users can create optimization patterns"
  ON public.optimization_patterns FOR INSERT
  WITH CHECK (is_email_allowed());

CREATE POLICY "Allowed users can delete optimization patterns"
  ON public.optimization_patterns FOR DELETE
  USING (is_email_allowed() AND (
    EXISTS (
      SELECT 1 FROM optimization_jobs oj
      JOIN projects p ON p.id = oj.project_id
      WHERE oj.id = optimization_patterns.job_id
      AND (p.created_by = auth.uid() OR is_app_owner())
    )
  ));

-- RLS policies for optimization_pattern_progress
CREATE POLICY "Allowed users can view pattern progress"
  ON public.optimization_pattern_progress FOR SELECT
  USING (is_email_allowed());

CREATE POLICY "Workers can insert pattern progress"
  ON public.optimization_pattern_progress FOR INSERT
  WITH CHECK (is_email_allowed() AND auth.uid() = worker_id);

CREATE POLICY "Workers can update own pattern progress"
  ON public.optimization_pattern_progress FOR UPDATE
  USING (is_email_allowed() AND auth.uid() = worker_id);

-- Create trigger for updated_at
CREATE TRIGGER update_optimization_jobs_updated_at
  BEFORE UPDATE ON public.optimization_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_optimization_pattern_progress_updated_at
  BEFORE UPDATE ON public.optimization_pattern_progress
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create storage bucket for optimization PDFs
INSERT INTO storage.buckets (id, name, public) VALUES ('optimization-pdfs', 'optimization-pdfs', false);

-- Storage policies
CREATE POLICY "Allowed users can upload optimization PDFs"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'optimization-pdfs' AND is_email_allowed());

CREATE POLICY "Allowed users can view optimization PDFs"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'optimization-pdfs' AND is_email_allowed());

CREATE POLICY "Allowed users can delete optimization PDFs"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'optimization-pdfs' AND is_email_allowed());