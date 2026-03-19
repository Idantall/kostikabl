import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { CheckCircle2, AlertCircle, Clock, Users, Scissors, GlassWater, Package, CreditCard } from 'lucide-react';
import { useManufacturingData, type ManufacturingData } from '@/hooks/useManufacturingData';
import { format } from 'date-fns';
import { he } from 'date-fns/locale';

const ACTION_LABELS: Record<string, { text: string; variant: 'default' | 'destructive' | 'secondary' | 'outline' }> = {
  cutlist_row_done: { text: 'שורה הושלמה', variant: 'default' },
  cutlist_row_issue: { text: 'דיווח בעיה', variant: 'destructive' },
  cutlist_row_reopened: { text: 'שורה נפתחה מחדש', variant: 'outline' },
  cutlist_section_done: { text: 'סעיף הושלם', variant: 'default' },
  cutlist_section_issue: { text: 'בעיה בסעיף', variant: 'destructive' },
  cutlist_section_reopened: { text: 'סעיף נפתח מחדש', variant: 'outline' },
  cutlist_section_packed: { text: 'פריט נארז', variant: 'secondary' },
};

function SummaryCards({ data }: { data: ManufacturingData }) {
  const { cutlistSummary: cl, optimizationSummary: opt } = data;

  const profilePct = cl.sectionsWithProfiles > 0 ? Math.round((cl.sectionsWithAllProfilesDone / cl.sectionsWithProfiles) * 100) : 0;
  const glassPct = cl.sectionsWithGlass > 0 ? Math.round((cl.sectionsWithAllGlassDone / cl.sectionsWithGlass) * 100) : 0;
  const packedPct = cl.totalSections > 0 ? Math.round((cl.packedSections / cl.totalSections) * 100) : 0;
  const patternPct = opt.totalPatterns > 0 ? Math.round((opt.completedPatterns / opt.totalPatterns) * 100) : 0;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
            <Package className="h-4 w-4" />
            אריזה
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold">{cl.packedSections}/{cl.totalSections}</span>
            <Badge variant="secondary" className="text-xs">{packedPct}%</Badge>
          </div>
          <Progress value={packedPct} className="mt-2 h-2" />
          <div className="flex gap-2 mt-1">
            {cl.doneSections > 0 && (
              <p className="text-xs text-primary">{cl.doneSections} הושלמו</p>
            )}
            {cl.issueSections > 0 && (
              <p className="text-xs text-destructive">{cl.issueSections} בעיות</p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
            <Scissors className="h-4 w-4" />
            פריטים
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold">{cl.sectionsWithAllProfilesDone}/{cl.sectionsWithProfiles}</span>
            <Badge variant="secondary" className="text-xs">{profilePct}%</Badge>
          </div>
          <Progress value={profilePct} className="mt-2 h-2" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
            <GlassWater className="h-4 w-4" />
            זכוכיות
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold">{cl.sectionsWithAllGlassDone}/{cl.sectionsWithGlass}</span>
            <Badge variant="secondary" className="text-xs">{glassPct}%</Badge>
          </div>
          <Progress value={glassPct} className="mt-2 h-2" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
            <Scissors className="h-4 w-4" />
            אופטימיזציה
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold">{opt.completedPatterns}/{opt.totalPatterns}</span>
            <Badge variant="secondary" className="text-xs">{patternPct}%</Badge>
          </div>
          <Progress value={patternPct} className="mt-2 h-2" />
          {opt.totalPages > 0 && (
            <p className="text-xs text-muted-foreground mt-1">{opt.completedPages}/{opt.totalPages} דפים</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function CutlistSectionsTable({ data }: { data: ManufacturingData }) {
  if (data.cutlistSections.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">פקודת יצור</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-center py-4">לא נמצאו נתוני פקודת יצור לפרויקט זה</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">פקודת יצור — פריטים</CardTitle>
        <CardDescription>מעקב התקדמות לפי פריט</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>פריט</TableHead>
                <TableHead>שם</TableHead>
                <TableHead>סטטוס</TableHead>
                <TableHead className="text-center">פריטים</TableHead>
                <TableHead className="text-center">זכוכיות</TableHead>
                <TableHead className="text-center">אביזרים</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.cutlistSections.map(section => {
                const statusBadge = section.status === 'packed'
                  ? <Badge className="bg-blue-600 text-white"><Package className="h-3 w-3 ml-1" />נארז</Badge>
                  : section.status === 'done'
                    ? <Badge variant="default"><CheckCircle2 className="h-3 w-3 ml-1" />הושלם</Badge>
                    : section.status === 'issue'
                      ? <Badge variant="destructive"><AlertCircle className="h-3 w-3 ml-1" />בעיה</Badge>
                      : <Badge variant="outline"><Clock className="h-3 w-3 ml-1" />בתהליך</Badge>;

                return (
                  <TableRow key={section.id}>
                    <TableCell className="font-medium">{section.section_ref}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{section.section_name || '-'}</TableCell>
                    <TableCell>{statusBadge}</TableCell>
                    <TableCell className="text-center">
                      <span className={section.profile_done === section.profile_total && section.profile_total > 0 ? 'text-primary font-medium' : ''}>
                        {section.profile_done}/{section.profile_total}
                      </span>
                      {section.profile_issues > 0 && (
                        <span className="text-destructive text-xs mr-1">({section.profile_issues} בעיות)</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      <span className={section.glass_done === section.glass_total && section.glass_total > 0 ? 'text-primary font-medium' : ''}>
                        {section.glass_done}/{section.glass_total}
                      </span>
                      {section.glass_issues > 0 && (
                        <span className="text-destructive text-xs mr-1">({section.glass_issues} בעיות)</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center text-muted-foreground">
                      {section.misc_total}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function WorkerActivityTable({ data }: { data: ManufacturingData }) {
  if (data.workerActivity.length === 0) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">פעילות עובדים</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-center py-4">אין פעילות עובדים עדיין</p>
        </CardContent>
      </Card>
    );
  }

  // Aggregate unique workers
  const workerSummary = new Map<string, { name: string; card?: number; done: number; issues: number }>();
  data.workerActivity.forEach(a => {
    const key = a.worker_id || a.user_email;
    const existing = workerSummary.get(key) || { name: a.worker_name || a.user_email, card: a.worker_card, done: 0, issues: 0 };
    if (a.action_type.includes('done')) existing.done++;
    if (a.action_type.includes('issue')) existing.issues++;
    workerSummary.set(key, existing);
  });

  return (
    <div className="space-y-4">
      {/* Worker summary */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">סיכום עובדים בפרויקט</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {Array.from(workerSummary.entries()).map(([key, stats]) => (
              <div key={key} className="p-3 rounded-lg border bg-card">
                <div className="flex items-center gap-2 mb-2">
                  <span className="font-medium text-sm">{stats.name}</span>
                  {stats.card && (
                    <Badge variant="secondary" className="text-xs gap-1">
                      <CreditCard className="h-3 w-3" />
                      {stats.card}
                    </Badge>
                  )}
                </div>
                <div className="flex gap-3 text-sm">
                  <span className="text-primary">{stats.done} הושלמו</span>
                  {stats.issues > 0 && <span className="text-destructive">{stats.issues} בעיות</span>}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Recent activity feed */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">פעילות אחרונה</CardTitle>
          <CardDescription>50 פעולות אחרונות</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {data.workerActivity.map(activity => {
              const label = ACTION_LABELS[activity.action_type] || { text: activity.action_type, variant: 'secondary' as const };
              return (
                <div key={activity.id} className="flex items-center justify-between p-2.5 rounded-lg border bg-card">
                  <div className="flex items-center gap-2">
                    <Badge variant={label.variant} className="text-xs">{label.text}</Badge>
                    <span className="text-sm font-medium">{activity.section_ref}</span>
                    {activity.worker_name && (
                      <Badge variant="outline" className="text-xs gap-1">
                        <CreditCard className="h-3 w-3" />
                        {activity.worker_name} #{activity.worker_card}
                      </Badge>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {format(new Date(activity.created_at), 'dd/MM HH:mm', { locale: he })}
                  </span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

interface ManufacturingTabProps {
  projectId: number;
  projectName?: string;
}

export function ManufacturingTab({ projectId, projectName }: ManufacturingTabProps) {
  const { data, isLoading } = useManufacturingData(projectId, projectName);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <Card key={i}>
              <CardHeader className="pb-2"><Skeleton className="h-4 w-20" /></CardHeader>
              <CardContent><Skeleton className="h-8 w-16" /><Skeleton className="h-2 w-full mt-2" /></CardContent>
            </Card>
          ))}
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!data) {
    return (
      <Card>
        <CardContent className="py-8">
          <p className="text-muted-foreground text-center">לא נמצאו נתוני ייצור</p>
        </CardContent>
      </Card>
    );
  }

  const hasAnyData = data.cutlistSections.length > 0 || data.optimizationJobs.length > 0 || data.workerActivity.length > 0;

  if (!hasAnyData) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Scissors className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <h3 className="text-lg font-semibold mb-2">אין נתוני ייצור עדיין</h3>
          <p className="text-muted-foreground">נתוני ייצור יופיעו כאן לאחר שעובדים יתחילו לעבוד על פקודת היצור או האופטימיזציה</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <SummaryCards data={data} />
      <CutlistSectionsTable data={data} />
      <WorkerActivityTable data={data} />
    </div>
  );
}
