
-- Father Projects table
CREATE TABLE public.father_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  metadata jsonb NULL,
  created_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.father_projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allowed users can view father projects"
  ON public.father_projects FOR SELECT
  USING (is_email_allowed());

CREATE POLICY "Managers can create father projects"
  ON public.father_projects FOR INSERT
  WITH CHECK (is_email_allowed() AND has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Managers can update father projects"
  ON public.father_projects FOR UPDATE
  USING (is_email_allowed() AND has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Managers can delete father projects"
  ON public.father_projects FOR DELETE
  USING (is_email_allowed() AND has_role(auth.uid(), 'manager'::app_role));

-- Join table: father_project_buildings
CREATE TABLE public.father_project_buildings (
  father_project_id uuid NOT NULL REFERENCES public.father_projects(id) ON DELETE CASCADE,
  building_project_id bigint NOT NULL REFERENCES public.projects(id) ON DELETE RESTRICT,
  building_number int NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (father_project_id, building_project_id),
  UNIQUE (father_project_id, building_number),
  UNIQUE (building_project_id) -- a building can belong to only one father project
);

ALTER TABLE public.father_project_buildings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allowed users can view father project buildings"
  ON public.father_project_buildings FOR SELECT
  USING (is_email_allowed());

CREATE POLICY "Managers can create father project buildings"
  ON public.father_project_buildings FOR INSERT
  WITH CHECK (is_email_allowed() AND has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Managers can update father project buildings"
  ON public.father_project_buildings FOR UPDATE
  USING (is_email_allowed() AND has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Managers can delete father project buildings"
  ON public.father_project_buildings FOR DELETE
  USING (is_email_allowed() AND has_role(auth.uid(), 'manager'::app_role));
