
-- Table for apartment-level QR labels (round stickers)
CREATE TABLE public.apt_labels (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  project_id bigint NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  apt_id bigint NOT NULL REFERENCES public.apartments(id) ON DELETE CASCADE,
  qr_token_hash text NOT NULL,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id, apt_id)
);

-- RLS
ALTER TABLE public.apt_labels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allowed users can view apt labels"
  ON public.apt_labels FOR SELECT
  USING (is_email_allowed());

CREATE POLICY "Allowed users can create apt labels"
  ON public.apt_labels FOR INSERT
  WITH CHECK (is_email_allowed() AND (
    EXISTS (SELECT 1 FROM projects WHERE projects.id = apt_labels.project_id AND (projects.created_by = auth.uid()))
    OR is_app_owner()
  ));

CREATE POLICY "Allowed users can update apt labels"
  ON public.apt_labels FOR UPDATE
  USING (is_email_allowed() AND (
    EXISTS (SELECT 1 FROM projects WHERE projects.id = apt_labels.project_id AND (projects.created_by = auth.uid()))
    OR is_app_owner()
  ));

CREATE POLICY "Allowed users can delete apt labels"
  ON public.apt_labels FOR DELETE
  USING (is_email_allowed() AND (
    EXISTS (SELECT 1 FROM projects WHERE projects.id = apt_labels.project_id AND (projects.created_by = auth.uid()))
    OR is_app_owner()
  ));
