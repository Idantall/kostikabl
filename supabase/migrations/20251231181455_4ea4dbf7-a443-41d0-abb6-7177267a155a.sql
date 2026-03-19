-- Add status and finalization fields to cutlist_sections
ALTER TABLE public.cutlist_sections
ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'open',
ADD COLUMN IF NOT EXISTS issue_text text NULL,
ADD COLUMN IF NOT EXISTS finalized_at timestamptz NULL,
ADD COLUMN IF NOT EXISTS finalized_by uuid NULL,
ADD COLUMN IF NOT EXISTS parse_error text NULL;

-- Add constraint for valid status values
ALTER TABLE public.cutlist_sections
ADD CONSTRAINT cutlist_sections_status_check CHECK (status IN ('open', 'done', 'issue'));