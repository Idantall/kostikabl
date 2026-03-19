import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface BuildingProject {
  id: number;
  name: string;
  status: string;
  production_batch_label: string | null;
  created_at: string;
  total_items: number;
  ready_items: number;
  partial_items: number;
  not_scanned_items: number;
  total_floors: number;
  total_apartments: number;
}

export function useBuildingDashboardData(
  fatherId: string | undefined,
  buildingNumber: string | undefined
) {
  // Fetch father project name
  const fatherQuery = useQuery({
    queryKey: ["father-project-name", fatherId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("father_projects")
        .select("id, name")
        .eq("id", fatherId!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!fatherId,
  });

  // Fetch project IDs for this building number
  const buildingLinksQuery = useQuery({
    queryKey: ["building-links", fatherId, buildingNumber],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("father_project_buildings")
        .select("building_project_id")
        .eq("father_project_id", fatherId!)
        .eq("building_number", buildingNumber!);
      if (error) throw error;
      return data?.map((d) => d.building_project_id) || [];
    },
    enabled: !!fatherId && buildingNumber !== undefined,
  });

  // Fetch projects with totals
  const projectsQuery = useQuery({
    queryKey: ["building-projects", fatherId, buildingNumber],
    queryFn: async () => {
      const ids = buildingLinksQuery.data!;
      if (ids.length === 0) return [];

      const { data: projects, error } = await supabase
        .from("projects")
        .select("id, name, status, production_batch_label, created_at")
        .in("id", ids)
        .order("created_at", { ascending: true });
      if (error) throw error;

      // Fetch totals
      const { data: totals } = await supabase
        .from("v_project_totals")
        .select("*")
        .in("project_id", ids);
      const totalsMap = new Map(totals?.map((t) => [t.project_id, t]) || []);

      // Also fetch batch projects (active projects spawned from these measurement projects)
      const { data: batchProjects } = await supabase
        .from("projects")
        .select("id, name, status, production_batch_label, created_at, source_measurement_project_id")
        .eq("status", "active")
        .in("source_measurement_project_id", ids);

      // Fetch totals for batch projects too
      const batchIds = batchProjects?.map((b) => b.id) || [];
      let batchTotals: any[] = [];
      if (batchIds.length > 0) {
        const { data } = await supabase
          .from("v_project_totals")
          .select("*")
          .in("project_id", batchIds);
        batchTotals = data || [];
        batchTotals.forEach((t) => totalsMap.set(t.project_id, t));
      }

      const allProjects = [
        ...(projects || []),
        ...(batchProjects || []).filter((bp) => !ids.includes(bp.id)),
      ];

      return allProjects.map((p) => {
        const t = totalsMap.get(p.id);
        return {
          ...p,
          total_items: Number(t?.total_items) || 0,
          ready_items: Number(t?.ready_items) || 0,
          partial_items: Number(t?.partial_items) || 0,
          not_scanned_items: Number(t?.not_scanned_items) || 0,
          total_floors: Number(t?.total_floors) || 0,
          total_apartments: Number(t?.total_apartments) || 0,
        } as BuildingProject;
      });
    },
    enabled: !!buildingLinksQuery.data,
  });

  // Recent activity across all projects in this building
  const recentActivityQuery = useQuery({
    queryKey: ["building-activity", fatherId, buildingNumber],
    queryFn: async () => {
      const projects = projectsQuery.data;
      if (!projects || projects.length === 0) return [];

      const projectIds = projects.map((p) => p.id);
      const { data: events, error } = await supabase
        .from("scan_events")
        .select("id, project_id, mode, created_at, subpart_code, item_id, actor_email")
        .in("project_id", projectIds)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;

      const itemIds = [...new Set(events?.map((e) => e.item_id) || [])];
      const { data: items } = await supabase
        .from("items")
        .select("id, item_code")
        .in("id", itemIds);
      const itemMap = new Map(items?.map((i) => [i.id, i.item_code]) || []);

      const projectMap = new Map(
        projects.map((p) => [p.id, p.production_batch_label || p.name])
      );

      return (events || []).map((e) => ({
        id: e.id,
        project_id: e.project_id,
        project_label: projectMap.get(e.project_id) || "",
        item_code: itemMap.get(e.item_id) || "",
        mode: e.mode,
        created_at: e.created_at,
        subpart_code: e.subpart_code,
        actor_email: e.actor_email,
      }));
    },
    enabled: !!projectsQuery.data && projectsQuery.data.length > 0,
  });

  // Aggregate metrics
  const projects = projectsQuery.data || [];
  const aggregated = {
    total_items: projects.reduce((s, p) => s + p.total_items, 0),
    ready_items: projects.reduce((s, p) => s + p.ready_items, 0),
    partial_items: projects.reduce((s, p) => s + p.partial_items, 0),
    not_scanned_items: projects.reduce((s, p) => s + p.not_scanned_items, 0),
    total_floors: projects.reduce((s, p) => s + p.total_floors, 0),
    total_apartments: projects.reduce((s, p) => s + p.total_apartments, 0),
  };
  const completionPercent =
    aggregated.total_items > 0
      ? Math.round((aggregated.ready_items / aggregated.total_items) * 100)
      : 0;

  return {
    father: fatherQuery.data,
    projects,
    aggregated: { ...aggregated, completionPercent },
    recentActivity: recentActivityQuery.data || [],
    isLoading: fatherQuery.isLoading || buildingLinksQuery.isLoading || projectsQuery.isLoading,
    error: fatherQuery.error || buildingLinksQuery.error || projectsQuery.error,
  };
}
