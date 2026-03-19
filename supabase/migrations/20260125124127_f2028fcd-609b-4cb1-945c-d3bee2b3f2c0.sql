-- =====================================================
-- 3-Stage Project Lifecycle Database Schema Changes
-- =====================================================

-- 1.2 Add measurement rule and conversion timestamp to projects
ALTER TABLE public.projects 
ADD COLUMN IF NOT EXISTS measurement_rule TEXT CHECK (measurement_rule IN ('baranovitz', 'conventional')),
ADD COLUMN IF NOT EXISTS converted_to_measurement_at TIMESTAMPTZ;

-- 1.3 Link running projects back to their measurement source
ALTER TABLE public.projects
ADD COLUMN IF NOT EXISTS source_measurement_project_id BIGINT REFERENCES public.projects(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS production_batch_label TEXT;

-- 1.4 Track exported floors and enforce floor locking
CREATE TABLE IF NOT EXISTS public.measurement_floor_exports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  measurement_project_id BIGINT NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  running_project_id BIGINT NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  floor_label TEXT NOT NULL,
  exported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  exported_by UUID REFERENCES auth.users(id),
  
  -- Unique constraint: prevent exporting the same floor twice from the same measurement project
  UNIQUE (measurement_project_id, floor_label)
);

-- Enable RLS on the new table
ALTER TABLE public.measurement_floor_exports ENABLE ROW LEVEL SECURITY;

-- RLS policies for measurement_floor_exports
CREATE POLICY "Allowed users can view measurement floor exports"
ON public.measurement_floor_exports
FOR SELECT
USING (is_email_allowed());

CREATE POLICY "Allowed users can create measurement floor exports"
ON public.measurement_floor_exports
FOR INSERT
WITH CHECK (
  is_email_allowed() AND 
  (
    EXISTS (
      SELECT 1 FROM projects 
      WHERE projects.id = measurement_floor_exports.measurement_project_id 
      AND (projects.created_by = auth.uid() OR is_app_owner())
    )
  )
);

CREATE POLICY "Allowed users can delete measurement floor exports"
ON public.measurement_floor_exports
FOR DELETE
USING (
  is_email_allowed() AND 
  (
    EXISTS (
      SELECT 1 FROM projects 
      WHERE projects.id = measurement_floor_exports.measurement_project_id 
      AND (projects.created_by = auth.uid() OR is_app_owner())
    ) OR is_app_owner()
  )
);

-- 1.5 Helper function to check if a floor is locked (exported)
CREATE OR REPLACE FUNCTION public.is_floor_locked(p_project_id BIGINT, p_floor_label TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.measurement_floor_exports
    WHERE measurement_project_id = p_project_id
    AND floor_label = p_floor_label
  )
$$;

-- 1.5 Trigger function to prevent modifications to exported measurement rows
CREATE OR REPLACE FUNCTION public.prevent_locked_floor_modification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- For INSERT and UPDATE, check the NEW record
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    IF EXISTS (
      SELECT 1 FROM public.measurement_floor_exports
      WHERE measurement_project_id = NEW.project_id
      AND floor_label = NEW.floor_label
    ) THEN
      RAISE EXCEPTION 'Cannot modify measurement row: floor "%" has been exported to production', NEW.floor_label;
    END IF;
    RETURN NEW;
  END IF;
  
  -- For DELETE, check the OLD record
  IF TG_OP = 'DELETE' THEN
    IF EXISTS (
      SELECT 1 FROM public.measurement_floor_exports
      WHERE measurement_project_id = OLD.project_id
      AND floor_label = OLD.floor_label
    ) THEN
      RAISE EXCEPTION 'Cannot delete measurement row: floor "%" has been exported to production', OLD.floor_label;
    END IF;
    RETURN OLD;
  END IF;
  
  RETURN NULL;
END;
$$;

-- Create the trigger on measurement_rows
DROP TRIGGER IF EXISTS trg_prevent_locked_floor_modification ON public.measurement_rows;
CREATE TRIGGER trg_prevent_locked_floor_modification
BEFORE INSERT OR UPDATE OR DELETE ON public.measurement_rows
FOR EACH ROW
EXECUTE FUNCTION public.prevent_locked_floor_modification();

-- Add index for faster floor locking checks
CREATE INDEX IF NOT EXISTS idx_measurement_floor_exports_lookup 
ON public.measurement_floor_exports(measurement_project_id, floor_label);

-- Add index for looking up running projects by source
CREATE INDEX IF NOT EXISTS idx_projects_source_measurement 
ON public.projects(source_measurement_project_id) 
WHERE source_measurement_project_id IS NOT NULL;