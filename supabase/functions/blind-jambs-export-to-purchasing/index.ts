import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Item type to required codes mapping
const NAME_TO_CODES: Record<string, string[]> = {
  "דלת": ["00", "03", "04"],
  "דלת מונובלוק": ["01", "02", "03", "05"],
  "חלון": ["00"],
  "ממד": ["01", "02"],
  "קיפ": ["00"],
  "חלון מונובלוק": ["01", "02"],
};

function normalizeEngineSide(raw: string | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim().toUpperCase();
  if (trimmed === "L" || trimmed === "LEFT" || trimmed === "שמאל") return "L";
  if (trimmed === "R" || trimmed === "RIGHT" || trimmed === "ימין") return "R";
  return null;
}

function classifySubpartsByKeywords(text: string): string[] {
  const searchText = text.toLowerCase();
  const codes: string[] = [];
  if (searchText.includes("משקוף")) codes.push("01");
  if (searchText.includes("כנפי") || searchText.includes("כנף")) codes.push("02");
  if (searchText.includes("תריס") || searchText.includes("גלילה")) codes.push("03");
  if (searchText.includes("מסילו") || searchText.includes("מסיל")) codes.push("04");
  if (searchText.includes("ארגז")) codes.push("05");
  return codes.length > 0 ? codes : ["00"];
}

// Derive item_type and required_codes from item_code and field_notes (actual descriptive notes).
// IMPORTANT: Do NOT pass measurement_rows.notes here — that field now stores numeric
// "height from floor" data, not item type descriptions.
function deriveItemTypeAndCodes(itemCode: string | null, fieldNotes: string | null): { itemType: string; requiredCodes: string[] } {
  const codeText = (itemCode || "").trim();
  if (codeText && NAME_TO_CODES[codeText]) {
    return { itemType: codeText, requiredCodes: NAME_TO_CODES[codeText] };
  }
  const notesText = (fieldNotes || "").trim();
  if (notesText && NAME_TO_CODES[notesText]) {
    return { itemType: notesText, requiredCodes: NAME_TO_CODES[notesText] };
  }
  const searchText = `${codeText} ${notesText}`;
  for (const [name, codes] of Object.entries(NAME_TO_CODES)) {
    if (searchText.includes(name)) {
      return { itemType: name, requiredCodes: codes };
    }
  }
  const codes = classifySubpartsByKeywords(searchText);
  return { itemType: "אחר", requiredCodes: codes };
}

function parseFloorLabel(label: string): { numeric: number | null; original: string } {
  const negMatch = label.match(/^(\d+)\s*-$/);
  if (negMatch) return { numeric: -parseInt(negMatch[1]), original: label };
  const match = label.match(/(-?\d+)/);
  if (match) return { numeric: parseInt(match[1]), original: label };
  if (label.includes('קרקע') || label.toLowerCase().includes('ground')) return { numeric: 0, original: label };
  if (label.includes('מרתף') || label.toLowerCase().includes('basement')) return { numeric: -1, original: label };
  return { numeric: null, original: label };
}

function validateContiguousRange(allFloors: string[], startLabel: string, endLabel: string): { valid: boolean; error?: string; floorsInRange: string[] } {
  const sortedFloors = allFloors
    .map(f => ({ label: f, ...parseFloorLabel(f) }))
    .sort((a, b) => {
      if (a.numeric === null && b.numeric === null) return a.label.localeCompare(b.label);
      if (a.numeric === null) return 1;
      if (b.numeric === null) return -1;
      return a.numeric - b.numeric;
    });
  const startIndex = sortedFloors.findIndex(f => f.label === startLabel);
  const endIndex = sortedFloors.findIndex(f => f.label === endLabel);
  if (startIndex === -1) return { valid: false, error: `Start floor "${startLabel}" not found`, floorsInRange: [] };
  if (endIndex === -1) return { valid: false, error: `End floor "${endLabel}" not found`, floorsInRange: [] };
  if (startIndex > endIndex) return { valid: false, error: `Start floor must come before end floor`, floorsInRange: [] };
  const floorsInRange = sortedFloors.slice(startIndex, endIndex + 1).map(f => f.label);
  return { valid: true, floorsInRange };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: isAllowed } = await supabase.rpc("is_email_allowed");
    if (!isAllowed) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { project_id, start_floor_label, end_floor_label } = body;

    if (!project_id) {
      return new Response(JSON.stringify({ error: "Missing project_id" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!start_floor_label || !end_floor_label) {
      return new Response(JSON.stringify({ error: "Missing start_floor_label or end_floor_label" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Exporting floors ${start_floor_label} to ${end_floor_label} from blind_jambs project ${project_id}`);

    // Verify project exists, is owned by user, and is in blind_jambs status
    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("id, status, created_by, name, folder_id, building_code")
      .eq("id", project_id)
      .single();

    if (projectError || !project) {
      return new Response(JSON.stringify({ error: "Project not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const appOwnerEmails = ['yossi@kostika.biz', 'idantal92@gmail.com'];
    const isAppOwner = appOwnerEmails.includes(user.email || '');

    if (project.created_by !== user.id && !isAppOwner) {
      return new Response(JSON.stringify({ error: "Forbidden - not project owner" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (project.status !== "blind_jambs") {
      return new Response(JSON.stringify({ error: "Project is not in blind_jambs status. Current status: " + project.status }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch all measurement rows
    const { data: allMeasurementRows, error: rowsError } = await supabase
      .from("measurement_rows")
      .select("*")
      .eq("project_id", project_id);

    if (rowsError) {
      return new Response(JSON.stringify({ error: "Failed to fetch measurement data" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!allMeasurementRows || allMeasurementRows.length === 0) {
      return new Response(JSON.stringify({ error: "No measurement data found" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const allFloorLabels = [...new Set(allMeasurementRows.map(r => r.floor_label).filter(Boolean) as string[])];
    const rangeValidation = validateContiguousRange(allFloorLabels, start_floor_label, end_floor_label);
    if (!rangeValidation.valid) {
      return new Response(JSON.stringify({ error: rangeValidation.error }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const floorsToExport = rangeValidation.floorsInRange;
    console.log(`Floors to export: ${floorsToExport.join(', ')}`);

    // Check if any floors already exported
    const { data: existingExports, error: exportsError } = await supabase
      .from("measurement_floor_exports")
      .select("floor_label")
      .eq("measurement_project_id", project_id)
      .in("floor_label", floorsToExport);

    if (exportsError) {
      return new Response(JSON.stringify({ error: "Failed to check existing exports" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (existingExports && existingExports.length > 0) {
      const alreadyExported = existingExports.map(e => e.floor_label).join(', ');
      return new Response(JSON.stringify({ error: `The following floors have already been exported: ${alreadyExported}` }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Use service role client for data insertion
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    // Create the new purchasing project
    const productionBatchLabel = `קומות ${start_floor_label}-${end_floor_label}`;
    const newProjectName = `${project.name} – ${productionBatchLabel}`;

    const { data: purchasingProject, error: purchasingProjectError } = await supabaseAdmin
      .from("projects")
      .insert({
        name: newProjectName,
        status: "purchasing",
        created_by: user.id,
        folder_id: project.folder_id,
        building_code: project.building_code,
        source_measurement_project_id: project_id,
        production_batch_label: productionBatchLabel,
        parent_project_id: project_id,
      })
      .select()
      .single();

    if (purchasingProjectError) {
      return new Response(JSON.stringify({ error: "Failed to create purchasing project: " + purchasingProjectError.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Created purchasing project: ${purchasingProject.id} - ${newProjectName}`);

    // Filter rows for selected floors
    const rowsToExport = allMeasurementRows.filter(r =>
      r.floor_label && floorsToExport.includes(r.floor_label)
    );

    // Copy measurement rows to new project
    if (rowsToExport.length > 0) {
      const copiedRows = rowsToExport.map(row => ({
        project_id: purchasingProject.id,
        floor_label: row.floor_label,
        apartment_label: row.apartment_label,
        sheet_name: row.sheet_name,
        location_in_apartment: row.location_in_apartment,
        opening_no: row.opening_no,
        contract_item: row.contract_item,
        item_code: row.item_code,
        height: row.height,
        width: row.width,
        notes: row.notes,
        hinge_direction: row.hinge_direction,
        mamad: row.mamad,
        field_notes: row.field_notes,
        wall_thickness: row.wall_thickness,
        depth: row.depth,
        glyph: row.glyph,
        jamb_height: row.jamb_height,
        is_manual: row.is_manual,
        engine_side: row.engine_side,
        internal_wing: row.internal_wing,
        wing_position: row.wing_position,
      }));

      const { error: copyError } = await supabaseAdmin
        .from("measurement_rows")
        .insert(copiedRows);

      if (copyError) {
        await supabaseAdmin.from("projects").delete().eq("id", purchasingProject.id);
        return new Response(JSON.stringify({ error: "Failed to copy measurement data: " + copyError.message }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Build hierarchy
    const validRows = rowsToExport.filter(row =>
      row.floor_label && row.apartment_label && row.item_code
    );

    console.log(`Creating hierarchy from ${validRows.length} valid rows`);

    // Create floors
    const uniqueFloors = [...new Set(validRows.map(r => r.floor_label))];
    const floorMap = new Map<string, number>();

    for (const floorLabel of uniqueFloors) {
      const { data: newFloor, error: floorError } = await supabaseAdmin
        .from("floors")
        .insert({ project_id: purchasingProject.id, floor_code: floorLabel })
        .select("id")
        .single();

      if (floorError) {
        await supabaseAdmin.from("projects").delete().eq("id", purchasingProject.id);
        return new Response(JSON.stringify({ error: "Failed to create floor: " + floorError.message }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      floorMap.set(floorLabel!, newFloor.id);
    }

    // Create apartments
    const uniqueApartments = [...new Set(validRows.map(r => `${r.floor_label}|||${r.apartment_label}`))];
    const apartmentMap = new Map<string, number>();

    for (const aptKey of uniqueApartments) {
      const [floorLabel, aptLabel] = aptKey.split("|||");
      const floorId = floorMap.get(floorLabel);
      if (!floorId) continue;

      const { data: newApt, error: aptError } = await supabaseAdmin
        .from("apartments")
        .insert({ project_id: purchasingProject.id, floor_id: floorId, apt_number: aptLabel })
        .select("id")
        .single();

      if (aptError) {
        await supabaseAdmin.from("projects").delete().eq("id", purchasingProject.id);
        return new Response(JSON.stringify({ error: "Failed to create apartment: " + aptError.message }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      apartmentMap.set(aptKey, newApt.id);
    }

    // Create items with purchasing_status
    const itemInserts: any[] = [];
    for (const row of validRows) {
      const aptKey = `${row.floor_label}|||${row.apartment_label}`;
      const floorId = floorMap.get(row.floor_label!);
      const aptId = apartmentMap.get(aptKey);
      if (!floorId || !aptId) continue;

      const { itemType, requiredCodes } = deriveItemTypeAndCodes(row.item_code, row.field_notes);
      const motorSide = normalizeEngineSide(row.engine_side);

      itemInserts.push({
        project_id: purchasingProject.id,
        floor_id: floorId,
        apt_id: aptId,
        item_code: row.item_code,
        item_type: itemType,
        location: row.location_in_apartment || null,
        opening_no: row.opening_no || null,
        width: row.width || null,
        height: row.height || null,
        notes: row.field_notes || null,
        field_notes: row.notes || null,
        side_rl: motorSide,
        motor_side: motorSide,
        required_codes: requiredCodes,
        status_cached: "NOT_SCANNED",
        loading_status_cached: "NOT_LOADED",
        install_status_cached: "NOT_INSTALLED",
        purchasing_status: "not_ordered",
        contract_item: row.contract_item || null,
        hinge_direction: row.hinge_direction || null,
        mamad: row.mamad || null,
        depth: row.depth || null,
        is_manual: row.is_manual || false,
      });
    }

    // Batch insert items
    let itemsCreated = 0;
    if (itemInserts.length > 0) {
      const batchSize = 100;
      for (let i = 0; i < itemInserts.length; i += batchSize) {
        const batch = itemInserts.slice(i, i + batchSize);
        const { error: itemsError } = await supabaseAdmin
          .from("items")
          .insert(batch);

        if (itemsError) {
          await supabaseAdmin.from("projects").delete().eq("id", purchasingProject.id);
          return new Response(JSON.stringify({ error: "Failed to create items: " + itemsError.message }), {
            status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        itemsCreated += batch.length;
      }
    }

    console.log(`Created ${itemsCreated} items`);

    // Ensure the blind_jambs project is set as its own parent (group root)
    await supabaseAdmin
      .from("projects")
      .update({ parent_project_id: project_id })
      .eq("id", project_id)
      .is("parent_project_id", null);

    // Record floor exports to lock them
    const exportRecords = floorsToExport.map(floorLabel => ({
      measurement_project_id: project_id,
      running_project_id: purchasingProject.id,
      floor_label: floorLabel,
      exported_by: user.id,
    }));

    const { error: exportRecordError } = await supabaseAdmin
      .from("measurement_floor_exports")
      .insert(exportRecords);

    if (exportRecordError) {
      console.log("Error recording floor exports:", exportRecordError.message);
    }

    console.log(`Export completed successfully. Purchasing project: ${purchasingProject.id}`);

    return new Response(JSON.stringify({
      success: true,
      purchasing_project_id: purchasingProject.id,
      purchasing_project_name: newProjectName,
      floors_exported: floorsToExport,
      items_created: itemsCreated,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: any) {
    console.error("Export error:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
