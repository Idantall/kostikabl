DROP TRIGGER IF EXISTS trg_prevent_locked_floor_modification ON public.measurement_rows;
DROP FUNCTION IF EXISTS public.prevent_locked_floor_modification();
DROP FUNCTION IF EXISTS public.is_floor_locked(bigint, text);