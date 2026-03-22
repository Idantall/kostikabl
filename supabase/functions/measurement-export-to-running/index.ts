import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Item type to required codes mapping (must match the existing normal import logic)
const NAME_TO_CODES: Record<string, string[]> = {
  "דלת": ["00", "03", "04"],
  "דלת מונובלוק": ["01", "02", "03", "05"],
  "חלון": ["00"],
  "ממד": ["01", "02"],
  "קיפ": ["00"],
  "חלון מונובלוק": ["01", "02"],
};

// Normalize engine side to L/R/null
function normalizeEngineSide(raw: string | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim().toUpperCase();
  if (trimmed === "L" || trimmed === "LEFT" || trimmed === "שמאל") return "L";
  if (trimmed === "R" || trimmed === "RIGHT" || trimmed === "ימין") return "R";
  return null;
}

// Determine required_codes based on item_code text patterns (fallback)
function classifySubpartsByKeywords(text: string): string[] {
  const searchText = text.toLowerCase();
  const codes: string[] = [];
  
  if (searchText.includes("משקוף")) codes.push("01");
  if (searchText.includes("כנפי") || searchText.includes("כנף")) codes.push("02");
  if (searchText.includes("תריס") || searchText.includes("גלילה")) codes.push("03");
  if (searchText.includes("מסילו") || searchText.includes("מסיל")) codes.push("04");
  if (searchText.includes("ארגז")) codes.push("05");
  
  // Default to single-label item if nothing detected
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

// Parse floor label to extract numeric value for sorting
// Handles Hebrew-style negative floors like "1-", "2-", "3-" (minus suffix)
function parseFloorLabel(label: string): { numeric: number | null; original: string } {
  // Check for Hebrew-style negative: "1-", "2-", "3-" (number followed by minus)
  const negMatch = label.match(/^(\d+)\s*-$/);
  if (negMatch) {
    return { numeric: -parseInt(negMatch[1]), original: label };
  }
  
  // Try to extract number from label like "קומה 1", "1", "-1" etc.
  const match = label.match(/(-?\d+)/);
  if (match) {
    return { numeric: parseInt(match[1]), original: label };
  }
  
  // Special cases
  if (label.includes('קרקע') || label.toLowerCase().includes('ground')) {
    return { numeric: 0, original: label };
  }
  if (label.includes('מרתף') || label.toLowerCase().includes('basement')) {
    return { numeric: -1, original: label };
  }
  
  return { numeric: null, original: label };
}

// Check if floor range is contiguous
function validateContiguousRange(allFloors: string[], startLabel: string, endLabel: string): { valid: boolean; error?: string; floorsInRange: string[] } {
  // Sort floors by their numeric value
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
  
  if (startIndex === -1) {
    return { valid: false, error: `Start floor "${startLabel}" not found`, floorsInRange: [] };
  }
  if (endIndex === -1) {
    return { valid: false, error: `End floor "${endLabel}" not found`, floorsInRange: [] };
  }
  if (startIndex > endIndex) {
    return { valid: false, error: `Start floor must come before end floor`, floorsInRange: [] };
  }
  
  const floorsInRange = sortedFloors.slice(startIndex, endIndex + 1).map(f => f.label);
  return { valid: true, floorsInRange };
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get authorization header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      console.log("Missing Authorization header");
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create Supabase client with user's token
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Verify user is authenticated and allowed
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      console.log("Auth error:", userError?.message);
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if user email is allowed
    const { data: isAllowed } = await supabase.rpc("is_email_allowed");
    if (!isAllowed) {
      console.log("User email not in allowlist:", user.email);
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse request body
    const body = await req.json();
    const { measurement_project_id, start_floor_label, end_floor_label } = body;
    
    if (!measurement_project_id) {
      return new Response(JSON.stringify({ error: "Missing measurement_project_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!start_floor_label || !end_floor_label) {
      return new Response(JSON.stringify({ error: "Missing start_floor_label or end_floor_label" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Exporting floors ${start_floor_label} to ${end_floor_label} from measurement project ${measurement_project_id}`);

    // Verify project exists, is owned by user, and is in measurement status
    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("id, status, created_by, name, folder_id, building_code")
      .eq("id", measurement_project_id)
      .single();

    if (projectError || !project) {
      console.log("Project not found:", projectError?.message);
      return new Response(JSON.stringify({ error: "Project not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if user is app owner
    const appOwnerEmails = ['yossi@kostika.biz', 'idantal92@gmail.com'];
    const isAppOwner = appOwnerEmails.includes(user.email || '');
    
    if (project.created_by !== user.id && !isAppOwner) {
      console.log("User does not own project and is not app owner");
      return new Response(JSON.stringify({ error: "Forbidden - not project owner" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (project.status !== "measurement") {
      console.log("Project is not in measurement status:", project.status);
      return new Response(JSON.stringify({ error: "Project is not in measurement status. Current status: " + project.status }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch all measurement rows for this project
    const { data: allMeasurementRows, error: rowsError } = await supabase
      .from("measurement_rows")
      .select("*")
      .eq("project_id", measurement_project_id);

    if (rowsError) {
      console.log("Error fetching measurement rows:", rowsError.message);
      return new Response(JSON.stringify({ error: "Failed to fetch measurement data" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!allMeasurementRows || allMeasurementRows.length === 0) {
      return new Response(JSON.stringify({ error: "No measurement data found" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get all unique floor labels
    const allFloorLabels = [...new Set(allMeasurementRows.map(r => r.floor_label).filter(Boolean) as string[])];
    
    // Validate contiguous range
    const rangeValidation = validateContiguousRange(allFloorLabels, start_floor_label, end_floor_label);
    if (!rangeValidation.valid) {
      return new Response(JSON.stringify({ error: rangeValidation.error }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const floorsToExport = rangeValidation.floorsInRange;
    console.log(`Floors to export: ${floorsToExport.join(', ')}`);

    // Check if any of the floors have already been exported
    const { data: existingExports, error: exportsError } = await supabase
      .from("measurement_floor_exports")
      .select("floor_label")
      .eq("measurement_project_id", measurement_project_id)
      .in("floor_label", floorsToExport);

    if (exportsError) {
      console.log("Error checking existing exports:", exportsError.message);
      return new Response(JSON.stringify({ error: "Failed to check existing exports" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (existingExports && existingExports.length > 0) {
      const alreadyExported = existingExports.map(e => e.floor_label).join(', ');
      return new Response(JSON.stringify({ 
        error: `The following floors have already been exported: ${alreadyExported}` 
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Use service role client for data insertion (bypasses RLS)
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    // Create the new running project
    const productionBatchLabel = `קומות ${start_floor_label}-${end_floor_label}`;
    const newProjectName = `${project.name} – ${productionBatchLabel}`;

    const { data: runningProject, error: runningProjectError } = await supabaseAdmin
      .from("projects")
      .insert({
        name: newProjectName,
        status: "active",
        created_by: user.id,
        folder_id: project.folder_id,
        building_code: project.building_code,
        source_measurement_project_id: measurement_project_id,
        production_batch_label: productionBatchLabel,
        parent_project_id: measurement_project_id,
      })
      .select()
      .single();

    if (runningProjectError) {
      console.log("Error creating running project:", runningProjectError.message);
      return new Response(JSON.stringify({ error: "Failed to create running project: " + runningProjectError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Created running project: ${runningProject.id} - ${newProjectName}`);

    // Filter measurement rows for the selected floors
    const rowsToExport = allMeasurementRows.filter(r => 
      r.floor_label && floorsToExport.includes(r.floor_label)
    );

    // Copy measurement rows to the new project
    if (rowsToExport.length > 0) {
      const copiedRows = rowsToExport.map(row => ({
        project_id: runningProject.id,
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
        console.log("Error copying measurement rows:", copyError.message);
        // Rollback: delete the running project
        await supabaseAdmin.from("projects").delete().eq("id", runningProject.id);
        return new Response(JSON.stringify({ error: "Failed to copy measurement data: " + copyError.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Build the active hierarchy (floors, apartments, items)
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
        .insert({ project_id: runningProject.id, floor_code: floorLabel })
        .select("id")
        .single();

      if (floorError) {
        console.log("Error creating floor:", floorError.message);
        // Rollback
        await supabaseAdmin.from("projects").delete().eq("id", runningProject.id);
        return new Response(JSON.stringify({ error: "Failed to create floor: " + floorError.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
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
        .insert({ project_id: runningProject.id, floor_id: floorId, apt_number: aptLabel })
        .select("id")
        .single();

      if (aptError) {
        console.log("Error creating apartment:", aptError.message);
        // Rollback
        await supabaseAdmin.from("projects").delete().eq("id", runningProject.id);
        return new Response(JSON.stringify({ error: "Failed to create apartment: " + aptError.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      apartmentMap.set(aptKey, newApt.id);
    }

    // Create items
    const itemInserts: any[] = [];
    for (const row of validRows) {
      const aptKey = `${row.floor_label}|||${row.apartment_label}`;
      const floorId = floorMap.get(row.floor_label!);
      const aptId = apartmentMap.get(aptKey);

      if (!floorId || !aptId) continue;

      const { itemType, requiredCodes } = deriveItemTypeAndCodes(row.item_code, row.field_notes);
      const motorSide = normalizeEngineSide(row.engine_side);

      itemInserts.push({
        project_id: runningProject.id,
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
          console.log("Error creating items:", itemsError.message);
          // Rollback
          await supabaseAdmin.from("projects").delete().eq("id", runningProject.id);
          return new Response(JSON.stringify({ error: "Failed to create items: " + itemsError.message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        itemsCreated += batch.length;
      }
    }

    console.log(`Created ${itemsCreated} items`);

    // Ensure the measurement project is set as its own parent (group root)
    await supabaseAdmin
      .from("projects")
      .update({ parent_project_id: measurement_project_id })
      .eq("id", measurement_project_id)
      .is("parent_project_id", null);

    // Record the floor exports to lock them in the source measurement project
    const exportRecords = floorsToExport.map(floorLabel => ({
      measurement_project_id: measurement_project_id,
      running_project_id: runningProject.id,
      floor_label: floorLabel,
      exported_by: user.id,
    }));

    const { error: exportRecordError } = await supabaseAdmin
      .from("measurement_floor_exports")
      .insert(exportRecords);

    if (exportRecordError) {
      console.log("Error recording floor exports:", exportRecordError.message);
      // Don't rollback - the project is created, just warn
    }

    console.log(`Export completed successfully. Running project: ${runningProject.id}`);

    return new Response(JSON.stringify({
      success: true,
      running_project_id: runningProject.id,
      running_project_name: newProjectName,
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
