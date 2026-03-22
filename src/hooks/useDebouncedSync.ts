import { useRef, useCallback, useEffect } from 'react';

type QueueUpdateFn = (id: string, table: string, data: Record<string, unknown>) => void;

/**
 * Debounces rapid field changes per row before calling queueUpdate.
 * Accumulates all field changes for the same row, then flushes once after `delayMs`.
 */
export function useDebouncedSync(queueUpdate: QueueUpdateFn, delayMs = 600) {
  /** Accumulated data per row: Map<rowId, { table, data }> */
  const accRef = useRef<Map<string, { table: string; data: Record<string, unknown> }>>(new Map());
  /** Active timers per row */
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const flushRow = useCallback((id: string) => {
    const entry = accRef.current.get(id);
    if (entry) {
      queueUpdate(id, entry.table, entry.data);
      accRef.current.delete(id);
    }
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, [queueUpdate]);

  const debouncedQueueUpdate: QueueUpdateFn = useCallback((id, table, data) => {
    // Accumulate fields
    const existing = accRef.current.get(id);
    accRef.current.set(id, {
      table,
      data: existing ? { ...existing.data, ...data } : { ...data },
    });

    // Reset timer for this row
    const prevTimer = timersRef.current.get(id);
    if (prevTimer) clearTimeout(prevTimer);

    timersRef.current.set(id, setTimeout(() => flushRow(id), delayMs));
  }, [flushRow, delayMs]);

  /** Flush all pending debounced updates immediately */
  const flushAll = useCallback(() => {
    for (const [id] of accRef.current) {
      flushRow(id);
    }
  }, [flushRow]);

  // Flush on unmount
  useEffect(() => {
    return () => {
      for (const [id] of accRef.current) {
        const entry = accRef.current.get(id);
        if (entry) queueUpdate(id, entry.table, entry.data);
      }
      for (const timer of timersRef.current.values()) clearTimeout(timer);
      accRef.current.clear();
      timersRef.current.clear();
    };
  }, [queueUpdate]);

  return { debouncedQueueUpdate, flushAll };
}
