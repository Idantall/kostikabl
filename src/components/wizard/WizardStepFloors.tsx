import { useState } from 'react';
import { useWizard } from './WizardContext';
import { createEmptyFloor, createEmptyApartment, createEmptyBuilding, WizardFloor } from '@/lib/wizardTypes';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, ArrowRight, Plus, Trash2, Copy, Building2, Home, ChevronDown, ChevronUp, Pencil, Check, X, Save, Download } from 'lucide-react';
import { toast } from 'sonner';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

export function WizardStepFloors() {
  const { state, dispatch, currentFloors } = useWizard();
  const { buildings, currentBuildingId } = state;
  const floors = currentFloors;

  const [expandedFloors, setExpandedFloors] = useState<Set<string>>(new Set());
  const [cloneDialogOpen, setCloneDialogOpen] = useState(false);
  const [cloneSource, setCloneSource] = useState<string>('');
  const [cloneCount, setCloneCount] = useState('3');
  const [cloneStartLabel, setCloneStartLabel] = useState('');
  
  // Building label editing
  const [editingBuildingId, setEditingBuildingId] = useState<string | null>(null);
  const [editingBuildingLabel, setEditingBuildingLabel] = useState('');

  // Apartment label editing
  const [editingApt, setEditingApt] = useState<{ floorId: string; aptId: string } | null>(null);
  const [editingAptLabel, setEditingAptLabel] = useState('');
  
  // Floor type dialogs
  const [saveFloorTypeDialogOpen, setSaveFloorTypeDialogOpen] = useState(false);
  const [saveFloorTypeSourceId, setSaveFloorTypeSourceId] = useState('');
  const [saveFloorTypeName, setSaveFloorTypeName] = useState('');
  const [applyFloorTypeDialogOpen, setApplyFloorTypeDialogOpen] = useState(false);
  const [applyFloorTypeId, setApplyFloorTypeId] = useState('');
  const [applyFloorRangeFrom, setApplyFloorRangeFrom] = useState('');
  const [applyFloorRangeTo, setApplyFloorRangeTo] = useState('');

  const handleStartEditApt = (floorId: string, aptId: string, label: string) => {
    setEditingApt({ floorId, aptId });
    setEditingAptLabel(label);
  };

  const handleSaveAptLabel = () => {
    if (!editingApt || !editingAptLabel.trim()) { toast.error('שם דירה לא יכול להיות ריק'); return; }
    dispatch({ type: 'UPDATE_APARTMENT', payload: { floorId: editingApt.floorId, apartmentId: editingApt.aptId, label: editingAptLabel.trim() } });
    setEditingApt(null);
  };

  const handleCancelEditApt = () => { setEditingApt(null); };

  const toggleFloorExpanded = (floorId: string) => {
    setExpandedFloors(prev => {
      const next = new Set(prev);
      if (next.has(floorId)) next.delete(floorId);
      else next.add(floorId);
      return next;
    });
  };

  // Multi-floor creation
  const [multiFloorDialogOpen, setMultiFloorDialogOpen] = useState(false);
  const [multiFloorFrom, setMultiFloorFrom] = useState('');
  const [multiFloorTo, setMultiFloorTo] = useState('');

  const handleAddFloor = () => {
    const nextFloorNum = floors.length + 1;
    const newFloor = createEmptyFloor(`קומה ${nextFloorNum}`);
    dispatch({ type: 'ADD_FLOOR', payload: newFloor });
    setExpandedFloors(prev => new Set(prev).add(newFloor.id));
  };

  const handleAddMultipleFloors = () => {
    const from = parseInt(multiFloorFrom);
    const to = parseInt(multiFloorTo);
    if (isNaN(from) || isNaN(to) || to < from) {
      toast.error('טווח לא תקין');
      return;
    }
    if (to - from + 1 > 50) {
      toast.error('ניתן ליצור עד 50 קומות בבת אחת');
      return;
    }
    const newIds: string[] = [];
    for (let i = from; i <= to; i++) {
      const newFloor = createEmptyFloor(`קומה ${i}`);
      dispatch({ type: 'ADD_FLOOR', payload: newFloor });
      newIds.push(newFloor.id);
    }
    setExpandedFloors(prev => {
      const next = new Set(prev);
      newIds.forEach(id => next.add(id));
      return next;
    });
    toast.success(`נוצרו ${to - from + 1} קומות`);
    setMultiFloorDialogOpen(false);
    setMultiFloorFrom('');
    setMultiFloorTo('');
  };

  const handleDeleteFloor = (floorId: string) => {
    dispatch({ type: 'DELETE_FLOOR', payload: floorId });
  };

  const handleUpdateFloorLabel = (floorId: string, label: string) => {
    dispatch({ type: 'UPDATE_FLOOR', payload: { id: floorId, updates: { label } } });
  };


  const handleAddApartment = (floorId: string) => {
    let nextAptNum = 1;
    buildings.forEach(b => {
      b.floors.forEach(floor => {
        floor.apartments.forEach(apt => {
          const match = apt.label.match(/דירה\s*(\d+)/);
          if (match) nextAptNum = Math.max(nextAptNum, parseInt(match[1]) + 1);
        });
      });
    });
    dispatch({ type: 'ADD_APARTMENT', payload: { floorId, label: `דירה ${nextAptNum}` } });
  };

  const handleDeleteApartment = (floorId: string, apartmentId: string) => {
    dispatch({ type: 'DELETE_APARTMENT', payload: { floorId, apartmentId } });
  };

  const handleCloneFloors = () => {
    if (!cloneSource) { toast.error('יש לבחור קומת מקור'); return; }
    const count = parseInt(cloneCount);
    if (isNaN(count) || count < 1 || count > 50) { toast.error('מספר עותקים לא תקין (1-50)'); return; }
    const startLabel = parseInt(cloneStartLabel);
    if (isNaN(startLabel)) { toast.error('מספר קומת התחלה לא תקין'); return; }
    dispatch({ type: 'CLONE_FLOORS', payload: { sourceFloorId: cloneSource, count, startLabel } });
    toast.success(`נוצרו ${count} קומות חדשות`);
    setCloneDialogOpen(false);
    setCloneSource('');
    setCloneCount('3');
    setCloneStartLabel('');
  };

  // Building actions
  const handleAddBuilding = () => {
    dispatch({ type: 'ADD_BUILDING' });
    toast.success('בניין חדש נוסף');
  };

  const handleCloneBuilding = () => {
    if (!currentBuildingId) return;
    dispatch({ type: 'CLONE_BUILDING', payload: currentBuildingId });
    toast.success('הבניין שוכפל');
  };

  const handleDeleteBuilding = (buildingId: string) => {
    if (buildings.length <= 1) { toast.error('חייב להיות לפחות בניין אחד'); return; }
    dispatch({ type: 'DELETE_BUILDING', payload: buildingId });
    toast.success('הבניין נמחק');
  };

  const handleStartEditBuilding = (id: string, label: string) => {
    setEditingBuildingId(id);
    setEditingBuildingLabel(label);
  };

  const handleSaveBuildingLabel = () => {
    if (!editingBuildingId || !editingBuildingLabel.trim()) return;
    dispatch({ type: 'UPDATE_BUILDING_LABEL', payload: { id: editingBuildingId, label: editingBuildingLabel.trim() } });
    setEditingBuildingId(null);
  };

  const handleBack = () => { dispatch({ type: 'SET_STEP', payload: 1 }); };

  const handleNext = () => {
    // Validate all buildings have floors and apartments
    let hasIssues = false;
    buildings.forEach(b => {
      if (b.floors.length === 0) hasIssues = true;
      if (!b.floors.some(f => f.apartments.length > 0)) hasIssues = true;
    });
    if (hasIssues) {
      toast.error('כל בניין חייב להכיל לפחות קומה אחת עם דירה אחת');
      return;
    }
    dispatch({ type: 'SET_STEP', payload: 3 });
  };

  const suggestStartLabel = () => {
    let max = 0;
    floors.forEach(f => {
      const match = f.label.match(/קומה\s*(\d+)/);
      if (match) max = Math.max(max, parseInt(match[1]));
    });
    return String(max + 1);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Buildings bar */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            בניינים
          </CardTitle>
          <CardDescription>
            ניתן להוסיף מספר בניינים לפרויקט. בניין בודד ייצור פרויקט רגיל, מספר בניינים ייצרו פרויקט אב.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            {buildings.map(b => (
              <div key={b.id} className="flex items-center">
                {editingBuildingId === b.id ? (
                  <div className="flex items-center gap-1 border border-primary rounded-lg px-2 py-1 bg-muted">
                    <Input
                      value={editingBuildingLabel}
                      onChange={e => setEditingBuildingLabel(e.target.value)}
                      className="h-7 w-28 text-sm border-0 bg-transparent focus-visible:ring-0 px-1"
                      autoFocus
                      onKeyDown={e => {
                        if (e.key === 'Enter') handleSaveBuildingLabel();
                        if (e.key === 'Escape') setEditingBuildingId(null);
                      }}
                    />
                    <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0" onClick={handleSaveBuildingLabel}>
                      <Check className="h-3.5 w-3.5 text-green-600" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0" onClick={() => setEditingBuildingId(null)}>
                      <X className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                ) : (
                  <div className={`flex items-center rounded-lg border transition-colors ${
                    currentBuildingId === b.id 
                      ? 'border-primary bg-primary/5 shadow-sm' 
                      : 'border-border hover:border-muted-foreground/30'
                  }`}>
                    <button
                      type="button"
                      className={`flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-r-lg transition-colors ${
                        currentBuildingId === b.id 
                          ? 'text-primary' 
                          : 'text-foreground hover:text-primary'
                      }`}
                      onClick={() => dispatch({ type: 'SET_CURRENT_BUILDING', payload: b.id })}
                    >
                      {b.label}
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0 font-normal">
                        {b.floors.length}ק / {b.floors.reduce((s, f) => s + f.apartments.length, 0)}ד
                      </Badge>
                    </button>
                    <div className="flex items-center border-r border-border/50 px-1 gap-0.5">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={() => handleStartEditBuilding(b.id, b.label)}
                        title="ערוך שם"
                      >
                        <Pencil className="h-3 w-3 text-muted-foreground" />
                      </Button>
                      {buildings.length > 1 && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 hover:bg-destructive/10"
                          onClick={() => handleDeleteBuilding(b.id)}
                          title="מחק בניין"
                        >
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
              <Plus className="h-3.5 w-3.5" />
              הוסף בניין
            </Button>
            {currentBuildingId && (
              <Button variant="outline" size="sm" onClick={handleCloneBuilding} className="gap-1.5">
                <Copy className="h-3.5 w-3.5" />
                שכפל בניין נוכחי
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Floors for current building */}
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl flex items-center gap-2">
            <Building2 className="h-6 w-6" />
            קומות ודירות - {buildings.find(b => b.id === currentBuildingId)?.label || ''}
          </CardTitle>
          <CardDescription>
            הגדר את מבנה הבניין - קומות ודירות בכל קומה. ניתן לשכפל קומות טיפוסיות.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-3 flex-wrap">
            <Button onClick={handleAddFloor} className="gap-2">
              <Plus className="h-4 w-4" />
              הוסף קומה
            </Button>

            <Dialog open={multiFloorDialogOpen} onOpenChange={setMultiFloorDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" className="gap-2" onClick={() => {
                  setMultiFloorFrom(suggestStartLabel());
                  setMultiFloorTo('');
                }}>
                  <Plus className="h-4 w-4" />
                  הוסף קומות מרובות
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>הוספת קומות מרובות</DialogTitle>
                  <DialogDescription>הגדר טווח מספרי קומות ליצירה</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="flex items-center gap-3" dir="ltr">
                    <div className="space-y-1">
                      <Label>מקומה</Label>
                      <Input
                        type="number"
                        value={multiFloorFrom}
                        onChange={e => setMultiFloorFrom(e.target.value)}
                        className="w-24"
                      />
                    </div>
                    <span className="text-muted-foreground mt-6">—</span>
                    <div className="space-y-1">
                      <Label>עד קומה</Label>
                      <Input
                        type="number"
                        value={multiFloorTo}
                        onChange={e => setMultiFloorTo(e.target.value)}
                        className="w-24"
                      />
                    </div>
                  </div>
                  {multiFloorFrom && multiFloorTo && (() => {
                    const f = parseInt(multiFloorFrom);
                    const t = parseInt(multiFloorTo);
                    if (!isNaN(f) && !isNaN(t) && t >= f) {
                      return <p className="text-sm text-muted-foreground">{t - f + 1} קומות ייווצרו</p>;
                    }
                    return null;
                  })()}
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setMultiFloorDialogOpen(false)}>ביטול</Button>
                  <Button onClick={handleAddMultipleFloors}>צור קומות</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            
            <Dialog open={cloneDialogOpen} onOpenChange={setCloneDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" className="gap-2" disabled={floors.length === 0} onClick={() => setCloneStartLabel(suggestStartLabel())}>
                  <Copy className="h-4 w-4" />
                  שכפל קומות
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
                        {floors.map(floor => (
                          <SelectItem key={floor.id} value={floor.id}>{floor.label} ({floor.apartments.length} דירות)</SelectItem>
                        ))}
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

          {/* Floor type actions */}
          <div className="flex items-center gap-2 flex-wrap">
            {state.floorTypes.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => {
                  setApplyFloorTypeId(state.floorTypes[0]?.id || '');
                  setApplyFloorRangeFrom('');
                  setApplyFloorRangeTo('');
                  setApplyFloorTypeDialogOpen(true);
                }}
              >
                <Download className="h-3.5 w-3.5" />
                החל סוג קומה
              </Button>
            )}
            {state.floorTypes.length > 0 && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                סוגי קומות:
                {state.floorTypes.map(t => (
                  <Badge key={t.id} variant="secondary" className="text-xs gap-1">
                    {t.name} ({t.apartments.length} דירות)
                    <button
                      type="button"
                      onClick={() => dispatch({ type: 'DELETE_FLOOR_TYPE', payload: t.id })}
                      className="hover:text-destructive"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {floors.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground border rounded-lg">
              <Building2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>אין קומות. לחץ "הוסף קומה" להתחיל.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {floors.map(floor => (
                <Collapsible key={floor.id} open={expandedFloors.has(floor.id)} onOpenChange={() => toggleFloorExpanded(floor.id)}>
                  <div className="border rounded-lg overflow-hidden">
                    <CollapsibleTrigger asChild>
                      <div className="flex items-center justify-between p-3 bg-muted/50 cursor-pointer hover:bg-muted transition-colors">
                        <div className="flex items-center gap-3">
                          
                          <Input value={floor.label} onChange={e => handleUpdateFloorLabel(floor.id, e.target.value)} onClick={e => e.stopPropagation()} className="w-32 h-8" dir="rtl" />
                          <Badge variant="outline">{floor.apartments.length} דירות</Badge>
                          {floor.sourceFloorTypeName && (
                            <Badge variant="secondary" className="text-xs gap-1">
                              טיפוס {floor.sourceFloorTypeName}
                              <button
                                type="button"
                                onClick={e => {
                                  e.stopPropagation();
                                  dispatch({ type: 'CLEAR_FLOOR_TYPE_TAG', payload: floor.id });
                                }}
                                className="hover:text-destructive"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          
                          <Button
                            variant="ghost"
                            size="sm"
                            className="gap-1"
                            onClick={e => {
                              e.stopPropagation();
                              setSaveFloorTypeSourceId(floor.id);
                              setSaveFloorTypeName(floor.label);
                              setSaveFloorTypeDialogOpen(true);
                            }}
                          >
                            <Save className="h-3.5 w-3.5" />
                            שמור כסוג
                          </Button>
                          <Button variant="ghost" size="icon" onClick={e => { e.stopPropagation(); handleDeleteFloor(floor.id); }} className="text-destructive hover:text-destructive">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="p-4 border-t bg-background">
                        <div className="flex flex-wrap gap-2.5 mb-3">
                          {floor.apartments.map(apt => (
                            <div key={apt.id} className="flex items-center gap-1.5 bg-muted rounded-lg px-3 py-2 border border-border/50">
                              <Home className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                              {editingApt?.floorId === floor.id && editingApt?.aptId === apt.id ? (
                                <>
                                  <Input
                                    value={editingAptLabel}
                                    onChange={e => setEditingAptLabel(e.target.value)}
                                    className="h-7 w-28 text-sm"
                                    autoFocus
                                    onKeyDown={e => {
                                      if (e.key === 'Enter') handleSaveAptLabel();
                                      if (e.key === 'Escape') handleCancelEditApt();
                                    }}
                                  />
                                  <Button size="icon" variant="ghost" className="h-6 w-6 hover:bg-green-100 dark:hover:bg-green-900/30" onClick={handleSaveAptLabel}>
                                    <Check className="h-3.5 w-3.5 text-green-600" />
                                  </Button>
                                  <Button size="icon" variant="ghost" className="h-6 w-6 hover:bg-destructive/10" onClick={handleCancelEditApt}>
                                    <X className="h-3.5 w-3.5 text-destructive" />
                                  </Button>
                                </>
                              ) : (
                                <>
                                  <span className="text-sm font-medium">{apt.label}</span>
                                  <span className="text-xs text-muted-foreground">({apt.rows.length} שורות)</span>
                                  {apt.sourceApartmentTypeName && (
                                    <Badge variant="secondary" className="text-[10px] px-1 py-0 gap-0.5">
                                      טיפוס {apt.sourceApartmentTypeName}
                                      <button
                                        type="button"
                                        onClick={() => dispatch({ type: 'CLEAR_APARTMENT_TYPE_TAG', payload: { floorId: floor.id, apartmentId: apt.id } })}
                                        className="hover:text-destructive"
                                      >
                                        <X className="h-2.5 w-2.5" />
                                      </button>
                                    </Badge>
                                  )}
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6 text-muted-foreground hover:text-foreground"
                                    onClick={() => handleStartEditApt(floor.id, apt.id, apt.label)}
                                    title="ערוך שם דירה"
                                  >
                                    <Pencil className="h-3 w-3" />
                                  </Button>
                                  <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive" onClick={() => handleDeleteApartment(floor.id, apt.id)}>
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                </>
                              )}
                            </div>
                          ))}
                        </div>
                        <Button variant="outline" size="sm" onClick={() => handleAddApartment(floor.id)} className="gap-2">
                          <Plus className="h-3 w-3" />
                          הוסף דירה
                        </Button>
                      </div>
                    </CollapsibleContent>
                  </div>
                </Collapsible>
              ))}
            </div>
          )}

          {floors.length > 0 && (
            <div className="flex gap-4 text-sm text-muted-foreground border-t pt-4">
              <span>סה"כ: {floors.length} קומות</span>
              <span>{floors.reduce((sum, f) => sum + f.apartments.length, 0)} דירות</span>
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
          המשך לטבלאות דירות
          <ArrowLeft className="h-4 w-4" />
        </Button>
      </div>

      {/* Save floor type dialog */}
      <Dialog open={saveFloorTypeDialogOpen} onOpenChange={setSaveFloorTypeDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>שמור כסוג קומה</DialogTitle>
            <DialogDescription>שמור את מבנה הקומה (דירות ושורות) כתבנית לשימוש חוזר</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Input
              value={saveFloorTypeName}
              onChange={e => setSaveFloorTypeName(e.target.value)}
              placeholder="שם הסוג"
              dir="rtl"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveFloorTypeDialogOpen(false)}>ביטול</Button>
            <Button onClick={() => {
              if (!saveFloorTypeName.trim()) { toast.error('יש להזין שם'); return; }
              const sourceFloor = floors.find(f => f.id === saveFloorTypeSourceId);
              if (!sourceFloor) return;
              dispatch({ type: 'SAVE_FLOOR_TYPE', payload: { name: saveFloorTypeName.trim(), floor: sourceFloor } });
              toast.success('סוג קומה נשמר');
              setSaveFloorTypeDialogOpen(false);
            }}>שמור</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Apply floor type dialog */}
      <Dialog open={applyFloorTypeDialogOpen} onOpenChange={setApplyFloorTypeDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>החל סוג קומה</DialogTitle>
            <DialogDescription>בחר סוג קומה וטווח קומות יעד. הדירות הקיימות בקומות הנבחרות יוחלפו.</DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="space-y-2">
              <Label>סוג קומה</Label>
              <Select value={applyFloorTypeId} onValueChange={setApplyFloorTypeId}>
                <SelectTrigger className="bg-background"><SelectValue placeholder="בחר סוג" /></SelectTrigger>
                <SelectContent className="bg-background z-50">
                  {state.floorTypes.map(t => (
                    <SelectItem key={t.id} value={t.id}>{t.name} ({t.apartments.length} דירות)</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>טווח קומות</Label>
              <div className="flex items-center gap-2" dir="ltr">
                <Input
                  type="number"
                  placeholder="מ-"
                  value={applyFloorRangeFrom}
                  onChange={e => setApplyFloorRangeFrom(e.target.value)}
                  className="w-24"
                />
                <span className="text-muted-foreground">—</span>
                <Input
                  type="number"
                  placeholder="עד"
                  value={applyFloorRangeTo}
                  onChange={e => setApplyFloorRangeTo(e.target.value)}
                  className="w-24"
                />
              </div>
              {applyFloorRangeFrom && applyFloorRangeTo && (() => {
                const from = parseInt(applyFloorRangeFrom);
                const to = parseInt(applyFloorRangeTo);
                if (!isNaN(from) && !isNaN(to) && to >= from) {
                  const matched = floors.filter(f => {
                    const num = parseInt(f.label.replace(/[^\d-]/g, ''));
                    return !isNaN(num) && num >= from && num <= to;
                  });
                  return <p className="text-xs text-muted-foreground">{matched.length} קומות נמצאו בטווח</p>;
                }
                return null;
              })()}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApplyFloorTypeDialogOpen(false)}>ביטול</Button>
            <Button
              disabled={!applyFloorTypeId || !applyFloorRangeFrom || !applyFloorRangeTo}
              onClick={() => {
                const from = parseInt(applyFloorRangeFrom);
                const to = parseInt(applyFloorRangeTo);
                if (isNaN(from) || isNaN(to) || to < from) {
                  toast.error('טווח קומות לא תקין');
                  return;
                }
                const targetFloorIds = floors
                  .filter(f => {
                    const num = parseInt(f.label.replace(/[^\d-]/g, ''));
                    return !isNaN(num) && num >= from && num <= to;
                  })
                  .map(f => f.id);
                if (targetFloorIds.length === 0) {
                  toast.error('לא נמצאו קומות בטווח המבוקש');
                  return;
                }
                const hasData = floors.some(f =>
                  targetFloorIds.includes(f.id) && f.apartments.some(a => a.rows.some(r => r.item_code || r.contract_item))
                );
                if (hasData) {
                  if (!confirm('חלק מהקומות הנבחרות מכילות נתונים. להחליף?')) return;
                }
                dispatch({
                  type: 'APPLY_FLOOR_TYPE',
                  payload: { typeId: applyFloorTypeId, targetFloorIds },
                });
                toast.success(`סוג קומה הוחל על ${targetFloorIds.length} קומות`);
                setApplyFloorTypeDialogOpen(false);
              }}
            >
              החל
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
