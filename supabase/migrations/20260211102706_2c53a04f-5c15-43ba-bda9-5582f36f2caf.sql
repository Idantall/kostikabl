
-- 1. Add parent_project_id column
ALTER TABLE public.projects 
ADD COLUMN parent_project_id bigint REFERENCES public.projects(id) ON DELETE SET NULL;

-- 2. Create index for fast lookups
CREATE INDEX idx_projects_parent_project_id ON public.projects(parent_project_id);

-- 3. Backfill: set parent_project_id for active projects that came from measurement exports
UPDATE public.projects
SET parent_project_id = source_measurement_project_id
WHERE source_measurement_project_id IS NOT NULL
  AND parent_project_id IS NULL;

-- 4. Also set the measurement project itself as its own parent (group root)
UPDATE public.projects p
SET parent_project_id = p.id
WHERE p.id IN (
  SELECT DISTINCT source_measurement_project_id 
  FROM public.projects 
  WHERE source_measurement_project_id IS NOT NULL
)
AND p.parent_project_id IS NULL;

-- 5. Create aggregated view for parent project totals
CREATE OR REPLACE VIEW public.v_parent_project_totals AS
SELECT
  parent.id AS parent_project_id,
  parent.name AS parent_name,
  parent.building_code,
  parent.status AS parent_status,
  COUNT(DISTINCT child.id) AS child_count,
  COALESCE(SUM(vpt.total_items), 0)::bigint AS total_items,
  COALESCE(SUM(vpt.ready_items), 0)::bigint AS ready_items,
  COALESCE(SUM(vpt.partial_items), 0)::bigint AS partial_items,
  COALESCE(SUM(vpt.not_scanned_items), 0)::bigint AS not_scanned_items,
  COALESCE(SUM(vpt.total_floors), 0)::bigint AS total_floors,
  COALESCE(SUM(vpt.total_apartments), 0)::bigint AS total_apartments
FROM public.projects parent
JOIN public.projects child ON child.parent_project_id = parent.id AND child.id != parent.id AND child.status = 'active'
LEFT JOIN public.v_project_totals vpt ON vpt.project_id = child.id
WHERE parent.parent_project_id = parent.id  -- only root parents
GROUP BY parent.id, parent.name, parent.building_code, parent.status;
