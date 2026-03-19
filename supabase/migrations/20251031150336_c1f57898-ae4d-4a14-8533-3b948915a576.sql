-- Fix security definer issues by recreating views with SECURITY INVOKER
-- This ensures views run with the permissions of the calling user, not the view creator

-- Drop existing views
DROP VIEW IF EXISTS public.v_item_status CASCADE;
DROP VIEW IF EXISTS public.v_apartment_totals CASCADE;
DROP VIEW IF EXISTS public.v_floor_totals CASCADE;
DROP VIEW IF EXISTS public.v_project_totals CASCADE;

-- Recreate view for item status rollup with SECURITY INVOKER
CREATE VIEW public.v_item_status
WITH (security_invoker = true) AS
SELECT 
  i.id,
  i.project_id,
  i.floor_id,
  i.apt_id,
  i.item_code,
  i.status_cached,
  COUNT(DISTINCT s.subpart_code) as scanned_parts,
  CASE 
    WHEN COUNT(DISTINCT s.subpart_code) = 0 THEN 'NOT_SCANNED'
    WHEN COUNT(DISTINCT s.subpart_code) >= 5 THEN 'READY'
    ELSE 'PARTIAL'
  END as computed_status
FROM public.items i
LEFT JOIN public.scans s ON i.id = s.item_id
GROUP BY i.id, i.project_id, i.floor_id, i.apt_id, i.item_code, i.status_cached;

-- Recreate view for apartment totals with SECURITY INVOKER
CREATE VIEW public.v_apartment_totals
WITH (security_invoker = true) AS
SELECT 
  a.id as apartment_id,
  a.project_id,
  a.floor_id,
  a.apt_number,
  COUNT(i.id) as total_items,
  SUM(CASE WHEN i.status_cached = 'READY' THEN 1 ELSE 0 END) as ready_items,
  SUM(CASE WHEN i.status_cached = 'PARTIAL' THEN 1 ELSE 0 END) as partial_items,
  SUM(CASE WHEN i.status_cached = 'NOT_SCANNED' THEN 1 ELSE 0 END) as not_scanned_items
FROM public.apartments a
LEFT JOIN public.items i ON a.id = i.apt_id
GROUP BY a.id, a.project_id, a.floor_id, a.apt_number;

-- Recreate view for floor totals with SECURITY INVOKER
CREATE VIEW public.v_floor_totals
WITH (security_invoker = true) AS
SELECT 
  f.id as floor_id,
  f.project_id,
  f.floor_code,
  COUNT(DISTINCT a.id) as total_apartments,
  COUNT(DISTINCT i.id) as total_items,
  SUM(CASE WHEN i.status_cached = 'READY' THEN 1 ELSE 0 END) as ready_items,
  SUM(CASE WHEN i.status_cached = 'PARTIAL' THEN 1 ELSE 0 END) as partial_items,
  SUM(CASE WHEN i.status_cached = 'NOT_SCANNED' THEN 1 ELSE 0 END) as not_scanned_items
FROM public.floors f
LEFT JOIN public.apartments a ON f.id = a.floor_id
LEFT JOIN public.items i ON f.id = i.floor_id
GROUP BY f.id, f.project_id, f.floor_code;

-- Recreate view for project totals with SECURITY INVOKER
CREATE VIEW public.v_project_totals
WITH (security_invoker = true) AS
SELECT 
  p.id as project_id,
  p.name,
  p.building_code,
  COUNT(DISTINCT f.id) as total_floors,
  COUNT(DISTINCT a.id) as total_apartments,
  COUNT(DISTINCT i.id) as total_items,
  SUM(CASE WHEN i.status_cached = 'READY' THEN 1 ELSE 0 END) as ready_items,
  SUM(CASE WHEN i.status_cached = 'PARTIAL' THEN 1 ELSE 0 END) as partial_items,
  SUM(CASE WHEN i.status_cached = 'NOT_SCANNED' THEN 1 ELSE 0 END) as not_scanned_items
FROM public.projects p
LEFT JOIN public.floors f ON p.id = f.project_id
LEFT JOIN public.apartments a ON p.id = a.project_id
LEFT JOIN public.items i ON p.id = i.project_id
GROUP BY p.id, p.name, p.building_code;