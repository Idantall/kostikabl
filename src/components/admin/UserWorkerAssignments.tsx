import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { UserPlus, Trash2, Link2, CreditCard, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

interface Worker {
  id: string;
  card_number: number;
  name: string;
  department: string | null;
}

interface UserWithEmail {
  user_id: string;
  email: string;
  role: string;
}

interface Assignment {
  id: string;
  user_id: string;
  worker_id: string;
  confirmed: boolean;
  worker: Worker;
  user_email?: string;
}

export function UserWorkerAssignments() {
  const queryClient = useQueryClient();
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [selectedWorkerId, setSelectedWorkerId] = useState<string>('');
  const [isAssigning, setIsAssigning] = useState(false);

  // Fetch users with worker role
  const { data: workerUsers, isLoading: usersLoading } = useQuery({
    queryKey: ['worker-users-for-assignment'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('get-users-with-emails');
      if (error) throw error;
      
      // Filter to only worker role users
      const workers = (data?.roles || []).filter((r: any) => r.role === 'worker');
      return workers as UserWithEmail[];
    },
  });

  // Fetch all workers
  const { data: workers, isLoading: workersLoading } = useQuery({
    queryKey: ['all-workers-for-assignment'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('workers')
        .select('id, card_number, name, department')
        .eq('is_active', true)
        .order('card_number', { ascending: true });
      if (error) throw error;
      return data as Worker[];
    },
  });

  // Fetch existing assignments
  const { data: assignments, isLoading: assignmentsLoading, refetch: refetchAssignments } = useQuery({
    queryKey: ['user-worker-assignments'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_worker_assignments')
        .select(`
          id,
          user_id,
          worker_id,
          confirmed,
          workers:worker_id (
            id,
            card_number,
            name,
            department
          )
        `)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      
      // Map worker details
      return (data || []).map((a: any) => ({
        id: a.id,
        user_id: a.user_id,
        worker_id: a.worker_id,
        confirmed: a.confirmed,
        worker: a.workers,
      })) as Assignment[];
    },
  });

  // Group assignments by user
  const assignmentsByUser = new Map<string, Assignment[]>();
  assignments?.forEach((a) => {
    const existing = assignmentsByUser.get(a.user_id) || [];
    existing.push(a);
    assignmentsByUser.set(a.user_id, existing);
  });

  // Get user email from workerUsers
  const getUserEmail = (userId: string) => {
    return workerUsers?.find(u => u.user_id === userId)?.email || userId.slice(0, 8) + '...';
  };

  // Get available workers for a user (not already assigned)
  const getAvailableWorkers = (userId: string) => {
    const assigned = assignmentsByUser.get(userId)?.map(a => a.worker_id) || [];
    return workers?.filter(w => !assigned.includes(w.id)) || [];
  };

  // Check if user can have more assignments (max 2)
  const canAssignMore = (userId: string) => {
    return (assignmentsByUser.get(userId)?.length || 0) < 2;
  };

  const handleAssign = async () => {
    if (!selectedUserId || !selectedWorkerId) {
      toast.error('יש לבחור משתמש ועובד');
      return;
    }

    if (!canAssignMore(selectedUserId)) {
      toast.error('ניתן להקצות עד 2 עובדים למשתמש');
      return;
    }

    setIsAssigning(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { error } = await supabase
        .from('user_worker_assignments')
        .insert({
          user_id: selectedUserId,
          worker_id: selectedWorkerId,
          assigned_by: user?.id,
          confirmed: false,
        });

      if (error) {
        if (error.code === '23505') {
          toast.error('עובד זה כבר מוקצה למשתמש');
        } else if (error.message.includes('Maximum')) {
          toast.error('ניתן להקצות עד 2 עובדים למשתמש');
        } else {
          throw error;
        }
      } else {
        toast.success('עובד הוקצה בהצלחה');
        setSelectedWorkerId('');
        await refetchAssignments();
      }
    } catch (error) {
      console.error('Error assigning worker:', error);
      toast.error('שגיאה בהקצאת עובד');
    } finally {
      setIsAssigning(false);
    }
  };

  const handleRemove = async (assignmentId: string) => {
    try {
      const { error } = await supabase
        .from('user_worker_assignments')
        .delete()
        .eq('id', assignmentId);

      if (error) throw error;
      
      toast.success('הקצאה הוסרה');
      await refetchAssignments();
    } catch (error) {
      console.error('Error removing assignment:', error);
      toast.error('שגיאה בהסרת הקצאה');
    }
  };

  const isLoading = usersLoading || workersLoading || assignmentsLoading;

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-48 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Link2 className="h-5 w-5 text-primary" />
          <CardTitle>הקצאת עובדים לחשבונות</CardTitle>
        </div>
        <CardDescription>
          הקצה עובדים מוגדרים מראש לכל חשבון (עד 2 לחשבון). העובד יצטרך לאשר בכניסה הראשונה.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Assignment form */}
        <div className="flex flex-col sm:flex-row gap-2 p-4 bg-muted/50 rounded-lg">
          <Select value={selectedUserId} onValueChange={setSelectedUserId}>
            <SelectTrigger className="flex-1">
              <SelectValue placeholder="בחר חשבון..." />
            </SelectTrigger>
            <SelectContent>
              {workerUsers?.map((user) => (
                <SelectItem 
                  key={user.user_id} 
                  value={user.user_id}
                  disabled={!canAssignMore(user.user_id)}
                >
                  <div className="flex items-center gap-2">
                    <span>{user.email}</span>
                    {!canAssignMore(user.user_id) && (
                      <Badge variant="outline" className="text-xs">מלא</Badge>
                    )}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select 
            value={selectedWorkerId} 
            onValueChange={setSelectedWorkerId}
            disabled={!selectedUserId}
          >
            <SelectTrigger className="flex-1">
              <SelectValue placeholder="בחר עובד..." />
            </SelectTrigger>
            <SelectContent>
              {selectedUserId && getAvailableWorkers(selectedUserId).map((worker) => (
                <SelectItem key={worker.id} value={worker.id}>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs gap-1">
                      <CreditCard className="h-3 w-3" />
                      {worker.card_number}
                    </Badge>
                    <span>{worker.name}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button 
            onClick={handleAssign} 
            disabled={!selectedUserId || !selectedWorkerId || isAssigning}
            className="gap-2"
          >
            <UserPlus className="h-4 w-4" />
            הקצה
          </Button>
        </div>

        {/* Assignments table */}
        {workerUsers && workerUsers.length > 0 ? (
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>חשבון (אימייל)</TableHead>
                  <TableHead>עובד 1</TableHead>
                  <TableHead>עובד 2</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {workerUsers.map((user) => {
                  const userAssignments = assignmentsByUser.get(user.user_id) || [];
                  return (
                    <TableRow key={user.user_id}>
                      <TableCell className="font-medium">{user.email}</TableCell>
                      {[0, 1].map((index) => {
                        const assignment = userAssignments[index];
                        return (
                          <TableCell key={index}>
                            {assignment ? (
                              <div className="flex items-center gap-2">
                                <Badge variant="secondary" className="gap-1">
                                  <CreditCard className="h-3 w-3" />
                                  {assignment.worker.card_number}
                                </Badge>
                                <span className="text-sm">{assignment.worker.name}</span>
                                {assignment.confirmed && (
                                  <CheckCircle2 className="h-4 w-4 text-primary" />
                                )}
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6 text-destructive"
                                  onClick={() => handleRemove(assignment.id)}
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            ) : (
                              <span className="text-muted-foreground text-xs">לא הוקצה</span>
                            )}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        ) : (
          <p className="text-center text-muted-foreground py-4">
            אין משתמשים עם תפקיד "עובד". הוסף משתמשים בלשונית "משתמשים" תחילה.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
