import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { WorkerLayout } from '@/components/worker/WorkerLayout';
import { useWorkerIdentity } from '@/components/worker/WorkerIdentityContext';
import { useCutlistLanguage } from '@/contexts/CutlistLanguageContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ClipboardList, CheckCircle2, AlertCircle, Clock, MapPin, Ruler } from 'lucide-react';
import { format } from 'date-fns';
import { he } from 'date-fns/locale';

interface ActivitySummary {
  total_today: number;
  done_today: number;
  issues_today: number;
}

interface RecentActivity {
  id: string;
  action_type: string;
  section_ref: string;
  project_name: string;
  created_at: string;
  worker_name?: string;
}

function WorkerPortalContent() {
  const { activeWorkers } = useWorkerIdentity();
  const { t, isRtl } = useCutlistLanguage();
  const [userStation, setUserStation] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [activitySummary, setActivitySummary] = useState<ActivitySummary>({
    total_today: 0,
    done_today: 0,
    issues_today: 0,
  });
  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([]);
  const [loading, setLoading] = useState(true);

  const workerNames = activeWorkers.length > 0
    ? activeWorkers.map(s => s.worker.name).join(' ו')
    : undefined;

  useEffect(() => {
    const fetchData = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      
      setUserEmail(user.email || null);

      const { data: roleData } = await supabase
        .from('user_roles')
        .select('station')
        .eq('user_id', user.id)
        .single();
      
      if (roleData?.station) {
        setUserStation(roleData.station);
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const session = await supabase.auth.getSession();
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/worker_activity_logs?user_id=eq.${user.id}&created_at=gte.${today.toISOString()}&select=action_type,worker_id`,
        {
          headers: {
            'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            'Authorization': `Bearer ${session.data.session?.access_token}`,
          }
        }
      );
      
      if (response.ok) {
        const todayLogs = await response.json();
        const doneCount = todayLogs.filter((l: any) => l.action_type.includes('done')).length;
        const issueCount = todayLogs.filter((l: any) => l.action_type.includes('issue')).length;
        setActivitySummary({
          total_today: todayLogs.length,
          done_today: doneCount,
          issues_today: issueCount,
        });
      }

      const recentResponse = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/worker_activity_logs?user_id=eq.${user.id}&select=id,action_type,section_ref,project_name,created_at,worker_id&order=created_at.desc&limit=10`,
        {
          headers: {
            'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            'Authorization': `Bearer ${session.data.session?.access_token}`,
          }
        }
      );

      if (recentResponse.ok) {
        const recent = await recentResponse.json();
        const workerIds = [...new Set(recent.filter((r: any) => r.worker_id).map((r: any) => r.worker_id))];
        let workerMap = new Map<string, string>();
        
        if (workerIds.length > 0) {
          const { data: workers } = await supabase
            .from('workers')
            .select('id, name, card_number')
            .in('id', workerIds as string[]);
          workers?.forEach(w => {
            workerMap.set(w.id, `${w.name} (#${w.card_number})`);
          });
        }

        const activitiesWithWorkers = recent.map((r: any) => ({
          ...r,
          worker_name: r.worker_id ? workerMap.get(r.worker_id) : undefined
        }));
        setRecentActivity(activitiesWithWorkers);
      }

      setLoading(false);
    };

    void fetchData();
  }, []);

  const getActionLabel = (actionType: string) => {
    const labels: Record<string, { key: string; variant: 'default' | 'destructive' | 'secondary' }> = {
      cutlist_row_done: { key: 'rowCompleted', variant: 'default' },
      cutlist_row_issue: { key: 'issueReportedAction', variant: 'destructive' },
      cutlist_section_done: { key: 'sectionCompleted', variant: 'default' },
      cutlist_section_issue: { key: 'sectionIssue', variant: 'destructive' },
      cutlist_section_packed: { key: 'sectionPacked', variant: 'secondary' },
      cutlist_section_reopened: { key: 'sectionReopened', variant: 'secondary' },
      cutlist_row_reopened: { key: 'rowReopened', variant: 'secondary' },
    };
    const entry = labels[actionType];
    if (!entry) return { text: actionType, variant: 'secondary' as const };
    return { text: t(entry.key as any), variant: entry.variant };
  };

  return (
    <div className="space-y-6">
      {/* Welcome Section */}
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">{t('welcomeWorker')}, {workerNames || ''}! 👋</h1>
        {userEmail && (
          <p className="text-sm text-muted-foreground">{userEmail}</p>
        )}
        <div className="flex items-center gap-2">
          <p className="text-muted-foreground">{t('welcomeToPortal')}</p>
          {userStation && (
            <Badge variant="secondary" className="gap-1">
              <MapPin className="h-3 w-3" />
              {userStation}
            </Badge>
          )}
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('actionsToday')}</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activitySummary.total_today}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('completedToday')}</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">{activitySummary.done_today}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('issueReports')}</CardTitle>
            <AlertCircle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{activitySummary.issues_today}</div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>{t('quickActions')}</CardTitle>
          <CardDescription>{t('quickActionsDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Link to="/worker/cutlist">
            <Button variant="outline" className="w-full h-24 flex flex-col gap-2">
              <ClipboardList className="h-8 w-8" />
              <span>{t('productionOrder')}</span>
            </Button>
          </Link>
          <Link to="/worker/optimization">
            <Button variant="outline" className="w-full h-24 flex flex-col gap-2">
              <Ruler className="h-8 w-8" />
              <span>{t('optimization')}</span>
            </Button>
          </Link>
        </CardContent>
      </Card>

      {/* Recent Activity */}
      <Card>
        <CardHeader>
          <CardTitle>{t('recentActivityTitle')}</CardTitle>
          <CardDescription>{t('recentActivityDesc')}</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground text-center py-4">{t('loading')}</p>
          ) : recentActivity.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">
              {t('noActivityYet')}
            </p>
          ) : (
            <div className="space-y-3">
              {recentActivity.map((activity) => {
                const { text, variant } = getActionLabel(activity.action_type);
                return (
                  <div 
                    key={activity.id} 
                    className="flex items-center justify-between p-3 rounded-lg border bg-card"
                  >
                    <div className="flex items-center gap-3">
                      <Badge variant={variant}>{text}</Badge>
                      <div>
                        <p className="font-medium">{activity.section_ref}</p>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          {activity.project_name && (
                            <span>{activity.project_name}</span>
                          )}
                          {activity.worker_name && (
                            <Badge variant="outline" className="text-xs">
                              {activity.worker_name}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                    <span className="text-sm text-muted-foreground">
                      {format(new Date(activity.created_at), 'HH:mm', { locale: he })}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function WorkerPortal() {
  return (
    <WorkerLayout>
      <WorkerPortalContent />
    </WorkerLayout>
  );
}
