-- Create cutlist uploads table
CREATE TABLE public.cutlist_uploads (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  filename text NOT NULL,
  project_name text,
  uploaded_by uuid REFERENCES auth.users(id),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'active'
);

-- Create cutlist sections table (windows/shutters)
CREATE TABLE public.cutlist_sections (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  upload_id uuid NOT NULL REFERENCES public.cutlist_uploads(id) ON DELETE CASCADE,
  section_ref text NOT NULL,
  section_name text,
  notes text,
  ord integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create cutlist items table (profile rows)
CREATE TABLE public.cutlist_items (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  section_id uuid NOT NULL REFERENCES public.cutlist_sections(id) ON DELETE CASCADE,
  profile_code text NOT NULL,
  description text,
  dimensions text,
  required_qty integer NOT NULL DEFAULT 1,
  is_checked boolean NOT NULL DEFAULT false,
  checked_at timestamp with time zone,
  checked_by uuid REFERENCES auth.users(id),
  ord integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.cutlist_uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cutlist_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cutlist_items ENABLE ROW LEVEL SECURITY;

-- RLS Policies for cutlist_uploads
CREATE POLICY "Allowed users can view cutlist uploads" 
ON public.cutlist_uploads FOR SELECT 
USING (is_email_allowed());

CREATE POLICY "Allowed users can create cutlist uploads" 
ON public.cutlist_uploads FOR INSERT 
WITH CHECK (is_email_allowed() AND auth.uid() = uploaded_by);

CREATE POLICY "Allowed users can update their cutlist uploads" 
ON public.cutlist_uploads FOR UPDATE 
USING (is_email_allowed() AND (uploaded_by = auth.uid() OR is_app_owner()));

CREATE POLICY "Allowed users can delete their cutlist uploads" 
ON public.cutlist_uploads FOR DELETE 
USING (is_email_allowed() AND (uploaded_by = auth.uid() OR is_app_owner()));

-- RLS Policies for cutlist_sections
CREATE POLICY "Allowed users can view cutlist sections" 
ON public.cutlist_sections FOR SELECT 
USING (is_email_allowed());

CREATE POLICY "Allowed users can create cutlist sections" 
ON public.cutlist_sections FOR INSERT 
WITH CHECK (is_email_allowed() AND EXISTS (
  SELECT 1 FROM public.cutlist_uploads 
  WHERE id = cutlist_sections.upload_id AND (uploaded_by = auth.uid() OR is_app_owner())
));

CREATE POLICY "Allowed users can update cutlist sections" 
ON public.cutlist_sections FOR UPDATE 
USING (is_email_allowed() AND EXISTS (
  SELECT 1 FROM public.cutlist_uploads 
  WHERE id = cutlist_sections.upload_id AND (uploaded_by = auth.uid() OR is_app_owner())
));

CREATE POLICY "Allowed users can delete cutlist sections" 
ON public.cutlist_sections FOR DELETE 
USING (is_email_allowed() AND EXISTS (
  SELECT 1 FROM public.cutlist_uploads 
  WHERE id = cutlist_sections.upload_id AND (uploaded_by = auth.uid() OR is_app_owner())
));

-- RLS Policies for cutlist_items
CREATE POLICY "Allowed users can view cutlist items" 
ON public.cutlist_items FOR SELECT 
USING (is_email_allowed());

CREATE POLICY "Allowed users can create cutlist items" 
ON public.cutlist_items FOR INSERT 
WITH CHECK (is_email_allowed() AND EXISTS (
  SELECT 1 FROM public.cutlist_sections cs
  JOIN public.cutlist_uploads cu ON cu.id = cs.upload_id
  WHERE cs.id = cutlist_items.section_id AND (cu.uploaded_by = auth.uid() OR is_app_owner())
));

CREATE POLICY "Allowed users can update cutlist items" 
ON public.cutlist_items FOR UPDATE 
USING (is_email_allowed());

CREATE POLICY "Allowed users can delete cutlist items" 
ON public.cutlist_items FOR DELETE 
USING (is_email_allowed() AND EXISTS (
  SELECT 1 FROM public.cutlist_sections cs
  JOIN public.cutlist_uploads cu ON cu.id = cs.upload_id
  WHERE cs.id = cutlist_items.section_id AND (cu.uploaded_by = auth.uid() OR is_app_owner())
));

-- Create indexes for performance
CREATE INDEX idx_cutlist_sections_upload_id ON public.cutlist_sections(upload_id);
CREATE INDEX idx_cutlist_items_section_id ON public.cutlist_items(section_id);
CREATE INDEX idx_cutlist_items_profile_code ON public.cutlist_items(profile_code);