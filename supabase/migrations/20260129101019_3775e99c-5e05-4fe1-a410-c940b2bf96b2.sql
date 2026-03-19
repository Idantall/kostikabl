-- =====================================================
-- PDF Annotation-Based Optimization Module
-- Phase 1: Database Schema Setup
-- =====================================================

-- 1. optimization_pdf_uploads - Store uploaded optimization PDFs linked to projects
CREATE TABLE public.optimization_pdf_uploads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  page_count INTEGER DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'uploaded' CHECK (status IN ('uploaded', 'active', 'archived')),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. optimization_pdf_annotations - Store all annotations
CREATE TABLE public.optimization_pdf_annotations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  pdf_id UUID NOT NULL REFERENCES public.optimization_pdf_uploads(id) ON DELETE CASCADE,
  page INTEGER NOT NULL DEFAULT 1,
  annotation_type TEXT NOT NULL CHECK (annotation_type IN ('path', 'rectangle', 'circle', 'text', 'checkmark', 'issue')),
  annotation_data JSONB NOT NULL DEFAULT '{}',
  profile_code TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. optimization_pdf_progress - Track overall page completion status
CREATE TABLE public.optimization_pdf_progress (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  pdf_id UUID NOT NULL REFERENCES public.optimization_pdf_uploads(id) ON DELETE CASCADE,
  page INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'done', 'issue')),
  worker_id UUID REFERENCES auth.users(id),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(pdf_id, page)
);

-- Create indexes for performance
CREATE INDEX idx_optimization_pdf_uploads_project ON public.optimization_pdf_uploads(project_id);
CREATE INDEX idx_optimization_pdf_annotations_pdf_page ON public.optimization_pdf_annotations(pdf_id, page);
CREATE INDEX idx_optimization_pdf_progress_pdf ON public.optimization_pdf_progress(pdf_id);

-- Add updated_at triggers
CREATE TRIGGER update_optimization_pdf_uploads_updated_at
  BEFORE UPDATE ON public.optimization_pdf_uploads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_optimization_pdf_annotations_updated_at
  BEFORE UPDATE ON public.optimization_pdf_annotations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_optimization_pdf_progress_updated_at
  BEFORE UPDATE ON public.optimization_pdf_progress
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Enable Row Level Security
ALTER TABLE public.optimization_pdf_uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.optimization_pdf_annotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.optimization_pdf_progress ENABLE ROW LEVEL SECURITY;

-- RLS Policies for optimization_pdf_uploads
CREATE POLICY "Authenticated users can view optimization PDFs"
  ON public.optimization_pdf_uploads FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Workers and above can upload optimization PDFs"
  ON public.optimization_pdf_uploads FOR INSERT
  TO authenticated WITH CHECK (public.has_role(auth.uid(), 'worker'));

CREATE POLICY "Workers and above can update optimization PDFs"
  ON public.optimization_pdf_uploads FOR UPDATE
  TO authenticated USING (public.has_role(auth.uid(), 'worker'));

CREATE POLICY "Managers and above can delete optimization PDFs"
  ON public.optimization_pdf_uploads FOR DELETE
  TO authenticated USING (public.has_role(auth.uid(), 'manager'));

-- RLS Policies for optimization_pdf_annotations
CREATE POLICY "Authenticated users can view annotations"
  ON public.optimization_pdf_annotations FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Workers can create annotations"
  ON public.optimization_pdf_annotations FOR INSERT
  TO authenticated WITH CHECK (public.has_role(auth.uid(), 'worker'));

CREATE POLICY "Workers can update their own annotations"
  ON public.optimization_pdf_annotations FOR UPDATE
  TO authenticated USING (
    created_by = auth.uid() OR public.has_role(auth.uid(), 'manager')
  );

CREATE POLICY "Workers can delete their own annotations"
  ON public.optimization_pdf_annotations FOR DELETE
  TO authenticated USING (
    created_by = auth.uid() OR public.has_role(auth.uid(), 'manager')
  );

-- RLS Policies for optimization_pdf_progress
CREATE POLICY "Authenticated users can view progress"
  ON public.optimization_pdf_progress FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Workers can create progress records"
  ON public.optimization_pdf_progress FOR INSERT
  TO authenticated WITH CHECK (public.has_role(auth.uid(), 'worker'));

CREATE POLICY "Workers can update progress"
  ON public.optimization_pdf_progress FOR UPDATE
  TO authenticated USING (public.has_role(auth.uid(), 'worker'));

-- Enable realtime for collaborative annotation sync
ALTER PUBLICATION supabase_realtime ADD TABLE public.optimization_pdf_annotations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.optimization_pdf_progress;