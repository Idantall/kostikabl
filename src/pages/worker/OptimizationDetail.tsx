import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { WorkerLayout } from '@/components/worker/WorkerLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronLeft, CheckCheck, AlertTriangle, Bug, ChevronDown, Loader2, RefreshCw, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { RodTrack, SegmentsData } from '@/components/optimization/RodTrack';

interface Pattern {
  id: string;
  profile_code: string;
  pattern_index: number;
  rod_count: number;
  segments_mm: number[];
  segments_json: SegmentsData | null;
  used_mm: number | null;
  remainder_mm: number | null;
  done: boolean;
  progress_id: string | null;
}

interface ProfileGroup {
  profile_code: string;
  patterns: Pattern[];
  doneCount: number;
  totalCount: number;
}

interface Job {
  id: string;
  source_file_name: string;
  source_file_path: string;
  bar_length_mm: number | null;
  project_name: string;
  project_id: number;
}

interface DebugDiagnostics {
  summary: {
    total_part_ids: number;
    total_angle_boundaries: number;
    total_unknown_boundaries: number;
  };
  pages: Array<{
    page: number;
    found_profiles: number;
    found_patterns: number;
    angle_boundaries_found: number;
    unknown_boundaries_found: number;
    operator_parsing_used: boolean;
    image_diagram_detected: boolean;
    construct_path_ops: number;
    direct_line_ops: number;
    row_diagnostics?: Array<{
      row_index: number;
      raw_lines_count: number;
      diagonal_candidates_count: number;
      fallback_reason: string | null;
      boundary_decisions: Array<{ between: [number, number]; decision: string; reason: string }>;
    }>;
  }>;
}

export default function OptimizationDetail() {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();
  const [job, setJob] = useState<Job | null>(null);
  const [profiles, setProfiles] = useState<ProfileGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [debugLoading, setDebugLoading] = useState(false);
  const [debugDiagnostics, setDebugDiagnostics] = useState<DebugDiagnostics | null>(null);
  const [debugOpen, setDebugOpen] = useState(false);
  const [reparseLoading, setReparseLoading] = useState(false);
  const [visionLoading, setVisionLoading] = useState(false);

  const fetchData = useCallback(async () => {
    if (!jobId) return;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      setUserId(user?.id || null);

      const { data: jobData, error: jobError } = await supabase
        .from('optimization_jobs')
        .select(`
          id,
          source_file_name,
          source_file_path,
          bar_length_mm,
          project_id,
          projects!inner(name)
        `)
        .eq('id', jobId)
        .single();

      if (jobError) throw jobError;

      setJob({
        ...jobData,
        project_name: (jobData.projects as any)?.name,
      });

      const { data: patternsData, error: patternsError } = await supabase
        .from('optimization_patterns')
        .select(`
          id,
          profile_code,
          pattern_index,
          rod_count,
          segments_mm,
          segments_json,
          used_mm,
          remainder_mm
        `)
        .eq('job_id', jobId)
        .order('profile_code')
        .order('pattern_index');

      if (patternsError) throw patternsError;

      const { data: progressData } = await supabase
        .from('optimization_pattern_progress')
        .select('id, pattern_id, done')
        .eq('worker_id', user?.id || '');

      const progressMap = new Map(
        (progressData || []).map(p => [p.pattern_id, { done: p.done, id: p.id }])
      );

      const grouped = new Map<string, Pattern[]>();

      for (const pattern of patternsData || []) {
        const progress = progressMap.get(pattern.id);
        
        // Parse segments_json
        let parsedSegmentsJson: SegmentsData | null = null;
        if (pattern.segments_json) {
          if (typeof pattern.segments_json === 'string') {
            try {
              parsedSegmentsJson = JSON.parse(pattern.segments_json);
            } catch (e) {
              console.warn('Failed to parse segments_json:', e);
            }
          } else if (typeof pattern.segments_json === 'object') {
            parsedSegmentsJson = pattern.segments_json as unknown as SegmentsData;
          }
        }
        
        const patternWithProgress: Pattern = {
          ...pattern,
          segments_json: parsedSegmentsJson,
          done: progress?.done || false,
          progress_id: progress?.id || null,
        };

        const existing = grouped.get(pattern.profile_code) || [];
        existing.push(patternWithProgress);
        grouped.set(pattern.profile_code, existing);
      }

      const profileGroups: ProfileGroup[] = Array.from(grouped.entries()).map(
        ([profile_code, patterns]) => ({
          profile_code,
          patterns,
          doneCount: patterns.filter(p => p.done).length,
          totalCount: patterns.length,
        })
      );

      setProfiles(profileGroups);
    } catch (error) {
      console.error('Error fetching optimization data:', error);
      toast.error('שגיאה בטעינת הנתונים');
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const runDebugParse = async () => {
    if (!job) return;
    
    setDebugLoading(true);
    setDebugDiagnostics(null);
    
    try {
      const { data, error } = await supabase.functions.invoke('parse-optimization-pdf', {
        body: {
          file_path: job.source_file_path,
          project_id: job.project_id,
          mode: 'chunk',
          startPage: 1,
          endPage: 3, // Just parse first 3 pages for debug
          debug: true,
          job_id: job.id, // Reuse existing job to not create duplicates
        },
      });
      
      if (error) throw error;
      
      if (data?.parse_diagnostics) {
        setDebugDiagnostics(data.parse_diagnostics);
        setDebugOpen(true);
        toast.success('דיאגנוסטיקה הושלמה');
      } else {
        toast.error('לא התקבלו נתוני דיאגנוסטיקה');
      }
    } catch (error: any) {
      console.error('Debug parse error:', error);
      toast.error(error.message || 'שגיאה בפענוח');
    } finally {
      setDebugLoading(false);
    }
  };

  const reparseWithAngles = async () => {
    if (!job) return;
    
    setReparseLoading(true);
    
    try {
      // First delete existing patterns for this job
      const { error: deleteError } = await supabase
        .from('optimization_patterns')
        .delete()
        .eq('job_id', job.id);
      
      if (deleteError) {
        console.error('Delete patterns error:', deleteError);
      }
      
      // Get page count
      const { data: infoData, error: infoError } = await supabase.functions.invoke('parse-optimization-pdf', {
        body: {
          file_path: job.source_file_path,
          mode: 'info',
        },
      });
      
      if (infoError) throw infoError;
      
      const pageCount = infoData?.data?.pageCount || 1;
      // Reduced chunk size to 3 pages to avoid CPU timeout on complex PDFs
      const chunkSize = 3;
      const totalChunks = Math.ceil(pageCount / chunkSize);
      
      toast.info(`מפענח מחדש ${pageCount} עמודים ב-${totalChunks} חלקים...`);
      
      for (let i = 0; i < totalChunks; i++) {
        const startPage = i * chunkSize + 1;
        const endPage = Math.min((i + 1) * chunkSize, pageCount);
        
        toast.loading(`מעבד חלק ${i + 1}/${totalChunks} (עמודים ${startPage}-${endPage})`, { id: 'reparse-progress' });
        
        const { data, error } = await supabase.functions.invoke('parse-optimization-pdf', {
          body: {
            file_path: job.source_file_path,
            project_id: job.project_id,
            mode: 'chunk',
            startPage,
            endPage,
            job_id: job.id,
            debug: false,
          },
        });
        
        if (error) {
          toast.dismiss('reparse-progress');
          throw error;
        }
        
        console.log(`Chunk ${i + 1}/${totalChunks}:`, data);
      }
      
      toast.dismiss('reparse-progress');
      toast.success('פענוח מחדש הושלם');
      await fetchData();
    } catch (error: any) {
      console.error('Reparse error:', error);
      toast.error(error.message || 'שגיאה בפענוח מחדש');
    } finally {
      setReparseLoading(false);
    }
  };

  const runVisionExtraction = async () => {
    if (!job) return;
    
    setVisionLoading(true);
    
    try {
      let offset = 0;
      const limit = 5; // Process 5 patterns per chunk
      let totalUpdated = 0;
      let totalPartIds = 0;
      let chunkNum = 0;
      let hasMore = true;
      
      toast.info(`מריץ זיהוי OCR...`);
      
      while (hasMore) {
        chunkNum++;
        toast.loading(`מעבד חלק ${chunkNum}...`, { id: 'vision-progress' });
        
        const { data, error } = await supabase.functions.invoke('parse-optimization-pdf', {
          body: {
            file_path: job.source_file_path,
            project_id: job.project_id,
            mode: 'vision',
            job_id: job.id,
            pattern_offset: offset,
            pattern_limit: limit,
            debug: false,
          },
        });
        
        if (error) throw error;
        
        if (data?.success) {
          totalUpdated += data.patterns_updated || 0;
          totalPartIds += data.total_part_ids_found || 0;
          
          if (data.chunk) {
            hasMore = data.chunk.has_more;
            offset = data.chunk.next_offset || offset + limit;
            console.log(`Vision chunk ${chunkNum}: updated ${data.patterns_updated}, total ${data.chunk.processed}/${data.chunk.total}`);
          } else {
            hasMore = false;
          }
        } else {
          hasMore = false;
        }
      }
      
      toast.dismiss('vision-progress');
      toast.success(`זוהו ${totalPartIds} מספרי חלקים ב-${totalUpdated} תבניות`);
      await fetchData();
    } catch (error: any) {
      toast.dismiss('vision-progress');
      console.error('Vision extraction error:', error);
      toast.error(error.message || 'שגיאה בזיהוי OCR');
    } finally {
      setVisionLoading(false);
    }
  };

  const togglePatternDone = async (pattern: Pattern) => {
    if (!userId) {
      toast.error('יש להתחבר כדי לסמן');
      return;
    }

    const newDone = !pattern.done;

    try {
      if (pattern.progress_id) {
        await supabase
          .from('optimization_pattern_progress')
          .update({
            done: newDone,
            done_at: newDone ? new Date().toISOString() : null,
          })
          .eq('id', pattern.progress_id);
      } else {
        await supabase
          .from('optimization_pattern_progress')
          .insert({
            pattern_id: pattern.id,
            worker_id: userId,
            done: newDone,
            done_at: newDone ? new Date().toISOString() : null,
          });
      }

      setProfiles(prev =>
        prev.map(group => ({
          ...group,
          patterns: group.patterns.map(p =>
            p.id === pattern.id ? { ...p, done: newDone } : p
          ),
          doneCount:
            group.profile_code === pattern.profile_code
              ? group.patterns.filter(p =>
                  p.id === pattern.id ? newDone : p.done
                ).length
              : group.doneCount,
        }))
      );

      toast.success(newDone ? 'סומן כבוצע' : 'הסימון הוסר');
    } catch (error) {
      console.error('Error updating progress:', error);
      toast.error('שגיאה בעדכון');
    }
  };

  const markAllProfileDone = async (profileCode: string) => {
    if (!userId) {
      toast.error('יש להתחבר כדי לסמן');
      return;
    }

    const profile = profiles.find(p => p.profile_code === profileCode);
    if (!profile) return;

    const undonePat = profile.patterns.filter(p => !p.done);

    try {
      for (const pattern of undonePat) {
        if (pattern.progress_id) {
          await supabase
            .from('optimization_pattern_progress')
            .update({
              done: true,
              done_at: new Date().toISOString(),
            })
            .eq('id', pattern.progress_id);
        } else {
          await supabase
            .from('optimization_pattern_progress')
            .insert({
              pattern_id: pattern.id,
              worker_id: userId,
              done: true,
              done_at: new Date().toISOString(),
            });
        }
      }

      await fetchData();
      toast.success(`כל התבניות ב-${profileCode} סומנו כבוצעות`);
    } catch (error) {
      console.error('Error marking all done:', error);
      toast.error('שגיאה בסימון');
    }
  };

  const totalDone = profiles.reduce((sum, p) => sum + p.doneCount, 0);
  const totalPatterns = profiles.reduce((sum, p) => sum + p.totalCount, 0);
  const overallProgress = totalPatterns > 0 ? (totalDone / totalPatterns) * 100 : 0;

  if (loading) {
    return (
      <WorkerLayout>
        <div className="space-y-6">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-96 w-full" />
        </div>
      </WorkerLayout>
    );
  }

  if (!job) {
    return (
      <WorkerLayout>
        <div className="text-center py-12">
          <p className="text-muted-foreground">עבודה לא נמצאה</p>
        </div>
      </WorkerLayout>
    );
  }

  return (
    <WorkerLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate('/worker/optimization')}
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold truncate">{job.source_file_name}</h1>
            <p className="text-sm text-muted-foreground">
              {job.project_name}
              {job.bar_length_mm && ` • אורך מוט: ${job.bar_length_mm} מ"מ`}
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={runVisionExtraction}
              disabled={visionLoading}
            >
              {visionLoading ? (
                <Loader2 className="h-4 w-4 ml-2 animate-spin" />
              ) : (
                <Eye className="h-4 w-4 ml-2" />
              )}
              Vision OCR
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={reparseWithAngles}
              disabled={reparseLoading}
            >
              {reparseLoading ? (
                <Loader2 className="h-4 w-4 ml-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 ml-2" />
              )}
              פענוח מחדש
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={runDebugParse}
              disabled={debugLoading}
            >
              {debugLoading ? (
                <Loader2 className="h-4 w-4 ml-2 animate-spin" />
              ) : (
                <Bug className="h-4 w-4 ml-2" />
              )}
              דיאגנוסטיקה
            </Button>
          </div>
        </div>

        {/* Debug Diagnostics Panel */}
        {debugDiagnostics && (
          <Collapsible open={debugOpen} onOpenChange={setDebugOpen}>
            <Card className="border-amber-300 bg-amber-50 dark:bg-amber-950/20">
              <CollapsibleTrigger asChild>
                <CardHeader className="cursor-pointer pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Bug className="h-5 w-5 text-amber-600" />
                      <CardTitle className="text-base">Parse Diagnostics</CardTitle>
                    </div>
                    <ChevronDown className={`h-5 w-5 transition-transform ${debugOpen ? 'rotate-180' : ''}`} />
                  </div>
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="space-y-4 text-sm">
                  {/* Summary */}
                  <div className="grid grid-cols-3 gap-4 p-3 bg-background rounded-lg">
                    <div className="text-center">
                      <div className="text-2xl font-bold">{debugDiagnostics.summary.total_angle_boundaries}</div>
                      <div className="text-xs text-muted-foreground">Angled Cuts</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-amber-600">{debugDiagnostics.summary.total_unknown_boundaries}</div>
                      <div className="text-xs text-muted-foreground">Unknown Cuts</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold">{debugDiagnostics.summary.total_part_ids}</div>
                      <div className="text-xs text-muted-foreground">Part IDs</div>
                    </div>
                  </div>
                  
                  {/* Page Details */}
                  {debugDiagnostics.pages.map((page) => (
                    <div key={page.page} className="p-3 bg-background rounded-lg space-y-2">
                      <div className="font-medium">Page {page.page}</div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>Profiles: {page.found_profiles}</div>
                        <div>Patterns: {page.found_patterns}</div>
                        <div>Angled: {page.angle_boundaries_found}</div>
                        <div className="text-amber-600">Unknown: {page.unknown_boundaries_found}</div>
                        <div>Direct lines: {page.direct_line_ops}</div>
                        <div>ConstructPath ops: {page.construct_path_ops}</div>
                        <div className={page.image_diagram_detected ? 'text-red-500' : ''}>
                          Image-based: {page.image_diagram_detected ? 'YES' : 'No'}
                        </div>
                        <div>Operator parsing: {page.operator_parsing_used ? 'Yes' : 'No'}</div>
                      </div>
                      
                      {/* Row diagnostics */}
                      {page.row_diagnostics && page.row_diagnostics.length > 0 && (
                        <div className="mt-2 space-y-1">
                          <div className="text-xs font-medium">Row Details:</div>
                          {page.row_diagnostics.map((row, idx) => (
                            <div key={idx} className="text-xs p-2 bg-muted rounded">
                              <div>Row {row.row_index}: {row.raw_lines_count} lines, {row.diagonal_candidates_count} diagonals</div>
                              {row.fallback_reason && (
                                <div className="text-amber-600">Fallback: {row.fallback_reason}</div>
                              )}
                              {row.boundary_decisions?.map((bd, bdIdx) => (
                                <div key={bdIdx} className="ml-2">
                                  [{bd.between[0]}→{bd.between[1]}]: <span className={bd.decision === 'angled' ? 'text-green-600' : bd.decision === 'unknown' ? 'text-amber-600' : ''}>{bd.decision}</span>
                                  <span className="text-muted-foreground ml-1">({bd.reason})</span>
                                </div>
                              ))}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        )}

        {/* Overall Progress */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">התקדמות כללית</span>
              <span className="text-sm text-muted-foreground">
                {totalDone}/{totalPatterns} תבניות
              </span>
            </div>
            <Progress value={overallProgress} className="h-2" />
          </CardContent>
        </Card>

        {/* Profile Groups */}
        {profiles.map((profile) => (
          <Card key={profile.profile_code}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <CardTitle className="text-lg">{profile.profile_code}</CardTitle>
                  <Badge variant="outline">
                    {profile.doneCount}/{profile.totalCount}
                  </Badge>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => markAllProfileDone(profile.profile_code)}
                  disabled={profile.doneCount === profile.totalCount}
                >
                  <CheckCheck className="h-4 w-4 ml-2" />
                  סמן הכל
                </Button>
              </div>
              <Progress
                value={(profile.doneCount / profile.totalCount) * 100}
                className="h-1 mt-2"
              />
            </CardHeader>
            <CardContent className="space-y-3">
              {profile.patterns.map((pattern) => {
                // Check if pattern has unknown cuts
                const hasUnknown = pattern.segments_json?.boundaries?.some(
                  b => b.cut_type === "unknown"
                ) || pattern.segments_json?.segments?.some(
                  s => {
                    const cl = typeof s.cut_left === 'object' ? s.cut_left?.type : s.cut_left;
                    const cr = typeof s.cut_right === 'object' ? s.cut_right?.type : s.cut_right;
                    return cl === 'unknown' || cr === 'unknown';
                  }
                );
                
                return (
                  <div
                    key={pattern.id}
                    className={`border rounded-lg p-3 transition-colors ${
                      pattern.done 
                        ? 'bg-primary/5 border-primary/20' 
                        : 'bg-background'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <Checkbox
                        checked={pattern.done}
                        onCheckedChange={() => togglePatternDone(pattern)}
                        className="mt-1 flex-shrink-0"
                      />
                      <div className="flex-1 min-w-0 space-y-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="secondary" className="flex-shrink-0">
                            x{pattern.rod_count} מוטות
                          </Badge>
                          {pattern.used_mm && (
                            <span className="text-xs text-muted-foreground">
                              שימוש: {pattern.used_mm.toFixed(1)} מ"מ
                            </span>
                          )}
                          {pattern.remainder_mm && (
                            <span className="text-xs text-muted-foreground">
                              שארית: {pattern.remainder_mm.toFixed(1)} מ"מ
                            </span>
                          )}
                          {hasUnknown && (
                            <Badge variant="outline" className="text-amber-600 border-amber-300 flex-shrink-0">
                              <AlertTriangle className="w-3 h-3 mr-1" />
                              זוויות לא ידועות
                            </Badge>
                          )}
                        </div>
                        <RodTrack
                          segments={pattern.segments_mm}
                          enhancedData={pattern.segments_json}
                          barLengthMm={job.bar_length_mm || 6000}
                          remainderMm={pattern.remainder_mm ?? undefined}
                          done={pattern.done}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        ))}
      </div>
    </WorkerLayout>
  );
}
