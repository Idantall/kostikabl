-- Extend cutlist_sections to store page-level data
ALTER TABLE cutlist_sections 
ADD COLUMN IF NOT EXISTS page_number integer,
ADD COLUMN IF NOT EXISTS title text,
ADD COLUMN IF NOT EXISTS dimensions_meta text,
ADD COLUMN IF NOT EXISTS quantity_total integer,
ADD COLUMN IF NOT EXISTS technical_text text,
ADD COLUMN IF NOT EXISTS raw_page_text text;

-- Create cutlist_profile_rows table for aluminum/profile parts (right table)
CREATE TABLE IF NOT EXISTS public.cutlist_profile_rows (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  section_id uuid NOT NULL REFERENCES public.cutlist_sections(id) ON DELETE CASCADE,
  ident text, -- The זיהוי column value in the row (e.g. "8", "9*")
  qty integer NOT NULL DEFAULT 1,
  orientation text, -- H or W
  cut_length text, -- The numeric cut length
  role text, -- תפקיד/description
  profile_code text NOT NULL, -- פרופיל code
  ord integer NOT NULL DEFAULT 0,
  is_checked boolean NOT NULL DEFAULT false,
  checked_at timestamptz,
  checked_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Create cutlist_misc_rows table for accessories/parts (left/bottom table)
CREATE TABLE IF NOT EXISTS public.cutlist_misc_rows (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  section_id uuid NOT NULL REFERENCES public.cutlist_sections(id) ON DELETE CASCADE,
  qty integer NOT NULL DEFAULT 1,
  unit text, -- יח', מ', etc.
  description text NOT NULL, -- תאור
  sku_code text, -- שם-מק''ט
  ord integer NOT NULL DEFAULT 0,
  is_checked boolean NOT NULL DEFAULT false,
  checked_at timestamptz,
  checked_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Create cutlist_glass_rows table for glass/insulation parts
CREATE TABLE IF NOT EXISTS public.cutlist_glass_rows (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  section_id uuid NOT NULL REFERENCES public.cutlist_sections(id) ON DELETE CASCADE,
  code text, -- e.g. v4, z4-6-5a1
  size_text text, -- e.g. "740 x 433"
  qty integer NOT NULL DEFAULT 1,
  description text, -- תאור
  sku_name text,
  ord integer NOT NULL DEFAULT 0,
  is_checked boolean NOT NULL DEFAULT false,
  checked_at timestamptz,
  checked_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Add pdf_path column to cutlist_uploads for storing the PDF in storage
ALTER TABLE cutlist_uploads 
ADD COLUMN IF NOT EXISTS pdf_path text;

-- Enable RLS on new tables
ALTER TABLE public.cutlist_profile_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cutlist_misc_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cutlist_glass_rows ENABLE ROW LEVEL SECURITY;

-- RLS policies for cutlist_profile_rows
CREATE POLICY "Allowed users can view cutlist profile rows"
  ON public.cutlist_profile_rows FOR SELECT
  USING (is_email_allowed());

CREATE POLICY "Allowed users can create cutlist profile rows"
  ON public.cutlist_profile_rows FOR INSERT
  WITH CHECK (is_email_allowed() AND EXISTS (
    SELECT 1 FROM cutlist_sections cs
    JOIN cutlist_uploads cu ON cu.id = cs.upload_id
    WHERE cs.id = cutlist_profile_rows.section_id 
    AND (cu.uploaded_by = auth.uid() OR is_app_owner())
  ));

CREATE POLICY "Allowed users can update cutlist profile rows"
  ON public.cutlist_profile_rows FOR UPDATE
  USING (is_email_allowed());

CREATE POLICY "Allowed users can delete cutlist profile rows"
  ON public.cutlist_profile_rows FOR DELETE
  USING (is_email_allowed() AND EXISTS (
    SELECT 1 FROM cutlist_sections cs
    JOIN cutlist_uploads cu ON cu.id = cs.upload_id
    WHERE cs.id = cutlist_profile_rows.section_id 
    AND (cu.uploaded_by = auth.uid() OR is_app_owner())
  ));

-- RLS policies for cutlist_misc_rows
CREATE POLICY "Allowed users can view cutlist misc rows"
  ON public.cutlist_misc_rows FOR SELECT
  USING (is_email_allowed());

CREATE POLICY "Allowed users can create cutlist misc rows"
  ON public.cutlist_misc_rows FOR INSERT
  WITH CHECK (is_email_allowed() AND EXISTS (
    SELECT 1 FROM cutlist_sections cs
    JOIN cutlist_uploads cu ON cu.id = cs.upload_id
    WHERE cs.id = cutlist_misc_rows.section_id 
    AND (cu.uploaded_by = auth.uid() OR is_app_owner())
  ));

CREATE POLICY "Allowed users can update cutlist misc rows"
  ON public.cutlist_misc_rows FOR UPDATE
  USING (is_email_allowed());

CREATE POLICY "Allowed users can delete cutlist misc rows"
  ON public.cutlist_misc_rows FOR DELETE
  USING (is_email_allowed() AND EXISTS (
    SELECT 1 FROM cutlist_sections cs
    JOIN cutlist_uploads cu ON cu.id = cs.upload_id
    WHERE cs.id = cutlist_misc_rows.section_id 
    AND (cu.uploaded_by = auth.uid() OR is_app_owner())
  ));

-- RLS policies for cutlist_glass_rows
CREATE POLICY "Allowed users can view cutlist glass rows"
  ON public.cutlist_glass_rows FOR SELECT
  USING (is_email_allowed());

CREATE POLICY "Allowed users can create cutlist glass rows"
  ON public.cutlist_glass_rows FOR INSERT
  WITH CHECK (is_email_allowed() AND EXISTS (
    SELECT 1 FROM cutlist_sections cs
    JOIN cutlist_uploads cu ON cu.id = cs.upload_id
    WHERE cs.id = cutlist_glass_rows.section_id 
    AND (cu.uploaded_by = auth.uid() OR is_app_owner())
  ));

CREATE POLICY "Allowed users can update cutlist glass rows"
  ON public.cutlist_glass_rows FOR UPDATE
  USING (is_email_allowed());

CREATE POLICY "Allowed users can delete cutlist glass rows"
  ON public.cutlist_glass_rows FOR DELETE
  USING (is_email_allowed() AND EXISTS (
    SELECT 1 FROM cutlist_sections cs
    JOIN cutlist_uploads cu ON cu.id = cs.upload_id
    WHERE cs.id = cutlist_glass_rows.section_id 
    AND (cu.uploaded_by = auth.uid() OR is_app_owner())
  ));

-- Create a private bucket for cutlist PDFs
INSERT INTO storage.buckets (id, name, public) 
VALUES ('cutlist-pdfs', 'cutlist-pdfs', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for cutlist-pdfs bucket
CREATE POLICY "Allowed users can view cutlist pdfs"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'cutlist-pdfs' AND is_email_allowed());

CREATE POLICY "Allowed users can upload cutlist pdfs"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'cutlist-pdfs' AND is_email_allowed());

CREATE POLICY "Allowed users can delete cutlist pdfs"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'cutlist-pdfs' AND is_email_allowed());