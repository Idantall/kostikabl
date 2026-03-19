
-- Allow authenticated users to update (upsert) in project-contracts bucket
CREATE POLICY "Allowed users can update contracts"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'project-contracts' AND public.is_email_allowed())
WITH CHECK (bucket_id = 'project-contracts' AND public.is_email_allowed());
