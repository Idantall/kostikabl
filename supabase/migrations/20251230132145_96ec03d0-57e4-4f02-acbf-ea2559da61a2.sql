-- Add source_file_path column to projects table for tracking original Excel files
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS source_file_path text DEFAULT NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.projects.source_file_path IS 'Path to the original Excel file in storage (measurement-excels bucket)';