-- Create the new pre-contract project
INSERT INTO projects (name, created_by, status)
VALUES ('הרצל 66', 'ffa60bcf-9085-4c92-a159-8436751f8bdb', 'pre_contract');

-- Copy all measurement rows from project 1, mapping item_code -> contract_item
INSERT INTO measurement_rows (
  project_id, floor_label, apartment_label, sheet_name,
  location_in_apartment, opening_no, contract_item,
  height, width, notes, field_notes, mamad, depth,
  glyph, jamb_height, is_manual, engine_side,
  internal_wing, wing_position, wing_position_out
)
SELECT
  (SELECT id FROM projects WHERE name = 'הרצל 66' AND status = 'pre_contract' ORDER BY created_at DESC LIMIT 1),
  floor_label, apartment_label, sheet_name,
  location_in_apartment, opening_no, item_code,
  height, width, notes, field_notes, mamad, depth,
  glyph, jamb_height, is_manual, engine_side,
  internal_wing, wing_position, wing_position_out
FROM measurement_rows
WHERE project_id = 1
ORDER BY floor_label, apartment_label, opening_no;