-- Update is_app_owner function to include idantal92@gmail.com
CREATE OR REPLACE FUNCTION public.is_app_owner()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT auth.email() IN ('yossi@kostika.biz', 'idantal92@gmail.com')
$$;