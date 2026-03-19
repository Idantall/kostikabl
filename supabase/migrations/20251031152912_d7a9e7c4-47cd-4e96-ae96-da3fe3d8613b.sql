-- Enable RLS on allowed_emails table
ALTER TABLE public.allowed_emails ENABLE ROW LEVEL SECURITY;

-- Only authenticated users can view allowed emails (for internal checks)
CREATE POLICY "Authenticated users can view allowed emails" ON public.allowed_emails
  FOR SELECT USING (auth.role() = 'authenticated');