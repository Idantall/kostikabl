import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { User, CreditCard, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface Worker {
  id: string;
  card_number: number;
  name: string;
  department: string | null;
}

interface Assignment {
  id: string;
  worker_id: string;
  worker: Worker;
  confirmed: boolean;
}

interface Props {
  open: boolean;
  assignments: Assignment[];
  onConfirmed: () => void;
}

export function WorkerConfirmationModal({ open, assignments, onConfirmed }: Props) {
  const [confirming, setConfirming] = useState(false);
  const [selectedAssignments, setSelectedAssignments] = useState<Set<string>>(new Set());

  const toggleSelection = (assignmentId: string) => {
    const newSelected = new Set(selectedAssignments);
    if (newSelected.has(assignmentId)) {
      newSelected.delete(assignmentId);
    } else {
      newSelected.add(assignmentId);
    }
    setSelectedAssignments(newSelected);
  };

  const handleConfirm = async () => {
    if (selectedAssignments.size === 0) {
      toast.error('יש לבחור לפחות עובד אחד לאישור');
      return;
    }

    setConfirming(true);
    try {
      // Confirm selected assignments
      const { error } = await supabase
        .from('user_worker_assignments')
        .update({ 
          confirmed: true, 
          confirmed_at: new Date().toISOString() 
        })
        .in('id', Array.from(selectedAssignments));

      if (error) throw error;

      // Create worker sessions for confirmed assignments
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('No user');

      // Get user station
      const { data: roleData } = await supabase
        .from('user_roles')
        .select('station')
        .eq('user_id', user.id)
        .single();

      // Create sessions for each confirmed worker
      const confirmedWorkers = assignments.filter(a => selectedAssignments.has(a.id));
      
      for (const assignment of confirmedWorkers) {
        await supabase
          .from('worker_sessions')
          .insert({
            user_id: user.id,
            worker_id: assignment.worker_id,
            station: roleData?.station || null,
            is_active: true,
          });
      }

      toast.success('זהות אושרה בהצלחה');
      onConfirmed();
    } catch (error) {
      console.error('Error confirming:', error);
      toast.error('שגיאה באישור זהות');
    } finally {
      setConfirming(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            אימות זהות עובד
          </DialogTitle>
          <DialogDescription>
            המנהל הקצה את העובדים הבאים לחשבון זה. אנא אשר שזו זהותך.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            {assignments.map((assignment) => (
              <Card 
                key={assignment.id}
                className={`cursor-pointer transition-all ${
                  selectedAssignments.has(assignment.id) 
                    ? 'ring-2 ring-primary bg-primary/5' 
                    : 'hover:bg-muted/50'
                }`}
                onClick={() => toggleSelection(assignment.id)}
              >
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <User className="h-8 w-8 text-primary" />
                    <div>
                      <p className="font-medium text-lg">{assignment.worker.name}</p>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="gap-1">
                          <CreditCard className="h-3 w-3" />
                          #{assignment.worker.card_number}
                        </Badge>
                        {assignment.worker.department && (
                          <span className="text-sm text-muted-foreground">
                            {assignment.worker.department}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  {selectedAssignments.has(assignment.id) && (
                    <CheckCircle2 className="h-6 w-6 text-primary" />
                  )}
                </CardContent>
              </Card>
            ))}
          </div>

          <p className="text-sm text-muted-foreground text-center">
            בחר את העובד/ים שאת/ה מזדהה איתם
          </p>

          <Button 
            className="w-full" 
            onClick={handleConfirm}
            disabled={selectedAssignments.size === 0 || confirming}
          >
            {confirming ? 'מאשר...' : 'אשר והמשך'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
