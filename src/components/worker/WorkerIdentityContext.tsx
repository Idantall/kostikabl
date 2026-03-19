import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface Worker {
  id: string;
  card_number: number;
  name: string;
  department: string | null;
}

interface WorkerSession {
  id: string;
  worker_id: string;
  worker: Worker;
  started_at: string;
}

interface PendingAssignment {
  id: string;
  worker_id: string;
  worker: Worker;
  confirmed: boolean;
}

interface WorkerIdentityContextType {
  activeWorkers: WorkerSession[];
  currentWorker: WorkerSession | null;
  setCurrentWorker: (session: WorkerSession | null) => void;
  addWorker: (cardNumber: number) => Promise<{ success: boolean; error?: string }>;
  removeWorker: (sessionId: string) => Promise<void>;
  isLoading: boolean;
  needsIdentification: boolean;
  pendingAssignments: PendingAssignment[];
  hasPendingConfirmation: boolean;
  refetchAssignments: () => Promise<void>;
}

const WorkerIdentityContext = createContext<WorkerIdentityContextType | null>(null);

export function useWorkerIdentity() {
  const context = useContext(WorkerIdentityContext);
  if (!context) {
    throw new Error('useWorkerIdentity must be used within WorkerIdentityProvider');
  }
  return context;
}

interface Props {
  children: ReactNode;
}

export function WorkerIdentityProvider({ children }: Props) {
  const [activeWorkers, setActiveWorkers] = useState<WorkerSession[]>([]);
  const [currentWorker, setCurrentWorker] = useState<WorkerSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [userStation, setUserStation] = useState<string | null>(null);
  const [pendingAssignments, setPendingAssignments] = useState<PendingAssignment[]>([]);

  const fetchAssignments = async (uid: string) => {
    // Check for pre-assigned workers that need confirmation
    const { data: assignments } = await supabase
      .from('user_worker_assignments')
      .select(`
        id,
        worker_id,
        confirmed,
        workers:worker_id (
          id,
          card_number,
          name,
          department
        )
      `)
      .eq('user_id', uid)
      .eq('confirmed', false);

    if (assignments && assignments.length > 0) {
      const mapped: PendingAssignment[] = assignments.map((a: any) => ({
        id: a.id,
        worker_id: a.worker_id,
        worker: a.workers,
        confirmed: a.confirmed,
      }));
      setPendingAssignments(mapped);
    } else {
      setPendingAssignments([]);
    }
  };

  // Fetch user and their active worker sessions
  useEffect(() => {
    const fetchData = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setIsLoading(false);
        return;
      }
      setUserId(user.id);

      // Get user's station
      const { data: roleData } = await supabase
        .from('user_roles')
        .select('station')
        .eq('user_id', user.id)
        .single();
      
      if (roleData?.station) {
        setUserStation(roleData.station);
      }

      // Check for pending assignments first
      await fetchAssignments(user.id);

      // Get active worker sessions for this user
      const { data: sessions } = await supabase
        .from('worker_sessions')
        .select(`
          id,
          worker_id,
          started_at,
          workers:worker_id (
            id,
            card_number,
            name,
            department
          )
        `)
        .eq('user_id', user.id)
        .eq('is_active', true)
        .order('started_at', { ascending: false });

      if (sessions && sessions.length > 0) {
        const mappedSessions: WorkerSession[] = sessions.map((s: any) => ({
          id: s.id,
          worker_id: s.worker_id,
          worker: s.workers,
          started_at: s.started_at,
        }));
        setActiveWorkers(mappedSessions);
        // Auto-select the most recent worker if only one
        if (mappedSessions.length === 1) {
          setCurrentWorker(mappedSessions[0]);
        }
      }

      setIsLoading(false);
    };

    void fetchData();
  }, []);

  const refetchAssignments = async () => {
    if (userId) {
      await fetchAssignments(userId);
      // Also refetch sessions
      const { data: sessions } = await supabase
        .from('worker_sessions')
        .select(`
          id,
          worker_id,
          started_at,
          workers:worker_id (
            id,
            card_number,
            name,
            department
          )
        `)
        .eq('user_id', userId)
        .eq('is_active', true)
        .order('started_at', { ascending: false });

      if (sessions && sessions.length > 0) {
        const mappedSessions: WorkerSession[] = sessions.map((s: any) => ({
          id: s.id,
          worker_id: s.worker_id,
          worker: s.workers,
          started_at: s.started_at,
        }));
        setActiveWorkers(mappedSessions);
        if (!currentWorker && mappedSessions.length > 0) {
          setCurrentWorker(mappedSessions[0]);
        }
      }
    }
  };

  const addWorker = async (cardNumber: number): Promise<{ success: boolean; error?: string }> => {
    if (!userId) return { success: false, error: 'לא מחובר' };

    // Check if we already have 2 workers
    if (activeWorkers.length >= 2) {
      return { success: false, error: 'ניתן להוסיף עד 2 עובדים בלבד' };
    }

    // Find the worker by card number
    const { data: worker, error: workerError } = await supabase
      .from('workers')
      .select('id, card_number, name, department')
      .eq('card_number', cardNumber)
      .eq('is_active', true)
      .single();

    if (workerError || !worker) {
      return { success: false, error: 'מספר כרטיס לא נמצא' };
    }

    // Check if this worker is already active on this user
    const existingSession = activeWorkers.find(s => s.worker_id === worker.id);
    if (existingSession) {
      return { success: false, error: 'עובד זה כבר פעיל' };
    }

    // Create new session
    const { data: newSession, error: sessionError } = await supabase
      .from('worker_sessions')
      .insert({
        user_id: userId,
        worker_id: worker.id,
        station: userStation,
        is_active: true,
      })
      .select('id, worker_id, started_at')
      .single();

    if (sessionError || !newSession) {
      return { success: false, error: 'שגיאה ביצירת סשן' };
    }

    const session: WorkerSession = {
      id: newSession.id,
      worker_id: newSession.worker_id,
      worker: worker,
      started_at: newSession.started_at,
    };

    setActiveWorkers(prev => [...prev, session]);
    
    // Auto-select if this is the only/first worker
    if (activeWorkers.length === 0) {
      setCurrentWorker(session);
    }

    return { success: true };
  };

  const removeWorker = async (sessionId: string) => {
    await supabase
      .from('worker_sessions')
      .update({ is_active: false, ended_at: new Date().toISOString() })
      .eq('id', sessionId);

    setActiveWorkers(prev => prev.filter(s => s.id !== sessionId));
    
    if (currentWorker?.id === sessionId) {
      setCurrentWorker(activeWorkers.find(s => s.id !== sessionId) || null);
    }
  };

  const needsIdentification = !isLoading && activeWorkers.length === 0 && pendingAssignments.length === 0;
  const hasPendingConfirmation = !isLoading && pendingAssignments.length > 0 && activeWorkers.length === 0;

  return (
    <WorkerIdentityContext.Provider
      value={{
        activeWorkers,
        currentWorker,
        setCurrentWorker,
        addWorker,
        removeWorker,
        isLoading,
        needsIdentification,
        pendingAssignments,
        hasPendingConfirmation,
        refetchAssignments,
      }}
    >
      {children}
    </WorkerIdentityContext.Provider>
  );
}
