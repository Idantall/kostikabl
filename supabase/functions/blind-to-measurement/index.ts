import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Check if item_code contains any English letter (A-Z/a-z) - indicates a door
function isDoorRow(itemCode: string | null): boolean {
  if (!itemCode) return false;
  return /[A-Za-z]/.test(itemCode);
}

// Parse a dimension value like "253+", "253", "136.5" and return { number, suffix }
function parseDimension(value: string | null): { number: number | null; suffix: string } {
  if (!value || value.trim() === '') {
    return { number: null, suffix: '' };
  }
  
  const trimmed = value.trim();
  
  // Match numeric part (including decimals) and optional suffix
  const match = trimmed.match(/^(-?\d+(?:\.\d+)?)(.*?)$/);
  if (!match) {
    return { number: null, suffix: trimmed }; // Not parseable, keep as-is
  }
  
  const num = parseFloat(match[1]);
  const suffix = match[2] || '';
  
  return { number: num, suffix };
}

// Format a number back to string, avoiding excessive decimals
function formatNumber(num: number): string {
  // Round to 1 decimal place if needed
  const rounded = Math.round(num * 10) / 10;
  // If it's a whole number, don't show decimal
  if (rounded === Math.floor(rounded)) {
    return String(Math.floor(rounded));
  }
  return String(rounded);
}

// Subtract 3 from a dimension value, preserving suffix
function subtractThree(value: string | null): { result: string | null; warning: string | null } {
  if (!value || value.trim() === '') {
    return { result: null, warning: null };
  }
  
  const { number, suffix } = parseDimension(value);
  
  if (number === null) {
    return { 
      result: value, 
      warning: `Could not parse dimension value: "${value}"` 
    };
  }
  
  const newNumber = number - 3;
  const result = formatNumber(newNumber) + suffix;
  
  return { result, warning: null };
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
    const { project_id, rule } = body;
    
    if (!project_id) {
      return new Response(JSON.stringify({ error: "Missing project_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!rule || !['baranovitz', 'conventional'].includes(rule)) {
      return new Response(JSON.stringify({ error: "Invalid rule. Must be 'baranovitz' or 'conventional'" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Converting project ${project_id} from blind_jambs to measurement with rule: ${rule}`);

    // Verify project exists, is owned by user, and is in blind_jambs status
    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("id, status, created_by, name")
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

    if (project.status !== "blind_jambs") {
      console.log("Project is not in blind_jambs status:", project.status);
      return new Response(JSON.stringify({ error: "Project is not in blind_jambs status. Current status: " + project.status }), {
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

    console.log(`Found ${measurementRows?.length || 0} measurement rows`);

    // Use service role client for data updates (bypasses RLS for bulk updates)
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    const warnings: string[] = [];
    let doorsProcessed = 0;
    let nonDoorsProcessed = 0;

    // Process each measurement row according to the rule
    for (const row of measurementRows || []) {
      const isDoor = isDoorRow(row.item_code);
      const updates: Record<string, any> = {};
      
      if (rule === 'baranovitz') {
        // Baranovitz Rule:
        // - Door rows: set height = NULL
        // - Non-door rows: leave unchanged
        if (isDoor) {
          updates.height = null;
          doorsProcessed++;
        }
      } else if (rule === 'conventional') {
        // Conventional Rule:
        // - Door rows: height = NULL, width -= 3
        // - Non-door rows: height -= 3, width -= 3
        if (isDoor) {
          updates.height = null;
          
          const widthResult = subtractThree(row.width);
          if (widthResult.warning) {
            warnings.push(`Row ${row.id}: ${widthResult.warning}`);
          }
          if (widthResult.result !== row.width) {
            updates.width = widthResult.result;
          }
          doorsProcessed++;
        } else {
          const heightResult = subtractThree(row.height);
          if (heightResult.warning) {
            warnings.push(`Row ${row.id} height: ${heightResult.warning}`);
          }
          if (heightResult.result !== row.height) {
            updates.height = heightResult.result;
          }
          
          const widthResult = subtractThree(row.width);
          if (widthResult.warning) {
            warnings.push(`Row ${row.id} width: ${widthResult.warning}`);
          }
          if (widthResult.result !== row.width) {
            updates.width = widthResult.result;
          }
          nonDoorsProcessed++;
        }
      }
      
      // Update the row if there are changes
      if (Object.keys(updates).length > 0) {
        const { error: updateError } = await supabaseAdmin
          .from("measurement_rows")
          .update(updates)
          .eq("id", row.id);
        
        if (updateError) {
          console.log(`Error updating row ${row.id}:`, updateError.message);
          warnings.push(`Failed to update row ${row.id}: ${updateError.message}`);
        }
      }
    }

    // Update project status and rule
    const { error: projectUpdateError } = await supabaseAdmin
      .from("projects")
      .update({ 
        status: "measurement",
        measurement_rule: rule,
        converted_to_measurement_at: new Date().toISOString()
      })
      .eq("id", project_id);

    if (projectUpdateError) {
      console.log("Error updating project status:", projectUpdateError.message);
      return new Response(JSON.stringify({ error: "Failed to update project status: " + projectUpdateError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Project ${project_id} converted successfully. Doors: ${doorsProcessed}, Non-doors: ${nonDoorsProcessed}, Warnings: ${warnings.length}`);

    return new Response(JSON.stringify({
      success: true,
      rule,
      doorsProcessed,
      nonDoorsProcessed,
      warnings,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: any) {
    console.error("Conversion error:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
