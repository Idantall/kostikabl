import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Users, MapPin, CheckCircle, AlertTriangle, TrendingUp, CreditCard } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { subDays } from 'date-fns';

interface WorkerStats {
  worker_id: string;
  worker_name: string;
  card_number: number;
  department: string | null;
  station: string | null;
  total_actions: number;
  completed: number;
  issues: number;
  avg_per_day: number;
}

export function WorkerMetricsCard() {
  const { data: workerStats, isLoading } = useQuery({
    queryKey: ['worker-metrics-individual'],
    queryFn: async () => {
      // Get all workers from the workers table
      const { data: workers, error: workersError } = await supabase
        .from('workers')
        .select('id, card_number, name, department')
        .eq('is_active', true);

      if (workersError) throw workersError;
      if (!workers || workers.length === 0) return [];

      // Get worker activity for last 7 days using fetch (types not updated)
      const sevenDaysAgo = subDays(new Date(), 7);
      const session = await supabase.auth.getSession();
      
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

      // Get active sessions to determine station
      const { data: sessions } = await supabase
        .from('worker_sessions')
        .select('worker_id, station')
        .eq('is_active', true);

      const sessionMap = new Map<string, string>();
      sessions?.forEach(s => {
        if (s.station) sessionMap.set(s.worker_id, s.station);
      });

      // Aggregate by worker
      const stats: WorkerStats[] = workers.map(w => {
        const workerActivities = activities?.filter((a: any) => a.worker_id === w.id) || [];
        
        const completed = workerActivities.filter((a: any) => 
          a.action_type === 'cutlist_row_done' || a.action_type === 'cutlist_section_done'
        ).length;
        
        const issues = workerActivities.filter((a: any) => 
          a.action_type === 'cutlist_row_issue' || a.action_type === 'cutlist_section_issue'
        ).length;

        return {
          worker_id: w.id,
          worker_name: w.name,
          card_number: w.card_number,
          department: w.department,
          station: sessionMap.get(w.id) || null,
          total_actions: workerActivities.length,
          completed,
          issues,
          avg_per_day: Math.round((workerActivities.length / 7) * 10) / 10,
        };
      });

      // Sort by total actions, filter out workers with no activity
      return stats
        .filter(s => s.total_actions > 0)
        .sort((a, b) => b.total_actions - a.total_actions);
    },
    refetchInterval: 60000, // Refresh every minute
  });

  // Get station summary
  const { data: stationSummary, isLoading: stationLoading } = useQuery({
    queryKey: ['station-summary-individual'],
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
        
        // Find which station this worker is in
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

      return Array.from(stationMap.entries()).map(([station, stats]) => ({
        station,
        total: stats.total,
        completed: stats.completed,
        issues: stats.issues,
        workers: stats.workers.size,
      }));
    },
    refetchInterval: 60000,
  });

  if (isLoading || stationLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-40" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-48 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Station Summary */}
      {stationSummary && stationSummary.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <MapPin className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg">ביצועי תחנות (7 ימים)</CardTitle>
            </div>
            <CardDescription>סיכום פעילות לפי תחנת עבודה</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
              {stationSummary.map((station) => (
                <div key={station.station} className="p-4 rounded-lg border bg-card">
                  <div className="flex items-center gap-2 mb-2">
                    <Badge variant="outline">{station.station}</Badge>
                    <span className="text-xs text-muted-foreground">{station.workers} עובדים</span>
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">סה"כ:</span>
                      <span className="font-medium">{station.total}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-primary">הושלמו:</span>
                      <span className="font-medium text-primary">{station.completed}</span>
                    </div>
                    {station.issues > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-destructive">בעיות:</span>
                        <span className="font-medium text-destructive">{station.issues}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Worker Details */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">ביצועי עובדים (7 ימים)</CardTitle>
          </div>
          <CardDescription>מעקב אחר ביצועים לפי עובד (מס' כרטיס)</CardDescription>
        </CardHeader>
        <CardContent>
          {workerStats && workerStats.length > 0 ? (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>עובד</TableHead>
                    <TableHead>מס' כרטיס</TableHead>
                    <TableHead>מחלקה</TableHead>
                    <TableHead>תחנה נוכחית</TableHead>
                    <TableHead className="text-center">סה"כ</TableHead>
                    <TableHead className="text-center">הושלמו</TableHead>
                    <TableHead className="text-center">בעיות</TableHead>
                    <TableHead className="text-center">ממוצע/יום</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {workerStats.map((worker) => (
                    <TableRow key={worker.worker_id}>
                      <TableCell className="font-medium">{worker.worker_name}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="gap-1">
                          <CreditCard className="h-3 w-3" />
                          {worker.card_number}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {worker.department || '-'}
                      </TableCell>
                      <TableCell>
                        {worker.station ? (
                          <Badge variant="outline" className="gap-1">
                            <MapPin className="h-3 w-3" />
                            {worker.station}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">לא פעיל</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center font-medium">{worker.total_actions}</TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-1 text-primary">
                          <CheckCircle className="h-3 w-3" />
                          {worker.completed}
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        {worker.issues > 0 ? (
                          <div className="flex items-center justify-center gap-1 text-destructive">
                            <AlertTriangle className="h-3 w-3" />
                            {worker.issues}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">0</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-1 text-primary">
                          <TrendingUp className="h-3 w-3" />
                          {worker.avg_per_day}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              אין נתוני עובדים זמינים. עובדים יופיעו כאן לאחר שיזדהו במערכת ויבצעו פעולות.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
