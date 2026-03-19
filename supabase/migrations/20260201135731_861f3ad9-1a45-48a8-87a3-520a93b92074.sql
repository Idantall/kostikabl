-- Add policy to allow anonymous users to check if email is allowed (for login flow)
CREATE POLICY "Anyone can check allowed emails"
ON public.allowed_emails
FOR SELECT
TO anon
USING (true);