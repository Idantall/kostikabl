import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { MapPin, Users } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { subDays } from 'date-fns';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

interface StationData {
  station: string;
  total: number;
  completed: number;
  issues: number;
  workers: number;
}

const COLORS = ['hsl(var(--primary))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))', 'hsl(var(--chart-5))'];

export function StationPerformanceChart() {
  const { data: stationData, isLoading } = useQuery({
    queryKey: ['station-performance-chart'],
    queryFn: async () => {
      const sevenDaysAgo = subDays(new Date(), 7);
      const session = await supabase.auth.getSession();
      
      // Get active sessions with stations
      const { data: sessions } = await supabase
        .from('worker_sessions')
        .select('worker_id, station')
        .eq('is_active', true)
        .not('station', 'is', null);

      if (!sessions || sessions.length === 0) return [];

      // Get activities with worker_id
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/worker_activity_logs?created_at=gte.${sevenDaysAgo.toISOString()}&select=worker_id,action_type`,
        {
          headers: {
            'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            'Authorization': `Bearer ${session.data.session?.access_token}`,
          }
        }
      );

      const activities = response.ok ? await response.json() : [];

      // Group by station
      const stationMap = new Map<string, { total: number; completed: number; issues: number; workers: Set<string> }>();

      sessions.forEach(s => {
        if (!s.station) return;
        const current = stationMap.get(s.station) || { total: 0, completed: 0, issues: 0, workers: new Set<string>() };
        current.workers.add(s.worker_id);
        stationMap.set(s.station, current);
      });

      // Add activity counts
      activities?.forEach((a: any) => {
        if (!a.worker_id) return;
        
        const session = sessions.find(s => s.worker_id === a.worker_id);
        if (!session?.station) return;

        const current = stationMap.get(session.station);
        if (!current) return;

        current.total++;
        if (a.action_type === 'cutlist_row_done' || a.action_type === 'cutlist_section_done') {
          current.completed++;
        }
        if (a.action_type === 'cutlist_row_issue' || a.action_type === 'cutlist_section_issue') {
          current.issues++;
        }
      });

      return Array.from(stationMap.entries())
        .map(([station, stats]) => ({
          station,
          total: stats.total,
          completed: stats.completed,
          issues: stats.issues,
          workers: stats.workers.size,
        }))
        .sort((a, b) => b.total - a.total);
    },
    refetchInterval: 60000,
  });

  if (isLoading) {
    return (
      <Card className="col-span-1 lg:col-span-2">
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!stationData || stationData.length === 0) {
    return (
      <Card className="col-span-1 lg:col-span-2">
        <CardHeader>
          <div className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-primary" />
            <CardTitle>ביצועי תחנות</CardTitle>
          </div>
          <CardDescription>7 ימים אחרונים</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-64 text-muted-foreground">
            אין נתוני תחנות זמינים. עובדים יופיעו כאן לאחר שיזדהו ויעבדו בתחנות מוגדרות.
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="col-span-1 lg:col-span-2">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-primary" />
            <CardTitle>ביצועי תחנות</CardTitle>
          </div>
          <Badge variant="outline" className="gap-1">
            <Users className="h-3 w-3" />
            {stationData.reduce((sum, s) => sum + s.workers, 0)} עובדים פעילים
          </Badge>
        </div>
        <CardDescription>סה"כ פעולות ב-7 ימים אחרונים לפי תחנה</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={stationData}
              layout="vertical"
              margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis type="number" className="text-xs" />
              <YAxis 
                dataKey="station" 
                type="category" 
                width={80}
                className="text-xs"
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const data = payload[0].payload as StationData;
                  return (
                    <div className="bg-background border rounded-lg shadow-lg p-3 text-sm" dir="rtl">
                      <p className="font-medium mb-2">{data.station}</p>
                      <div className="space-y-1">
                        <p>סה"כ: <span className="font-medium">{data.total}</span></p>
                        <p className="text-primary">הושלמו: <span className="font-medium">{data.completed}</span></p>
                        {data.issues > 0 && (
                          <p className="text-destructive">בעיות: <span className="font-medium">{data.issues}</span></p>
                        )}
                        <p className="text-muted-foreground">עובדים: {data.workers}</p>
                      </div>
                    </div>
                  );
                }}
              />
              <Bar dataKey="total" radius={[0, 4, 4, 0]}>
                {stationData.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Station cards below chart */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mt-4">
          {stationData.map((station, index) => (
            <div 
              key={station.station} 
              className="p-3 rounded-lg border bg-card text-center"
              style={{ borderLeftColor: COLORS[index % COLORS.length], borderLeftWidth: 4 }}
            >
              <p className="font-medium text-sm">{station.station}</p>
              <p className="text-2xl font-bold mt-1">{station.completed}</p>
              <p className="text-xs text-muted-foreground">הושלמו</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
