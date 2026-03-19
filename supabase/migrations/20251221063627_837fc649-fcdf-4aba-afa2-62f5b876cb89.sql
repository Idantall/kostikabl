-- Create function to update timestamps if it doesn't exist
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Add project status column
ALTER TABLE public.projects 
ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';

-- Add constraint for valid status values (drop first if exists)
ALTER TABLE public.projects
DROP CONSTRAINT IF EXISTS projects_status_check;

ALTER TABLE public.projects
ADD CONSTRAINT projects_status_check CHECK (status IN ('measurement', 'active'));

-- Create measurement_rows table for editable measurement data
CREATE TABLE IF NOT EXISTS public.measurement_rows (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id bigint NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  floor_label text,
  apartment_label text,
  sheet_name text,
  location_in_apartment text,
  opening_no text,
  item_code text,
  height text,
  width text,
  notes text,
  field_notes text,
  wall_thickness text,
  glyph text,
  jamb_height text,
  engine_side text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS on measurement_rows
ALTER TABLE public.measurement_rows ENABLE ROW LEVEL SECURITY;

-- RLS policies for measurement_rows (drop first if exist)
DROP POLICY IF EXISTS "Allowed users can view measurement rows" ON public.measurement_rows;
DROP POLICY IF EXISTS "Allowed users can create measurement rows" ON public.measurement_rows;
DROP POLICY IF EXISTS "Allowed users can update measurement rows" ON public.measurement_rows;
DROP POLICY IF EXISTS "Allowed users can delete measurement rows" ON public.measurement_rows;

CREATE POLICY "Allowed users can view measurement rows"
ON public.measurement_rows
FOR SELECT
USING (is_email_allowed() AND (EXISTS (
  SELECT 1 FROM projects
  WHERE projects.id = measurement_rows.project_id AND projects.created_by = auth.uid()
)));

CREATE POLICY "Allowed users can create measurement rows"
ON public.measurement_rows
FOR INSERT
WITH CHECK (is_email_allowed() AND (EXISTS (
  SELECT 1 FROM projects
  WHERE projects.id = measurement_rows.project_id AND projects.created_by = auth.uid()
)));

CREATE POLICY "Allowed users can update measurement rows"
ON public.measurement_rows
FOR UPDATE
USING (is_email_allowed() AND (EXISTS (
  SELECT 1 FROM projects
  WHERE projects.id = measurement_rows.project_id AND projects.created_by = auth.uid()
)));

CREATE POLICY "Allowed users can delete measurement rows"
ON public.measurement_rows
FOR DELETE
USING (is_email_allowed() AND (EXISTS (
  SELECT 1 FROM projects
  WHERE projects.id = measurement_rows.project_id AND projects.created_by = auth.uid()
)));

-- Create trigger for updated_at (drop first if exists)
DROP TRIGGER IF EXISTS update_measurement_rows_updated_at ON public.measurement_rows;
CREATE TRIGGER update_measurement_rows_updated_at
BEFORE UPDATE ON public.measurement_rows
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create storage bucket for measurement Excel files
INSERT INTO storage.buckets (id, name, public)
VALUES ('measurement-excels', 'measurement-excels', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for measurement-excels bucket (drop first if exist)
DROP POLICY IF EXISTS "Users can upload measurement excels" ON storage.objects;
DROP POLICY IF EXISTS "Users can view their measurement excels" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their measurement excels" ON storage.objects;

CREATE POLICY "Users can upload measurement excels"
ON storage.objects
FOR INSERT
WITH CHECK (bucket_id = 'measurement-excels' AND auth.role() = 'authenticated');

CREATE POLICY "Users can view their measurement excels"
ON storage.objects
FOR SELECT
USING (bucket_id = 'measurement-excels' AND auth.role() = 'authenticated');

CREATE POLICY "Users can delete their measurement excels"
ON storage.objects
FOR DELETE
USING (bucket_id = 'measurement-excels' AND auth.role() = 'authenticated');

-- Update v_project_totals view to include status
DROP VIEW IF EXISTS public.v_project_totals;
CREATE VIEW public.v_project_totals AS
SELECT 
  p.id AS project_id,
  p.name,
  p.building_code,
  p.status,
  COALESCE(f.total_floors, 0) AS total_floors,
  COALESCE(a.total_apartments, 0) AS total_apartments,
  COALESCE(i.total_items, 0) AS total_items,
  COALESCE(i.ready_items, 0) AS ready_items,
  COALESCE(i.partial_items, 0) AS partial_items,
  COALESCE(i.not_scanned_items, 0) AS not_scanned_items
FROM projects p
LEFT JOIN (
  SELECT project_id, COUNT(*) AS total_floors
  FROM floors
  GROUP BY project_id
) f ON f.project_id = p.id
LEFT JOIN (
  SELECT project_id, COUNT(*) AS total_apartments
  FROM apartments
  GROUP BY project_id
) a ON a.project_id = p.id
LEFT JOIN (
  SELECT 
    project_id,
    COUNT(*) AS total_items,
    COUNT(*) FILTER (WHERE status_cached = 'READY') AS ready_items,
    COUNT(*) FILTER (WHERE status_cached = 'PARTIAL') AS partial_items,
    COUNT(*) FILTER (WHERE status_cached = 'NOT_SCANNED') AS not_scanned_items
  FROM items
  GROUP BY project_id
) i ON i.project_id = p.id;