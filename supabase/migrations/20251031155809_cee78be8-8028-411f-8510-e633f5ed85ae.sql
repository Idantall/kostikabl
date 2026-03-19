-- Create storage bucket for label PDFs
INSERT INTO storage.buckets (id, name, public)
VALUES ('labels', 'labels', false)
ON CONFLICT (id) DO NOTHING;

-- RLS policies for labels bucket: authenticated users can read their own project labels
CREATE POLICY "Users can view their project labels"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'labels' AND
  EXISTS (
    SELECT 1 FROM projects p
    WHERE p.id::text = (storage.foldername(name))[1]
    AND p.created_by = auth.uid()
  )
);

-- Edge functions (service role) can insert labels
CREATE POLICY "Service role can upload labels"
ON storage.objects FOR INSERT
TO service_role
WITH CHECK (bucket_id = 'labels');