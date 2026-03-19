import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMemo } from "react";

/**
 * Centralized hook for fetching project data with caching and deduplication.
 * Uses TanStack Query for automatic caching and request deduplication.
 */

// Query key factories for consistent cache management
export const projectKeys = {
  all: ['projects'] as const,
  lists: () => [...projectKeys.all, 'list'] as const,
  list: (filters: string) => [...projectKeys.lists(), { filters }] as const,
  details: () => [...projectKeys.all, 'detail'] as const,
  detail: (id: number) => [...projectKeys.details(), id] as const,
  floors: (projectId: number) => [...projectKeys.detail(projectId), 'floors'] as const,
  apartments: (projectId: number) => [...projectKeys.detail(projectId), 'apartments'] as const,
  items: (projectId: number) => [...projectKeys.detail(projectId), 'items'] as const,
  recentEvents: (projectId: number) => [...projectKeys.detail(projectId), 'recentEvents'] as const,
  loadIssues: (projectId: number) => [...projectKeys.detail(projectId), 'loadIssues'] as const,
};

// Fetch project details
export function useProject(projectId: number | undefined) {
  return useQuery({
    queryKey: projectKeys.detail(projectId || 0),
    queryFn: async () => {
      if (!projectId) return null;
      const { data, error } = await supabase
        .from('projects')
        .select('id, name, building_code, created_at')
        .eq('id', projectId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!projectId,
    staleTime: 5 * 60 * 1000,
  });
}

// Fetch project floors with totals
export function useProjectFloors(projectId: number | undefined) {
  return useQuery({
    queryKey: projectKeys.floors(projectId || 0),
    queryFn: async () => {
      if (!projectId) return [];
      const { data, error } = await supabase
        .from('v_floor_totals')
        .select('floor_id, floor_code, project_id, total_items, ready_items, partial_items, not_scanned_items, total_apartments')
        .eq('project_id', projectId)
        .order('floor_code');
      if (error) throw error;
      return data || [];
    },
    enabled: !!projectId,
    staleTime: 30 * 1000, // 30 seconds for dynamic data
  });
}

// Fetch project apartments with totals
export function useProjectApartments(projectId: number | undefined) {
  return useQuery({
    queryKey: projectKeys.apartments(projectId || 0),
    queryFn: async () => {
      if (!projectId) return [];
      const { data, error } = await supabase
        .from('v_apartment_totals')
        .select('apartment_id, apt_number, floor_id, project_id, total_items, ready_items, partial_items, not_scanned_items')
        .eq('project_id', projectId)
        .order('apt_number');
      if (error) throw error;
      return data || [];
    },
    enabled: !!projectId,
    staleTime: 30 * 1000,
  });
}

// Fetch project items with pagination support
export function useProjectItems(
  projectId: number | undefined,
  options?: {
    page?: number;
    pageSize?: number;
    loadingStatusFilter?: string;
    installStatusFilter?: string;
  }
) {
  const { page = 1, pageSize = 50, loadingStatusFilter = 'all', installStatusFilter = 'all' } = options || {};
  
  return useQuery({
    queryKey: [...projectKeys.items(projectId || 0), { page, pageSize, loadingStatusFilter, installStatusFilter }],
    queryFn: async () => {
      if (!projectId) return { items: [], totalCount: 0 };
      
      let query = supabase
        .from('items')
        .select(`
          id, item_code, item_type, location, opening_no, width, height, notes, motor_side, side_rl,
          loading_status_cached, install_status_cached, required_codes,
          floors(floor_code), apartments(apt_number)
        `, { count: 'exact' })
        .eq('project_id', projectId);
      
      // Apply filters - cast to expected enum types
      if (loadingStatusFilter !== 'all') {
        query = query.eq('loading_status_cached', loadingStatusFilter as 'NOT_LOADED' | 'PARTIAL' | 'LOADED');
      }
      if (installStatusFilter !== 'all') {
        query = query.eq('install_status_cached', installStatusFilter as 'NOT_INSTALLED' | 'PARTIAL' | 'INSTALLED' | 'ISSUE');
      }
      
      // Apply pagination
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      query = query.range(from, to).order('id');
      
      const { data, error, count } = await query;
      if (error) throw error;
      
      return {
        items: data || [],
        totalCount: count || 0,
      };
    },
    enabled: !!projectId,
    staleTime: 30 * 1000,
  });
}

// Fetch recent scan events
export function useRecentScanEvents(projectId: number | undefined, limit = 10) {
  return useQuery({
    queryKey: [...projectKeys.recentEvents(projectId || 0), limit],
    queryFn: async () => {
      if (!projectId) return [];
      const { data, error } = await supabase
        .from('scan_events')
        .select('id, item_id, subpart_code, mode, loading_mark, installed_status, issue_code, created_at, actor_email')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data || [];
    },
    enabled: !!projectId,
    staleTime: 10 * 1000, // Short stale time for real-time data
  });
}

// Fetch load issues for items
export function useLoadIssues(itemIds: number[]) {
  return useQuery({
    queryKey: ['loadIssues', itemIds],
    queryFn: async () => {
      if (itemIds.length === 0) return new Map<number, any>();
      
      const { data, error } = await supabase
        .from('load_issues')
        .select('item_id, issue_codes, free_text, created_at')
        .in('item_id', itemIds)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      
      // Build map with latest issue per item
      const issueMap = new Map<number, any>();
      (data || []).forEach((issue) => {
        if (!issueMap.has(issue.item_id)) {
          issueMap.set(issue.item_id, issue);
        }
      });
      
      return issueMap;
    },
    enabled: itemIds.length > 0,
    staleTime: 30 * 1000,
  });
}

// Prefetch project data for navigation
export function usePrefetchProject() {
  const queryClient = useQueryClient();
  
  return (projectId: number) => {
    queryClient.prefetchQuery({
      queryKey: projectKeys.detail(projectId),
      queryFn: async () => {
        const { data, error } = await supabase
          .from('projects')
          .select('id, name, building_code, created_at')
          .eq('id', projectId)
          .single();
        if (error) throw error;
        return data;
      },
      staleTime: 5 * 60 * 1000,
    });
  };
}

// Dashboard summary hook - computes derived data efficiently
export function useProjectDashboard(projectId: number | undefined) {
  const { data: project, isLoading: projectLoading } = useProject(projectId);
  const { data: floors, isLoading: floorsLoading } = useProjectFloors(projectId);
  const { data: apartments, isLoading: apartmentsLoading } = useProjectApartments(projectId);
  
  const summary = useMemo(() => {
    if (!floors || !apartments) return null;
    
    const totalItems = floors.reduce((sum, f) => sum + (f.total_items || 0), 0);
    const readyItems = floors.reduce((sum, f) => sum + (f.ready_items || 0), 0);
    const partialItems = floors.reduce((sum, f) => sum + (f.partial_items || 0), 0);
    const notScannedItems = floors.reduce((sum, f) => sum + (f.not_scanned_items || 0), 0);
    
    return {
      totalFloors: floors.length,
      totalApartments: apartments.length,
      totalItems,
      readyItems,
      partialItems,
      notScannedItems,
      readyPercent: totalItems > 0 ? Math.round((readyItems / totalItems) * 100) : 0,
    };
  }, [floors, apartments]);
  
  return {
    project,
    floors,
    apartments,
    summary,
    isLoading: projectLoading || floorsLoading || apartmentsLoading,
  };
}
