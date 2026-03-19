-- Add new columns to measurement_rows for updated template
ALTER TABLE public.measurement_rows
  ADD COLUMN IF NOT EXISTS contract_item TEXT,
  ADD COLUMN IF NOT EXISTS hinge_direction TEXT,
  ADD COLUMN IF NOT EXISTS mamad TEXT,
  ADD COLUMN IF NOT EXISTS depth TEXT,
  ADD COLUMN IF NOT EXISTS is_manual BOOLEAN NOT NULL DEFAULT FALSE;

-- Add new columns to items table for when projects convert from measurement
ALTER TABLE public.items
  ADD COLUMN IF NOT EXISTS contract_item TEXT,
  ADD COLUMN IF NOT EXISTS hinge_direction TEXT,
  ADD COLUMN IF NOT EXISTS mamad TEXT,
  ADD COLUMN IF NOT EXISTS depth TEXT,
  ADD COLUMN IF NOT EXISTS is_manual BOOLEAN NOT NULL DEFAULT FALSE;
