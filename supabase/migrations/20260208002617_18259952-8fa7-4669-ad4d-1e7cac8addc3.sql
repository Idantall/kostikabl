-- Fix: add 'packed' to the allowed status values
ALTER TABLE public.cutlist_sections DROP CONSTRAINT cutlist_sections_status_check;
ALTER TABLE public.cutlist_sections ADD CONSTRAINT cutlist_sections_status_check CHECK (status = ANY (ARRAY['open'::text, 'done'::text, 'issue'::text, 'packed'::text]));