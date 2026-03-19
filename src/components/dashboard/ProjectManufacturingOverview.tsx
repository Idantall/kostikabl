import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Factory, ChevronDown, ChevronUp, Users, CreditCard, Package } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useState } from 'react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface ProjectManufacturingRow {
  project_id: number;
  project_name: string;
  total_sections: number;
  done_sections: number;
  packed_sections: number;
  issue_sections: number;
  total_profile_rows: number;
  done_profile_rows: number;
  total_glass_rows: number;
  done_glass_rows: number;
  workers: { name: string; card: number; done: number; issues: number }[];
}

export function ProjectManufacturingOverview() {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const { data, isLoading } = useQuery({
    queryKey: ['admin-project-manufacturing'],
    queryFn: async () => {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      const headers = {
        'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        'Authorization': `Bearer ${token}`,
      };

      // Get all uploads with project_name
      const { data: uploads } = await supabase
        .from('cutlist_uploads')
        .select('id, project_name')
        .not('project_name', 'is', null);

      if (!uploads || uploads.length === 0) return [];

      // Group by project_name
      const projectUploads = new Map<string, string[]>();
      uploads.forEach(u => {
        if (!u.project_name) return;
        const existing = projectUploads.get(u.project_name) || [];
        existing.push(u.id);
        projectUploads.set(u.project_name, existing);
      });

      // Get project IDs from names
      const projectNames = Array.from(projectUploads.keys());
      const { data: projects } = await supabase
        .from('projects')
        .select('id, name')
        .in('name', projectNames);

      if (!projects || projects.length === 0) return [];

      // Get all sections for these uploads
      const allUploadIds = uploads.map(u => u.id);
      const { data: sections } = await supabase
        .from('cutlist_sections')
        .select('id, section_ref, status, upload_id')
        .in('upload_id', allUploadIds);

      if (!sections) return [];

      const sectionIds = sections.map(s => s.id);
      
      // Get row counts
      const [profileRes, glassRes] = await Promise.all([
        supabase.from('cutlist_profile_rows').select('id, section_id, status').in('section_id', sectionIds),
        supabase.from('cutlist_glass_rows').select('id, section_id, status').in('section_id', sectionIds),
      ]);

      const profileRows = profileRes.data || [];
      const glassRows = glassRes.data || [];

      // Get worker activity per project
      const activityRes = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/worker_activity_logs?select=worker_id,action_type,project_name&project_name=in.(${projectNames.map(n => `"${n}"`).join(',')})`,
        { headers }
      );
      const activities = activityRes.ok ? await activityRes.json() : [];

      // Get worker names
      const workerIds = [...new Set(activities.filter((a: any) => a.worker_id).map((a: any) => a.worker_id))] as string[];
      let workerMap = new Map<string, { name: string; card: number }>();
      if (workerIds.length > 0) {
        const { data: workers } = await supabase
          .from('workers')
          .select('id, name, card_number')
          .in('id', workerIds);
        workers?.forEach(w => workerMap.set(w.id, { name: w.name, card: w.card_number }));
      }

      // Build per-project data
      const result: ProjectManufacturingRow[] = projects.map(p => {
        const uploadIds = projectUploads.get(p.name) || [];
        const projectSections = sections.filter(s => uploadIds.includes(s.upload_id));
        const sIds = new Set(projectSections.map(s => s.id));

        const pProfiles = profileRows.filter(r => sIds.has(r.section_id));
        const pGlass = glassRows.filter(r => sIds.has(r.section_id));

        // Worker summary
        const projectActivities = activities.filter((a: any) => a.project_name === p.name);
        const workerAgg = new Map<string, { name: string; card: number; done: number; issues: number }>();
        projectActivities.forEach((a: any) => {
          if (!a.worker_id) return;
          const w = workerMap.get(a.worker_id);
          if (!w) return;
          const existing = workerAgg.get(a.worker_id) || { name: w.name, card: w.card, done: 0, issues: 0 };
          if (a.action_type.includes('done')) existing.done++;
          if (a.action_type.includes('issue')) existing.issues++;
          workerAgg.set(a.worker_id, existing);
        });

        return {
          project_id: p.id,
          project_name: p.name,
          total_sections: projectSections.length,
          done_sections: projectSections.filter(s => s.status === 'done' || s.status === 'packed').length,
          packed_sections: projectSections.filter(s => s.status === 'packed').length,
          issue_sections: projectSections.filter(s => s.status === 'issue').length,
          total_profile_rows: pProfiles.length,
          done_profile_rows: pProfiles.filter(r => r.status === 'done').length,
          total_glass_rows: pGlass.length,
          done_glass_rows: pGlass.filter(r => r.status === 'done').length,
          workers: Array.from(workerAgg.values()).sort((a, b) => b.done - a.done),
        };
      });

      // Sort by most activity
      return result.sort((a, b) => 
        (b.done_profile_rows + b.done_glass_rows) - (a.done_profile_rows + a.done_glass_rows)
      );
    },
    staleTime: 60_000,
    refetchInterval: 120_000,
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader><Skeleton className="h-6 w-48" /></CardHeader>
        <CardContent><Skeleton className="h-48 w-full" /></CardContent>
      </Card>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Factory className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">התקדמות ייצור לפי פרויקט</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-center text-muted-foreground py-4">אין נתוני ייצור זמינים</p>
        </CardContent>
      </Card>
    );
  }

  const toggleExpand = (id: number) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Factory className="h-5 w-5 text-primary" />
          <CardTitle className="text-lg">התקדמות ייצור לפי פרויקט</CardTitle>
        </div>
        <CardDescription>סיכום פקודות יצור וביצועי עובדים</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {data.map(project => {
          const profilePct = project.total_profile_rows > 0 
            ? Math.round((project.done_profile_rows / project.total_profile_rows) * 100) : 0;
          const glassPct = project.total_glass_rows > 0 
            ? Math.round((project.done_glass_rows / project.total_glass_rows) * 100) : 0;
          const isExpanded = expanded.has(project.project_id);

          return (
            <Collapsible key={project.project_id} open={isExpanded} onOpenChange={() => toggleExpand(project.project_id)}>
              <div className="rounded-lg border p-4">
                <CollapsibleTrigger className="w-full">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="font-semibold">{project.project_name}</span>
                      <Badge variant="outline">{project.done_sections}/{project.total_sections} סעיפים</Badge>
                      {project.packed_sections > 0 && (
                        <Badge className="bg-blue-600 text-white gap-1"><Package className="h-3 w-3" />{project.packed_sections} נארזו</Badge>
                      )}
                      {project.issue_sections > 0 && (
                        <Badge variant="destructive">{project.issue_sections} בעיות</Badge>
                      )}
                      {project.workers.length > 0 && (
                        <Badge variant="secondary" className="gap-1">
                          <Users className="h-3 w-3" />
                          {project.workers.length}
                        </Badge>
                      )}
                    </div>
                    {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </div>

                  <div className="grid grid-cols-2 gap-4 mt-3">
                    <div>
                      <div className="flex justify-between text-xs text-muted-foreground mb-1">
                        <span>פרופילים</span>
                        <span>{project.done_profile_rows}/{project.total_profile_rows}</span>
                      </div>
                      <Progress value={profilePct} className="h-2" />
                    </div>
                    <div>
                      <div className="flex justify-between text-xs text-muted-foreground mb-1">
                        <span>זכוכיות</span>
                        <span>{project.done_glass_rows}/{project.total_glass_rows}</span>
                      </div>
                      <Progress value={glassPct} className="h-2" />
                    </div>
                  </div>
                </CollapsibleTrigger>

                <CollapsibleContent>
                  {project.workers.length > 0 && (
                    <div className="mt-4 pt-4 border-t">
                      <p className="text-sm font-medium mb-2">עובדים שעבדו על הפרויקט:</p>
                      <div className="rounded-md border overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>עובד</TableHead>
                              <TableHead>כרטיס</TableHead>
                              <TableHead className="text-center">הושלמו</TableHead>
                              <TableHead className="text-center">בעיות</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {project.workers.map((w, i) => (
                              <TableRow key={i}>
                                <TableCell className="font-medium">{w.name}</TableCell>
                                <TableCell>
                                  <Badge variant="secondary" className="gap-1 text-xs">
                                    <CreditCard className="h-3 w-3" />{w.card}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-center text-primary">{w.done}</TableCell>
                                <TableCell className="text-center">
                                  {w.issues > 0 ? <span className="text-destructive">{w.issues}</span> : <span className="text-muted-foreground">0</span>}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  )}
                </CollapsibleContent>
              </div>
            </Collapsible>
          );
        })}
      </CardContent>
    </Card>
  );
}
