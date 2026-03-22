import { useState } from 'react';
import { WizardBuilding, WizardFloor, WizardApartmentRow, createEmptyFloor, createEmptyApartment, createEmptyRow, cloneBuilding, LOCATION_OPTIONS, MAMAD_OPTIONS } from '@/lib/wizardTypes';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Plus, Trash2, Copy, Building2, Home, ChevronDown, ChevronUp, Pencil, Check, X } from 'lucide-react';
import { toast } from 'sonner';
import { useTableKeyboardNav } from '@/hooks/useTableKeyboardNav';

interface ImportStructureEditorProps {
  buildings: WizardBuilding[];
  onBuildingsChange: (buildings: WizardBuilding[]) => void;
  bankItems?: { id: string; item_no: string; height: string; width: string }[];
}

export function ImportStructureEditor({ buildings, onBuildingsChange, bankItems = [] }: ImportStructureEditorProps) {
  const [currentBuildingId, setCurrentBuildingId] = useState<string>(buildings[0]?.id || '');
  const [expandedFloors, setExpandedFloors] = useState<Set<string>>(new Set());
  const [editingBuildingId, setEditingBuildingId] = useState<string | null>(null);
  const [editingBuildingLabel, setEditingBuildingLabel] = useState('');
  const [editingApt, setEditingApt] = useState<{ floorId: string; aptId: string } | null>(null);
  const [editingAptLabel, setEditingAptLabel] = useState('');
  const [cloneDialogOpen, setCloneDialogOpen] = useState(false);
  const [cloneSource, setCloneSource] = useState('');
  const [cloneCount, setCloneCount] = useState('3');
  const [cloneStartLabel, setCloneStartLabel] = useState('');

  // Apartment detail view state
  const [selectedFloorId, setSelectedFloorId] = useState<string>('');
  const [selectedApartmentId, setSelectedApartmentId] = useState<string>('');
  const [showAptDetail, setShowAptDetail] = useState(false);
  const { tableRef, onTableKeyDown } = useTableKeyboardNav();

  const currentBuilding = buildings.find(b => b.id === currentBuildingId);
  const currentFloors = currentBuilding?.floors || [];

  const getGlobalMaxAptNum = (): number => {
    let max = 0;
    buildings.forEach(b => {
      b.floors.forEach(f => {
        f.apartments.forEach(apt => {
          const match = apt.label.match(/דירה\s*(\d+)/);
          if (match) max = Math.max(max, parseInt(match[1]));
        });
      });
    });
    return max;
  };

  // Helper to update current building's floors
  const updateFloors = (updater: (floors: WizardFloor[]) => WizardFloor[]) => {
    onBuildingsChange(buildings.map(b =>
      b.id === currentBuildingId ? { ...b, floors: updater(b.floors) } : b
    ));
  };

  // Building actions
  const handleAddBuilding = () => {
    const nextNum = buildings.length + 1;
    const newBuilding = { id: crypto.randomUUID(), label: `בניין ${nextNum}`, floors: [] };
    onBuildingsChange([...buildings, newBuilding]);
    setCurrentBuildingId(newBuilding.id);
    toast.success('בניין חדש נוסף');
  };

  const handleCloneBuilding = () => {
    const source = buildings.find(b => b.id === currentBuildingId);
    if (!source) return;
    const counter = { value: getGlobalMaxAptNum() + 1 };
    const cloned = cloneBuilding(source, `בניין ${buildings.length + 1}`, counter);
    onBuildingsChange([...buildings, cloned]);
    setCurrentBuildingId(cloned.id);
    toast.success('הבניין שוכפל');
  };

  const handleDeleteBuilding = (id: string) => {
    if (buildings.length <= 1) { toast.error('חייב להיות לפחות בניין אחד'); return; }
    const filtered = buildings.filter(b => b.id !== id);
    onBuildingsChange(filtered);
    if (currentBuildingId === id) setCurrentBuildingId(filtered[0]?.id || '');
    toast.success('הבניין נמחק');
  };

  const handleSaveBuildingLabel = () => {
    if (!editingBuildingId || !editingBuildingLabel.trim()) return;
    onBuildingsChange(buildings.map(b =>
      b.id === editingBuildingId ? { ...b, label: editingBuildingLabel.trim() } : b
    ));
    setEditingBuildingId(null);
  };

  // Floor actions
  const handleAddFloor = () => {
    const nextNum = currentFloors.length + 1;
    const newFloor = createEmptyFloor(`קומה ${nextNum}`);
    updateFloors(floors => [...floors, newFloor]);
    setExpandedFloors(prev => new Set(prev).add(newFloor.id));
  };

  const handleDeleteFloor = (floorId: string) => {
    updateFloors(floors => floors.filter(f => f.id !== floorId));
  };

  const handleUpdateFloorLabel = (floorId: string, label: string) => {
    updateFloors(floors => floors.map(f => f.id === floorId ? { ...f, label } : f));
  };

  // Apartment actions
  const handleAddApartment = (floorId: string) => {
    const nextAptNum = getGlobalMaxAptNum() + 1;
    updateFloors(floors => floors.map(f =>
      f.id === floorId
        ? { ...f, apartments: [...f.apartments, createEmptyApartment(`דירה ${nextAptNum}`)] }
        : f
    ));
  };

  const handleDeleteApartment = (floorId: string, aptId: string) => {
    updateFloors(floors => floors.map(f =>
      f.id === floorId
        ? { ...f, apartments: f.apartments.filter(a => a.id !== aptId) }
        : f
    ));
  };

  const handleSaveAptLabel = () => {
    if (!editingApt || !editingAptLabel.trim()) { toast.error('שם דירה לא יכול להיות ריק'); return; }
    updateFloors(floors => floors.map(f =>
      f.id === editingApt!.floorId
        ? { ...f, apartments: f.apartments.map(a => a.id === editingApt!.aptId ? { ...a, label: editingAptLabel.trim() } : a) }
        : f
    ));
    setEditingApt(null);
  };

  // Clone floors
  const handleCloneFloors = () => {
    if (!cloneSource) { toast.error('יש לבחור קומת מקור'); return; }
    const count = parseInt(cloneCount);
    if (isNaN(count) || count < 1 || count > 50) { toast.error('מספר עותקים לא תקין (1-50)'); return; }
    const startLabel = parseInt(cloneStartLabel);
    if (isNaN(startLabel)) { toast.error('מספר קומת התחלה לא תקין'); return; }
    
    const sourceFloor = currentFloors.find(f => f.id === cloneSource);
    if (!sourceFloor) return;

    let nextAptNum = getGlobalMaxAptNum() + 1;
    const newFloors: WizardFloor[] = [];
    for (let i = 0; i < count; i++) {
      const clonedFloor: WizardFloor = {
        id: crypto.randomUUID(),
        label: `קומה ${startLabel + i}`,
        isTypical: false,
        apartments: sourceFloor.apartments.map(apt => ({
          id: crypto.randomUUID(),
          label: `דירה ${nextAptNum++}`,
          rows: apt.rows.map(row => ({ ...row, id: crypto.randomUUID() })),
        })),
      };
      newFloors.push(clonedFloor);
    }
    updateFloors(floors => [...floors, ...newFloors]);
    toast.success(`נוצרו ${count} קומות חדשות`);
    setCloneDialogOpen(false);
  };

  // Row editing for apartment detail
  const handleUpdateRow = (floorId: string, aptId: string, rowId: string, field: keyof WizardApartmentRow, value: any) => {
    const updates: Partial<WizardApartmentRow> = { [field]: value };
    if (field === 'height') updates.height_overridden = true;
    if (field === 'width') updates.width_overridden = true;
    updateFloors(floors => floors.map(f =>
      f.id === floorId ? {
        ...f, apartments: f.apartments.map(a =>
          a.id === aptId ? { ...a, rows: a.rows.map(r => r.id === rowId ? { ...r, ...updates } : r) } : a
        )
      } : f
    ));
  };

  const handleAddRow = (floorId: string, aptId: string) => {
    updateFloors(floors => floors.map(f =>
      f.id === floorId ? {
        ...f, apartments: f.apartments.map(a => {
          if (a.id !== aptId) return a;
          const nextNo = a.rows.length > 0 ? Math.max(...a.rows.map(r => r.opening_no)) + 1 : 1;
          if (nextNo > 20 || a.rows.length >= 20) return a;
          return { ...a, rows: [...a.rows, createEmptyRow(nextNo)] };
        })
      } : f
    ));
  };

  const handleDeleteRow = (floorId: string, aptId: string, rowId: string) => {
    updateFloors(floors => floors.map(f =>
      f.id === floorId ? {
        ...f, apartments: f.apartments.map(a =>
          a.id === aptId ? { ...a, rows: a.rows.filter(r => r.id !== rowId) } : a
        )
      } : f
    ));
  };

  const suggestStartLabel = () => {
    let max = 0;
    currentFloors.forEach(f => {
      const match = f.label.match(/קומה\s*(\d+)/);
      if (match) max = Math.max(max, parseInt(match[1]));
    });
    return String(max + 1);
  };

  const toggleFloor = (id: string) => {
    setExpandedFloors(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const openAptDetail = (floorId: string, aptId: string) => {
    setSelectedFloorId(floorId);
    setSelectedApartmentId(aptId);
    setShowAptDetail(true);
  };

  const selectedFloor = currentFloors.find(f => f.id === selectedFloorId);
  const selectedApt = selectedFloor?.apartments.find(a => a.id === selectedApartmentId);

  return (
    <div className="space-y-4">
      {/* Buildings bar */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            בניינים
          </CardTitle>
          <CardDescription>
            ניתן להוסיף מספר בניינים. בניין בודד ייצור פרויקט רגיל, מספר בניינים ייצרו פרויקט אב.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            {buildings.map(b => (
              <div key={b.id}>
                {editingBuildingId === b.id ? (
                  <div className="flex items-center gap-1 border border-primary rounded-lg px-2 py-1 bg-muted">
                    <Input
                      value={editingBuildingLabel}
                      onChange={e => setEditingBuildingLabel(e.target.value)}
                      className="h-7 w-28 text-sm border-0 bg-transparent focus-visible:ring-0 px-1"
                      autoFocus
                      onKeyDown={e => { if (e.key === 'Enter') handleSaveBuildingLabel(); if (e.key === 'Escape') setEditingBuildingId(null); }}
                    />
                    <Button size="icon" variant="ghost" className="h-6 w-6" onClick={handleSaveBuildingLabel}>
                      <Check className="h-3.5 w-3.5 text-green-600" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setEditingBuildingId(null)}>
                      <X className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                ) : (
                  <div className={`flex items-center rounded-lg border transition-colors ${
                    currentBuildingId === b.id ? 'border-primary bg-primary/5 shadow-sm' : 'border-border hover:border-muted-foreground/30'
                  }`}>
                    <button
                      type="button"
                      className={`flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-r-lg transition-colors ${
                        currentBuildingId === b.id ? 'text-primary' : 'text-foreground hover:text-primary'
                      }`}
                      onClick={() => setCurrentBuildingId(b.id)}
                    >
                      {b.label}
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0 font-normal">
                        {b.floors.length}ק / {b.floors.reduce((s, f) => s + f.apartments.length, 0)}ד
                      </Badge>
                    </button>
                    <div className="flex items-center border-r border-border/50 px-1 gap-0.5">
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setEditingBuildingId(b.id); setEditingBuildingLabel(b.label); }}>
                        <Pencil className="h-3 w-3 text-muted-foreground" />
                      </Button>
                      {buildings.length > 1 && (
                        <Button size="icon" variant="ghost" className="h-7 w-7 hover:bg-destructive/10" onClick={() => handleDeleteBuilding(b.id)}>
                          <Trash2 className="h-3 w-3 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleAddBuilding} className="gap-1.5">
              <Plus className="h-3.5 w-3.5" />הוסף בניין
            </Button>
            {currentBuildingId && (
              <Button variant="outline" size="sm" onClick={handleCloneBuilding} className="gap-1.5">
                <Copy className="h-3.5 w-3.5" />שכפל בניין נוכחי
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Floors for current building */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">קומות ודירות — {currentBuilding?.label || ''}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-3 flex-wrap">
            <Button onClick={handleAddFloor} size="sm" className="gap-2">
              <Plus className="h-4 w-4" />הוסף קומה
            </Button>
            <Dialog open={cloneDialogOpen} onOpenChange={setCloneDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2" disabled={currentFloors.length === 0} onClick={() => setCloneStartLabel(suggestStartLabel())}>
                  <Copy className="h-4 w-4" />שכפל קומות
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>שכפול קומות</DialogTitle>
                  <DialogDescription>בחר קומת מקור ומספר העותקים ליצירה</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>קומת מקור</Label>
                    <Select value={cloneSource} onValueChange={setCloneSource}>
                      <SelectTrigger className="bg-background"><SelectValue placeholder="בחר קומה" /></SelectTrigger>
                      <SelectContent className="bg-background z-50">
                        {currentFloors.map(f => <SelectItem key={f.id} value={f.id}>{f.label} ({f.apartments.length} דירות)</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>מספר עותקים</Label>
                    <Input type="number" min="1" max="50" value={cloneCount} onChange={e => setCloneCount(e.target.value)} dir="ltr" />
                  </div>
                  <div className="space-y-2">
                    <Label>מספר קומת התחלה</Label>
                    <Input type="number" value={cloneStartLabel} onChange={e => setCloneStartLabel(e.target.value)} dir="ltr" />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setCloneDialogOpen(false)}>ביטול</Button>
                  <Button onClick={handleCloneFloors}>שכפל</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          {currentFloors.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground border rounded-lg">
              <Building2 className="h-10 w-10 mx-auto mb-3 opacity-50" />
              <p>אין קומות. לחץ "הוסף קומה" להתחיל.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {currentFloors.map(floor => (
                <Collapsible key={floor.id} open={expandedFloors.has(floor.id)} onOpenChange={() => toggleFloor(floor.id)}>
                  <div className="border rounded-lg overflow-hidden">
                    <CollapsibleTrigger asChild>
                      <div className="flex items-center justify-between p-3 bg-muted/50 cursor-pointer hover:bg-muted transition-colors">
                        <div className="flex items-center gap-3">
                          {expandedFloors.has(floor.id) ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          <Input value={floor.label} onChange={e => { e.stopPropagation(); handleUpdateFloorLabel(floor.id, e.target.value); }} onClick={e => e.stopPropagation()} className="w-32 h-8" dir="rtl" />
                          <Badge variant="outline">{floor.apartments.length} דירות</Badge>
                        </div>
                        <Button variant="ghost" size="icon" onClick={e => { e.stopPropagation(); handleDeleteFloor(floor.id); }} className="text-destructive hover:text-destructive">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="p-4 border-t bg-background">
                        <div className="flex flex-wrap gap-2 mb-3">
                          {floor.apartments.map(apt => (
                            <div key={apt.id} className="flex items-center gap-1 bg-muted rounded-lg px-3 py-2 border border-border/50">
                              <Home className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                              {editingApt?.floorId === floor.id && editingApt?.aptId === apt.id ? (
                                <>
                                  <Input
                                    value={editingAptLabel}
                                    onChange={e => setEditingAptLabel(e.target.value)}
                                    className="h-7 w-24 text-sm"
                                    autoFocus
                                    onKeyDown={e => { if (e.key === 'Enter') handleSaveAptLabel(); if (e.key === 'Escape') setEditingApt(null); }}
                                  />
                                  <Button size="icon" variant="ghost" className="h-6 w-6" onClick={handleSaveAptLabel}>
                                    <Check className="h-3.5 w-3.5 text-green-600" />
                                  </Button>
                                  <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setEditingApt(null)}>
                                    <X className="h-3.5 w-3.5 text-destructive" />
                                  </Button>
                                </>
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    className="text-sm font-medium hover:text-primary transition-colors"
                                    onClick={() => openAptDetail(floor.id, apt.id)}
                                  >
                                    {apt.label}
                                  </button>
                                  <Badge variant="secondary" className="text-[10px] px-1 py-0">{apt.rows.length}</Badge>
                                  <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => { setEditingApt({ floorId: floor.id, aptId: apt.id }); setEditingAptLabel(apt.label); }}>
                                    <Pencil className="h-3 w-3 text-muted-foreground" />
                                  </Button>
                                  <Button size="icon" variant="ghost" className="h-6 w-6 hover:bg-destructive/10" onClick={() => handleDeleteApartment(floor.id, apt.id)}>
                                    <Trash2 className="h-3 w-3 text-destructive" />
                                  </Button>
                                </>
                              )}
                            </div>
                          ))}
                        </div>
                        <Button variant="outline" size="sm" onClick={() => handleAddApartment(floor.id)} className="gap-1.5">
                          <Plus className="h-3.5 w-3.5" />הוסף דירה
                        </Button>
                      </div>
                    </CollapsibleContent>
                  </div>
                </Collapsible>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Apartment detail dialog */}
      <Dialog open={showAptDetail && !!selectedApt} onOpenChange={setShowAptDetail}>
        <DialogContent className="max-w-[95vw] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedApt?.label} — {selectedFloor?.label}</DialogTitle>
          </DialogHeader>
          {selectedApt && selectedFloor && (
            <div className="space-y-3">
              <ScrollArea className="w-full" dir="rtl">
                <div className="border rounded-lg min-w-[1200px]" ref={tableRef} onKeyDown={onTableKeyDown}>
                  <Table dir="rtl" className="table-fixed">
                    <TableHeader>
                      <TableRow>
                         <TableHead className="text-right w-14">פתח</TableHead>
                        <TableHead className="text-right w-32">מיקום</TableHead>
                        <TableHead className="text-right w-20">פרט חוזה</TableHead>
                        <TableHead className="text-right w-24">פרט יצור</TableHead>
                        <TableHead className="text-right w-18">גובה</TableHead>
                        <TableHead className="text-right w-18">רוחב</TableHead>
                        <TableHead className="text-right w-24">גובה מהריצוף</TableHead>
                        <TableHead className="text-right w-18">ציר מבט מבפנים</TableHead>
                        <TableHead className="text-right w-28">ממד כיס בצד</TableHead>
                        <TableHead className="text-right w-16">גליף</TableHead>
                        <TableHead className="text-right w-18">עומק עד הפריקסט</TableHead>
                        <TableHead className="text-right w-20">מדרגה בשיש</TableHead>
                        <TableHead className="text-right w-18">מנוע</TableHead>
                        <TableHead className="text-right w-24">הערות</TableHead>
                        <TableHead className="text-right w-20">כנף פנימית</TableHead>
                        <TableHead className="w-10"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedApt.rows.map((row, rowIdx) => (
                        <TableRow key={row.id}>
                          <TableCell className="font-medium text-center">{row.opening_no}</TableCell>
                          <TableCell data-row={rowIdx} data-col={1}>
                            <Select value={row.location_in_apartment || 'none'} onValueChange={v => handleUpdateRow(selectedFloorId, selectedApartmentId, row.id, 'location_in_apartment', v === 'none' ? null : v)}>
                              <SelectTrigger className="h-8 bg-background text-xs"><SelectValue placeholder="-" /></SelectTrigger>
                              <SelectContent className="bg-background z-50 max-h-80">
                                <SelectItem value="none">-</SelectItem>
                                {LOCATION_OPTIONS.map(loc => <SelectItem key={loc} value={loc}>{loc}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell data-row={rowIdx} data-col={2}>
                            <Input value={row.contract_item || ''} onChange={e => handleUpdateRow(selectedFloorId, selectedApartmentId, row.id, 'contract_item', e.target.value || null)} className="h-8 text-xs" dir="rtl" />
                          </TableCell>
                          <TableCell data-row={rowIdx} data-col={3}>
                            <Input value={row.item_code || ''} onChange={e => handleUpdateRow(selectedFloorId, selectedApartmentId, row.id, 'item_code', e.target.value || null)} className="h-8 text-xs" dir="rtl" />
                          </TableCell>
                          <TableCell data-row={rowIdx} data-col={4}>
                            <Input value={row.height || ''} onChange={e => handleUpdateRow(selectedFloorId, selectedApartmentId, row.id, 'height', e.target.value)} className="h-8 text-xs" dir="ltr" />
                          </TableCell>
                          <TableCell data-row={rowIdx} data-col={5}>
                            <Input value={row.width || ''} onChange={e => handleUpdateRow(selectedFloorId, selectedApartmentId, row.id, 'width', e.target.value)} className="h-8 text-xs" dir="ltr" />
                          </TableCell>
                          <TableCell data-row={rowIdx} data-col={6}>
                            <Input value={row.notes || ''} onChange={e => handleUpdateRow(selectedFloorId, selectedApartmentId, row.id, 'notes', e.target.value)} className="h-8 text-xs" dir="rtl" />
                          </TableCell>
                          <TableCell data-row={rowIdx} data-col={7}>
                            <Select value={row.hinge_direction || 'none'} onValueChange={v => handleUpdateRow(selectedFloorId, selectedApartmentId, row.id, 'hinge_direction', v === 'none' ? null : v)}>
                              <SelectTrigger className="h-8 bg-background text-xs"><SelectValue placeholder="-" /></SelectTrigger>
                              <SelectContent className="bg-background z-50">
                                <SelectItem value="none">-</SelectItem>
                                <SelectItem value="L">L</SelectItem>
                                <SelectItem value="R">R</SelectItem>
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell data-row={rowIdx} data-col={8}>
                            <Select value={row.mamad || 'none'} onValueChange={v => handleUpdateRow(selectedFloorId, selectedApartmentId, row.id, 'mamad', v === 'none' ? null : v)}>
                              <SelectTrigger className="h-8 bg-background text-xs"><SelectValue placeholder="-" /></SelectTrigger>
                              <SelectContent className="bg-background z-50">
                                <SelectItem value="none">-</SelectItem>
                                {MAMAD_OPTIONS.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell data-row={rowIdx} data-col={9}>
                            <Input value={row.glyph || ''} onChange={e => handleUpdateRow(selectedFloorId, selectedApartmentId, row.id, 'glyph', e.target.value)} className="h-8 text-xs" dir="ltr" />
                          </TableCell>
                          <TableCell data-row={rowIdx} data-col={10}>
                            <Input value={row.depth || ''} onChange={e => handleUpdateRow(selectedFloorId, selectedApartmentId, row.id, 'depth', e.target.value)} className="h-8 text-xs" dir="ltr" />
                          </TableCell>
                          <TableCell data-row={rowIdx} data-col={11}>
                            <Input value={row.jamb_height || ''} onChange={e => handleUpdateRow(selectedFloorId, selectedApartmentId, row.id, 'jamb_height', e.target.value)} className="h-8 text-xs" dir="ltr" />
                          </TableCell>
                          <TableCell data-row={rowIdx} data-col={12}>
                            <Select value={row.engine_side || 'none'} onValueChange={v => handleUpdateRow(selectedFloorId, selectedApartmentId, row.id, 'engine_side', v === 'none' ? null : v)}>
                              <SelectTrigger className="h-8 bg-background text-xs"><SelectValue placeholder="-" /></SelectTrigger>
                              <SelectContent className="bg-background z-50">
                                <SelectItem value="none">-</SelectItem>
                                <SelectItem value="R">ימין</SelectItem>
                                <SelectItem value="L">שמאל</SelectItem>
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell>
                            <Button size="icon" variant="ghost" className="h-7 w-7 hover:bg-destructive/10" onClick={() => handleDeleteRow(selectedFloorId, selectedApartmentId, row.id)} disabled={selectedApt.rows.length <= 1}>
                              <Trash2 className="h-3 w-3 text-destructive" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <ScrollBar orientation="horizontal" />
              </ScrollArea>
              <Button variant="outline" size="sm" onClick={() => handleAddRow(selectedFloorId, selectedApartmentId)} className="gap-1.5">
                <Plus className="h-3.5 w-3.5" />הוסף שורה
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
