-- Add production_file_path column to projects table for תיק יצור PDF
ALTER TABLE public.projects 
ADD COLUMN IF NOT EXISTS production_file_path text;

-- Create production-files storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('production-files', 'production-files', false)
ON CONFLICT (id) DO NOTHING;

-- Create RLS policies for production-files bucket
CREATE POLICY "Allowed users can view production files"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'production-files' 
  AND is_email_allowed()
);

CREATE POLICY "Allowed users can upload production files"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'production-files' 
  AND is_email_allowed()
);

CREATE POLICY "Allowed users can update production files"
ON storage.objects
FOR UPDATE
USING (
  bucket_id = 'production-files' 
  AND is_email_allowed()
);

CREATE POLICY "Allowed users can delete production files"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'production-files' 
  AND is_email_allowed()
);

-- Add similar policies for measurement-excels to support PDF uploads too
-- (These may already exist, using IF NOT EXISTS pattern)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'storage' 
    AND tablename = 'objects' 
    AND policyname = 'Allowed users can view measurement files'
  ) THEN
    CREATE POLICY "Allowed users can view measurement files"
    ON storage.objects
    FOR SELECT
    USING (
      bucket_id = 'measurement-excels' 
      AND is_email_allowed()
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'storage' 
    AND tablename = 'objects' 
    AND policyname = 'Allowed users can upload measurement files'
  ) THEN
    CREATE POLICY "Allowed users can upload measurement files"
    ON storage.objects
    FOR INSERT
    WITH CHECK (
      bucket_id = 'measurement-excels' 
      AND is_email_allowed()
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'storage' 
    AND tablename = 'objects' 
    AND policyname = 'Allowed users can update measurement files'
  ) THEN
    CREATE POLICY "Allowed users can update measurement files"
    ON storage.objects
    FOR UPDATE
    USING (
      bucket_id = 'measurement-excels' 
      AND is_email_allowed()
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'storage' 
    AND tablename = 'objects' 
    AND policyname = 'Allowed users can delete measurement files'
  ) THEN
    CREATE POLICY "Allowed users can delete measurement files"
    ON storage.objects
    FOR DELETE
    USING (
      bucket_id = 'measurement-excels' 
      AND is_email_allowed()
    );
  END IF;
END $$;