-- Enable realtime for measurement_rows table
ALTER TABLE public.measurement_rows REPLICA IDENTITY FULL;

-- Add table to realtime publication if not already added
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND schemaname = 'public' 
    AND tablename = 'measurement_rows'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.measurement_rows;
  END IF;
END $$;