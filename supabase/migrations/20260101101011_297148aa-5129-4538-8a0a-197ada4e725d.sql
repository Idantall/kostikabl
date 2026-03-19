-- Fix storage policies for measurement-excels bucket
-- First drop the old policies that might be conflicting
DROP POLICY IF EXISTS "Users can upload measurement excels" ON storage.objects;
DROP POLICY IF EXISTS "Users can view their measurement excels" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their measurement excels" ON storage.objects;
DROP POLICY IF EXISTS "Allowed users can read measurement excels" ON storage.objects;
DROP POLICY IF EXISTS "Allowed users can upload measurement excels" ON storage.objects;
DROP POLICY IF EXISTS "Allowed users can update measurement excels" ON storage.objects;
DROP POLICY IF EXISTS "Allowed users can delete measurement excels" ON storage.objects;

-- Create simple authenticated-user policies for measurement-excels
-- These allow any authenticated user to read/write (the RLS on projects table handles access control)
CREATE POLICY "Authenticated users can read measurement excels"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'measurement-excels'
  AND auth.role() = 'authenticated'
);

CREATE POLICY "Authenticated users can upload measurement excels"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'measurement-excels'
  AND auth.role() = 'authenticated'
);

CREATE POLICY "Authenticated users can update measurement excels"
ON storage.objects
FOR UPDATE
USING (
  bucket_id = 'measurement-excels'
  AND auth.role() = 'authenticated'
)
WITH CHECK (
  bucket_id = 'measurement-excels'
  AND auth.role() = 'authenticated'
);

CREATE POLICY "Authenticated users can delete measurement excels"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'measurement-excels'
  AND auth.role() = 'authenticated'
);