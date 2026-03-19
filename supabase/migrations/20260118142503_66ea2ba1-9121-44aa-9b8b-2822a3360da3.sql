-- Add station column to user_roles table for tracking worker assignments
ALTER TABLE public.user_roles 
ADD COLUMN station TEXT DEFAULT NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.user_roles.station IS 'Worker station assignment for performance tracking (e.g., "חיתוך", "הרכבה", "זיגוג")';