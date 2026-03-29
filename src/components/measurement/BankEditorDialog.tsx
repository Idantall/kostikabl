import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Trash2, Plus } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';

export interface BankItem {
  id: string;
  item_no: string;
  height: string;
  width: string;
  floor_height: string;
}

interface BankEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: number;
  bankItems: BankItem[];
  onBankItemsChange: (items: BankItem[]) => void;
  onRowsUpdated: () => void;
}

export function BankEditorDialog({ open, onOpenChange, projectId, bankItems, onBankItemsChange, onRowsUpdated }: BankEditorDialogProps) {
  const [items, setItems] = useState<BankItem[]>(bankItems);
  const [originalItems] = useState<BankItem[]>(bankItems);
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [affectedCount, setAffectedCount] = useState(0);
  const [overrideManual, setOverrideManual] = useState(false);
  const [pendingChanges, setPendingChanges] = useState<{ item_no: string; oldHeight?: string; newHeight?: string; oldWidth?: string; newWidth?: string }[]>([]);

  const addItem = () => {
    setItems(prev => [...prev, {
      id: crypto.randomUUID(),
      item_no: '',
      height: '',
      width: '',
      floor_height: '',
    }]);
  };

  const updateItem = (id: string, field: keyof BankItem, value: string) => {
    setItems(prev => prev.map(item => item.id === id ? { ...item, [field]: value } : item));
  };

  const deleteItem = (id: string) => {
    setItems(prev => prev.filter(item => item.id !== id));
  };

  const handleSave = async () => {
    // Find changed height/width values
    const changes: typeof pendingChanges = [];
    for (const item of items) {
      const original = originalItems.find(o => o.item_no === item.item_no);
      if (original) {
        const heightChanged = original.height !== item.height;
        const widthChanged = original.width !== item.width;
        if (heightChanged || widthChanged) {
          changes.push({
            item_no: item.item_no,
            oldHeight: heightChanged ? original.height : undefined,
            newHeight: heightChanged ? item.height : undefined,
            oldWidth: widthChanged ? original.width : undefined,
            newWidth: widthChanged ? item.width : undefined,
          });
        }
      }
    }

    if (changes.length > 0) {
      // Count affected rows
      let total = 0;
      for (const change of changes) {
        const { count } = await supabase
          .from('measurement_rows')
          .select('*', { count: 'exact', head: true })
          .eq('project_id', projectId)
          .eq('contract_item', change.item_no);
        total += count || 0;
      }
      setAffectedCount(total);
      setPendingChanges(changes);
      setConfirmOpen(true);
    } else {
      await saveDirectly([]);
    }
  };

  const saveDirectly = async (changes: typeof pendingChanges) => {
    setSaving(true);
    try {
      // Save bank items to project_metadata
      const { error: metaError } = await supabase
        .from('projects')
        .update({ project_metadata: { bankItems: items } as any })
        .eq('id', projectId);
      if (metaError) throw metaError;

      // Apply retroactive changes
      for (const change of changes) {
        if (change.newHeight !== undefined) {
          let query = supabase
            .from('measurement_rows')
            .update({ height: change.newHeight })
            .eq('project_id', projectId)
            .eq('contract_item', change.item_no);
          if (!overrideManual && change.oldHeight) {
            query = query.eq('height', change.oldHeight);
          }
          await query;
        }
        if (change.newWidth !== undefined) {
          let query = supabase
            .from('measurement_rows')
            .update({ width: change.newWidth })
            .eq('project_id', projectId)
            .eq('contract_item', change.item_no);
          if (!overrideManual && change.oldWidth) {
            query = query.eq('width', change.oldWidth);
          }
          await query;
        }
      }

      onBankItemsChange(items);
      if (changes.length > 0) onRowsUpdated();
      toast.success('בנק פרטים עודכן');
      onOpenChange(false);
    } catch (error: any) {
      toast.error(`שגיאה: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle>בנק פרטים</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-[1fr_1fr_1fr_1fr_auto] gap-2 text-sm font-medium text-muted-foreground">
              <span>פרט</span>
              <span>גובה</span>
              <span>רוחב</span>
              <span>גובה מהריצוף</span>
              <span></span>
            </div>
            {items.map(item => (
              <div key={item.id} className="grid grid-cols-[1fr_1fr_1fr_1fr_auto] gap-2">
                <Input value={item.item_no} onChange={e => updateItem(item.id, 'item_no', e.target.value)} placeholder="מק״ט" dir="rtl" />
                <Input value={item.height} onChange={e => updateItem(item.id, 'height', e.target.value)} placeholder="גובה" dir="ltr" />
                <Input value={item.width} onChange={e => updateItem(item.id, 'width', e.target.value)} placeholder="רוחב" dir="ltr" />
                <Input value={item.floor_height} onChange={e => updateItem(item.id, 'floor_height', e.target.value)} placeholder="גובה מהריצוף" dir="ltr" />
                <Button variant="ghost" size="icon" onClick={() => deleteItem(item.id)} className="text-muted-foreground hover:text-destructive">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={addItem} className="gap-1">
              <Plus className="h-4 w-4" />
              הוסף פרט
            </Button>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>ביטול</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'שומר...' : 'שמור'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>עדכון שורות קיימות</AlertDialogTitle>
            <AlertDialogDescription>
              עדכון גובה/רוחב ישפיע על עד {affectedCount} שורות. להמשיך?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex items-center gap-2 px-1">
            <input
              type="checkbox"
              id="override-manual"
              checked={overrideManual}
              onChange={e => setOverrideManual(e.target.checked)}
              className="h-4 w-4"
            />
            <Label htmlFor="override-manual" className="text-sm">דרוס גם ערכים שנערכו ידנית</Label>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>ביטול</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setConfirmOpen(false); saveDirectly(pendingChanges); }}>
              עדכן
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
