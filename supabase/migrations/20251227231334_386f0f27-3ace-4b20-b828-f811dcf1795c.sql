-- Add field_notes column to items table for storing field-specific notes
ALTER TABLE public.items 
ADD COLUMN IF NOT EXISTS field_notes text;