-- Create a new project as a copy of project 101 with corrected data
-- The new project will be in 'active' status with all measurement data properly transferred

DO $$
DECLARE
  new_project_id bigint;
  floor_map jsonb := '{}';
  apt_map jsonb := '{}';
  floor_rec RECORD;
  apt_rec RECORD;
  new_floor_id bigint;
  new_apt_id bigint;
BEGIN
  -- Create the new project
  INSERT INTO projects (name, building_code, status, created_by, source_file_path)
  VALUES (
    'האיטצדיון בניין 2 קומות 0-5 אפי קפיטל (תיקון)',
    NULL,
    'active',
    '7632325e-0c4b-4b63-937c-42c5baf55bbe',
    '101/1767513663731__-_2-_0-5.xlsx'
  )
  RETURNING id INTO new_project_id;

  -- Create floors and build mapping
  FOR floor_rec IN 
    SELECT DISTINCT floor_label 
    FROM measurement_rows 
    WHERE project_id = 101 AND floor_label IS NOT NULL
    ORDER BY floor_label
  LOOP
    INSERT INTO floors (project_id, floor_code)
    VALUES (new_project_id, floor_rec.floor_label)
    RETURNING id INTO new_floor_id;
    
    floor_map := floor_map || jsonb_build_object(floor_rec.floor_label, new_floor_id);
  END LOOP;

  -- Create apartments and build mapping
  FOR apt_rec IN 
    SELECT DISTINCT floor_label, apartment_label 
    FROM measurement_rows 
    WHERE project_id = 101 AND floor_label IS NOT NULL AND apartment_label IS NOT NULL
    ORDER BY floor_label, apartment_label
  LOOP
    INSERT INTO apartments (project_id, floor_id, apt_number)
    VALUES (
      new_project_id, 
      (floor_map->>apt_rec.floor_label)::bigint, 
      apt_rec.apartment_label
    )
    RETURNING id INTO new_apt_id;
    
    apt_map := apt_map || jsonb_build_object(apt_rec.floor_label || '_' || apt_rec.apartment_label, new_apt_id);
  END LOOP;

  -- Insert all items from measurement_rows with field_notes properly transferred
  -- Map Hebrew engine_side values to R/L for side_rl constraint
  INSERT INTO items (
    project_id,
    floor_id,
    apt_id,
    item_code,
    location,
    opening_no,
    width,
    height,
    notes,
    field_notes,
    motor_side,
    side_rl,
    required_codes,
    status_cached,
    loading_status_cached,
    install_status_cached
  )
  SELECT 
    new_project_id,
    (floor_map->>mr.floor_label)::bigint,
    (apt_map->>(mr.floor_label || '_' || mr.apartment_label))::bigint,
    mr.item_code,
    mr.location_in_apartment,
    mr.opening_no,
    mr.width,
    mr.height,
    mr.notes,
    mr.field_notes,
    mr.engine_side,
    -- Map Hebrew to R/L for side_rl constraint
    CASE 
      WHEN mr.engine_side = 'ימין' THEN 'R'
      WHEN mr.engine_side = 'שמאל' THEN 'L'
      ELSE NULL
    END,
    CASE 
      WHEN mr.item_code LIKE 'A-%' THEN ARRAY['WINDOW', 'MOTOR']
      WHEN mr.item_code ~ '^[0-9]+$' THEN ARRAY['WINDOW']
      WHEN mr.item_code LIKE '%-ח' THEN ARRAY['WINDOW', 'SHUTTER']
      WHEN mr.item_code LIKE '%ב' THEN ARRAY['WINDOW']
      ELSE ARRAY['WINDOW']
    END,
    'NOT_SCANNED',
    'NOT_LOADED',
    'NOT_INSTALLED'
  FROM measurement_rows mr
  WHERE mr.project_id = 101 AND mr.item_code IS NOT NULL;

  RAISE NOTICE 'Created new project with ID: %', new_project_id;
END $$;