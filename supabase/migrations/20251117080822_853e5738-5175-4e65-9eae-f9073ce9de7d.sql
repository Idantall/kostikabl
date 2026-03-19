-- Add motor_side column to items table for דלת מונובלוק and חלון מונובלוק
ALTER TABLE public.items 
ADD COLUMN motor_side TEXT;