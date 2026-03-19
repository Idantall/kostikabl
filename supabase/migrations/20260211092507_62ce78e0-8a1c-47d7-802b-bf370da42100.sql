
-- Allow authenticated users with allowed email to upload to project-contracts bucket
CREATE POLICY "Authenticated users can upload contracts"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'project-contracts'
  AND public.is_email_allowed()
);

-- Allow authenticated users to read their uploaded contracts
CREATE POLICY "Authenticated users can read contracts"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'project-contracts'
  AND public.is_email_allowed()
);
