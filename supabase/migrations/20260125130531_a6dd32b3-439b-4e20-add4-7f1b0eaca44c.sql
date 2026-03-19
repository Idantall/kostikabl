-- Drop the existing check constraint and add updated one that includes blind_jambs
ALTER TABLE public.projects DROP CONSTRAINT IF EXISTS projects_status_check;

ALTER TABLE public.projects ADD CONSTRAINT projects_status_check 
CHECK (status IN ('active', 'measurement', 'blind_jambs', 'archived', 'completed'));