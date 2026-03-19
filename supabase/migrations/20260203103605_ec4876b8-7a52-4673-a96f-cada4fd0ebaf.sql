-- Table to store admin-assigned workers per user email (max 2 per user)
CREATE TABLE public.user_worker_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  worker_id uuid NOT NULL REFERENCES public.workers(id) ON DELETE CASCADE,
  assigned_by uuid REFERENCES auth.users(id),
  confirmed boolean NOT NULL DEFAULT false,
  confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, worker_id)
);

-- Enable RLS
ALTER TABLE public.user_worker_assignments ENABLE ROW LEVEL SECURITY;

-- Policy: Owners and managers can view and manage all assignments
CREATE POLICY "Owners and managers can manage assignments"
ON public.user_worker_assignments
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_roles.user_id = auth.uid() 
    AND user_roles.role IN ('owner', 'manager')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_roles.user_id = auth.uid() 
    AND user_roles.role IN ('owner', 'manager')
  )
);

-- Policy: Users can view their own assignments
CREATE POLICY "Users can view own assignments"
ON public.user_worker_assignments
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- Policy: Users can update own assignments for confirmation
CREATE POLICY "Users can update own assignments for confirmation"
ON public.user_worker_assignments
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Create trigger for updated_at
CREATE TRIGGER update_user_worker_assignments_updated_at
  BEFORE UPDATE ON public.user_worker_assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Constraint function to enforce max 2 workers per user
CREATE OR REPLACE FUNCTION public.check_max_worker_assignments()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (SELECT COUNT(*) FROM public.user_worker_assignments WHERE user_id = NEW.user_id) >= 2 THEN
    RAISE EXCEPTION 'Maximum of 2 workers can be assigned per user';
  END IF;
  RETURN NEW;
END;
$$;

-- Trigger to enforce max 2 workers
CREATE TRIGGER enforce_max_worker_assignments
  BEFORE INSERT ON public.user_worker_assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.check_max_worker_assignments();