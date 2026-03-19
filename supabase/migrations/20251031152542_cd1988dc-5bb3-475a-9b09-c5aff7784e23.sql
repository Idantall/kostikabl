-- Create allow-list table for authorized users
CREATE TABLE IF NOT EXISTS public.allowed_emails (
  email TEXT PRIMARY KEY
);

-- Insert the 3 authorized users
INSERT INTO public.allowed_emails (email) VALUES
  ('yossi@kostika.biz'),
  ('idantal92@gmail.com'),
  ('test@test.com')
ON CONFLICT (email) DO NOTHING;

-- Helper function to check if user email is in allow-list
CREATE OR REPLACE FUNCTION public.is_email_allowed()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.allowed_emails 
    WHERE email = auth.email()
  );
$$;

-- Update RLS policies for projects table
DROP POLICY IF EXISTS "Users can view their own projects" ON public.projects;
DROP POLICY IF EXISTS "Users can create their own projects" ON public.projects;
DROP POLICY IF EXISTS "Users can update their own projects" ON public.projects;
DROP POLICY IF EXISTS "Users can delete their own projects" ON public.projects;

CREATE POLICY "Allowed users can view projects" ON public.projects
  FOR SELECT USING (public.is_email_allowed());

CREATE POLICY "Allowed users can create projects" ON public.projects
  FOR INSERT WITH CHECK (public.is_email_allowed() AND auth.uid() = created_by);

CREATE POLICY "Allowed users can update projects" ON public.projects
  FOR UPDATE USING (public.is_email_allowed() AND auth.uid() = created_by);

CREATE POLICY "Allowed users can delete projects" ON public.projects
  FOR DELETE USING (public.is_email_allowed() AND auth.uid() = created_by);

-- Update RLS policies for floors table
DROP POLICY IF EXISTS "Users can view floors of their projects" ON public.floors;
DROP POLICY IF EXISTS "Users can create floors in their projects" ON public.floors;
DROP POLICY IF EXISTS "Users can update floors in their projects" ON public.floors;
DROP POLICY IF EXISTS "Users can delete floors in their projects" ON public.floors;

CREATE POLICY "Allowed users can view floors" ON public.floors
  FOR SELECT USING (
    public.is_email_allowed() AND
    EXISTS (SELECT 1 FROM projects WHERE projects.id = floors.project_id AND projects.created_by = auth.uid())
  );

CREATE POLICY "Allowed users can create floors" ON public.floors
  FOR INSERT WITH CHECK (
    public.is_email_allowed() AND
    EXISTS (SELECT 1 FROM projects WHERE projects.id = floors.project_id AND projects.created_by = auth.uid())
  );

CREATE POLICY "Allowed users can update floors" ON public.floors
  FOR UPDATE USING (
    public.is_email_allowed() AND
    EXISTS (SELECT 1 FROM projects WHERE projects.id = floors.project_id AND projects.created_by = auth.uid())
  );

CREATE POLICY "Allowed users can delete floors" ON public.floors
  FOR DELETE USING (
    public.is_email_allowed() AND
    EXISTS (SELECT 1 FROM projects WHERE projects.id = floors.project_id AND projects.created_by = auth.uid())
  );

-- Update RLS policies for apartments table
DROP POLICY IF EXISTS "Users can view apartments in their projects" ON public.apartments;
DROP POLICY IF EXISTS "Users can create apartments in their projects" ON public.apartments;
DROP POLICY IF EXISTS "Users can update apartments in their projects" ON public.apartments;
DROP POLICY IF EXISTS "Users can delete apartments in their projects" ON public.apartments;

CREATE POLICY "Allowed users can view apartments" ON public.apartments
  FOR SELECT USING (
    public.is_email_allowed() AND
    EXISTS (SELECT 1 FROM projects WHERE projects.id = apartments.project_id AND projects.created_by = auth.uid())
  );

CREATE POLICY "Allowed users can create apartments" ON public.apartments
  FOR INSERT WITH CHECK (
    public.is_email_allowed() AND
    EXISTS (SELECT 1 FROM projects WHERE projects.id = apartments.project_id AND projects.created_by = auth.uid())
  );

CREATE POLICY "Allowed users can update apartments" ON public.apartments
  FOR UPDATE USING (
    public.is_email_allowed() AND
    EXISTS (SELECT 1 FROM projects WHERE projects.id = apartments.project_id AND projects.created_by = auth.uid())
  );

CREATE POLICY "Allowed users can delete apartments" ON public.apartments
  FOR DELETE USING (
    public.is_email_allowed() AND
    EXISTS (SELECT 1 FROM projects WHERE projects.id = apartments.project_id AND projects.created_by = auth.uid())
  );

-- Update RLS policies for items table
DROP POLICY IF EXISTS "Users can view items in their projects" ON public.items;
DROP POLICY IF EXISTS "Users can create items in their projects" ON public.items;
DROP POLICY IF EXISTS "Users can update items in their projects" ON public.items;
DROP POLICY IF EXISTS "Users can delete items in their projects" ON public.items;

CREATE POLICY "Allowed users can view items" ON public.items
  FOR SELECT USING (
    public.is_email_allowed() AND
    EXISTS (SELECT 1 FROM projects WHERE projects.id = items.project_id AND projects.created_by = auth.uid())
  );

CREATE POLICY "Allowed users can create items" ON public.items
  FOR INSERT WITH CHECK (
    public.is_email_allowed() AND
    EXISTS (SELECT 1 FROM projects WHERE projects.id = items.project_id AND projects.created_by = auth.uid())
  );

CREATE POLICY "Allowed users can update items" ON public.items
  FOR UPDATE USING (
    public.is_email_allowed() AND
    EXISTS (SELECT 1 FROM projects WHERE projects.id = items.project_id AND projects.created_by = auth.uid())
  );

CREATE POLICY "Allowed users can delete items" ON public.items
  FOR DELETE USING (
    public.is_email_allowed() AND
    EXISTS (SELECT 1 FROM projects WHERE projects.id = items.project_id AND projects.created_by = auth.uid())
  );

-- Update RLS policies for labels table
DROP POLICY IF EXISTS "Users can view labels for items in their projects" ON public.labels;
DROP POLICY IF EXISTS "Users can create labels for items in their projects" ON public.labels;
DROP POLICY IF EXISTS "Users can update labels for items in their projects" ON public.labels;
DROP POLICY IF EXISTS "Users can delete labels for items in their projects" ON public.labels;

CREATE POLICY "Allowed users can view labels" ON public.labels
  FOR SELECT USING (
    public.is_email_allowed() AND
    EXISTS (
      SELECT 1 FROM items 
      JOIN projects ON items.project_id = projects.id 
      WHERE items.id = labels.item_id AND projects.created_by = auth.uid()
    )
  );

CREATE POLICY "Allowed users can create labels" ON public.labels
  FOR INSERT WITH CHECK (
    public.is_email_allowed() AND
    EXISTS (
      SELECT 1 FROM items 
      JOIN projects ON items.project_id = projects.id 
      WHERE items.id = labels.item_id AND projects.created_by = auth.uid()
    )
  );

CREATE POLICY "Allowed users can update labels" ON public.labels
  FOR UPDATE USING (
    public.is_email_allowed() AND
    EXISTS (
      SELECT 1 FROM items 
      JOIN projects ON items.project_id = projects.id 
      WHERE items.id = labels.item_id AND projects.created_by = auth.uid()
    )
  );

CREATE POLICY "Allowed users can delete labels" ON public.labels
  FOR DELETE USING (
    public.is_email_allowed() AND
    EXISTS (
      SELECT 1 FROM items 
      JOIN projects ON items.project_id = projects.id 
      WHERE items.id = labels.item_id AND projects.created_by = auth.uid()
    )
  );

-- Update RLS policies for scans table (read-only for users)
DROP POLICY IF EXISTS "Users can view scans for items in their projects" ON public.scans;

CREATE POLICY "Allowed users can view scans" ON public.scans
  FOR SELECT USING (
    public.is_email_allowed() AND
    EXISTS (
      SELECT 1 FROM items 
      JOIN projects ON items.project_id = projects.id 
      WHERE items.id = scans.item_id AND projects.created_by = auth.uid()
    )
  );