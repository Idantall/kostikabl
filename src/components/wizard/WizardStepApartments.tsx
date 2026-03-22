import { useState } from 'react';
import { useWizard } from './WizardContext';
import { LOCATION_OPTIONS, MAMAD_OPTIONS, WizardApartmentRow } from '@/lib/wizardTypes';
import { useTableKeyboardNav } from '@/hooks/useTableKeyboardNav';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ArrowLeft, ArrowRight, Plus, Trash2, RotateCcw, Building2, Home, Pencil, Check, X, Save, Download } from 'lucide-react';
import { WingPositionSelector, WingPositionValue } from '@/components/WingPositionSelector';
import { toast } from 'sonner';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';

export function WizardStepApartments() {
  const { state, dispatch, currentFloors } = useWizard();
  const { buildings, currentBuildingId, bankItems } = state;
  const floors = currentFloors;
  const { tableRef, onTableKeyDown } = useTableKeyboardNav();
  
  const [selectedFloorId, setSelectedFloorId] = useState<string>(floors[0]?.id || '');
  const [selectedApartmentId, setSelectedApartmentId] = useState<string>(
    floors[0]?.apartments[0]?.id || ''
  );
  
  const [editingApartmentId, setEditingApartmentId] = useState<string | null>(null);
  const [editingApartmentLabel, setEditingApartmentLabel] = useState<string>('');
  
  // Apartment type dialogs
  const [saveTypeDialogOpen, setSaveTypeDialogOpen] = useState(false);
  const [saveTypeName, setSaveTypeName] = useState('');
  const [applyTypeDialogOpen, setApplyTypeDialogOpen] = useState(false);

  const currentFloor = floors.find(f => f.id === selectedFloorId);
  const currentApartment = currentFloor?.apartments.find(a => a.id === selectedApartmentId);

  // When switching building, reset floor/apartment selection
  const handleBuildingChange = (buildingId: string) => {
    dispatch({ type: 'SET_CURRENT_BUILDING', payload: buildingId });
    const building = buildings.find(b => b.id === buildingId);
    if (building && building.floors.length > 0) {
      setSelectedFloorId(building.floors[0].id);
      setSelectedApartmentId(building.floors[0].apartments[0]?.id || '');
    } else {
      setSelectedFloorId('');
      setSelectedApartmentId('');
    }
  };

  const handleFloorChange = (floorId: string) => {
    setSelectedFloorId(floorId);
    const floor = floors.find(f => f.id === floorId);
    if (floor && floor.apartments.length > 0) {
      setSelectedApartmentId(floor.apartments[0].id);
    } else {
      setSelectedApartmentId('');
    }
  };

  const handleApartmentChange = (aptId: string) => {
    setSelectedApartmentId(aptId);
  };

  const handleStartEditApartmentLabel = (apt: { id: string; label: string }) => {
    setEditingApartmentId(apt.id);
    setEditingApartmentLabel(apt.label);
  };

  const handleSaveApartmentLabel = () => {
    if (!currentFloor || !editingApartmentId) return;
    const trimmedLabel = editingApartmentLabel.trim();
    if (!trimmedLabel) { toast.error('שם דירה לא יכול להיות ריק'); return; }
    dispatch({ type: 'UPDATE_APARTMENT', payload: { floorId: currentFloor.id, apartmentId: editingApartmentId, label: trimmedLabel } });
    setEditingApartmentId(null);
    setEditingApartmentLabel('');
  };

  const handleCancelEditApartmentLabel = () => {
    setEditingApartmentId(null);
    setEditingApartmentLabel('');
  };

  const isPreContract = state.projectType === 'pre_contract';
  const bankField: keyof WizardApartmentRow = isPreContract ? 'contract_item' : 'item_code';

  const handleUpdateRow = (rowId: string, field: keyof WizardApartmentRow, value: any) => {
    if (!currentFloor || !currentApartment) return;
    let updates: Partial<WizardApartmentRow> = { [field]: value };
    if (field === bankField && value) {
      const bankItem = bankItems.find(b => b.item_no === value);
      if (bankItem) {
        const row = currentApartment.rows.find(r => r.id === rowId);
        if (row && !row.height_overridden) updates.height = bankItem.height;
        if (row && !row.width_overridden) updates.width = bankItem.width;
        if (bankItem.floor_height) updates.notes = bankItem.floor_height;
      }
    }
    if (field === 'height') updates.height_overridden = true;
    if (field === 'width') updates.width_overridden = true;
    dispatch({ type: 'UPDATE_APARTMENT_ROW', payload: { floorId: currentFloor.id, apartmentId: currentApartment.id, rowId, updates } });
  };

  const handleResetToBank = (rowId: string) => {
    if (!currentFloor || !currentApartment) return;
    const row = currentApartment.rows.find(r => r.id === rowId);
    if (!row || !row.item_code) return;
    const bankItem = bankItems.find(b => b.item_no === row.item_code);
    if (!bankItem) return;
    const resetUpdates: Partial<WizardApartmentRow> = { height: bankItem.height, height_overridden: false, width: bankItem.width, width_overridden: false };
    if (bankItem.floor_height) resetUpdates.notes = bankItem.floor_height;
    dispatch({ type: 'UPDATE_APARTMENT_ROW', payload: { floorId: currentFloor.id, apartmentId: currentApartment.id, rowId, updates: resetUpdates } });
    toast.success('הערכים אופסו לפי הבנק');
  };

  const handleAddRow = () => {
    if (!currentFloor || !currentApartment) return;
    dispatch({ type: 'ADD_APARTMENT_ROW', payload: { floorId: currentFloor.id, apartmentId: currentApartment.id } });
  };

  const handleDeleteRow = (rowId: string) => {
    if (!currentFloor || !currentApartment) return;
    if (currentApartment.rows.length <= 1) { toast.error('חייבת להיות לפחות שורה אחת'); return; }
    dispatch({ type: 'DELETE_APARTMENT_ROW', payload: { floorId: currentFloor.id, apartmentId: currentApartment.id, rowId } });
  };

  const handleBack = () => { dispatch({ type: 'SET_STEP', payload: 2 }); };

  const handleNext = () => {
    let hasErrors = false;
    buildings.forEach(b => {
      b.floors.forEach(floor => {
        floor.apartments.forEach(apt => {
          if (apt.rows.filter(r => r.item_code).length === 0) hasErrors = true;
        });
      });
    });
    if (hasErrors) { toast.error('יש דירות ללא פרטים. יש למלא לפחות פרט אחד בכל דירה.'); return; }
    dispatch({ type: 'SET_STEP', payload: 4 });
  };

  if (buildings.length === 0 || floors.length === 0 || !currentFloor) {
    return (
      <div className="max-w-4xl mx-auto">
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            אין קומות. חזור לשלב הקודם להוספת קומות ודירות.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">טבלאות דירות</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Building / Floor / Apartment selection */}
          <div className="flex gap-4 flex-wrap">
            {/* Building selector (only show if multiple buildings) */}
            {buildings.length > 1 && (
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                <Select value={currentBuildingId || ''} onValueChange={handleBuildingChange}>
                  <SelectTrigger className="w-40 bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-background z-50">
                    {buildings.map(b => (
                      <SelectItem key={b.id} value={b.id}>{b.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              <Select value={selectedFloorId} onValueChange={handleFloorChange}>
                <SelectTrigger className="w-40 bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-background z-50">
                  {floors.map(floor => (
                    <SelectItem key={floor.id} value={floor.id}>{floor.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {currentFloor.apartments.length > 0 && (
              <div className="flex items-center gap-3">
                <Home className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="flex items-center gap-2 flex-wrap">
                  {currentFloor.apartments.map(apt => (
                    <div key={apt.id} className="flex items-center">
                      {editingApartmentId === apt.id ? (
                        <div className="flex items-center gap-1.5 bg-muted rounded-lg px-2 py-1.5 border border-border shadow-sm">
                          <Input
                            value={editingApartmentLabel}
                            onChange={e => setEditingApartmentLabel(e.target.value)}
                            className="h-8 w-28 text-sm"
                            autoFocus
                            onKeyDown={e => {
                              if (e.key === 'Enter') handleSaveApartmentLabel();
                              if (e.key === 'Escape') handleCancelEditApartmentLabel();
                            }}
                          />
                          <Button size="icon" variant="ghost" className="h-7 w-7 hover:bg-green-100 dark:hover:bg-green-900/30" onClick={handleSaveApartmentLabel}>
                            <Check className="h-4 w-4 text-green-600" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7 hover:bg-destructive/10" onClick={handleCancelEditApartmentLabel}>
                            <X className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-0.5">
                          <Button
                            variant={selectedApartmentId === apt.id ? "default" : "outline"}
                            size="sm"
                            className="min-w-[70px]"
                            onClick={() => handleApartmentChange(apt.id)}
                          >
                            {apt.label}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-foreground"
                            onClick={() => handleStartEditApartmentLabel(apt)}
                            title="ערוך שם דירה"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Apartment type actions */}
          {currentApartment && (
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => { setSaveTypeName(currentApartment.label); setSaveTypeDialogOpen(true); }}
              >
                <Save className="h-3.5 w-3.5" />
                שמור כסוג דירה
              </Button>
              {state.apartmentTypes.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => setApplyTypeDialogOpen(true)}
                >
                  <Download className="h-3.5 w-3.5" />
                  החל סוג דירה
                </Button>
              )}
              {state.apartmentTypes.length > 0 && (
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  סוגים שמורים:
                  {state.apartmentTypes.map(t => (
                    <Badge key={t.id} variant="secondary" className="text-xs gap-1">
                      {t.name} ({t.rows.length})
                      <button
                        type="button"
                        onClick={() => dispatch({ type: 'DELETE_APARTMENT_TYPE', payload: t.id })}
                        className="hover:text-destructive"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Apartment table */}
          {currentApartment ? (
            <>
              <ScrollArea className="w-full" dir="rtl">
                <div className="border rounded-lg min-w-[1500px]" ref={tableRef} onKeyDown={onTableKeyDown}>
                  <Table dir="rtl" className="table-fixed">
                    <TableHeader>
                      <TableRow>
                         <TableHead className="text-right w-14">פתח</TableHead>
                        <TableHead className="text-right w-36">מיקום</TableHead>
                        <TableHead className="text-right w-20">פרט חוזה</TableHead>
                        <TableHead className="text-right w-32">פרט יצור</TableHead>
                        <TableHead className="text-right w-28">גובה</TableHead>
                        <TableHead className="text-right w-20">רוחב</TableHead>
                        <TableHead className="text-right w-28">גובה מהריצוף</TableHead>
                        <TableHead className="text-right w-32">ממד כיס בצד</TableHead>
                        <TableHead className="text-right w-16">גליף</TableHead>
                        <TableHead className="text-right w-20">עומק עד הפריקסט</TableHead>
                        <TableHead className="text-right w-24">מדרגה בשיש</TableHead>
                        <TableHead className="text-right w-16">מנואלה</TableHead>
                        <TableHead className="text-right w-20">מנוע</TableHead>
                        <TableHead className="text-right w-28">הערות</TableHead>
                        <TableHead className="text-right w-24">כנף פנימית</TableHead>
                        <TableHead className="text-right w-24">פתיחה פנימה</TableHead>
                        <TableHead className="text-right w-24">פתיחה החוצה</TableHead>
                        <TableHead className="w-12"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {currentApartment.rows.map((row, rowIdx) => (
                        <TableRow key={row.id}>
                          <TableCell className="font-medium text-center">{row.opening_no}</TableCell>
                          <TableCell data-row={rowIdx} data-col={1}>
                            <Select value={row.location_in_apartment || 'none'} onValueChange={v => handleUpdateRow(row.id, 'location_in_apartment', v === 'none' ? null : v)}>
                              <SelectTrigger className="h-9 bg-background"><SelectValue placeholder="-" /></SelectTrigger>
                              <SelectContent className="bg-background z-50 max-h-80 overflow-y-auto">
                                <SelectItem value="none">-</SelectItem>
                                {LOCATION_OPTIONS.map(loc => <SelectItem key={loc} value={loc}>{loc}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell data-row={rowIdx} data-col={2}>
                            <Input value={row.contract_item || ''} onChange={e => handleUpdateRow(row.id, 'contract_item', e.target.value || null)} className="h-9" dir="rtl" />
                          </TableCell>
                          <TableCell data-row={rowIdx} data-col={3}>
                            <Select value={row.item_code || 'none'} onValueChange={v => handleUpdateRow(row.id, 'item_code', v === 'none' ? null : v)}>
                              <SelectTrigger className="h-9 bg-background"><SelectValue placeholder="-" /></SelectTrigger>
                              <SelectContent className="bg-background z-50 max-h-60">
                                <SelectItem value="none">-</SelectItem>
                                {bankItems.map(item => <SelectItem key={item.id} value={item.item_no}>{item.item_no}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell data-row={rowIdx} data-col={4}>
                            <div className="relative">
                              <Input value={row.height || ''} onChange={e => handleUpdateRow(row.id, 'height', e.target.value)} className={`h-9 w-full min-w-[80px] ${row.height_overridden ? 'bg-yellow-50 dark:bg-yellow-950/30' : 'bg-primary/5'}`} dir="ltr" />
                              {row.height_overridden && <Badge variant="outline" className="absolute -top-2 -right-2 text-[10px] px-1 py-0">שונה</Badge>}
                            </div>
                          </TableCell>
                          <TableCell data-row={rowIdx} data-col={5}>
                            <div className="relative">
                              <Input value={row.width || ''} onChange={e => handleUpdateRow(row.id, 'width', e.target.value)} className={`h-9 w-full min-w-[60px] ${row.width_overridden ? 'bg-yellow-50 dark:bg-yellow-950/30' : 'bg-primary/5'}`} dir="ltr" />
                              {row.width_overridden && <Badge variant="outline" className="absolute -top-2 -right-2 text-[10px] px-1 py-0">שונה</Badge>}
                            </div>
                          </TableCell>
                          <TableCell data-row={rowIdx} data-col={6}>
                            <Input value={row.notes || ''} onChange={e => handleUpdateRow(row.id, 'notes', e.target.value)} className="h-9" dir="rtl" />
                          </TableCell>
                          <TableCell data-row={rowIdx} data-col={7}>
                            <Select value={row.mamad || 'none'} onValueChange={v => handleUpdateRow(row.id, 'mamad', v === 'none' ? null : v)}>
                              <SelectTrigger className="h-9 bg-background"><SelectValue placeholder="-" /></SelectTrigger>
                              <SelectContent className="bg-background z-50">
                                <SelectItem value="none">-</SelectItem>
                                {MAMAD_OPTIONS.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell data-row={rowIdx} data-col={9}>
                            <Input value={row.glyph || ''} onChange={e => handleUpdateRow(row.id, 'glyph', e.target.value)} className="h-9 w-full min-w-[50px]" dir="ltr" />
                          </TableCell>
                          <TableCell data-row={rowIdx} data-col={10}>
                            <Input value={row.depth || ''} onChange={e => handleUpdateRow(row.id, 'depth', e.target.value || null)} className="h-9" inputMode="tel" dir="ltr" />
                          </TableCell>
                          <TableCell data-row={rowIdx} data-col={11}>
                            <Input value={row.jamb_height || ''} onChange={e => handleUpdateRow(row.id, 'jamb_height', e.target.value)} className="h-9" dir="ltr" />
                          </TableCell>
                          <TableCell className="text-center" data-row={rowIdx} data-col={12}>
                            <input type="checkbox" checked={row.is_manual || false} onChange={e => handleUpdateRow(row.id, 'is_manual', e.target.checked)} className="h-5 w-5 rounded border-border" />
                          </TableCell>
                          <TableCell data-row={rowIdx} data-col={13}>
                            <Select value={row.engine_side || 'none'} onValueChange={v => handleUpdateRow(row.id, 'engine_side', v === 'none' ? null : v)}>
                              <SelectTrigger className="h-9 bg-background"><SelectValue placeholder="-" /></SelectTrigger>
                              <SelectContent className="bg-background z-50">
                                <SelectItem value="none">-</SelectItem>
                                <SelectItem value="ימין">ימין</SelectItem>
                                <SelectItem value="שמאל">שמאל</SelectItem>
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell data-row={rowIdx} data-col={14}>
                            <Input value={row.field_notes || ''} onChange={e => handleUpdateRow(row.id, 'field_notes', e.target.value || null)} className="h-9" dir="rtl" />
                          </TableCell>
                          <TableCell data-row={rowIdx} data-col={15}>
                            <Select value={row.internal_wing || 'none'} onValueChange={v => handleUpdateRow(row.id, 'internal_wing', v === 'none' ? null : v)}>
                              <SelectTrigger className="h-9 bg-background"><SelectValue placeholder="-" /></SelectTrigger>
                              <SelectContent className="bg-background z-50">
                                <SelectItem value="none">-</SelectItem>
                                <SelectItem value="R">ימין</SelectItem>
                                <SelectItem value="L">שמאל</SelectItem>
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell data-row={rowIdx} data-col={16}>
                            <WingPositionSelector
                              value={(row.wing_position as WingPositionValue) || null}
                              onChange={(v) => handleUpdateRow(row.id, 'wing_position', v)}
                            />
                          </TableCell>
                          <TableCell data-row={rowIdx} data-col={17}>
                            <WingPositionSelector
                              value={(row.wing_position_out as WingPositionValue) || null}
                              onChange={(v) => handleUpdateRow(row.id, 'wing_position_out', v)}
                            />
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              {(row.height_overridden || row.width_overridden) && row.item_code && (
                                <Button variant="ghost" size="icon" className="h-8 w-8" title="אפס לערכי הבנק" onClick={() => handleResetToBank(row.id)}>
                                  <RotateCcw className="h-3 w-3" />
                                </Button>
                              )}
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => handleDeleteRow(row.id)}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <ScrollBar orientation="horizontal" />
              </ScrollArea>

              <Button variant="outline" onClick={handleAddRow} className="gap-2" disabled={currentApartment.rows.length >= 30}>
                <Plus className="h-4 w-4" />
                הוסף שורה
              </Button>

              <p className="text-xs text-muted-foreground">
                * שורות עם רקע צהוב מציינות ערכים ששונו ידנית מהבנק
              </p>
            </>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              אין דירות בקומה זו. חזור לשלב הקודם להוספת דירות.
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-between">
        <Button variant="outline" onClick={handleBack} className="gap-2">
          <ArrowRight className="h-4 w-4" />
          חזור
        </Button>
        <Button onClick={handleNext} className="gap-2">
          המשך לסיכום
          <ArrowLeft className="h-4 w-4" />
        </Button>
      </div>

      {/* Save apartment type dialog */}
      <Dialog open={saveTypeDialogOpen} onOpenChange={setSaveTypeDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>שמור כסוג דירה</DialogTitle>
            <DialogDescription>שמור את מבנה הדירה הנוכחית כתבנית לשימוש חוזר</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Input
              value={saveTypeName}
              onChange={e => setSaveTypeName(e.target.value)}
              placeholder="שם הסוג"
              dir="rtl"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveTypeDialogOpen(false)}>ביטול</Button>
            <Button onClick={() => {
              if (!saveTypeName.trim()) { toast.error('יש להזין שם'); return; }
              if (!currentApartment) return;
              dispatch({ type: 'SAVE_APARTMENT_TYPE', payload: { name: saveTypeName.trim(), apartment: currentApartment } });
              toast.success('סוג דירה נשמר');
              setSaveTypeDialogOpen(false);
            }}>שמור</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Apply apartment type dialog */}
      <Dialog open={applyTypeDialogOpen} onOpenChange={setApplyTypeDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>החל סוג דירה</DialogTitle>
            <DialogDescription>בחר סוג דירה להחלה על הדירה הנוכחית. הנתונים הקיימים יוחלפו.</DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-2">
            {state.apartmentTypes.map(t => (
              <Button
                key={t.id}
                variant="outline"
                className="w-full justify-start gap-2"
                onClick={() => {
                  if (!currentFloor || !currentApartment) return;
                  if (currentApartment.rows.some(r => r.item_code)) {
                    if (!confirm('לדירה זו יש נתונים קיימים. להחליף?')) return;
                  }
                  dispatch({ type: 'APPLY_APARTMENT_TYPE', payload: { typeId: t.id, floorId: currentFloor.id, apartmentId: currentApartment.id } });
                  toast.success(`סוג "${t.name}" הוחל`);
                  setApplyTypeDialogOpen(false);
                }}
              >
                <Home className="h-4 w-4" />
                {t.name}
                <Badge variant="secondary" className="mr-auto">{t.rows.length} שורות</Badge>
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
