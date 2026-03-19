-- Add packed columns to cutlist_sections
ALTER TABLE public.cutlist_sections
  ADD COLUMN IF NOT EXISTS packed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS packed_by TEXT;

-- Add 'cutlist_section_packed' to worker_action_type enum
ALTER TYPE public.worker_action_type ADD VALUE IF NOT EXISTS 'cutlist_section_packed';
