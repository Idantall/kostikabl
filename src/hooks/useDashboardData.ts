import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface ProjectTotal {
  project_id: number;
  name: string;
  building_code: string | null;
  status: string;
  total_items: number;
  ready_items: number;
  partial_items: number;
  not_scanned_items: number;
  total_floors: number;
  total_apartments: number;
}

interface FloorTotal {
  floor_id: number;
  project_id: number;
  floor_code: string;
  total_items: number;
  ready_items: number;
  partial_items: number;
  not_scanned_items: number;
  total_apartments: number;
}

interface DailyActivity {
  date: string;
  loading_count: number;
  install_count: number;
}

interface RecentActivity {
  id: number;
  project_id: number;
  project_name: string;
  item_code: string;
  mode: string;
  created_at: string;
  subpart_code: string;
}

export function useDashboardData() {
  // Fetch all active project totals
  const projectsQuery = useQuery({
    queryKey: ["dashboard-projects"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_project_totals")
        .select("*")
        .eq("status", "active");
      
      if (error) throw error;
      return data as ProjectTotal[];
    },
  });

  // Fetch floor totals for all active projects
  const floorTotalsQuery = useQuery({
    queryKey: ["dashboard-floor-totals"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_floor_totals")
        .select("*");
      
      if (error) throw error;
      return data as FloorTotal[];
    },
    enabled: !!projectsQuery.data,
  });

  // Fetch today's activity counts
  const todayActivityQuery = useQuery({
    queryKey: ["dashboard-today-activity"],
    queryFn: async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const { data, error } = await supabase
        .from("scan_events")
        .select("mode")
        .gte("created_at", today.toISOString());
      
      if (error) throw error;
      
      const loadingCount = data?.filter(e => e.mode === "loading").length || 0;
      const installCount = data?.filter(e => e.mode === "install").length || 0;
      
      return { loadingCount, installCount };
    },
  });

  // Fetch last 30 days activity for chart
  const activityChartQuery = useQuery({
    queryKey: ["dashboard-activity-chart"],
    queryFn: async () => {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      // PostgREST enforces a max of 1000 rows per request.
      // We paginate to make sure we include the newest events as well.
      const pageSize = 1000;
      const maxPages = 20; // safety
      const all: { created_at: string; mode: string }[] = [];

      for (let page = 0; page < maxPages; page++) {
        const from = page * pageSize;
        const to = from + pageSize - 1;

        const { data, error } = await supabase
          .from("scan_events")
          .select("created_at, mode")
          .gte("created_at", thirtyDaysAgo.toISOString())
          .order("created_at", { ascending: true })
          .range(from, to);

        if (error) throw error;

        const chunk = (data || []) as { created_at: string; mode: string }[];
        all.push(...chunk);

        if (chunk.length < pageSize) break;
      }

      // Group by date and mode
      const dailyMap = new Map<string, { loading: number; install: number }>();

      // Initialize all 30 days
      for (let i = 29; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split("T")[0];
        dailyMap.set(dateStr, { loading: 0, install: 0 });
      }

      // Count events
      all.forEach((event) => {
        const dateStr = event.created_at?.split("T")[0];
        if (dateStr && dailyMap.has(dateStr)) {
          const current = dailyMap.get(dateStr)!;
          if (event.mode === "loading") {
            current.loading++;
          } else if (event.mode === "install") {
            current.install++;
          }
        }
      });

      // Convert to array
      const result: DailyActivity[] = [];
      dailyMap.forEach((counts, date) => {
        result.push({
          date,
          loading_count: counts.loading,
          install_count: counts.install,
        });
      });

      return result.sort((a, b) => a.date.localeCompare(b.date));
    },
  });

  // Fetch recent activity feed
  const recentActivityQuery = useQuery({
    queryKey: ["dashboard-recent-activity"],
    queryFn: async () => {
      const { data: events, error } = await supabase
        .from("scan_events")
        .select(`
          id,
          project_id,
          mode,
          created_at,
          subpart_code,
          item_id
        `)
        .order("created_at", { ascending: false })
        .limit(15);
      
      if (error) throw error;
      
      // Get item codes for these events
      const itemIds = [...new Set(events?.map(e => e.item_id) || [])];
      const { data: items } = await supabase
        .from("items")
        .select("id, item_code, project_id")
        .in("id", itemIds);
      
      const itemMap = new Map(items?.map(i => [i.id, i]) || []);
      
      // Get project names
      const projectIds = [...new Set(events?.map(e => e.project_id) || [])];
      const { data: projects } = await supabase
        .from("projects")
        .select("id, name")
        .in("id", projectIds);
      
      const projectMap = new Map(projects?.map(p => [p.id, p.name]) || []);
      
      return events?.map(e => ({
        id: e.id,
        project_id: e.project_id,
        project_name: projectMap.get(e.project_id) || "Unknown",
        item_code: itemMap.get(e.item_id)?.item_code || "Unknown",
        mode: e.mode,
        created_at: e.created_at,
        subpart_code: e.subpart_code,
      })) as RecentActivity[];
    },
  });

  // Calculate aggregated metrics
  const metrics = {
    activeProjects: projectsQuery.data?.length || 0,
    totalItems: projectsQuery.data?.reduce((sum, p) => sum + (p.total_items || 0), 0) || 0,
    readyItems: projectsQuery.data?.reduce((sum, p) => sum + (p.ready_items || 0), 0) || 0,
    partialItems: projectsQuery.data?.reduce((sum, p) => sum + (p.partial_items || 0), 0) || 0,
    notScannedItems: projectsQuery.data?.reduce((sum, p) => sum + (p.not_scanned_items || 0), 0) || 0,
    todayLoading: todayActivityQuery.data?.loadingCount || 0,
    todayInstall: todayActivityQuery.data?.installCount || 0,
  };

  const completionPercent = metrics.totalItems > 0 
    ? Math.round((metrics.readyItems / metrics.totalItems) * 100) 
    : 0;

  return {
    projects: projectsQuery.data || [],
    floorTotals: floorTotalsQuery.data || [],
    metrics: { ...metrics, completionPercent },
    activityChart: activityChartQuery.data || [],
    recentActivity: recentActivityQuery.data || [],
    isLoading:
      projectsQuery.isLoading ||
      floorTotalsQuery.isLoading ||
      todayActivityQuery.isLoading ||
      activityChartQuery.isLoading ||
      recentActivityQuery.isLoading,
    error: projectsQuery.error || todayActivityQuery.error,
  };
}

// Build rich context for AI assistant
export function buildAIContext(data: ReturnType<typeof useDashboardData>) {
  const { projects, floorTotals, metrics, recentActivity } = data;
  
  // Build detailed project summaries with floor breakdown
  const projectDetails = projects.map(p => {
    const projectFloors = floorTotals.filter(f => f.project_id === p.project_id);
    const progressPct = p.total_items > 0 ? Math.round((p.ready_items / p.total_items) * 100) : 0;
    
    let floorInfo = "";
    if (projectFloors.length > 0) {
      floorInfo = projectFloors.map(f => {
        const floorPct = f.total_items > 0 ? Math.round((f.ready_items / f.total_items) * 100) : 0;
        return `    קומה ${f.floor_code}: ${f.ready_items}/${f.total_items} פריטים (${floorPct}%), ${f.total_apartments} דירות`;
      }).join("\n");
    }
    
    return `
פרויקט: ${p.name}${p.building_code ? ` (${p.building_code})` : ""}
  סטטוס: ${p.status === "active" ? "פעיל" : p.status}
  התקדמות: ${p.ready_items}/${p.total_items} פריטים מוכנים (${progressPct}%)
  פריטים חלקיים: ${p.partial_items}
  פריטים שלא נסרקו: ${p.not_scanned_items}
  קומות: ${p.total_floors}, דירות: ${p.total_apartments}
${floorInfo ? `  פירוט קומות:\n${floorInfo}` : ""}`;
  }).join("\n");
  
  const recentSummary = recentActivity.slice(0, 10).map(a => {
    const timeAgo = getTimeAgo(a.created_at);
    return `- ${a.project_name}: פריט ${a.item_code} (${a.subpart_code}) - ${a.mode === "loading" ? "נטען" : "הותקן"} ${timeAgo}`;
  }).join("\n");
  
  // Identify projects needing attention
  const lowProgressProjects = projects
    .filter(p => p.total_items > 0 && (p.ready_items / p.total_items) < 0.3)
    .map(p => p.name);
  
  const highProgressProjects = projects
    .filter(p => p.total_items > 0 && (p.ready_items / p.total_items) >= 0.8)
    .map(p => p.name);
  
  return `
=== סיכום מצב מערכת Kostika ===

מדדים כלליים:
- פרויקטים פעילים: ${metrics.activeProjects}
- סה"כ פריטים במערכת: ${metrics.totalItems}
- פריטים מוכנים (נטענו והותקנו): ${metrics.readyItems} (${metrics.completionPercent}%)
- פריטים בתהליך (חלקי): ${metrics.partialItems}
- פריטים שטרם נסרקו: ${metrics.notScannedItems}
- טעינות היום: ${metrics.todayLoading}
- התקנות היום: ${metrics.todayInstall}

${lowProgressProjects.length > 0 ? `⚠️ פרויקטים עם התקדמות נמוכה (<30%): ${lowProgressProjects.join(", ")}` : ""}
${highProgressProjects.length > 0 ? `✅ פרויקטים קרובים לסיום (>80%): ${highProgressProjects.join(", ")}` : ""}

=== פירוט פרויקטים ===
${projectDetails || "אין פרויקטים פעילים"}

=== פעילות אחרונה ===
${recentSummary || "אין פעילות אחרונה"}
`.trim();
}

function getTimeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  
  if (diffMins < 1) return "עכשיו";
  if (diffMins < 60) return `לפני ${diffMins} דקות`;
  if (diffHours < 24) return `לפני ${diffHours} שעות`;
  return `לפני ${diffDays} ימים`;
}
