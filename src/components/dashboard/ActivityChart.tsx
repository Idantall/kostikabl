import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";

interface DailyActivity {
  date: string;
  loading_count: number;
  install_count: number;
}

interface ActivityChartProps {
  data: DailyActivity[];
  isLoading?: boolean;
}

export function ActivityChart({ data, isLoading }: ActivityChartProps) {
  // Format date for display
  const formattedData = data.map(d => ({
    ...d,
    displayDate: new Date(d.date).toLocaleDateString("he-IL", { 
      day: "numeric", 
      month: "short" 
    }),
  }));

  return (
    <Card className="col-span-1 lg:col-span-2">
      <CardHeader>
        <CardTitle className="text-lg">פעילות - 30 יום אחרונים</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="h-[300px] bg-muted animate-pulse rounded" />
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={formattedData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="colorLoading" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f97316" stopOpacity={0.8}/>
                  <stop offset="95%" stopColor="#f97316" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="colorInstall" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#22c55e" stopOpacity={0.8}/>
                  <stop offset="95%" stopColor="#22c55e" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis 
                dataKey="displayDate" 
                tick={{ fontSize: 12 }}
                interval="preserveStartEnd"
              />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip 
                contentStyle={{ 
                  direction: "rtl",
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                }}
                labelStyle={{ fontWeight: "bold", marginBottom: "4px" }}
              />
              <Legend 
                verticalAlign="top" 
                height={36}
                formatter={(value) => value === "loading_count" ? "טעינות" : "התקנות"}
              />
              <Area 
                type="monotone" 
                dataKey="loading_count" 
                name="loading_count"
                stroke="#f97316" 
                fillOpacity={1} 
                fill="url(#colorLoading)" 
              />
              <Area 
                type="monotone" 
                dataKey="install_count" 
                name="install_count"
                stroke="#22c55e" 
                fillOpacity={1} 
                fill="url(#colorInstall)" 
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
