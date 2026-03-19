-- Create labels storage bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public) 
VALUES ('labels', 'labels', false)
ON CONFLICT (id) DO NOTHING;

-- RLS policies for labels bucket
CREATE POLICY "Allowed users can upload labels" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'labels' AND
    (SELECT public.is_email_allowed())
  );

CREATE POLICY "Allowed users can view labels" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'labels' AND
    (SELECT public.is_email_allowed())
  );

CREATE POLICY "Allowed users can delete labels" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'labels' AND
    (SELECT public.is_email_allowed())
  );