-- Add format column to label_jobs table for roll/A4 selection
ALTER TABLE public.label_jobs 
ADD COLUMN IF NOT EXISTS format TEXT DEFAULT 'a4_big';