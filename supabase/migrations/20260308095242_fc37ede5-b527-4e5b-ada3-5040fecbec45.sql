
DO $$
DECLARE
  draft_floors jsonb;
  building_c3 jsonb;
  apt_rec record;
  row_rec record;
  floors_arr jsonb := '[]'::jsonb;
  apts_arr jsonb;
  rows_arr jsonb;
  floor_labels text[] := ARRAY['קרקע', '1', '2', '3', '4', '5'];
  fl text;
BEGIN
  FOREACH fl IN ARRAY floor_labels LOOP
    apts_arr := '[]'::jsonb;
    
    FOR apt_rec IN 
      SELECT apartment_label 
      FROM (SELECT DISTINCT apartment_label FROM measurement_rows WHERE project_id = 295 AND floor_label = fl) sub
      ORDER BY apartment_label::int
    LOOP
      rows_arr := '[]'::jsonb;
      
      FOR row_rec IN 
        SELECT opening_no, item_code, width, height, depth, hinge_direction, 
               mamad, notes, engine_side, location_in_apartment, contract_item
        FROM measurement_rows 
        WHERE project_id = 295 AND floor_label = fl AND apartment_label = apt_rec.apartment_label
        ORDER BY opening_no::int
      LOOP
        rows_arr := rows_arr || jsonb_build_object(
          'id', gen_random_uuid(),
          'opening_no', row_rec.opening_no::int,
          'location_in_apartment', row_rec.location_in_apartment,
          'contract_item', row_rec.contract_item,
          'item_code', row_rec.item_code,
          'height', row_rec.height,
          'height_overridden', CASE WHEN row_rec.height IS NOT NULL THEN true ELSE false END,
          'width', row_rec.width,
          'width_overridden', CASE WHEN row_rec.width IS NOT NULL THEN true ELSE false END,
          'notes', row_rec.notes,
          'hinge_direction', row_rec.hinge_direction,
          'mamad', row_rec.mamad,
          'glyph', null,
          'jamb_height', null,
          'depth', row_rec.depth,
          'is_manual', false,
          'engine_side', row_rec.engine_side,
          'angle1', null,
          'angle2', null
        );
      END LOOP;
      
      apts_arr := apts_arr || jsonb_build_object(
        'id', gen_random_uuid(),
        'label', 'דירה ' || apt_rec.apartment_label,
        'rows', rows_arr
      );
    END LOOP;
    
    floors_arr := floors_arr || jsonb_build_object(
      'id', gen_random_uuid(),
      'label', CASE WHEN fl = 'קרקע' THEN 'קומת קרקע' ELSE 'קומה ' || fl END,
      'apartments', apts_arr,
      'isTypical', false
    );
  END LOOP;
  
  building_c3 := jsonb_build_object(
    'id', gen_random_uuid(),
    'label', 'בניין C3',
    'floors', floors_arr
  );
  
  SELECT floors INTO draft_floors FROM project_wizard_drafts WHERE id = 'c8c531f8-c08a-4cf7-9f4c-0a8aae440bc2';
  
  draft_floors := draft_floors || building_c3;
  
  UPDATE project_wizard_drafts 
  SET floors = draft_floors, 
      name = 'לאטי גרדנס -אור ים',
      updated_at = now()
  WHERE id = 'c8c531f8-c08a-4cf7-9f4c-0a8aae440bc2';
END $$;
