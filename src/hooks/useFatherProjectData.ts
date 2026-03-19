import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface FatherProject {
  id: string;
  name: string;
  metadata: any;
  contractor: string | null;
  created_by: string | null;
  created_at: string;
}

export interface BuildingEntry {
  father_project_id: string;
  building_project_id: number;
  building_number: string;
  created_at: string;
  // joined
  project_name?: string;
  project_status?: string;
  building_code?: string | null;
}

/** List all father projects */
export function useFatherProjects() {
  return useQuery({
    queryKey: ["father-projects"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("father_projects")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as FatherProject[];
    },
  });
}

/** Father project detail + buildings */
export function useFatherProjectDetail(fatherId: string | undefined) {
  const fatherQuery = useQuery({
    queryKey: ["father-project", fatherId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("father_projects")
        .select("*")
        .eq("id", fatherId!)
        .single();
      if (error) throw error;
      return data as FatherProject;
    },
    enabled: !!fatherId,
  });

  const buildingsQuery = useQuery({
    queryKey: ["father-project-buildings", fatherId],
    queryFn: async () => {
      const { data: links, error } = await supabase
        .from("father_project_buildings")
        .select("*")
        .eq("father_project_id", fatherId!)
        .order("building_number", { ascending: true });
      if (error) throw error;
      if (!links || links.length === 0) return [];

      const projectIds = links.map((l) => l.building_project_id);
      const { data: projects } = await supabase
        .from("projects")
        .select("id, name, status, building_code")
        .in("id", projectIds);
      const projectMap = new Map(projects?.map((p) => [p.id, p]) || []);

      return links.map((link) => {
        const proj = projectMap.get(link.building_project_id);
        return {
          ...link,
          project_name: proj?.name || "",
          project_status: proj?.status || "",
          building_code: proj?.building_code || null,
        } as BuildingEntry;
      });
    },
    enabled: !!fatherId,
  });

  // Per-building metrics
  const buildingIds = buildingsQuery.data?.map(b => b.building_project_id) ?? [];
  const metricsQuery = useQuery({
    queryKey: ["father-project-metrics", fatherId, buildingIds],
    queryFn: async () => {
      const buildings = buildingsQuery.data;
      if (!buildings || buildings.length === 0) return new Map();

      const ids = buildings.map((b) => b.building_project_id);
      const metricsMap = new Map<number, {
        apartments: number;
        items: number;
        totalFloors: number;
        exportedFloors: number;
        batches: number;
      }>();

      const { data: measRows } = await supabase
        .from("measurement_rows")
        .select("project_id, floor_label, apartment_label")
        .in("project_id", ids);

      const { data: activeTotals } = await supabase
        .from("v_project_totals")
        .select("project_id, total_apartments, total_items, total_floors")
        .in("project_id", ids);
      const activeTotalsMap = new Map(activeTotals?.map((t) => [t.project_id, t]) || []);

      const { data: exports } = await supabase
        .from("measurement_floor_exports")
        .select("measurement_project_id, floor_label")
        .in("measurement_project_id", ids);

      const { data: batchProjects } = await supabase
        .from("projects")
        .select("id, name, production_batch_label, source_measurement_project_id, created_at, status")
        .eq("status", "active")
        .in("source_measurement_project_id", ids);

      for (const b of buildings) {
        const pid = b.building_project_id;
        const status = b.project_status;

        if (status === "active") {
          const t = activeTotalsMap.get(pid);
          metricsMap.set(pid, {
            apartments: Number(t?.total_apartments) || 0,
            items: Number(t?.total_items) || 0,
            totalFloors: Number(t?.total_floors) || 0,
            exportedFloors: 0,
            batches: 0,
          });
        } else {
          const rows = measRows?.filter((r) => r.project_id === pid) || [];
          const uniqueApts = new Set(rows.map((r) => r.apartment_label).filter(Boolean));
          const uniqueFloors = new Set(rows.map((r) => r.floor_label).filter(Boolean));
          const exportedFloors = new Set(
            exports?.filter((e) => e.measurement_project_id === pid).map((e) => e.floor_label) || []
          );
          const batches = batchProjects?.filter((p) => p.source_measurement_project_id === pid).length || 0;

          metricsMap.set(pid, {
            apartments: uniqueApts.size,
            items: rows.length,
            totalFloors: uniqueFloors.size,
            exportedFloors: exportedFloors.size,
            batches,
          });
        }
      }

      return metricsMap;
    },
    enabled: !!buildingsQuery.data && buildingsQuery.data.length > 0,
  });

  // Batch projects (production feed)
  const batchesQuery = useQuery({
    queryKey: ["father-project-batches", fatherId],
    queryFn: async () => {
      const buildings = buildingsQuery.data;
      if (!buildings || buildings.length === 0) return [];
      const ids = buildings.map((b) => b.building_project_id);

      const { data, error } = await supabase
        .from("projects")
        .select("id, name, production_batch_label, source_measurement_project_id, created_at, status")
        .eq("status", "active")
        .in("source_measurement_project_id", ids)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!buildingsQuery.data && buildingsQuery.data.length > 0,
  });

  return {
    father: fatherQuery.data,
    buildings: buildingsQuery.data || [],
    metrics: metricsQuery.data || new Map(),
    batches: batchesQuery.data || [],
    isLoading: fatherQuery.isLoading || buildingsQuery.isLoading,
    error: fatherQuery.error || buildingsQuery.error,
  };
}

/** Create father project */
export function useCreateFatherProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ name, contractor }: { name: string; contractor?: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("father_projects")
        .insert({ name, created_by: user?.id, contractor: contractor || null })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["father-projects"] });
    },
  });
}

/** Delete father project */
export function useDeleteFatherProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (fatherId: string) => {
      // Delete buildings first
      const { error: buildingsError } = await supabase
        .from("father_project_buildings")
        .delete()
        .eq("father_project_id", fatherId);
      if (buildingsError) throw buildingsError;
      // Delete father project
      const { error } = await supabase
        .from("father_projects")
        .delete()
        .eq("id", fatherId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["father-projects"] });
    },
  });
}

/** Update father project (name, contractor) */
export function useUpdateFatherProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, name, contractor }: { id: string; name?: string; contractor?: string | null }) => {
      const updates: Record<string, any> = {};
      if (name !== undefined) updates.name = name;
      if (contractor !== undefined) updates.contractor = contractor;
      const { error } = await supabase
        .from("father_projects")
        .update(updates)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["father-projects"] });
      queryClient.invalidateQueries({ queryKey: ["father-project", vars.id] });
    },
  });
}

/** Add building to father project */
export function useAddBuilding() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      fatherId,
      buildingProjectId,
      buildingNumber,
    }: {
      fatherId: string;
      buildingProjectId: number;
      buildingNumber: string;
    }) => {
      const { error } = await supabase.from("father_project_buildings").insert({
        father_project_id: fatherId,
        building_project_id: buildingProjectId,
        building_number: buildingNumber,
      });
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["father-project-buildings", vars.fatherId] });
      queryClient.invalidateQueries({ queryKey: ["father-project-metrics", vars.fatherId] });
      queryClient.invalidateQueries({ queryKey: ["father-project-batches", vars.fatherId] });
    },
  });
}

/** Remove building from father project */
export function useRemoveBuilding() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      fatherId,
      buildingProjectId,
    }: {
      fatherId: string;
      buildingProjectId: number;
    }) => {
      const { error } = await supabase
        .from("father_project_buildings")
        .delete()
        .eq("father_project_id", fatherId)
        .eq("building_project_id", buildingProjectId);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["father-project-buildings", vars.fatherId] });
      queryClient.invalidateQueries({ queryKey: ["father-project-metrics", vars.fatherId] });
    },
  });
}

/** Update building number for a project in a father project */
export function useUpdateBuildingNumber() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      fatherId,
      buildingProjectId,
      newBuildingNumber,
    }: {
      fatherId: string;
      buildingProjectId: number;
      newBuildingNumber: string;
    }) => {
      const { error } = await supabase
        .from("father_project_buildings")
        .update({ building_number: newBuildingNumber })
        .eq("father_project_id", fatherId)
        .eq("building_project_id", buildingProjectId);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["father-project-buildings", vars.fatherId] });
      queryClient.invalidateQueries({ queryKey: ["father-project-metrics", vars.fatherId] });
    },
  });
}

/** Swap building numbers between two building groups */
export function useSwapBuildingNumbers() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      fatherId,
      fromNumber,
      toNumber,
    }: {
      fatherId: string;
      fromNumber: string;
      toNumber: string;
    }) => {
      const tempNumber = "__swap_temp__";
      const { error: e1 } = await supabase
        .from("father_project_buildings")
        .update({ building_number: tempNumber })
        .eq("father_project_id", fatherId)
        .eq("building_number", fromNumber);
      if (e1) throw e1;
      const { error: e2 } = await supabase
        .from("father_project_buildings")
        .update({ building_number: fromNumber })
        .eq("father_project_id", fatherId)
        .eq("building_number", toNumber);
      if (e2) throw e2;
      const { error: e3 } = await supabase
        .from("father_project_buildings")
        .update({ building_number: toNumber })
        .eq("father_project_id", fatherId)
        .eq("building_number", tempNumber);
      if (e3) throw e3;
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["father-project-buildings", vars.fatherId] });
      queryClient.invalidateQueries({ queryKey: ["father-project-metrics", vars.fatherId] });
    },
  });
}

/** Get father project for a given building project id */
export function useBuildingFatherProject(buildingProjectId: number | undefined) {
  return useQuery({
    queryKey: ["building-father-project", buildingProjectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("father_project_buildings")
        .select("father_project_id, building_number")
        .eq("building_project_id", buildingProjectId!)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;

      const { data: father } = await supabase
        .from("father_projects")
        .select("id, name")
        .eq("id", data.father_project_id)
        .single();

      return father ? { ...father, building_number: data.building_number } : null;
    },
    enabled: !!buildingProjectId,
  });
}
