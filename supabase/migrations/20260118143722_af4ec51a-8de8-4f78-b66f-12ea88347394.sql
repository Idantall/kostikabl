-- Create project_folders table
CREATE TABLE public.project_folders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.project_folders ENABLE ROW LEVEL SECURITY;

-- All authenticated users can view folders
CREATE POLICY "Authenticated users can view folders"
ON public.project_folders FOR SELECT
TO authenticated
USING (true);

-- Managers and owners can create folders
CREATE POLICY "Managers can create folders"
ON public.project_folders FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'manager'));

-- Managers and owners can update folders
CREATE POLICY "Managers can update folders"
ON public.project_folders FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'manager'));

-- Managers and owners can delete folders
CREATE POLICY "Managers can delete folders"
ON public.project_folders FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'manager'));

-- Add folder_id column to projects table
ALTER TABLE public.projects ADD COLUMN folder_id UUID REFERENCES public.project_folders(id) ON DELETE SET NULL;

-- Create stations table for customizable stations
CREATE TABLE public.stations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.stations ENABLE ROW LEVEL SECURITY;

-- All authenticated users can view stations
CREATE POLICY "Authenticated users can view stations"
ON public.stations FOR SELECT
TO authenticated
USING (true);

-- Only owners can manage stations
CREATE POLICY "Owners can manage stations"
ON public.stations FOR ALL
TO authenticated
USING (public.is_app_owner())
WITH CHECK (public.is_app_owner());

-- Seed default stations
INSERT INTO public.stations (name) VALUES 
  ('חיתוך'),
  ('הרכבה'),
  ('זיגוג'),
  ('אריזה'),
  ('בדיקה');

-- Update timestamp trigger for project_folders
CREATE TRIGGER update_project_folders_updated_at
BEFORE UPDATE ON public.project_folders
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();