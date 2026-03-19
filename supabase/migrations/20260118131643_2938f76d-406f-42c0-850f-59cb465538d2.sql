-- Create enum for worker activity action types
CREATE TYPE public.worker_action_type AS ENUM (
  'cutlist_row_done',
  'cutlist_row_issue',
  'cutlist_row_reopened',
  'cutlist_section_done',
  'cutlist_section_issue',
  'cutlist_section_reopened'
);

-- Create worker_activity_logs table
CREATE TABLE public.worker_activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  user_email text NOT NULL,
  action_type worker_action_type NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  upload_id uuid REFERENCES public.cutlist_uploads(id) ON DELETE CASCADE,
  project_name text,
  section_ref text,
  details jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create indexes for efficient querying
CREATE INDEX idx_worker_activity_logs_user_id ON public.worker_activity_logs(user_id);
CREATE INDEX idx_worker_activity_logs_created_at ON public.worker_activity_logs(created_at DESC);
CREATE INDEX idx_worker_activity_logs_upload_id ON public.worker_activity_logs(upload_id);
CREATE INDEX idx_worker_activity_logs_action_type ON public.worker_activity_logs(action_type);

-- Enable RLS
ALTER TABLE public.worker_activity_logs ENABLE ROW LEVEL SECURITY;

-- Workers can view their own activity logs
CREATE POLICY "Workers can view own activity logs"
ON public.worker_activity_logs
FOR SELECT
USING (auth.uid() = user_id);

-- Owners/Managers can view all activity logs
CREATE POLICY "Owners can view all activity logs"
ON public.worker_activity_logs
FOR SELECT
USING (is_app_owner() OR has_role(auth.uid(), 'manager'::app_role));

-- Any authenticated allowed user can insert their own logs
CREATE POLICY "Users can insert own activity logs"
ON public.worker_activity_logs
FOR INSERT
WITH CHECK (is_email_allowed() AND auth.uid() = user_id);

-- Only owners can delete logs (for cleanup purposes)
CREATE POLICY "Owners can delete activity logs"
ON public.worker_activity_logs
FOR DELETE
USING (is_app_owner());