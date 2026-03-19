
-- Step 1a: Extend status constraint to include 'pre_contract'
ALTER TABLE public.projects DROP CONSTRAINT IF EXISTS projects_status_check;
ALTER TABLE public.projects ADD CONSTRAINT projects_status_check 
  CHECK (status IN ('active', 'measurement', 'blind_jambs', 'pre_contract', 'archived', 'completed'));

-- Step 1b: Add contract columns to projects
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS contract_pdf_path text;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS contract_uploaded_at timestamptz;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS contract_parsed_at timestamptz;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS contract_parse_method text;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS contract_parse_result jsonb;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS contract_parse_warnings jsonb;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS contract_totals jsonb;

-- Step 1c: Create storage bucket for contract PDFs (private)
INSERT INTO storage.buckets (id, name, public)
VALUES ('project-contracts', 'project-contracts', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for project-contracts bucket
CREATE POLICY "Authenticated users can upload contract PDFs"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'project-contracts' AND auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can read contract PDFs"
ON storage.objects FOR SELECT
USING (bucket_id = 'project-contracts' AND auth.role() = 'authenticated');

-- Step 1d: Add contract fields to wizard draft table
ALTER TABLE public.project_wizard_drafts ADD COLUMN IF NOT EXISTS project_type text DEFAULT 'blind_jambs';
ALTER TABLE public.project_wizard_drafts ADD COLUMN IF NOT EXISTS contract_pdf_path text;
ALTER TABLE public.project_wizard_drafts ADD COLUMN IF NOT EXISTS contract_parse_result jsonb;
