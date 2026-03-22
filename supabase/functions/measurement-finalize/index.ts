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
  // First try item_code for exact match
  const codeText = (itemCode || "").trim();
  if (codeText && NAME_TO_CODES[codeText]) {
    return { itemType: codeText, requiredCodes: NAME_TO_CODES[codeText] };
  }

  // Then try field_notes (actual descriptive notes) for type hints
  const notesText = (fieldNotes || "").trim();
  if (notesText && NAME_TO_CODES[notesText]) {
    return { itemType: notesText, requiredCodes: NAME_TO_CODES[notesText] };
  }

  // Try partial matches in both fields
  const searchText = `${codeText} ${notesText}`;
  for (const [name, codes] of Object.entries(NAME_TO_CODES)) {
    if (searchText.includes(name)) {
      return { itemType: name, requiredCodes: codes };
    }
  }
  
  // Fallback: use keyword detection
  const codes = classifySubpartsByKeywords(searchText);
  return { itemType: "אחר", requiredCodes: codes };
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
    const { project_id } = body;
    
    if (!project_id) {
      return new Response(JSON.stringify({ error: "Missing project_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("Finalizing measurement project:", project_id);

    // Verify project exists, is owned by user, and is in measurement status
    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("id, status, created_by")
      .eq("id", project_id)
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
      return new Response(JSON.stringify({ error: "Project is not in measurement status" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch all measurement rows for this project
    const { data: measurementRows, error: rowsError } = await supabase
      .from("measurement_rows")
      .select("*")
      .eq("project_id", project_id);

    if (rowsError) {
      console.log("Error fetching measurement rows:", rowsError.message);
      return new Response(JSON.stringify({ error: "Failed to fetch measurement data" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!measurementRows || measurementRows.length === 0) {
      return new Response(JSON.stringify({ error: "No measurement data to convert" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate minimum required fields
    const validRows = measurementRows.filter(row => 
      row.floor_label && row.apartment_label && row.item_code
    );

    if (validRows.length === 0) {
      return new Response(JSON.stringify({ 
        error: "No valid rows found. Each row needs: floor_label, apartment_label, item_code" 
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Processing ${validRows.length} valid rows`);

    // Use service role client for data insertion (bypasses RLS)
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    // Step 1: Create floors (distinct floor_label values)
    const uniqueFloors = [...new Set(validRows.map(r => r.floor_label))];
    const floorMap = new Map<string, number>();
    let floorsCreated = 0;

    for (const floorLabel of uniqueFloors) {
      // Check if floor already exists
      const { data: existingFloor } = await supabaseAdmin
        .from("floors")
        .select("id")
        .eq("project_id", project_id)
        .eq("floor_code", floorLabel)
        .single();

      if (existingFloor) {
        floorMap.set(floorLabel!, existingFloor.id);
      } else {
        const { data: newFloor, error: floorError } = await supabaseAdmin
          .from("floors")
          .insert({ project_id, floor_code: floorLabel })
          .select("id")
          .single();

        if (floorError) {
          console.log("Error creating floor:", floorError.message);
          throw new Error(`Failed to create floor: ${floorError.message}`);
        }
        floorMap.set(floorLabel!, newFloor.id);
        floorsCreated++;
      }
    }

    console.log(`Created ${floorsCreated} floors`);

    // Step 2: Create apartments (distinct floor_label + apartment_label pairs)
    const uniqueApartments = [...new Set(validRows.map(r => `${r.floor_label}|||${r.apartment_label}`))];
    const apartmentMap = new Map<string, number>();
    let apartmentsCreated = 0;

    for (const aptKey of uniqueApartments) {
      const [floorLabel, aptLabel] = aptKey.split("|||");
      const floorId = floorMap.get(floorLabel);

      if (!floorId) {
        console.log("Floor not found for apartment:", floorLabel);
        continue;
      }

      // Check if apartment already exists
      const { data: existingApt } = await supabaseAdmin
        .from("apartments")
        .select("id")
        .eq("project_id", project_id)
        .eq("floor_id", floorId)
        .eq("apt_number", aptLabel)
        .single();

      if (existingApt) {
        apartmentMap.set(aptKey, existingApt.id);
      } else {
        const { data: newApt, error: aptError } = await supabaseAdmin
          .from("apartments")
          .insert({ project_id, floor_id: floorId, apt_number: aptLabel })
          .select("id")
          .single();

        if (aptError) {
          console.log("Error creating apartment:", aptError.message);
          throw new Error(`Failed to create apartment: ${aptError.message}`);
        }
        apartmentMap.set(aptKey, newApt.id);
        apartmentsCreated++;
      }
    }

    console.log(`Created ${apartmentsCreated} apartments`);

    // Step 3: Create items from measurement rows
    let itemsCreated = 0;
    const itemInserts: any[] = [];

    for (const row of validRows) {
      const aptKey = `${row.floor_label}|||${row.apartment_label}`;
      const floorId = floorMap.get(row.floor_label!);
      const aptId = apartmentMap.get(aptKey);

      if (!floorId || !aptId) {
        console.log("Missing floor/apartment for row:", row.id);
        continue;
      }

      // Derive item_type and required_codes from item_code and notes
      const { itemType, requiredCodes } = deriveItemTypeAndCodes(row.item_code, row.notes);
      const motorSide = normalizeEngineSide(row.engine_side);

      itemInserts.push({
        project_id,
        floor_id: floorId,
        apt_id: aptId,
        item_code: row.item_code,
        item_type: itemType,
        location: row.location_in_apartment || null,
        opening_no: row.opening_no || null,
        width: row.width || null,
        height: row.height || null,
        notes: row.notes || null,
        field_notes: row.field_notes || null,
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
    if (itemInserts.length > 0) {
      // Insert in batches of 100 for performance
      const batchSize = 100;
      for (let i = 0; i < itemInserts.length; i += batchSize) {
        const batch = itemInserts.slice(i, i + batchSize);
        const { error: itemsError } = await supabaseAdmin
          .from("items")
          .insert(batch);

        if (itemsError) {
          console.log("Error creating items:", itemsError.message);
          throw new Error(`Failed to create items: ${itemsError.message}`);
        }
        itemsCreated += batch.length;
      }
    }

    console.log(`Created ${itemsCreated} items`);

    // Step 4: Update project status to active
    const { error: updateError } = await supabaseAdmin
      .from("projects")
      .update({ status: "active" })
      .eq("id", project_id);

    if (updateError) {
      console.log("Error updating project status:", updateError.message);
      throw new Error(`Failed to activate project: ${updateError.message}`);
    }

    console.log("Project finalized successfully");

    return new Response(JSON.stringify({
      status: "ok",
      floorsCreated,
      apartmentsCreated,
      itemsCreated,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: any) {
    console.error("Finalize error:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});