import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ParentProjectTotals {
  parent_project_id: number;
  parent_name: string;
  building_code: string | null;
  parent_status: string;
  child_count: number;
  total_items: number;
  ready_items: number;
  partial_items: number;
  not_scanned_items: number;
  total_floors: number;
  total_apartments: number;
}

export interface ChildProject {
  id: number;
  name: string;
  production_batch_label: string | null;
  status: string;
  total_items: number;
  ready_items: number;
  partial_items: number;
  not_scanned_items: number;
  total_floors: number;
  total_apartments: number;
}

export function useParentProjectData(parentId: number | undefined) {
  // Fetch parent project info
  const parentQuery = useQuery({
    queryKey: ["parent-project", parentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("id, name, building_code, status")
        .eq("id", parentId!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!parentId,
  });

  // Fetch child projects with their totals
  const childrenQuery = useQuery({
    queryKey: ["parent-project-children", parentId],
    queryFn: async () => {
      const { data: children, error } = await supabase
        .from("projects")
        .select("id, name, production_batch_label, status")
        .eq("parent_project_id", parentId!)
        .neq("id", parentId!)
        .in("status", ["active", "purchasing"])
        .order("id", { ascending: true });
      if (error) throw error;

      // Fetch totals for each child
      const childIds = children.map((c) => c.id);
      const { data: totals, error: totalsError } = await supabase
        .from("v_project_totals")
        .select("*")
        .in("project_id", childIds);
      if (totalsError) throw totalsError;

      const totalsMap = new Map(totals?.map((t) => [t.project_id, t]) || []);

      return children.map((child) => {
        const t = totalsMap.get(child.id);
        return {
          ...child,
          total_items: t?.total_items || 0,
          ready_items: t?.ready_items || 0,
          partial_items: t?.partial_items || 0,
          not_scanned_items: t?.not_scanned_items || 0,
          total_floors: t?.total_floors || 0,
          total_apartments: t?.total_apartments || 0,
        } as ChildProject;
      });
    },
    enabled: !!parentId,
  });

  // Fetch recent activity across all child projects
  const recentActivityQuery = useQuery({
    queryKey: ["parent-project-activity", parentId],
    queryFn: async () => {
      const childIds =
        childrenQuery.data?.map((c) => c.id) || [];
      if (childIds.length === 0) return [];

      const { data: events, error } = await supabase
        .from("scan_events")
        .select("id, project_id, mode, created_at, subpart_code, item_id")
        .in("project_id", childIds)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;

      // Get item codes
      const itemIds = [...new Set(events?.map((e) => e.item_id) || [])];
      const { data: items } = await supabase
        .from("items")
        .select("id, item_code")
        .in("id", itemIds);
      const itemMap = new Map(items?.map((i) => [i.id, i.item_code]) || []);

      // Get project names
      const projectMap = new Map(
        childrenQuery.data?.map((c) => [c.id, c.production_batch_label || c.name]) || []
      );

      return (events || []).map((e) => ({
        id: e.id,
        project_id: e.project_id,
        project_label: projectMap.get(e.project_id) || "",
        item_code: itemMap.get(e.item_id) || "",
        mode: e.mode,
        created_at: e.created_at,
        subpart_code: e.subpart_code,
      }));
    },
    enabled: !!childrenQuery.data && childrenQuery.data.length > 0,
  });

  // Aggregate metrics
  const children = childrenQuery.data || [];
  const aggregated = {
    total_items: children.reduce((s, c) => s + c.total_items, 0),
    ready_items: children.reduce((s, c) => s + c.ready_items, 0),
    partial_items: children.reduce((s, c) => s + c.partial_items, 0),
    not_scanned_items: children.reduce((s, c) => s + c.not_scanned_items, 0),
    total_floors: children.reduce((s, c) => s + c.total_floors, 0),
    total_apartments: children.reduce((s, c) => s + c.total_apartments, 0),
  };

  const completionPercent =
    aggregated.total_items > 0
      ? Math.round((aggregated.ready_items / aggregated.total_items) * 100)
      : 0;

  return {
    parent: parentQuery.data,
    children,
    aggregated: { ...aggregated, completionPercent },
    recentActivity: recentActivityQuery.data || [],
    isLoading: parentQuery.isLoading || childrenQuery.isLoading,
    error: parentQuery.error || childrenQuery.error,
  };
}

/** Fetch all parent project groupings for the projects list */
export function useParentProjectGroupings() {
  return useQuery({
    queryKey: ["parent-project-groupings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("id, parent_project_id")
        .not("parent_project_id", "is", null);
      if (error) throw error;
      return data as { id: number; parent_project_id: number }[];
    },
  });
}

/** Fetch projects that serve as parent roots (parent_project_id = id) */
export function useAvailableParentProjects() {
  return useQuery({
    queryKey: ["available-parent-projects"],
    queryFn: async () => {
      // Get all projects that are parent roots (self-referencing)
      const { data, error } = await supabase
        .from("projects")
        .select("id, name, building_code, status, parent_project_id")
        .order("name", { ascending: true });
      if (error) throw error;
      // Filter to those where parent_project_id === id (group roots)
      const roots = (data || []).filter((p) => p.parent_project_id === p.id);
      return roots as { id: number; name: string; building_code: string | null; status: string }[];
    },
  });
}

/** Compare structure of a project against existing children in a parent group */
export function useProjectStructureComparison(
  projectId: number | undefined,
  parentId: number | undefined
) {
  return useQuery({
    queryKey: ["project-structure-comparison", projectId, parentId],
    queryFn: async () => {
      if (!projectId || !parentId) return { hasMismatch: false, details: "" };

      // Get totals for the project we want to add
      const { data: projectTotals } = await supabase
        .from("v_project_totals")
        .select("total_floors, total_apartments")
        .eq("project_id", projectId)
        .maybeSingle();

      // Get totals for existing children
      const { data: children } = await supabase
        .from("projects")
        .select("id")
        .eq("parent_project_id", parentId)
        .neq("id", projectId);

      if (!children || children.length === 0) {
        return { hasMismatch: false, details: "" };
      }

      const childIds = children.map((c) => c.id);
      const { data: childTotals } = await supabase
        .from("v_project_totals")
        .select("total_floors, total_apartments")
        .in("project_id", childIds);

      if (!childTotals || childTotals.length === 0 || !projectTotals) {
        return { hasMismatch: false, details: "" };
      }

      const avgFloors =
        childTotals.reduce((s, c) => s + (c.total_floors || 0), 0) / childTotals.length;
      const avgApts =
        childTotals.reduce((s, c) => s + (c.total_apartments || 0), 0) / childTotals.length;

      const projFloors = projectTotals.total_floors || 0;
      const projApts = projectTotals.total_apartments || 0;

      const floorDiff = avgFloors > 0 ? Math.abs(projFloors - avgFloors) / avgFloors : 0;
      const aptDiff = avgApts > 0 ? Math.abs(projApts - avgApts) / avgApts : 0;

      const hasMismatch = floorDiff > 0.5 || aptDiff > 0.5;
      const details = hasMismatch
        ? `${projFloors} קומות / ${projApts} דירות לעומת ממוצע ${Math.round(avgFloors)} קומות / ${Math.round(avgApts)} דירות בקבוצה`
        : "";

      return { hasMismatch, details };
    },
    enabled: !!projectId && !!parentId,
  });
}
