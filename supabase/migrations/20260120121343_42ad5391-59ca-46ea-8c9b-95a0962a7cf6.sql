-- Add segments_json column to optimization_patterns for storing enhanced segment data
-- This includes part_ids and cut indicators (straight/angle) per segment
ALTER TABLE public.optimization_patterns
ADD COLUMN IF NOT EXISTS segments_json JSONB;

-- Add comment explaining the structure
COMMENT ON COLUMN public.optimization_patterns.segments_json IS 'Enhanced segment data: [{length_mm: number, part_ids: string[], cut_left: "straight"|"angle", cut_right: "straight"|"angle"}]';