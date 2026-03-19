-- Give yossi@kostika.biz full owner permissions across all tables

-- Helper function to check if user is yossi (the app owner)
CREATE OR REPLACE FUNCTION public.is_app_owner()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.email() = 'yossi@kostika.biz'
$$;

-- PROJECTS: Full access for yossi
DROP POLICY IF EXISTS "Allowed users can view projects" ON public.projects;
CREATE POLICY "Allowed users can view projects" 
ON public.projects 
FOR SELECT 
USING (
  is_email_allowed() AND (
    created_by = auth.uid() 
    OR is_app_owner()
  )
);

DROP POLICY IF EXISTS "Allowed users can update projects" ON public.projects;
CREATE POLICY "Allowed users can update projects" 
ON public.projects 
FOR UPDATE 
USING (
  is_email_allowed() AND (
    created_by = auth.uid() 
    OR is_app_owner()
  )
);

DROP POLICY IF EXISTS "Allowed users can delete projects" ON public.projects;
CREATE POLICY "Allowed users can delete projects" 
ON public.projects 
FOR DELETE 
USING (
  is_email_allowed() AND (
    created_by = auth.uid() 
    OR is_app_owner()
  )
);

-- FLOORS: Full access for yossi
DROP POLICY IF EXISTS "Allowed users can create floors" ON public.floors;
CREATE POLICY "Allowed users can create floors" 
ON public.floors 
FOR INSERT 
WITH CHECK (
  is_email_allowed() AND (
    EXISTS (SELECT 1 FROM projects WHERE projects.id = floors.project_id AND projects.created_by = auth.uid())
    OR is_app_owner()
  )
);

DROP POLICY IF EXISTS "Allowed users can update floors" ON public.floors;
CREATE POLICY "Allowed users can update floors" 
ON public.floors 
FOR UPDATE 
USING (
  is_email_allowed() AND (
    EXISTS (SELECT 1 FROM projects WHERE projects.id = floors.project_id AND projects.created_by = auth.uid())
    OR is_app_owner()
  )
);

DROP POLICY IF EXISTS "Allowed users can delete floors" ON public.floors;
CREATE POLICY "Allowed users can delete floors" 
ON public.floors 
FOR DELETE 
USING (
  is_email_allowed() AND (
    EXISTS (SELECT 1 FROM projects WHERE projects.id = floors.project_id AND projects.created_by = auth.uid())
    OR is_app_owner()
  )
);

-- APARTMENTS: Full access for yossi
DROP POLICY IF EXISTS "Allowed users can create apartments" ON public.apartments;
CREATE POLICY "Allowed users can create apartments" 
ON public.apartments 
FOR INSERT 
WITH CHECK (
  is_email_allowed() AND (
    EXISTS (SELECT 1 FROM projects WHERE projects.id = apartments.project_id AND projects.created_by = auth.uid())
    OR is_app_owner()
  )
);

DROP POLICY IF EXISTS "Allowed users can update apartments" ON public.apartments;
CREATE POLICY "Allowed users can update apartments" 
ON public.apartments 
FOR UPDATE 
USING (
  is_email_allowed() AND (
    EXISTS (SELECT 1 FROM projects WHERE projects.id = apartments.project_id AND projects.created_by = auth.uid())
    OR is_app_owner()
  )
);

DROP POLICY IF EXISTS "Allowed users can delete apartments" ON public.apartments;
CREATE POLICY "Allowed users can delete apartments" 
ON public.apartments 
FOR DELETE 
USING (
  is_email_allowed() AND (
    EXISTS (SELECT 1 FROM projects WHERE projects.id = apartments.project_id AND projects.created_by = auth.uid())
    OR is_app_owner()
  )
);

-- ITEMS: Full access for yossi
DROP POLICY IF EXISTS "Allowed users can create items" ON public.items;
CREATE POLICY "Allowed users can create items" 
ON public.items 
FOR INSERT 
WITH CHECK (
  is_email_allowed() AND (
    EXISTS (SELECT 1 FROM projects WHERE projects.id = items.project_id AND projects.created_by = auth.uid())
    OR is_app_owner()
  )
);

DROP POLICY IF EXISTS "Allowed users can update items" ON public.items;
CREATE POLICY "Allowed users can update items" 
ON public.items 
FOR UPDATE 
USING (is_email_allowed() OR is_app_owner())
WITH CHECK (is_email_allowed() OR is_app_owner());

DROP POLICY IF EXISTS "Allowed users can delete items" ON public.items;
CREATE POLICY "Allowed users can delete items" 
ON public.items 
FOR DELETE 
USING (
  is_email_allowed() AND (
    EXISTS (SELECT 1 FROM projects WHERE projects.id = items.project_id AND projects.created_by = auth.uid())
    OR is_app_owner()
  )
);

-- LABELS: Full access for yossi
DROP POLICY IF EXISTS "Allowed users can create labels" ON public.labels;
CREATE POLICY "Allowed users can create labels" 
ON public.labels 
FOR INSERT 
WITH CHECK (
  is_email_allowed() AND (
    EXISTS (
      SELECT 1 FROM items JOIN projects ON items.project_id = projects.id
      WHERE items.id = labels.item_id AND projects.created_by = auth.uid()
    )
    OR is_app_owner()
  )
);

DROP POLICY IF EXISTS "Allowed users can update labels" ON public.labels;
CREATE POLICY "Allowed users can update labels" 
ON public.labels 
FOR UPDATE 
USING (
  is_email_allowed() AND (
    EXISTS (
      SELECT 1 FROM items JOIN projects ON items.project_id = projects.id
      WHERE items.id = labels.item_id AND projects.created_by = auth.uid()
    )
    OR is_app_owner()
  )
);

DROP POLICY IF EXISTS "Allowed users can delete labels" ON public.labels;
CREATE POLICY "Allowed users can delete labels" 
ON public.labels 
FOR DELETE 
USING (
  is_email_allowed() AND (
    EXISTS (
      SELECT 1 FROM items JOIN projects ON items.project_id = projects.id
      WHERE items.id = labels.item_id AND projects.created_by = auth.uid()
    )
    OR is_app_owner()
  )
);

-- LABEL_JOBS: Full access for yossi
DROP POLICY IF EXISTS "Allowed users can view their jobs" ON public.label_jobs;
CREATE POLICY "Allowed users can view their jobs" 
ON public.label_jobs 
FOR SELECT 
USING (
  is_email_allowed() AND (
    EXISTS (SELECT 1 FROM projects WHERE projects.id = label_jobs.project_id AND projects.created_by = auth.uid())
    OR is_app_owner()
  )
);

-- LABEL_JOB_ITEMS: Full access for yossi
DROP POLICY IF EXISTS "Allowed users can view their job items" ON public.label_job_items;
CREATE POLICY "Allowed users can view their job items" 
ON public.label_job_items 
FOR SELECT 
USING (
  is_email_allowed() AND (
    EXISTS (
      SELECT 1 FROM label_jobs JOIN projects ON projects.id = label_jobs.project_id
      WHERE label_jobs.id = label_job_items.job_id AND projects.created_by = auth.uid()
    )
    OR is_app_owner()
  )
);

DROP POLICY IF EXISTS "Allowed users can delete their job items" ON public.label_job_items;
CREATE POLICY "Allowed users can delete their job items" 
ON public.label_job_items 
FOR DELETE 
USING (
  is_email_allowed() AND (
    EXISTS (
      SELECT 1 FROM label_jobs JOIN projects ON projects.id = label_jobs.project_id
      WHERE label_jobs.id = label_job_items.job_id AND projects.created_by = auth.uid()
    )
    OR is_app_owner()
  )
);

-- MEASUREMENT_ROWS: Full access for yossi
DROP POLICY IF EXISTS "Allowed users can view measurement rows" ON public.measurement_rows;
CREATE POLICY "Allowed users can view measurement rows" 
ON public.measurement_rows 
FOR SELECT 
USING (
  is_email_allowed() AND (
    EXISTS (SELECT 1 FROM projects WHERE projects.id = measurement_rows.project_id AND projects.created_by = auth.uid())
    OR is_app_owner()
  )
);

DROP POLICY IF EXISTS "Allowed users can create measurement rows" ON public.measurement_rows;
CREATE POLICY "Allowed users can create measurement rows" 
ON public.measurement_rows 
FOR INSERT 
WITH CHECK (
  is_email_allowed() AND (
    EXISTS (SELECT 1 FROM projects WHERE projects.id = measurement_rows.project_id AND projects.created_by = auth.uid())
    OR is_app_owner()
  )
);

DROP POLICY IF EXISTS "Allowed users can update measurement rows" ON public.measurement_rows;
CREATE POLICY "Allowed users can update measurement rows" 
ON public.measurement_rows 
FOR UPDATE 
USING (
  is_email_allowed() AND (
    EXISTS (SELECT 1 FROM projects WHERE projects.id = measurement_rows.project_id AND projects.created_by = auth.uid())
    OR is_app_owner()
  )
);

DROP POLICY IF EXISTS "Allowed users can delete measurement rows" ON public.measurement_rows;
CREATE POLICY "Allowed users can delete measurement rows" 
ON public.measurement_rows 
FOR DELETE 
USING (
  is_email_allowed() AND (
    EXISTS (SELECT 1 FROM projects WHERE projects.id = measurement_rows.project_id AND projects.created_by = auth.uid())
    OR is_app_owner()
  )
);