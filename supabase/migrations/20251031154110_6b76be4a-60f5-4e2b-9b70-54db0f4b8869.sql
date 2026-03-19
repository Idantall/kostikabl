-- Enable realtime for items table
ALTER TABLE public.items REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.items;

-- Enable realtime for scans table
ALTER TABLE public.scans REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.scans;

-- Create unique index for idempotent scans (one scan per item+subpart+label)
CREATE UNIQUE INDEX IF NOT EXISTS idx_scans_unique_item_subpart_label 
  ON public.scans(item_id, subpart_code, label_id);

-- Add RLS policy for public scans insertion via service role (handled by edge function)
-- The scans table already has SELECT policy for authenticated users
-- We don't need INSERT policy for users since inserts come through edge function with service role