import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, Pencil, Trash2, Users, CreditCard } from 'lucide-react';
import { toast } from 'sonner';

interface Worker {
  id: string;
  card_number: number;
  name: string;
  department: string | null;
  is_active: boolean;
}

export function WorkersManager() {
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingWorker, setEditingWorker] = useState<Worker | null>(null);
  
  const [cardNumber, setCardNumber] = useState('');
  const [name, setName] = useState('');
  const [department, setDepartment] = useState('');
  const [isActive, setIsActive] = useState(true);

  const departments = ['ייצור', 'מסגרות', 'הרכבה', 'אחסנה', 'אחר'];

  const fetchWorkers = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from('workers')
      .select('*')
      .order('card_number', { ascending: true });
    
    if (error) {
      toast.error('שגיאה בטעינת עובדים');
    } else {
      setWorkers(data || []);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    void fetchWorkers();
  }, []);

  const resetForm = () => {
    setCardNumber('');
    setName('');
    setDepartment('');
    setIsActive(true);
    setEditingWorker(null);
  };

  const openDialog = (worker?: Worker) => {
    if (worker) {
      setEditingWorker(worker);
      setCardNumber(worker.card_number.toString());
      setName(worker.name);
      setDepartment(worker.department || '');
      setIsActive(worker.is_active);
    } else {
      resetForm();
    }
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!cardNumber || !name) {
      toast.error('יש למלא מספר כרטיס ושם');
      return;
    }

    const num = parseInt(cardNumber, 10);
    if (isNaN(num) || num <= 0) {
      toast.error('מספר כרטיס לא תקין');
      return;
    }

    const workerData = {
      card_number: num,
      name: name.trim(),
      department: department || null,
      is_active: isActive,
    };

    if (editingWorker) {
      const { error } = await supabase
        .from('workers')
        .update(workerData)
        .eq('id', editingWorker.id);
      
      if (error) {
        toast.error('שגיאה בעדכון עובד');
      } else {
        toast.success('עובד עודכן');
        setDialogOpen(false);
        resetForm();
        await fetchWorkers();
      }
    } else {
      const { error } = await supabase
        .from('workers')
        .insert(workerData);
      
      if (error) {
        if (error.code === '23505') {
          toast.error('מספר כרטיס כבר קיים');
        } else {
          toast.error('שגיאה בהוספת עובד');
        }
      } else {
        toast.success('עובד נוסף');
        setDialogOpen(false);
        resetForm();
        await fetchWorkers();
      }
    }
  };

  const handleDelete = async (worker: Worker) => {
    if (!confirm(`למחוק את ${worker.name}?`)) return;

    const { error } = await supabase
      .from('workers')
      .delete()
      .eq('id', worker.id);

    if (error) {
      toast.error('שגיאה במחיקת עובד');
    } else {
      toast.success('עובד נמחק');
      await fetchWorkers();
    }
  };

  const activeWorkers = workers.filter(w => w.is_active);
  const inactiveWorkers = workers.filter(w => !w.is_active);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              <CardTitle>ניהול עובדים</CardTitle>
            </div>
            <CardDescription>
              רשימת עובדי הייצור עם מספרי כרטיס ({activeWorkers.length} פעילים)
            </CardDescription>
          </div>
          <Dialog open={dialogOpen} onOpenChange={(open) => {
            setDialogOpen(open);
            if (!open) resetForm();
          }}>
            <DialogTrigger asChild>
              <Button onClick={() => openDialog()}>
                <Plus className="h-4 w-4 ml-1" />
                הוסף עובד
              </Button>
            </DialogTrigger>
            <DialogContent dir="rtl">
              <DialogHeader>
                <DialogTitle>
                  {editingWorker ? 'עריכת עובד' : 'הוספת עובד חדש'}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="cardNumber">מספר כרטיס *</Label>
                  <Input
                    id="cardNumber"
                    type="number"
                    value={cardNumber}
                    onChange={(e) => setCardNumber(e.target.value)}
                    placeholder="לדוגמה: 123"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="name">שם העובד *</Label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="שם מלא"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="department">מחלקה</Label>
                  <Select value={department} onValueChange={setDepartment}>
                    <SelectTrigger>
                      <SelectValue placeholder="בחר מחלקה" />
                    </SelectTrigger>
                    <SelectContent>
                      {departments.map((dept) => (
                        <SelectItem key={dept} value={dept}>
                          {dept}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="isActive"
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                  />
                  <Label htmlFor="isActive">עובד פעיל</Label>
                </div>
                <div className="flex gap-2 justify-end">
                  <Button variant="outline" onClick={() => setDialogOpen(false)}>
                    ביטול
                  </Button>
                  <Button onClick={handleSave}>
                    {editingWorker ? 'עדכון' : 'הוספה'}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-center text-muted-foreground py-4">טוען...</p>
        ) : workers.length === 0 ? (
          <p className="text-center text-muted-foreground py-4">אין עובדים רשומים</p>
        ) : (
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-24">מס' כרטיס</TableHead>
                  <TableHead>שם</TableHead>
                  <TableHead>מחלקה</TableHead>
                  <TableHead>סטטוס</TableHead>
                  <TableHead className="w-24">פעולות</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {workers.map((worker) => (
                  <TableRow key={worker.id} className={!worker.is_active ? 'opacity-50' : ''}>
                    <TableCell>
                      <Badge variant="secondary" className="gap-1">
                        <CreditCard className="h-3 w-3" />
                        {worker.card_number}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium">{worker.name}</TableCell>
                    <TableCell>{worker.department || '-'}</TableCell>
                    <TableCell>
                      <Badge variant={worker.is_active ? 'default' : 'outline'}>
                        {worker.is_active ? 'פעיל' : 'לא פעיל'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openDialog(worker)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(worker)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
