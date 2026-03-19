import { supabase } from '@/integrations/supabase/client';

export type WorkerActionType = 
  | 'cutlist_row_done'
  | 'cutlist_row_issue'
  | 'cutlist_row_reopened'
  | 'cutlist_section_done'
  | 'cutlist_section_issue'
  | 'cutlist_section_reopened'
  | 'cutlist_section_packed';

export interface LogActivityParams {
  actionType: WorkerActionType;
  entityType: string;
  entityId: string;
  uploadId?: string;
  projectName?: string;
  sectionRef?: string;
  details?: Record<string, unknown>;
  workerId?: string; // Individual worker ID (from workers table)
}

/**
 * Hook to log worker activity for tracking completions and issues
 */
export function useWorkerActivityLog() {
  const logActivity = async (params: LogActivityParams): Promise<boolean> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        console.error('Cannot log activity: No authenticated user');
        return false;
      }

      // Use raw SQL insert since types aren't regenerated yet
      const { error } = await supabase.rpc('log_worker_activity' as never, {
        p_user_id: user.id,
        p_user_email: user.email || 'unknown',
        p_action_type: params.actionType,
        p_entity_type: params.entityType,
        p_entity_id: params.entityId,
        p_upload_id: params.uploadId || null,
        p_project_name: params.projectName || null,
        p_section_ref: params.sectionRef || null,
        p_details: params.details || {},
        p_worker_id: params.workerId || null,
      } as never);

      if (error) {
        // Fallback to direct insert using fetch
        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/worker_activity_logs`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
              'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
              'Prefer': 'return=minimal',
            },
            body: JSON.stringify({
              user_id: user.id,
              user_email: user.email || 'unknown',
              action_type: params.actionType,
              entity_type: params.entityType,
              entity_id: params.entityId,
              upload_id: params.uploadId || null,
              project_name: params.projectName || null,
              section_ref: params.sectionRef || null,
              details: params.details || {},
              worker_id: params.workerId || null,
            }),
          }
        );

        if (!response.ok) {
          console.error('Failed to log worker activity via fetch');
          return false;
        }
      }

      return true;
    } catch (err) {
      console.error('Error logging worker activity:', err);
      return false;
    }
  };

  return { logActivity };
}
