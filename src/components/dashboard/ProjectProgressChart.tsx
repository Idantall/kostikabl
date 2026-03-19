import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { useNavigate } from "react-router-dom";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface Project {
  project_id: number;
  name: string;
  total_items: number;
  ready_items: number;
}

interface ProjectProgressChartProps {
  projects: Project[];
  isLoading?: boolean;
}

type ProgressMode = "overall" | "loading" | "install";

export function ProjectProgressChart({ projects, isLoading }: ProjectProgressChartProps) {
  const navigate = useNavigate();
  const [mode, setMode] = useState<ProgressMode>("overall");

  // Fetch items with loading/install status for detailed breakdown
  const { data: itemStats } = useQuery({
    queryKey: ["project-item-stats", projects.map(p => p.project_id)],
    queryFn: async () => {
      if (projects.length === 0) return {};
      
      const projectIds = projects.map(p => p.project_id);
      const { data, error } = await supabase
        .from("items")
        .select("project_id, loading_status_cached, install_status_cached")
        .in("project_id", projectIds);
      
      if (error) throw error;
      
      // Aggregate by project
      const stats: Record<number, { 
        total: number; 
        loaded: number; 
        installed: number;
      }> = {};
      
      projectIds.forEach(id => {
        stats[id] = { total: 0, loaded: 0, installed: 0 };
      });
      
      data?.forEach(item => {
        const projectStats = stats[item.project_id];
        if (projectStats) {
          projectStats.total++;
          if (item.loading_status_cached === "LOADED") {
            projectStats.loaded++;
          }
          if (item.install_status_cached === "INSTALLED") {
            projectStats.installed++;
          }
        }
      });
      
      return stats;
    },
    enabled: projects.length > 0 && mode !== "overall",
  });

  const getChartData = () => {
    return projects
      .filter(p => p.total_items > 0)
      .map(p => {
        let progress: number;
        let completed: number;
        let total: number;
        
        if (mode === "overall") {
          progress = Math.round((p.ready_items / p.total_items) * 100);
          completed = p.ready_items;
          total = p.total_items;
        } else if (mode === "loading" && itemStats?.[p.project_id]) {
          const stats = itemStats[p.project_id];
          progress = stats.total > 0 ? Math.round((stats.loaded / stats.total) * 100) : 0;
          completed = stats.loaded;
          total = stats.total;
        } else if (mode === "install" && itemStats?.[p.project_id]) {
          const stats = itemStats[p.project_id];
          progress = stats.total > 0 ? Math.round((stats.installed / stats.total) * 100) : 0;
          completed = stats.installed;
          total = stats.total;
        } else {
          // Fallback to overall
          progress = Math.round((p.ready_items / p.total_items) * 100);
          completed = p.ready_items;
          total = p.total_items;
        }
        
        return {
          id: p.project_id,
          name: p.name.length > 12 ? p.name.substring(0, 12) + "..." : p.name,
          fullName: p.name,
          progress,
          ready: completed,
          total,
        };
      })
      .sort((a, b) => b.progress - a.progress)
      .slice(0, 8);
  };

  const chartData = getChartData();

  const getBarColor = (progress: number) => {
    if (progress >= 80) return "hsl(142, 76%, 36%)"; // green
    if (progress >= 50) return "hsl(45, 93%, 47%)"; // yellow
    return "hsl(0, 84%, 60%)"; // red
  };

  const getModeLabel = () => {
    switch (mode) {
      case "loading": return "טעינה";
      case "install": return "התקנה";
      default: return "התקדמות";
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-lg">התקדמות פרויקטים</CardTitle>
        <Select value={mode} onValueChange={(v) => setMode(v as ProgressMode)}>
          <SelectTrigger className="w-[130px] h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="end">
            <SelectItem value="overall">כללי</SelectItem>
            <SelectItem value="loading">טעינה</SelectItem>
            <SelectItem value="install">התקנה</SelectItem>
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent className="pt-0 pb-2 px-2">
        {isLoading ? (
          <div className="h-[300px] bg-muted animate-pulse rounded" />
        ) : chartData.length === 0 ? (
          <div className="h-[300px] flex items-center justify-center text-muted-foreground">
            אין פרויקטים פעילים
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={320}>
            <BarChart 
              data={chartData} 
              layout="vertical"
              margin={{ top: 5, right: 15, left: 5, bottom: 5 }}
              onClick={(data) => {
                if (data?.activePayload?.[0]?.payload?.id) {
                  navigate(`/projects/${data.activePayload[0].payload.id}`);
                }
              }}
            >
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" horizontal={false} />
              <XAxis 
                type="number" 
                domain={[0, 100]} 
                tick={{ fontSize: 10 }} 
                tickLine={false}
                axisLine={false}
              />
              <YAxis 
                type="category" 
                dataKey="name" 
                tick={{ fontSize: 10, textAnchor: "end" }}
                width={90}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                contentStyle={{ 
                  direction: "rtl",
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                  fontSize: "12px",
                }}
                formatter={(value: number, name: string, props: any) => [
                  `${props.payload.ready}/${props.payload.total} פריטים (${value}%)`,
                  getModeLabel()
                ]}
                labelFormatter={(label) => chartData.find(d => d.name === label)?.fullName || label}
              />
              <Bar 
                dataKey="progress" 
                radius={[0, 4, 4, 0]}
                cursor="pointer"
                maxBarSize={28}
              >
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={getBarColor(entry.progress)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}