-- Add canonical required codes column to items
ALTER TABLE public.items
  ADD COLUMN IF NOT EXISTS required_codes text[] NOT NULL DEFAULT '{}';

-- Backfill from existing labels (prefer '00' if present, otherwise use all distinct codes)
WITH label_codes AS (
  SELECT item_id, array_agg(DISTINCT subpart_code ORDER BY subpart_code) AS codes
  FROM labels
  WHERE revoked_at IS NULL
  GROUP BY item_id
)
UPDATE items i
SET required_codes = 
  CASE
    WHEN '00' = ANY(COALESCE(l.codes, ARRAY[]::text[])) THEN ARRAY['00']
    ELSE COALESCE(l.codes, ARRAY[]::text[])
  END
FROM label_codes l
WHERE i.id = l.item_id;

-- Drop old unique index and create new one that includes source
DROP INDEX IF EXISTS idx_scans_unique_item_subpart_label;

CREATE UNIQUE INDEX IF NOT EXISTS idx_scans_unique_item_subpart_label_source
  ON public.scans(item_id, subpart_code, label_id, source);