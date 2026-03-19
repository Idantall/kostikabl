-- Create projects table
CREATE TABLE IF NOT EXISTS public.projects (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  building_code TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create floors table
CREATE TABLE IF NOT EXISTS public.floors (
  id BIGSERIAL PRIMARY KEY,
  project_id BIGINT NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  floor_code TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create apartments table
CREATE TABLE IF NOT EXISTS public.apartments (
  id BIGSERIAL PRIMARY KEY,
  project_id BIGINT NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  floor_id BIGINT NOT NULL REFERENCES public.floors(id) ON DELETE CASCADE,
  apt_number TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create items table
CREATE TABLE IF NOT EXISTS public.items (
  id BIGSERIAL PRIMARY KEY,
  project_id BIGINT NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  floor_id BIGINT REFERENCES public.floors(id) ON DELETE SET NULL,
  apt_id BIGINT REFERENCES public.apartments(id) ON DELETE SET NULL,
  item_code TEXT NOT NULL,
  location TEXT,
  opening_no TEXT,
  width TEXT,
  height TEXT,
  notes TEXT,
  side_rl TEXT CHECK (side_rl IN ('R', 'L') OR side_rl IS NULL),
  status_cached TEXT NOT NULL DEFAULT 'NOT_SCANNED' CHECK (status_cached IN ('NOT_SCANNED', 'PARTIAL', 'READY')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create labels table
CREATE TABLE IF NOT EXISTS public.labels (
  id BIGSERIAL PRIMARY KEY,
  item_id BIGINT NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  subpart_code TEXT NOT NULL,
  qr_token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create scans table
CREATE TABLE IF NOT EXISTS public.scans (
  id BIGSERIAL PRIMARY KEY,
  item_id BIGINT NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  subpart_code TEXT NOT NULL,
  label_id BIGINT REFERENCES public.labels(id) ON DELETE SET NULL,
  scanned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source TEXT,
  ip_hash TEXT,
  UNIQUE(item_id, subpart_code, label_id)
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_projects_created_by ON public.projects(created_by);
CREATE INDEX IF NOT EXISTS idx_floors_project_id ON public.floors(project_id);
CREATE INDEX IF NOT EXISTS idx_apartments_project_id ON public.apartments(project_id);
CREATE INDEX IF NOT EXISTS idx_apartments_floor_id ON public.apartments(floor_id);
CREATE INDEX IF NOT EXISTS idx_items_project_id ON public.items(project_id);
CREATE INDEX IF NOT EXISTS idx_items_floor_id ON public.items(floor_id);
CREATE INDEX IF NOT EXISTS idx_items_apt_id ON public.items(apt_id);
CREATE INDEX IF NOT EXISTS idx_labels_item_id ON public.labels(item_id);
CREATE INDEX IF NOT EXISTS idx_scans_item_id ON public.scans(item_id);
CREATE INDEX IF NOT EXISTS idx_scans_label_id ON public.scans(label_id);

-- Create view for item status rollup
CREATE OR REPLACE VIEW public.v_item_status AS
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

-- Create view for apartment totals
CREATE OR REPLACE VIEW public.v_apartment_totals AS
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

-- Create view for floor totals
CREATE OR REPLACE VIEW public.v_floor_totals AS
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

-- Create view for project totals
CREATE OR REPLACE VIEW public.v_project_totals AS
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

-- Enable Row Level Security
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.floors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.apartments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.labels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scans ENABLE ROW LEVEL SECURITY;

-- RLS Policies for projects table
CREATE POLICY "Users can view their own projects"
  ON public.projects FOR SELECT
  USING (auth.uid() = created_by);

CREATE POLICY "Users can create their own projects"
  ON public.projects FOR INSERT
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can update their own projects"
  ON public.projects FOR UPDATE
  USING (auth.uid() = created_by);

CREATE POLICY "Users can delete their own projects"
  ON public.projects FOR DELETE
  USING (auth.uid() = created_by);

-- RLS Policies for floors table
CREATE POLICY "Users can view floors of their projects"
  ON public.floors FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.projects
      WHERE projects.id = floors.project_id
      AND projects.created_by = auth.uid()
    )
  );

CREATE POLICY "Users can create floors in their projects"
  ON public.floors FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.projects
      WHERE projects.id = floors.project_id
      AND projects.created_by = auth.uid()
    )
  );

CREATE POLICY "Users can update floors in their projects"
  ON public.floors FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.projects
      WHERE projects.id = floors.project_id
      AND projects.created_by = auth.uid()
    )
  );

CREATE POLICY "Users can delete floors in their projects"
  ON public.floors FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.projects
      WHERE projects.id = floors.project_id
      AND projects.created_by = auth.uid()
    )
  );

-- RLS Policies for apartments table
CREATE POLICY "Users can view apartments in their projects"
  ON public.apartments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.projects
      WHERE projects.id = apartments.project_id
      AND projects.created_by = auth.uid()
    )
  );

CREATE POLICY "Users can create apartments in their projects"
  ON public.apartments FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.projects
      WHERE projects.id = apartments.project_id
      AND projects.created_by = auth.uid()
    )
  );

CREATE POLICY "Users can update apartments in their projects"
  ON public.apartments FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.projects
      WHERE projects.id = apartments.project_id
      AND projects.created_by = auth.uid()
    )
  );

CREATE POLICY "Users can delete apartments in their projects"
  ON public.apartments FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.projects
      WHERE projects.id = apartments.project_id
      AND projects.created_by = auth.uid()
    )
  );

-- RLS Policies for items table
CREATE POLICY "Users can view items in their projects"
  ON public.items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.projects
      WHERE projects.id = items.project_id
      AND projects.created_by = auth.uid()
    )
  );

CREATE POLICY "Users can create items in their projects"
  ON public.items FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.projects
      WHERE projects.id = items.project_id
      AND projects.created_by = auth.uid()
    )
  );

CREATE POLICY "Users can update items in their projects"
  ON public.items FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.projects
      WHERE projects.id = items.project_id
      AND projects.created_by = auth.uid()
    )
  );

CREATE POLICY "Users can delete items in their projects"
  ON public.items FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.projects
      WHERE projects.id = items.project_id
      AND projects.created_by = auth.uid()
    )
  );

-- RLS Policies for labels table
CREATE POLICY "Users can view labels for items in their projects"
  ON public.labels FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.items
      JOIN public.projects ON items.project_id = projects.id
      WHERE items.id = labels.item_id
      AND projects.created_by = auth.uid()
    )
  );

CREATE POLICY "Users can create labels for items in their projects"
  ON public.labels FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.items
      JOIN public.projects ON items.project_id = projects.id
      WHERE items.id = labels.item_id
      AND projects.created_by = auth.uid()
    )
  );

CREATE POLICY "Users can update labels for items in their projects"
  ON public.labels FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.items
      JOIN public.projects ON items.project_id = projects.id
      WHERE items.id = labels.item_id
      AND projects.created_by = auth.uid()
    )
  );

CREATE POLICY "Users can delete labels for items in their projects"
  ON public.labels FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.items
      JOIN public.projects ON items.project_id = projects.id
      WHERE items.id = labels.item_id
      AND projects.created_by = auth.uid()
    )
  );

-- RLS Policies for scans table (allow reads for project owners, writes via edge function)
CREATE POLICY "Users can view scans for items in their projects"
  ON public.scans FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.items
      JOIN public.projects ON items.project_id = projects.id
      WHERE items.id = scans.item_id
      AND projects.created_by = auth.uid()
    )
  );