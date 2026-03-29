CREATE OR REPLACE VIEW public.v_project_totals AS
SELECT p.id AS project_id,
    p.name,
    p.building_code,
    p.status,
    COALESCE(f.total_floors, m.m_floors, 0::bigint) AS total_floors,
    COALESCE(a.total_apartments, m.m_apartments, 0::bigint) AS total_apartments,
    COALESCE(i.total_items, m.m_items, 0::bigint) AS total_items,
    COALESCE(i.ready_items, 0::bigint) AS ready_items,
    COALESCE(i.partial_items, 0::bigint) AS partial_items,
    COALESCE(i.not_scanned_items, 0::bigint) AS not_scanned_items
   FROM projects p
     LEFT JOIN ( SELECT floors.project_id,
            count(*) AS total_floors
           FROM floors
          GROUP BY floors.project_id) f ON f.project_id = p.id
     LEFT JOIN ( SELECT apartments.project_id,
            count(*) AS total_apartments
           FROM apartments
          GROUP BY apartments.project_id) a ON a.project_id = p.id
     LEFT JOIN ( SELECT items.project_id,
            count(*) AS total_items,
            count(*) FILTER (WHERE items.status_cached = 'READY'::text) AS ready_items,
            count(*) FILTER (WHERE items.status_cached = 'PARTIAL'::text) AS partial_items,
            count(*) FILTER (WHERE items.status_cached = 'NOT_SCANNED'::text) AS not_scanned_items
           FROM items
          GROUP BY items.project_id) i ON i.project_id = p.id
     LEFT JOIN ( SELECT measurement_rows.project_id,
            count(DISTINCT measurement_rows.floor_label) AS m_floors,
            count(DISTINCT measurement_rows.apartment_label) AS m_apartments,
            count(*) AS m_items
           FROM measurement_rows
          GROUP BY measurement_rows.project_id) m ON m.project_id = p.id;