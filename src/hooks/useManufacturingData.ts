import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface CutlistSectionProgress {
  id: string;
  section_ref: string;
  section_name: string | null;
  status: string;
  upload_id: string;
  upload_filename: string;
  profile_total: number;
  profile_done: number;
  profile_issues: number;
  glass_total: number;
  glass_done: number;
  glass_issues: number;
  misc_total: number;
}

export interface OptimizationJobProgress {
  id: string;
  source_file_name: string;
  status: string;
  total_patterns: number;
  completed_patterns: number;
  total_pages: number;
  completed_pages: number;
}

export interface WorkerActivityEntry {
  id: string;
  action_type: string;
  section_ref: string | null;
  created_at: string;
  worker_id: string | null;
  worker_name?: string;
  worker_card?: number;
  user_email: string;
}

export interface ManufacturingData {
  cutlistSections: CutlistSectionProgress[];
  optimizationJobs: OptimizationJobProgress[];
  workerActivity: WorkerActivityEntry[];
  cutlistSummary: {
    totalSections: number;
    doneSections: number;
    packedSections: number;
    issueSections: number;
    totalProfileRows: number;
    doneProfileRows: number;
    totalGlassRows: number;
    doneGlassRows: number;
    /** Sections where ALL profiles are done */
    sectionsWithAllProfilesDone: number;
    /** Sections that have any profiles */
    sectionsWithProfiles: number;
    /** Sections where ALL glass rows are done */
    sectionsWithAllGlassDone: number;
    /** Sections that have any glass */
    sectionsWithGlass: number;
  };
  optimizationSummary: {
    totalPatterns: number;
    completedPatterns: number;
    totalPages: number;
    completedPages: number;
  };
}

export function useManufacturingData(projectId: number | undefined, projectName?: string) {
  return useQuery({
    queryKey: ['manufacturing-data', projectId, projectName],
    queryFn: async (): Promise<ManufacturingData> => {
      if (!projectId) throw new Error('No project ID');

      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      const headers = {
        'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        'Authorization': `Bearer ${token}`,
      };

      // 1. Cutlist data - find uploads matching project name
      let cutlistSections: CutlistSectionProgress[] = [];
      let uploadIds: string[] = [];

      if (projectName) {
        const { data: uploads } = await supabase
          .from('cutlist_uploads')
          .select('id, filename, project_name')
          .eq('project_name', projectName);

        if (uploads && uploads.length > 0) {
          uploadIds = uploads.map(u => u.id);
          const uploadMap = new Map(uploads.map(u => [u.id, u.filename]));

          const { data: sections } = await supabase
            .from('cutlist_sections')
            .select('id, section_ref, section_name, status, upload_id')
            .in('upload_id', uploadIds)
            .order('ord');

          if (sections && sections.length > 0) {
            const sectionIds = sections.map(s => s.id);

            // Fetch profile, glass, misc row counts in parallel
            // Use count queries per section to avoid the 1000-row default limit
            const [profileRes, glassRes, miscRes] = await Promise.all([
              supabase.from('cutlist_profile_rows').select('id, section_id, status', { count: 'exact' }).in('section_id', sectionIds).limit(10000),
              supabase.from('cutlist_glass_rows').select('id, section_id, status', { count: 'exact' }).in('section_id', sectionIds).limit(10000),
              supabase.from('cutlist_misc_rows').select('id, section_id', { count: 'exact' }).in('section_id', sectionIds).limit(10000),
            ]);

            const profileRows = profileRes.data || [];
            const glassRows = glassRes.data || [];
            const miscRows = miscRes.data || [];

            cutlistSections = sections.map(s => {
              const sProfiles = profileRows.filter(r => r.section_id === s.id);
              const sGlass = glassRows.filter(r => r.section_id === s.id);
              const sMisc = miscRows.filter(r => r.section_id === s.id);

              return {
                id: s.id,
                section_ref: s.section_ref,
                section_name: s.section_name,
                status: s.status,
                upload_id: s.upload_id,
                upload_filename: uploadMap.get(s.upload_id) || '',
                profile_total: sProfiles.length,
                profile_done: sProfiles.filter(r => r.status === 'done').length,
                profile_issues: sProfiles.filter(r => r.status === 'issue').length,
                glass_total: sGlass.length,
                glass_done: sGlass.filter(r => r.status === 'done').length,
                glass_issues: sGlass.filter(r => r.status === 'issue').length,
                misc_total: sMisc.length,
              };
            });
          }
        }
      }

      // 2. Optimization data
      const { data: optJobs } = await supabase
        .from('optimization_jobs')
        .select('id, source_file_name, status')
        .eq('project_id', projectId);

      let optimizationJobs: OptimizationJobProgress[] = [];
      if (optJobs && optJobs.length > 0) {
        const jobIds = optJobs.map(j => j.id);

        const [patternsRes, patternProgressRes] = await Promise.all([
          supabase.from('optimization_patterns').select('id, job_id').in('job_id', jobIds),
          supabase.from('optimization_pattern_progress').select('pattern_id, done')
            .in('pattern_id', (await supabase.from('optimization_patterns').select('id').in('job_id', jobIds)).data?.map(p => p.id) || []),
        ]);

        // Also get PDF progress
        const { data: pdfUploads } = await supabase
          .from('optimization_pdf_uploads')
          .select('id, page_count')
          .eq('project_id', projectId);

        let pdfProgressMap = new Map<string, { total: number; done: number }>();
        if (pdfUploads && pdfUploads.length > 0) {
          const pdfIds = pdfUploads.map(p => p.id);
          const { data: pdfProgress } = await supabase
            .from('optimization_pdf_progress')
            .select('pdf_id, status')
            .in('pdf_id', pdfIds);

          pdfUploads.forEach(pdf => {
            const progress = (pdfProgress || []).filter(p => p.pdf_id === pdf.id);
            pdfProgressMap.set(pdf.id, {
              total: pdf.page_count || 0,
              done: progress.filter(p => p.status === 'done').length,
            });
          });
        }

        const patterns = patternsRes.data || [];
        const patternProgress = patternProgressRes.data || [];
        const donePatternIds = new Set(patternProgress.filter(p => p.done).map(p => p.pattern_id));

        optimizationJobs = optJobs.map(j => {
          const jobPatterns = patterns.filter(p => p.job_id === j.id);
          const completedPatterns = jobPatterns.filter(p => donePatternIds.has(p.id)).length;

          // Sum PDF pages for this project
          let totalPages = 0, completedPages = 0;
          pdfProgressMap.forEach(v => {
            totalPages += v.total;
            completedPages += v.done;
          });

          return {
            id: j.id,
            source_file_name: j.source_file_name,
            status: j.status,
            total_patterns: jobPatterns.length,
            completed_patterns: completedPatterns,
            total_pages: totalPages,
            completed_pages: completedPages,
          };
        });
      }

      // 3. Worker activity for this project
      let workerActivity: WorkerActivityEntry[] = [];
      if (projectName) {
        const activityRes = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/worker_activity_logs?project_name=eq.${encodeURIComponent(projectName)}&select=id,action_type,section_ref,created_at,worker_id,user_email&order=created_at.desc&limit=50`,
          { headers }
        );

        if (activityRes.ok) {
          const activities = await activityRes.json();

          // Fetch worker names
          const workerIds = [...new Set(activities.filter((a: any) => a.worker_id).map((a: any) => a.worker_id))] as string[];
          let workerMap = new Map<string, { name: string; card: number }>();

          if (workerIds.length > 0) {
            const { data: workers } = await supabase
              .from('workers')
              .select('id, name, card_number')
              .in('id', workerIds);

            workers?.forEach(w => {
              workerMap.set(w.id, { name: w.name, card: w.card_number });
            });
          }

          workerActivity = activities.map((a: any) => ({
            id: a.id,
            action_type: a.action_type,
            section_ref: a.section_ref,
            created_at: a.created_at,
            worker_id: a.worker_id,
            worker_name: a.worker_id ? workerMap.get(a.worker_id)?.name : undefined,
            worker_card: a.worker_id ? workerMap.get(a.worker_id)?.card : undefined,
            user_email: a.user_email,
          }));
        }
      }

      // Summaries
      const sectionsWithProfiles = cutlistSections.filter(s => s.profile_total > 0);
      const sectionsWithGlass = cutlistSections.filter(s => s.glass_total > 0);

      const cutlistSummary = {
        totalSections: cutlistSections.length,
        doneSections: cutlistSections.filter(s => s.status === 'done' || s.status === 'packed').length,
        packedSections: cutlistSections.filter(s => s.status === 'packed').length,
        issueSections: cutlistSections.filter(s => s.status === 'issue').length,
        totalProfileRows: cutlistSections.reduce((sum, s) => sum + s.profile_total, 0),
        doneProfileRows: cutlistSections.reduce((sum, s) => sum + s.profile_done, 0),
        totalGlassRows: cutlistSections.reduce((sum, s) => sum + s.glass_total, 0),
        doneGlassRows: cutlistSections.reduce((sum, s) => sum + s.glass_done, 0),
        sectionsWithProfiles: sectionsWithProfiles.length,
        sectionsWithAllProfilesDone: sectionsWithProfiles.filter(s => s.profile_done === s.profile_total).length,
        sectionsWithGlass: sectionsWithGlass.length,
        sectionsWithAllGlassDone: sectionsWithGlass.filter(s => s.glass_done === s.glass_total).length,
      };

      const optimizationSummary = {
        totalPatterns: optimizationJobs.reduce((sum, j) => sum + j.total_patterns, 0),
        completedPatterns: optimizationJobs.reduce((sum, j) => sum + j.completed_patterns, 0),
        totalPages: optimizationJobs.reduce((sum, j) => sum + j.total_pages, 0),
        completedPages: optimizationJobs.reduce((sum, j) => sum + j.completed_pages, 0),
      };

      return {
        cutlistSections,
        optimizationJobs,
        workerActivity,
        cutlistSummary,
        optimizationSummary,
      };
    },
    enabled: !!projectId,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}
