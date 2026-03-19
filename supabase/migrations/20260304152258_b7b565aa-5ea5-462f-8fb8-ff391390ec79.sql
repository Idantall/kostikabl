
-- Add contractor column to father_projects
ALTER TABLE public.father_projects ADD COLUMN IF NOT EXISTS contractor text;

-- Add is_archived column to projects
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false;
