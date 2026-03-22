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
const SYNC_INTERVAL = 3000;

export type ConnectionStatus = 'online' | 'offline' | 'syncing' | 'error';

// ── Pure helpers ──────────────────────────────────────────────
function storageKeyFor(projectId: string) {
  return `${STORAGE_KEY}_${projectId}`;
}

function readStorage(projectId: string): PendingUpdate[] {
  try {
    const stored = localStorage.getItem(storageKeyFor(projectId));
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function writeStorage(projectId: string, updates: PendingUpdate[]) {
  try {
    localStorage.setItem(storageKeyFor(projectId), JSON.stringify(updates));
  } catch (e) {
    console.error('[OfflineSync] Failed to write localStorage:', e);
  }
}

/** Merge a single update into an existing queue (mutates nothing, returns new array) */
function mergeIntoQueue(
  queue: PendingUpdate[],
  id: string,
  table: string,
  data: Record<string, unknown>,
): PendingUpdate[] {
  const next = [...queue];
  const idx = next.findIndex(p => p.id === id && p.table === table);
  if (idx >= 0) {
    next[idx] = {
      ...next[idx],
      data: { ...next[idx].data, ...data },
      timestamp: Date.now(),
    };
  } else {
    next.push({ id, table, data, timestamp: Date.now(), retries: 0 });
  }
  return next;
}

/** Merge two queues – items in `additions` override / extend items in `base` */
function mergeQueues(base: PendingUpdate[], additions: PendingUpdate[]): PendingUpdate[] {
  let merged = [...base];
  for (const add of additions) {
    const idx = merged.findIndex(p => p.id === add.id && p.table === add.table);
    if (idx >= 0) {
      // keep the newer timestamp / merged data
      merged[idx] = {
        ...merged[idx],
        data: { ...merged[idx].data, ...add.data },
        timestamp: Math.max(merged[idx].timestamp, add.timestamp),
        retries: Math.min(merged[idx].retries, add.retries),
      };
    } else {
      merged.push(add);
    }
  }
  return merged;
}

// ── Exported helpers for MeasurementEditor ───────────────────
/** Returns a Map<rowId, pendingFieldData> for all pending updates in a project */
export function getAllPendingData(projectId: string | number): Map<string, Record<string, unknown>> {
  const pending = readStorage(String(projectId));
  const map = new Map<string, Record<string, unknown>>();
  for (const p of pending) {
    const existing = map.get(p.id);
    map.set(p.id, existing ? { ...existing, ...p.data } : { ...p.data });
  }
  return map;
}

/** Returns pending field data for a single row, or undefined */
export function getPendingDataForRow(
  projectId: string | number,
  rowId: string,
): Record<string, unknown> | undefined {
  return getAllPendingData(projectId).get(rowId);
}

// ── Hook ─────────────────────────────────────────────────────
export function useOfflineSync(projectId: string | undefined) {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('online');
  const [pendingCount, setPendingCount] = useState(0);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const syncIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isSyncingRef = useRef(false);
  /** When true, queueUpdate defers its localStorage write to avoid clobbering sync's final write */
  const storageLockRef = useRef(false);

  const loadPendingUpdates = useCallback((): PendingUpdate[] => {
    if (!projectId) return [];
    return readStorage(projectId);
  }, [projectId]);

  const savePendingUpdates = useCallback((updates: PendingUpdate[]) => {
    if (!projectId) return;
    writeStorage(projectId, updates);
    setPendingCount(updates.length);
  }, [projectId]);

  // Queue an update – defers write when sync holds the lock
  const queueUpdate = useCallback((id: string, table: string, data: Record<string, unknown>) => {
    const doWrite = () => {
      if (!projectId) return;
      const pending = readStorage(projectId);
      const next = mergeIntoQueue(pending, id, table, data);
      writeStorage(projectId, next);
      setPendingCount(next.length);
    };

    if (storageLockRef.current) {
      // Defer to next microtask so sync's final write lands first
      queueMicrotask(doWrite);
    } else {
      doWrite();
    }
  }, [projectId]);

  const checkConnection = useCallback(async (): Promise<{ online: boolean; authError: boolean }> => {
    if (!navigator.onLine) return { online: false, authError: false };

    try {
      const { error } = await supabase.from('projects').select('id').limit(1);
      if (error) {
        const status = (error as any)?.status;
        const message = String((error as any)?.message ?? '');
        const looksLikeAuth = status === 401 || status === 403 || /jwt|unauthorized|session/i.test(message);
        if (looksLikeAuth) {
          console.warn('[OfflineSync] Auth error detected');
          return { online: true, authError: true };
        }
        return { online: true, authError: false };
      }
      return { online: true, authError: false };
    } catch {
      return { online: false, authError: false };
    }
  }, []);

  const syncPendingUpdates = useCallback(async () => {
    if (isSyncingRef.current || !projectId) return;

    // Take a snapshot of what's currently pending
    const snapshot = loadPendingUpdates();
    if (snapshot.length === 0) {
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
      setConnectionStatus('error');
      setLastError('יש לרענן את העמוד או להתחבר מחדש');
      isSyncingRef.current = false;
      return;
    }

    // Track which snapshot items we successfully synced (by index)
    const syncedIds = new Set<string>();
    const failed: PendingUpdate[] = [];
    let hasError = false;
    let successCount = 0;

    for (const update of snapshot) {
      try {
        const { error } = await supabase
          .from('measurement_rows')
          .update({ ...update.data, updated_at: new Date().toISOString() })
          .eq('id', update.id);

        if (error) {
          const status = (error as any)?.status;
          const message = String((error as any)?.message ?? '');
          const looksLikeAuth = status === 401 || status === 403 || /jwt|unauthorized|session/i.test(message);

          if (looksLikeAuth) {
            failed.push(update);
            hasError = true;
            setLastError('יש לרענן את העמוד או להתחבר מחדש');
            break;
          }
          if (update.retries < MAX_RETRIES) {
            failed.push({ ...update, retries: update.retries + 1 });
          }
          hasError = true;
        } else {
          syncedIds.add(`${update.id}::${update.table}`);
          successCount++;
        }
      } catch {
        failed.push({ ...update, retries: update.retries + 1 });
        hasError = true;
      }
    }

    // ── Merge-back: re-read localStorage to catch writes that happened during sync ──
    storageLockRef.current = true;
    const currentQueue = readStorage(projectId);

    // Items in currentQueue that are NEW (not in our snapshot) or have a NEWER timestamp
    const snapshotMap = new Map(snapshot.map(s => [`${s.id}::${s.table}`, s.timestamp]));
    const newOrUpdated: PendingUpdate[] = [];
    for (const item of currentQueue) {
      const key = `${item.id}::${item.table}`;
      const snapshotTs = snapshotMap.get(key);
      if (snapshotTs === undefined) {
        // Entirely new item added during sync
        newOrUpdated.push(item);
      } else if (item.timestamp > snapshotTs) {
        // Same item but user typed more data during sync
        newOrUpdated.push(item);
      }
      // else: item was in snapshot and wasn't updated → handled by syncedIds/failed
    }

    // Final queue = failed items merged with new/updated items
    const finalQueue = mergeQueues(failed, newOrUpdated);
    writeStorage(projectId, finalQueue);
    setPendingCount(finalQueue.length);
    storageLockRef.current = false;

    if (finalQueue.length === 0 && !hasError) {
      setConnectionStatus('online');
      setLastSyncTime(new Date());
      setLastError(null);
      if (successCount > 0) {
        console.log(`[OfflineSync] Synced ${successCount} updates`);
      }
    } else if (hasError) {
      setConnectionStatus('error');
      if (!lastError) {
        setLastError(`${finalQueue.length} עדכונים ממתינים לסנכרון`);
      }
    } else {
      setConnectionStatus('online');
      setLastSyncTime(new Date());
    }

    isSyncingRef.current = false;
  }, [projectId, loadPendingUpdates, checkConnection, lastError]);

  // Online/offline listeners
  useEffect(() => {
    const handleOnline = () => syncPendingUpdates();
    const handleOffline = () => {
      setConnectionStatus('offline');
      setLastError('אין חיבור לאינטרנט');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

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
    setPendingCount(loadPendingUpdates().length);

    syncIntervalRef.current = setInterval(() => syncPendingUpdates(), SYNC_INTERVAL);
    syncPendingUpdates();

    return () => {
      if (syncIntervalRef.current) clearInterval(syncIntervalRef.current);
    };
  }, [projectId, loadPendingUpdates, syncPendingUpdates]);

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
