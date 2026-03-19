import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { User, X, Plus, CreditCard } from 'lucide-react';
import { useWorkerIdentity } from './WorkerIdentityContext';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onClose: () => void;
  required?: boolean;
}

export function WorkerIdentityModal({ open, onClose, required = false }: Props) {
  const { activeWorkers, addWorker, removeWorker, setCurrentWorker } = useWorkerIdentity();
  const [cardNumber, setCardNumber] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleAddWorker = async () => {
    const num = parseInt(cardNumber, 10);
    if (isNaN(num)) {
      toast.error('יש להזין מספר כרטיס תקין');
      return;
    }

    setIsSubmitting(true);
    const result = await addWorker(num);
    setIsSubmitting(false);

    if (result.success) {
      toast.success('עובד נוסף בהצלחה');
      setCardNumber('');
    } else {
      toast.error(result.error || 'שגיאה');
    }
  };

  const handleRemoveWorker = async (sessionId: string) => {
    await removeWorker(sessionId);
    toast.success('עובד הוסר');
  };

  const handleSelectAndClose = (session: typeof activeWorkers[0]) => {
    setCurrentWorker(session);
    onClose();
  };

  const canClose = !required || activeWorkers.length > 0;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && canClose && onClose()}>
      <DialogContent className="max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            זיהוי עובד
          </DialogTitle>
          <DialogDescription>
            הזן את מספר הכרטיס שלך כדי להתחיל לעבוד. ניתן להוסיף עד 2 עובדים.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Active workers list */}
          {activeWorkers.length > 0 && (
            <div className="space-y-2">
              <Label>עובדים פעילים:</Label>
              <div className="space-y-2">
                {activeWorkers.map((session) => (
                  <div
                    key={session.id}
                    className="flex items-center justify-between p-3 rounded-lg border bg-muted/50 hover:bg-muted cursor-pointer transition-colors"
                    onClick={() => handleSelectAndClose(session)}
                  >
                    <div className="flex items-center gap-3">
                      <User className="h-5 w-5 text-primary" />
                      <div>
                        <p className="font-medium">{session.worker.name}</p>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Badge variant="outline" className="text-xs">
                            #{session.worker.card_number}
                          </Badge>
                          {session.worker.department && (
                            <span>{session.worker.department}</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveWorker(session.id);
                      }}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Add worker form */}
          {activeWorkers.length < 2 && (
            <div className="space-y-2">
              <Label htmlFor="cardNumber">
                {activeWorkers.length === 0 ? 'מספר כרטיס:' : 'הוסף עובד נוסף:'}
              </Label>
              <div className="flex gap-2">
                <Input
                  id="cardNumber"
                  type="number"
                  placeholder="הזן מס' כרטיס"
                  value={cardNumber}
                  onChange={(e) => setCardNumber(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddWorker()}
                  className="flex-1"
                  autoFocus
                />
                <Button 
                  onClick={handleAddWorker} 
                  disabled={!cardNumber || isSubmitting}
                >
                  <Plus className="h-4 w-4 ml-1" />
                  הוסף
                </Button>
              </div>
            </div>
          )}

          {/* Continue button */}
          {activeWorkers.length > 0 && (
            <Button 
              className="w-full" 
              onClick={() => handleSelectAndClose(activeWorkers[0])}
            >
              המשך לעבודה
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
