-- Add row-level status tracking to cutlist row tables

-- cutlist_profile_rows
ALTER TABLE public.cutlist_profile_rows 
ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'open',
ADD COLUMN IF NOT EXISTS issue_text text NULL,
ADD COLUMN IF NOT EXISTS finalized_at timestamptz NULL,
ADD COLUMN IF NOT EXISTS finalized_by uuid NULL;

-- cutlist_misc_rows
ALTER TABLE public.cutlist_misc_rows 
ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'open',
ADD COLUMN IF NOT EXISTS issue_text text NULL,
ADD COLUMN IF NOT EXISTS finalized_at timestamptz NULL,
ADD COLUMN IF NOT EXISTS finalized_by uuid NULL;

-- cutlist_glass_rows
ALTER TABLE public.cutlist_glass_rows 
ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'open',
ADD COLUMN IF NOT EXISTS issue_text text NULL,
ADD COLUMN IF NOT EXISTS finalized_at timestamptz NULL,
ADD COLUMN IF NOT EXISTS finalized_by uuid NULL;

-- Add check constraint for valid status values
-- Using a simple validation approach

COMMENT ON COLUMN public.cutlist_profile_rows.status IS 'Row status: open, done, or issue';
COMMENT ON COLUMN public.cutlist_misc_rows.status IS 'Row status: open, done, or issue';
COMMENT ON COLUMN public.cutlist_glass_rows.status IS 'Row status: open, done, or issue';