import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Find projects deleted more than 30 days ago
    const thirtyDaysAgo = new Date(
      Date.now() - 30 * 24 * 60 * 60 * 1000
    ).toISOString();

    const { data: projectsToDelete, error: fetchError } = await supabase
      .from("projects")
      .select("id")
      .not("deleted_at", "is", null)
      .lt("deleted_at", thirtyDaysAgo);

    if (fetchError) throw fetchError;

    if (!projectsToDelete || projectsToDelete.length === 0) {
      return new Response(
        JSON.stringify({ message: "No projects to purge" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const purged: number[] = [];

    for (const project of projectsToDelete) {
      const pid = project.id;
      try {
        // Delete in FK order
        const { data: jobs } = await supabase
          .from("label_jobs")
          .select("id")
          .eq("project_id", pid);
        const jobIds = jobs?.map((j: any) => j.id) || [];
        if (jobIds.length > 0) {
          await supabase.from("label_job_items").delete().in("job_id", jobIds);
        }
        await supabase.from("label_jobs").delete().eq("project_id", pid);
        await supabase.from("load_issues").delete().eq("project_id", pid);
        await supabase.from("scan_events").delete().eq("project_id", pid);
        await supabase
          .from("measurement_rows")
          .delete()
          .eq("project_id", pid);
        await supabase
          .from("measurement_floor_exports")
          .delete()
          .eq("measurement_project_id", pid);
        await supabase
          .from("measurement_floor_exports")
          .delete()
          .eq("running_project_id", pid);

        const { data: items } = await supabase
          .from("items")
          .select("id")
          .eq("project_id", pid);
        const itemIds = items?.map((i: any) => i.id) || [];
        if (itemIds.length > 0) {
          await supabase.from("labels").delete().in("item_id", itemIds);
        }

        await supabase.from("apt_labels").delete().eq("project_id", pid);
        await supabase.from("items").delete().eq("project_id", pid);
        await supabase.from("apartments").delete().eq("project_id", pid);
        await supabase.from("floors").delete().eq("project_id", pid);

        // Optimization data
        const { data: optJobs } = await supabase
          .from("optimization_jobs")
          .select("id")
          .eq("project_id", pid);
        if (optJobs && optJobs.length > 0) {
          const optJobIds = optJobs.map((j: any) => j.id);
          const { data: patterns } = await supabase
            .from("optimization_patterns")
            .select("id")
            .in("job_id", optJobIds);
          if (patterns && patterns.length > 0) {
            await supabase
              .from("optimization_pattern_progress")
              .delete()
              .in("pattern_id", patterns.map((p: any) => p.id));
            await supabase
              .from("optimization_patterns")
              .delete()
              .in("job_id", optJobIds);
          }
          await supabase
            .from("optimization_jobs")
            .delete()
            .eq("project_id", pid);
        }

        const { data: optPdfs } = await supabase
          .from("optimization_pdf_uploads")
          .select("id")
          .eq("project_id", pid);
        if (optPdfs && optPdfs.length > 0) {
          const pdfIds = optPdfs.map((p: any) => p.id);
          await supabase
            .from("optimization_pdf_annotations")
            .delete()
            .in("pdf_id", pdfIds);
          await supabase
            .from("optimization_pdf_progress")
            .delete()
            .in("pdf_id", pdfIds);
          await supabase
            .from("optimization_pdf_uploads")
            .delete()
            .eq("project_id", pid);
        }

        // Father project links
        await supabase
          .from("father_project_buildings")
          .delete()
          .eq("building_project_id", pid);

        // Storage cleanup
        try {
          const { data: files } = await supabase.storage
            .from("labels")
            .list(`${pid}`);
          if (files && files.length > 0) {
            await supabase.storage
              .from("labels")
              .remove(files.map((f: any) => `${pid}/${f.name}`));
          }
        } catch (_) {
          // non-blocking
        }

        // Finally delete the project
        await supabase.from("projects").delete().eq("id", pid);
        purged.push(pid);
      } catch (err) {
        console.error(`Failed to purge project ${pid}:`, err);
      }
    }

    return new Response(
      JSON.stringify({ purged, count: purged.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Purge error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
