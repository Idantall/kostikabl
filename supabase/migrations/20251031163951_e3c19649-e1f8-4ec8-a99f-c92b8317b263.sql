-- Create assets bucket for fonts and other static files
INSERT INTO storage.buckets (id, name, public)
VALUES ('assets', 'assets', false)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to read from assets bucket
CREATE POLICY "Allow authenticated users to read assets"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'assets');