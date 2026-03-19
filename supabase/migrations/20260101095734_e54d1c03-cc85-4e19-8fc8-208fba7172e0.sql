-- Storage policies for 'measurement-excels' bucket
-- Goal: allow allowed (whitelisted) authenticated users to upload/download/list the original source Excel snapshots.

-- Read/list
CREATE POLICY "Allowed users can read measurement excels"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'measurement-excels'
  AND public.is_email_allowed()
);

-- Upload
CREATE POLICY "Allowed users can upload measurement excels"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'measurement-excels'
  AND public.is_email_allowed()
);

-- Replace/update (optional but useful)
CREATE POLICY "Allowed users can update measurement excels"
ON storage.objects
FOR UPDATE
USING (
  bucket_id = 'measurement-excels'
  AND public.is_email_allowed()
)
WITH CHECK (
  bucket_id = 'measurement-excels'
  AND public.is_email_allowed()
);

-- Delete (optional)
CREATE POLICY "Allowed users can delete measurement excels"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'measurement-excels'
  AND public.is_email_allowed()
);