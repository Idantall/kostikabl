import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface PendingUpdate {
  id: string;
  table: string;
  data: Record<string, unknown>;
  timestamp: number;
  retries: number;
}

const STORAGE_KEY = 'offline_pending_updates';
const MAX_RETRIES = 5;
const SYNC_INTERVAL = 3000; // 3 seconds

export type ConnectionStatus = 'online' | 'offline' | 'syncing' | 'error';

export function useOfflineSync(projectId: string | undefined) {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('online');
  const [pendingCount, setPendingCount] = useState(0);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const syncIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isSyncingRef = useRef(false);
  
  // Load pending updates from localStorage
  const loadPendingUpdates = useCallback((): PendingUpdate[] => {
    try {
      const stored = localStorage.getItem(`${STORAGE_KEY}_${projectId}`);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  }, [projectId]);

  // Save pending updates to localStorage
  const savePendingUpdates = useCallback((updates: PendingUpdate[]) => {
    try {
      localStorage.setItem(`${STORAGE_KEY}_${projectId}`, JSON.stringify(updates));
      setPendingCount(updates.length);
    } catch (e) {
      console.error('Failed to save pending updates:', e);
    }
  }, [projectId]);

  // Queue an update for sync
  const queueUpdate = useCallback((id: string, table: string, data: Record<string, unknown>) => {
    const pending = loadPendingUpdates();
    
    // Merge with existing update for same id if exists
    const existingIndex = pending.findIndex(p => p.id === id && p.table === table);
    if (existingIndex >= 0) {
      pending[existingIndex] = {
        ...pending[existingIndex],
        data: { ...pending[existingIndex].data, ...data },
        timestamp: Date.now(),
      };
    } else {
      pending.push({
        id,
        table,
        data,
        timestamp: Date.now(),
        retries: 0,
      });
    }
    
    savePendingUpdates(pending);
  }, [loadPendingUpdates, savePendingUpdates]);

  // Check if we're online by pinging Supabase
  // Returns: { online: boolean, authError: boolean }
  const checkConnection = useCallback(async (): Promise<{ online: boolean; authError: boolean }> => {
    // First check browser's online status
    if (!navigator.onLine) {
      return { online: false, authError: false };
    }
    
    try {
      // Simple ping - just check if we can reach the API
      const { error } = await supabase
        .from('projects')
        .select('id')
        .limit(1);

      if (error) {
        const status = (error as any)?.status;
        const message = String((error as any)?.message ?? '');
        const looksLikeAuth =
          status === 401 ||
          status === 403 ||
          /jwt|unauthorized|session/i.test(message);

        if (looksLikeAuth) {
          // Auth error - we're online but session expired
          // Don't force logout here, let the UI handle re-auth
          console.warn('[OfflineSync] Auth error detected, session may have expired');
          return { online: true, authError: true };
        }

        // Other DB error - likely still online
        console.warn('[OfflineSync] DB error but likely online:', message);
        return { online: true, authError: false };
      }

      return { online: true, authError: false };
    } catch (e) {
      // Network error
      console.warn('[OfflineSync] Network error:', e);
      return { online: false, authError: false };
    }
  }, []);

  // Sync pending updates to server
  const syncPendingUpdates = useCallback(async () => {
    if (isSyncingRef.current || !projectId) return;
    
    const pending = loadPendingUpdates();
    if (pending.length === 0) {
      setConnectionStatus(prev => prev === 'syncing' ? 'online' : prev);
      return;
    }

    isSyncingRef.current = true;
    setConnectionStatus('syncing');
    
    const { online, authError } = await checkConnection();
    
    if (!online) {
      setConnectionStatus('offline');
      setLastError('אין חיבור לאינטרנט');
      isSyncingRef.current = false;
      return;
    }
    
    if (authError) {
      // Auth error - don't mark as offline, just show error
      // Keep pending updates, they'll sync after re-login
      setConnectionStatus('error');
      setLastError('יש לרענן את העמוד או להתחבר מחדש');
      isSyncingRef.current = false;
      return;
    }

    const remaining: PendingUpdate[] = [];
    let hasError = false;
    let successCount = 0;

    for (const update of pending) {
      try {
        // Use measurement_rows table specifically since that's what we're syncing
        const { error } = await supabase
          .from('measurement_rows')
          .update({ ...update.data, updated_at: new Date().toISOString() })
          .eq('id', update.id);

        if (error) {
          const status = (error as any)?.status;
          const message = String((error as any)?.message ?? '');
          const looksLikeAuth =
            status === 401 ||
            status === 403 ||
            /jwt|unauthorized|session/i.test(message);

          if (looksLikeAuth) {
            // Auth error - keep all remaining pending updates for after re-login
            remaining.push(update);
            hasError = true;
            setLastError('יש לרענן את העמוד או להתחבר מחדש');
            // Stop processing more updates
            break;
          }

          console.error('Sync error for', update.id, error);
          if (update.retries < MAX_RETRIES) {
            remaining.push({ ...update, retries: update.retries + 1 });
          } else {
            // Max retries reached, log and drop
            console.error('Max retries reached for update:', update.id);
          }
          hasError = true;
        } else {
          successCount++;
        }
      } catch (e) {
        console.error('Network error syncing', update.id, e);
        remaining.push({ ...update, retries: update.retries + 1 });
        hasError = true;
      }
    }

    savePendingUpdates(remaining);
    
    if (remaining.length === 0 && !hasError) {
      setConnectionStatus('online');
      setLastSyncTime(new Date());
      setLastError(null);
      if (successCount > 0) {
        console.log(`[OfflineSync] Successfully synced ${successCount} updates`);
      }
    } else if (hasError) {
      setConnectionStatus('error');
      if (!lastError) {
        setLastError(`${remaining.length} עדכונים ממתינים לסנכרון`);
      }
    }

    isSyncingRef.current = false;
  }, [projectId, loadPendingUpdates, savePendingUpdates, checkConnection, lastError]);

  // Listen for online/offline events
  useEffect(() => {
    const handleOnline = () => {
      console.log('Browser went online');
      syncPendingUpdates();
    };

    const handleOffline = () => {
      console.log('Browser went offline');
      setConnectionStatus('offline');
      setLastError('אין חיבור לאינטרנט');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Initial status
    if (!navigator.onLine) {
      setConnectionStatus('offline');
      setLastError('אין חיבור לאינטרנט');
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [syncPendingUpdates]);

  // Periodic sync
  useEffect(() => {
    if (!projectId) return;

    // Initial load of pending count
    setPendingCount(loadPendingUpdates().length);

    // Start sync interval
    syncIntervalRef.current = setInterval(() => {
      syncPendingUpdates();
    }, SYNC_INTERVAL);

    // Initial sync
    syncPendingUpdates();

    return () => {
      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current);
      }
    };
  }, [projectId, loadPendingUpdates, syncPendingUpdates]);

  // Force sync now
  const forceSync = useCallback(async () => {
    await syncPendingUpdates();
  }, [syncPendingUpdates]);

  return {
    connectionStatus,
    pendingCount,
    lastSyncTime,
    lastError,
    queueUpdate,
    forceSync,
  };
}
