-- Add item_type column to items table
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS item_type text;

-- Create load_issues table
CREATE TABLE IF NOT EXISTS public.load_issues (
  id bigserial PRIMARY KEY,
  project_id bigint NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  item_id bigint NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  scan_id bigint NOT NULL REFERENCES public.scans(id) ON DELETE CASCADE,
  source text NOT NULL CHECK (source IN ('load')),
  issue_codes text[] NOT NULL DEFAULT '{}',
  free_text text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by_ip_hash text
);

-- Enable RLS
ALTER TABLE public.load_issues ENABLE ROW LEVEL SECURITY;

-- RLS policy for select - all allowed users can view (for visibility across team)
CREATE POLICY "Allowed users can view load issues"
ON public.load_issues
FOR SELECT
USING (is_email_allowed());

-- RLS policy for insert - only via service role (edge functions)
CREATE POLICY "Service role can insert load issues"
ON public.load_issues
FOR INSERT
WITH CHECK (false);

-- Backfill: remove '04' from monoblock doors
UPDATE public.items
SET required_codes = array_remove(required_codes, '04')
WHERE '04' = ANY(required_codes)
  AND (notes ILIKE '%מונובלוק%' OR notes ILIKE '%monobloc%');

-- Create index for efficient queries
CREATE INDEX IF NOT EXISTS idx_load_issues_item_id ON public.load_issues(item_id);
CREATE INDEX IF NOT EXISTS idx_load_issues_scan_id ON public.load_issues(scan_id);