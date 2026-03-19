import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from "recharts";

interface StatusPieChartProps {
  metrics: {
    readyItems: number;
    partialItems: number;
    notScannedItems: number;
  };
  isLoading?: boolean;
}

const COLORS = ["#22c55e", "#eab308", "#94a3b8"];

export function StatusPieChart({ metrics, isLoading }: StatusPieChartProps) {
  const data = [
    { name: "מוכן", value: metrics.readyItems, color: COLORS[0] },
    { name: "חלקי", value: metrics.partialItems, color: COLORS[1] },
    { name: "לא נסרק", value: metrics.notScannedItems, color: COLORS[2] },
  ].filter(d => d.value > 0);

  const total = data.reduce((sum, d) => sum + d.value, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">התפלגות סטטוס פריטים</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="h-[250px] bg-muted animate-pulse rounded" />
        ) : total === 0 ? (
          <div className="h-[250px] flex items-center justify-center text-muted-foreground">
            אין נתונים
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={80}
                paddingAngle={2}
                dataKey="value"
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                labelLine={false}
              >
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ 
                  direction: "rtl",
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                }}
                formatter={(value: number) => [value.toLocaleString(), "פריטים"]}
              />
              <Legend 
                verticalAlign="bottom" 
                height={36}
                formatter={(value) => value}
              />
            </PieChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
