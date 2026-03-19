-- Drop existing measurement_rows policies
DROP POLICY IF EXISTS "Allowed users can view measurement rows" ON public.measurement_rows;
DROP POLICY IF EXISTS "Allowed users can create measurement rows" ON public.measurement_rows;
DROP POLICY IF EXISTS "Allowed users can update measurement rows" ON public.measurement_rows;
DROP POLICY IF EXISTS "Allowed users can delete measurement rows" ON public.measurement_rows;

-- Create new policies that allow yossi@kostika.biz to access measurement mode projects

-- View: Owner OR yossi@kostika.biz for measurement projects
CREATE POLICY "Allowed users can view measurement rows" 
ON public.measurement_rows 
FOR SELECT 
USING (
  is_email_allowed() AND (
    EXISTS (
      SELECT 1 FROM projects 
      WHERE projects.id = measurement_rows.project_id 
      AND projects.created_by = auth.uid()
    )
    OR (
      auth.email() = 'yossi@kostika.biz' 
      AND EXISTS (
        SELECT 1 FROM projects 
        WHERE projects.id = measurement_rows.project_id 
        AND projects.status = 'measurement'
      )
    )
  )
);

-- Create: Owner OR yossi@kostika.biz for measurement projects
CREATE POLICY "Allowed users can create measurement rows" 
ON public.measurement_rows 
FOR INSERT 
WITH CHECK (
  is_email_allowed() AND (
    EXISTS (
      SELECT 1 FROM projects 
      WHERE projects.id = measurement_rows.project_id 
      AND projects.created_by = auth.uid()
    )
    OR (
      auth.email() = 'yossi@kostika.biz' 
      AND EXISTS (
        SELECT 1 FROM projects 
        WHERE projects.id = measurement_rows.project_id 
        AND projects.status = 'measurement'
      )
    )
  )
);

-- Update: Owner OR yossi@kostika.biz for measurement projects
CREATE POLICY "Allowed users can update measurement rows" 
ON public.measurement_rows 
FOR UPDATE 
USING (
  is_email_allowed() AND (
    EXISTS (
      SELECT 1 FROM projects 
      WHERE projects.id = measurement_rows.project_id 
      AND projects.created_by = auth.uid()
    )
    OR (
      auth.email() = 'yossi@kostika.biz' 
      AND EXISTS (
        SELECT 1 FROM projects 
        WHERE projects.id = measurement_rows.project_id 
        AND projects.status = 'measurement'
      )
    )
  )
);

-- Delete: Owner OR yossi@kostika.biz for measurement projects
CREATE POLICY "Allowed users can delete measurement rows" 
ON public.measurement_rows 
FOR DELETE 
USING (
  is_email_allowed() AND (
    EXISTS (
      SELECT 1 FROM projects 
      WHERE projects.id = measurement_rows.project_id 
      AND projects.created_by = auth.uid()
    )
    OR (
      auth.email() = 'yossi@kostika.biz' 
      AND EXISTS (
        SELECT 1 FROM projects 
        WHERE projects.id = measurement_rows.project_id 
        AND projects.status = 'measurement'
      )
    )
  )
);

-- Also update projects view policy to allow yossi@kostika.biz to see measurement projects
DROP POLICY IF EXISTS "Allowed users can view projects" ON public.projects;
CREATE POLICY "Allowed users can view projects" 
ON public.projects 
FOR SELECT 
USING (
  is_email_allowed() AND (
    created_by = auth.uid()
    OR (auth.email() = 'yossi@kostika.biz' AND status = 'measurement')
  )
);