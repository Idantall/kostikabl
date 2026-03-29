import { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowRight, Plus, Loader2, Trash2, ChevronDown, Building2, Home, FileText } from "lucide-react";
import { WingPositionSelector, WingPositionValue } from "@/components/WingPositionSelector";
import { toast } from "sonner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { useOfflineSync, getAllPendingData } from "@/hooks/useOfflineSync";
import { useDebouncedSync } from "@/hooks/useDebouncedSync";
import { ConnectionStatusBadge } from "@/components/ConnectionStatusBadge";

interface MeasurementRow {
  id: string;
  project_id: number;
  floor_label: string | null;
  apartment_label: string | null;
  sheet_name: string | null;
  location_in_apartment: string | null;
  opening_no: string | null;
  contract_item: string | null;
  item_code: string | null;
  height: string | null;
  width: string | null;
  notes: string | null;
  field_notes: string | null;
  wall_thickness: string | null;
  glyph: string | null;
  jamb_height: string | null;
  engine_side: string | null;
  hinge_direction: string | null;
  mamad: string | null;
  depth: string | null;
  is_manual: boolean;
  internal_wing: string | null;
  wing_position: string | null;
  wing_position_out: string | null;
}

// Helper to extract user notes (excluding angle patterns from legacy data)
const getUserNotes = (notes: string | null): string => {
  if (!notes) return '';
  return notes
    .replace(/זווית1:[^;]*;?/g, '')
    .replace(/זווית2:[^;]*;?/g, '')
    .trim();
};

// Helper to preserve angle patterns when user edits notes (legacy compatibility)
const mergeUserNotes = (newUserNotes: string, existingNotes: string | null): string | null => {
  const angle1Match = existingNotes?.match(/זווית1:[^;]*/)?.[0] || '';
  const angle2Match = existingNotes?.match(/זווית2:[^;]*/)?.[0] || '';
  
  const parts = [angle1Match, angle2Match, newUserNotes.trim()].filter(Boolean);
  return parts.length > 0 ? parts.join(';') : null;
};

const MeasurementEditor = () => {
  const navigate = useNavigate();
  const { projectId } = useParams();
  const [loading, setLoading] = useState(true);
  const [project, setProject] = useState<{ name: string; status: string } | null>(null);
  const [rows, setRows] = useState<MeasurementRow[]>([]);
  const [floors, setFloors] = useState<string[]>([]);
  const [apartments, setApartments] = useState<string[]>([]);
  const [selectedFloor, setSelectedFloor] = useState<string>('all');
  const [selectedApartment, setSelectedApartment] = useState<string>('all');
  const [rowToDelete, setRowToDelete] = useState<string | null>(null);
  const [addFloorOpen, setAddFloorOpen] = useState(false);
  const [addApartmentOpen, setAddApartmentOpen] = useState(false);
  
  // Add floor dialog state
  const [newFloorLabel, setNewFloorLabel] = useState('');
  const [newFloorAptCount, setNewFloorAptCount] = useState(1);
  const [newFloorAptLabels, setNewFloorAptLabels] = useState<string[]>(['1']);
  const [newFloorOpeningsPerApt, setNewFloorOpeningsPerApt] = useState(1);
  
  // Add apartment dialog state
  const [newAptFloor, setNewAptFloor] = useState('');
  const [newAptLabel, setNewAptLabel] = useState('');
  const [newAptOpenings, setNewAptOpenings] = useState(1);
  
  const { connectionStatus, pendingCount, lastError, queueUpdate, forceSync } = useOfflineSync(projectId);
  const { debouncedQueueUpdate, flushAll } = useDebouncedSync(queueUpdate, 600);

  useEffect(() => {
    const checkUserAndFetch = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate("/login");
        return;
      }
      await fetchData();
      setLoading(false);
    };
    checkUserAndFetch();
  }, [navigate, projectId]);

  const fetchData = async () => {
    if (!projectId) return;

    // Fetch project
    const { data: projectData } = await supabase
      .from("projects")
      .select("name, status")
      .eq("id", parseInt(projectId))
      .single();
    
    if (!projectData || !['measurement', 'blind_jambs', 'pre_contract'].includes(projectData.status)) {
      toast.error("פרויקט לא נמצא או אינו במצב מתאים לעריכה");
      navigate("/projects");
      return;
    }
    setProject(projectData);

    // Fetch measurement rows
    const { data: rowsData, error } = await supabase
      .from("measurement_rows")
      .select("*")
      .eq("project_id", parseInt(projectId))
      .order("floor_label, apartment_label, id");
    
    if (error) {
      toast.error("שגיאה בטעינת נתונים");
      return;
    }

    // Merge any pending localStorage updates on top of DB data
    const pendingMap = getAllPendingData(projectId);
    const mergedRows = (rowsData || []).map((row: MeasurementRow) => {
      const pendingData = pendingMap.get(row.id);
      return pendingData ? { ...row, ...pendingData } : row;
    });
    setRows(mergedRows);

    // Extract unique floors and apartments
    const uniqueFloors = [...new Set((rowsData || []).map(r => r.floor_label).filter(Boolean))] as string[];
    const uniqueApartments = [...new Set((rowsData || []).map(r => r.apartment_label).filter(Boolean))] as string[];
    // Floor sorting: קרקע/לובי come first (as floor 0), then numeric order
    setFloors(uniqueFloors.sort((a, b) => {
      const getOrder = (label: string) => {
        const lower = label.toLowerCase();
        if (lower.includes('קרקע') || lower.includes('לובי') || lower.includes('lobby') || lower.includes('ground')) return 0;
        return parseInt(label) || 999;
      };
      return getOrder(a) - getOrder(b);
    }));
    setApartments(uniqueApartments.sort((a, b) => a.localeCompare(b, 'he', { numeric: true })));
  };

  const filteredRows = rows
    .filter(row => {
      if (selectedFloor !== 'all' && row.floor_label !== selectedFloor) return false;
      if (selectedApartment !== 'all' && row.apartment_label !== selectedApartment) return false;
      return true;
    })
    .sort((a, b) => {
      const aNum = parseInt(a.opening_no || '999999', 10);
      const bNum = parseInt(b.opening_no || '999999', 10);
      return aNum - bNum;
    });

  const filteredApartments = selectedFloor === 'all' 
    ? apartments 
    : [...new Set(rows.filter(r => r.floor_label === selectedFloor).map(r => r.apartment_label).filter(Boolean))] as string[];

  const updateRow = (id: string, field: keyof MeasurementRow, value: string | null) => {
    // Update local state immediately
    setRows(prev => prev.map(row => 
      row.id === id ? { ...row, [field]: value } : row
    ));
    
    // Queue for offline-aware sync (debounced to avoid race conditions)
    debouncedQueueUpdate(id, 'measurement_rows', { [field]: value });
  };

  const addRow = async () => {
    if (!projectId) return;
    
    // Check if we're online first
    if (connectionStatus === 'offline') {
      toast.error("לא ניתן להוסיף שורה במצב אופליין");
      return;
    }
    
    const newRow = {
      project_id: parseInt(projectId),
      floor_label: selectedFloor !== 'all' ? selectedFloor : floors[0] || null,
      apartment_label: selectedApartment !== 'all' ? selectedApartment : filteredApartments[0] || null,
      sheet_name: 'ידני',
      location_in_apartment: null,
      opening_no: null,
      item_code: null,
      height: null,
      width: null,
      notes: null,
      field_notes: null,
      wall_thickness: null,
      glyph: null,
      jamb_height: null,
      engine_side: null
    };

    const { data, error } = await supabase
      .from("measurement_rows")
      .insert(newRow)
      .select()
      .single();
    
    if (error) {
      toast.error("שגיאה בהוספת שורה");
      return;
    }

    setRows(prev => [...prev, data]);
    toast.success("שורה נוספה");
  };

  const deleteRow = async () => {
    if (!rowToDelete) return;
    
    // Check if we're online first
    if (connectionStatus === 'offline') {
      toast.error("לא ניתן למחוק שורה במצב אופליין");
      setRowToDelete(null);
      return;
    }
    
    const { error } = await supabase
      .from("measurement_rows")
      .delete()
      .eq("id", rowToDelete);
    
    if (error) {
      toast.error("שגיאה במחיקה");
      return;
    }

    setRows(prev => prev.filter(r => r.id !== rowToDelete));
    setRowToDelete(null);
    toast.success("שורה נמחקה");
  };

  const addFloor = async () => {
    if (!projectId || !newFloorLabel.trim()) { toast.error("יש להזין שם קומה"); return; }
    if (connectionStatus === 'offline') { toast.error("לא ניתן להוסיף במצב אופליין"); return; }
    const validLabels = newFloorAptLabels.filter(l => l.trim());
    if (validLabels.length === 0) { toast.error("יש להזין לפחות דירה אחת"); return; }
    const newRows = validLabels.flatMap(aptLabel =>
      Array.from({ length: newFloorOpeningsPerApt }, (_, i) => ({
        project_id: parseInt(projectId),
        floor_label: newFloorLabel.trim(),
        apartment_label: aptLabel.trim(),
        sheet_name: 'ידני',
        opening_no: String(i + 1),
        is_manual: true,
      }))
    );
    const { data, error } = await supabase.from("measurement_rows").insert(newRows).select();
    if (error) { toast.error("שגיאה בהוספת קומה"); return; }
    setRows(prev => [...prev, ...(data || [])]);
    if (!floors.includes(newFloorLabel.trim())) {
      setFloors(prev => [...prev, newFloorLabel.trim()].sort((a, b) => {
        const getOrder = (label: string) => {
          const lower = label.toLowerCase();
          if (lower.includes('קרקע') || lower.includes('לובי')) return 0;
          return parseInt(label) || 999;
        };
        return getOrder(a) - getOrder(b);
      }));
    }
    const newApts = validLabels.map(l => l.trim()).filter(l => !apartments.includes(l));
    if (newApts.length > 0) {
      setApartments(prev => [...prev, ...newApts].sort((a, b) => a.localeCompare(b, 'he', { numeric: true })));
    }
    setAddFloorOpen(false);
    setNewFloorLabel(''); setNewFloorAptCount(1); setNewFloorAptLabels(['1']); setNewFloorOpeningsPerApt(1);
    toast.success(`קומה ${newFloorLabel} נוספה עם ${validLabels.length} דירות`);
  };

  const addApartment = async () => {
    if (!projectId || !newAptFloor || !newAptLabel.trim()) { toast.error("יש לבחור קומה ולהזין שם דירה"); return; }
    if (connectionStatus === 'offline') { toast.error("לא ניתן להוסיף במצב אופליין"); return; }
    const newRows = Array.from({ length: newAptOpenings }, (_, i) => ({
      project_id: parseInt(projectId),
      floor_label: newAptFloor,
      apartment_label: newAptLabel.trim(),
      sheet_name: 'ידני',
      opening_no: String(i + 1),
      is_manual: true,
    }));
    const { data, error } = await supabase.from("measurement_rows").insert(newRows).select();
    if (error) { toast.error("שגיאה בהוספת דירה"); return; }
    setRows(prev => [...prev, ...(data || [])]);
    if (!apartments.includes(newAptLabel.trim())) {
      setApartments(prev => [...prev, newAptLabel.trim()].sort((a, b) => a.localeCompare(b, 'he', { numeric: true })));
    }
    setAddApartmentOpen(false);
    setNewAptFloor(''); setNewAptLabel(''); setNewAptOpenings(1);
    toast.success(`דירה ${newAptLabel} נוספה לקומה ${newAptFloor}`);
  };


  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center" dir="rtl">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      {/* Offline Banner */}
      {(connectionStatus === 'offline' || connectionStatus === 'error') && (
        <div className="bg-destructive/10 border-b border-destructive/20 px-3 py-2">
          <div className="container mx-auto flex items-center justify-between">
            <span className="text-sm text-destructive">
              {connectionStatus === 'offline' 
                ? 'אין חיבור לאינטרנט - השינויים נשמרים מקומית ויסונכרנו כשהחיבור יחזור'
                : lastError || 'שגיאה בסנכרון'
              }
            </span>
            <Button variant="ghost" size="sm" onClick={forceSync} className="text-destructive">
              נסה שוב
            </Button>
          </div>
        </div>
      )}

      {/* Sticky Header */}
      <nav className="border-b bg-card shadow-sm sticky top-0 z-20">
        <div className="container mx-auto px-3 py-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Link to={`/projects/${projectId}`}>
                <Button variant="ghost" size="sm" className="px-2">
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <h1 className="text-lg font-bold text-primary truncate">{project?.name}</h1>
            </div>
            <ConnectionStatusBadge
              status={connectionStatus}
              pendingCount={pendingCount}
              lastError={lastError}
              onRetry={forceSync}
            />
          </div>
        </div>
      </nav>

      {/* Filters */}
      <div className="sticky top-[57px] z-10 bg-muted/80 backdrop-blur-sm border-b">
        <div className="container mx-auto px-3 py-3">
          <div className="flex flex-wrap gap-2 items-center">
            <Select value={selectedFloor} onValueChange={(v) => { setSelectedFloor(v); setSelectedApartment('all'); }}>
              <SelectTrigger className="w-[120px]">
                <SelectValue placeholder="קומה" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">כל הקומות</SelectItem>
                {floors.map(f => (
                  <SelectItem key={f} value={f}>קומה {f}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={selectedApartment} onValueChange={setSelectedApartment}>
              <SelectTrigger className="w-[120px]">
                <SelectValue placeholder="דירה" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">כל הדירות</SelectItem>
                {filteredApartments.map(a => (
                  <SelectItem key={a} value={a}>דירה {a}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1" disabled={connectionStatus === 'offline'}>
                  <Plus className="h-4 w-4" />
                  תוספות
                  <ChevronDown className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem onClick={() => setAddFloorOpen(true)}>
                  <Building2 className="h-4 w-4 ml-2" />
                  הוסף קומה
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => { setNewAptFloor(selectedFloor !== 'all' ? selectedFloor : floors[0] || ''); setAddApartmentOpen(true); }}>
                  <Home className="h-4 w-4 ml-2" />
                  הוסף דירה
                </DropdownMenuItem>
                <DropdownMenuItem onClick={addRow}>
                  <FileText className="h-4 w-4 ml-2" />
                  הוסף שורה
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <span className="text-sm text-muted-foreground mr-auto">
              {filteredRows.length} שורות
            </span>
          </div>
        </div>
      </div>

      {/* Table */}
      <main className="container mx-auto px-2 py-4">
        {filteredRows.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              אין שורות להצגה
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {filteredRows.map((row) => (
              <Card key={row.id} className="overflow-hidden">
                <CardContent className="p-3">
                  <div className="text-xs text-muted-foreground mb-2">
                    קומה {row.floor_label || '—'} | דירה {row.apartment_label || '—'}
                  </div>
                  <div className="flex gap-2 items-end flex-wrap">
                    {/* מיקום */}
                    <div className="w-20">
                      <label className="text-[11px] text-muted-foreground block text-center">מיקום</label>
                      <Input
                        value={row.location_in_apartment || ''}
                        onChange={(e) => updateRow(row.id, 'location_in_apartment', e.target.value || null)}
                        className="h-10 text-lg font-medium px-2 text-center"
                        dir="rtl"
                      />
                    </div>
                    {/* פתח */}
                    <div className="w-16">
                      <label className="text-[11px] text-muted-foreground block text-center">פתח</label>
                      <Input
                        value={row.opening_no || ''}
                        onChange={(e) => updateRow(row.id, 'opening_no', e.target.value || null)}
                        className="h-10 text-lg font-medium px-2 text-center"
                        dir="rtl"
                      />
                    </div>
                    {/* פרט חוזה */}
                    <div className="w-16">
                      <label className="text-[11px] text-muted-foreground block text-center">חוזה</label>
                      <Input
                        value={(row as any).contract_item || ''}
                        onChange={(e) => updateRow(row.id, 'contract_item' as any, e.target.value || null)}
                        className="h-10 text-lg font-medium px-2 text-center"
                        dir="rtl"
                      />
                    </div>
                    {/* פרט משקופים - only show for blind_jambs+ */}
                    {project?.status !== 'pre_contract' && (
                    <div className="w-20">
                      <label className="text-[11px] text-muted-foreground block text-center">משקופים</label>
                      <Input
                        value={(row as any).blind_jamb_item || ''}
                        onChange={(e) => updateRow(row.id, 'blind_jamb_item' as any, e.target.value || null)}
                        className="h-10 text-lg font-medium px-2 text-center"
                        dir="rtl"
                      />
                    </div>
                    )}
                    {/* פרט יצור - only show for measurement stage */}
                    {project?.status !== 'pre_contract' && project?.status !== 'blind_jambs' && (
                    <div className="w-20">
                      <label className="text-[11px] text-muted-foreground block text-center">פרט יצור</label>
                      <Input
                        value={row.item_code || ''}
                        onChange={(e) => updateRow(row.id, 'item_code', e.target.value || null)}
                        className="h-10 text-lg font-medium px-2 text-center"
                        dir="rtl"
                      />
                    </div>
                    )}
                    {/* גובה */}
                    <div className="w-28">
                      <label className="text-[11px] text-muted-foreground block text-center">גובה</label>
                      <Input
                        value={row.height || ''}
                        onChange={(e) => updateRow(row.id, 'height', e.target.value || null)}
                        className="h-10 text-lg font-medium px-2 text-center bg-primary/5"
                        inputMode="tel"
                        pattern="[0-9+.]*"
                        dir="ltr"
                      />
                    </div>
                    {/* רוחב */}
                    <div className="w-20">
                      <label className="text-[11px] text-muted-foreground block text-center">רוחב</label>
                      <Input
                        value={row.width || ''}
                        onChange={(e) => updateRow(row.id, 'width', e.target.value || null)}
                        className="h-10 text-lg font-medium px-2 text-center bg-primary/5"
                        inputMode="tel"
                        pattern="[0-9+.]*"
                        dir="ltr"
                      />
                    </div>
                    {/* הערות */}
                    <div className="w-28">
                      <label className="text-[11px] text-muted-foreground block text-center">גובה מהריצוף</label>
                      <Input
                        value={getUserNotes(row.notes)}
                        onChange={(e) => updateRow(row.id, 'notes', mergeUserNotes(e.target.value, row.notes))}
                        className="h-10 text-base px-2"
                        dir="rtl"
                      />
                    </div>
                    {/* ממד */}
                    <div className="w-20">
                      <label className="text-[11px] text-muted-foreground block text-center">ממד כיס בצד</label>
                      <Select
                        value={(row as any).mamad || 'none'}
                        onValueChange={(value) => updateRow(row.id, 'mamad' as any, value === 'none' ? null : value)}
                      >
                        <SelectTrigger className="h-10 text-sm px-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">-</SelectItem>
                          <SelectItem value="☒☐">☒☐ שמאל</SelectItem>
                          <SelectItem value="☐☒">☐☒ ימין</SelectItem>
                          <SelectItem value="☒☐☒">☒☐☒ כפול</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {/* צד מנוע */}
                    <div className="w-16">
                      <label className="text-[11px] text-muted-foreground block text-center">מנוע</label>
                      <Select
                        value={row.engine_side || 'none'}
                        onValueChange={(value) => updateRow(row.id, 'engine_side', value === 'none' ? null : value)}
                      >
                        <SelectTrigger className="h-10 text-base px-2">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">-</SelectItem>
                          <SelectItem value="L">L</SelectItem>
                          <SelectItem value="R">R</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {/* כנף פנימית מבט פנים */}
                    <div className="w-20">
                      <label className="text-[11px] text-muted-foreground block text-center">כנף פנימית</label>
                      <Select
                        value={(row as any).internal_wing || 'none'}
                        onValueChange={(value) => updateRow(row.id, 'internal_wing' as any, value === 'none' ? null : value)}
                      >
                        <SelectTrigger className="h-10 text-base px-2">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">-</SelectItem>
                          <SelectItem value="R">ימין</SelectItem>
                          <SelectItem value="L">שמאל</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {/* ציר מבט פנים פתיחה פנימה */}
                    <div className="w-24">
                      <label className="text-[11px] text-muted-foreground block text-center">פתיחה פנימה</label>
                      <WingPositionSelector
                        value={(row.wing_position as WingPositionValue) || null}
                        onChange={(v) => updateRow(row.id, 'wing_position' as any, v)}
                        size="sm"
                      />
                    </div>
                    {/* ציר מבט פנים פתיחה החוצה */}
                    <div className="w-24">
                      <label className="text-[11px] text-muted-foreground block text-center">פתיחה החוצה</label>
                      <WingPositionSelector
                        value={(row.wing_position_out as WingPositionValue) || null}
                        onChange={(v) => updateRow(row.id, 'wing_position_out' as any, v)}
                        size="sm"
                      />
                    </div>
                    {/* גליף */}
                    <div className="w-16">
                      <label className="text-[11px] text-muted-foreground block text-center">גליף</label>
                      <Input
                        value={row.glyph || ''}
                        onChange={(e) => updateRow(row.id, 'glyph', e.target.value || null)}
                        className="h-10 text-lg font-medium px-2 text-center"
                        dir="ltr"
                      />
                    </div>
                    {/* עובי קיר - legacy field, keep for existing data */}
                    <div className="w-16">
                      <label className="text-[11px] text-muted-foreground block text-center">עובי קיר</label>
                      <Input
                        value={row.wall_thickness || ''}
                        onChange={(e) => updateRow(row.id, 'wall_thickness', e.target.value || null)}
                        className="h-10 text-lg font-medium px-2 text-center"
                        inputMode="tel"
                        dir="ltr"
                      />
                    </div>
                    {/* עומק */}
                    <div className="w-16">
                      <label className="text-[11px] text-muted-foreground block text-center">עומק עד הפריקסט</label>
                      <Input
                        value={(row as any).depth || ''}
                        onChange={(e) => updateRow(row.id, 'depth' as any, e.target.value || null)}
                        className="h-10 text-lg font-medium px-2 text-center"
                        inputMode="tel"
                        dir="ltr"
                      />
                    </div>
                    {/* גובה יואים */}
                    <div className="w-16">
                      <label className="text-[11px] text-muted-foreground block text-center">מדרגה בשיש</label>
                      <Input
                        value={row.jamb_height || ''}
                        onChange={(e) => updateRow(row.id, 'jamb_height', e.target.value || null)}
                        className="h-10 text-lg font-medium px-2 text-center"
                        inputMode="tel"
                        dir="ltr"
                      />
                    </div>
                    {/* מנואלה */}
                    <div className="w-14">
                      <label className="text-[11px] text-muted-foreground block text-center">מנואלה</label>
                      <div className="h-10 flex items-center justify-center">
                        <input
                          type="checkbox"
                          checked={(row as any).is_manual || false}
                          onChange={(e) => updateRow(row.id, 'is_manual' as any, e.target.checked as any)}
                          className="h-5 w-5 rounded border-border"
                        />
                      </div>
                    </div>
                    {/* הערות */}
                    <div className="w-28">
                      <label className="text-[11px] text-muted-foreground block text-center">הערות</label>
                      <Input
                        value={row.field_notes || ''}
                        onChange={(e) => updateRow(row.id, 'field_notes', e.target.value || null)}
                        className="h-10 text-base px-2"
                        dir="rtl"
                      />
                    </div>
                    
                    {/* Delete Button */}
                    <div className="w-10 flex items-end">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-10 w-10 text-muted-foreground hover:text-destructive"
                        onClick={() => setRowToDelete(row.id)}
                        disabled={connectionStatus === 'offline'}
                      >
                        <Trash2 className="h-5 w-5" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>

      {/* Delete Confirmation */}
      <AlertDialog open={!!rowToDelete} onOpenChange={() => setRowToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>מחיקת שורה</AlertDialogTitle>
            <AlertDialogDescription>
              האם אתה בטוח שברצונך למחוק שורה זו? לא ניתן לבטל פעולה זו.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ביטול</AlertDialogCancel>
            <AlertDialogAction onClick={deleteRow} className="bg-destructive text-destructive-foreground">
              מחק
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Add Floor Dialog */}
      <Dialog open={addFloorOpen} onOpenChange={setAddFloorOpen}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>הוסף קומה</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>שם קומה</Label>
              <Input
                value={newFloorLabel}
                onChange={(e) => setNewFloorLabel(e.target.value)}
                placeholder="לדוגמה: 5"
                dir="rtl"
              />
            </div>
            <div>
              <Label>מספר דירות</Label>
              <Input
                type="number"
                min={1}
                max={20}
                value={newFloorAptCount}
                onChange={(e) => {
                  const count = Math.max(1, Math.min(20, parseInt(e.target.value) || 1));
                  setNewFloorAptCount(count);
                  setNewFloorAptLabels(Array.from({ length: count }, (_, i) => String(i + 1)));
                }}
              />
            </div>
            <div>
              <Label>שמות דירות</Label>
              <div className="flex flex-wrap gap-2 mt-1">
                {newFloorAptLabels.map((label, i) => (
                  <Input
                    key={i}
                    value={label}
                    onChange={(e) => {
                      const updated = [...newFloorAptLabels];
                      updated[i] = e.target.value;
                      setNewFloorAptLabels(updated);
                    }}
                    className="w-16 text-center"
                    dir="rtl"
                  />
                ))}
              </div>
            </div>
            <div>
              <Label>פתחים לדירה</Label>
              <Input
                type="number"
                min={1}
                max={35}
                value={newFloorOpeningsPerApt}
                onChange={(e) => setNewFloorOpeningsPerApt(Math.max(1, Math.min(35, parseInt(e.target.value) || 1)))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddFloorOpen(false)}>ביטול</Button>
            <Button onClick={addFloor}>הוסף קומה</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Apartment Dialog */}
      <Dialog open={addApartmentOpen} onOpenChange={setAddApartmentOpen}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>הוסף דירה</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>קומה</Label>
              <Select value={newAptFloor} onValueChange={setNewAptFloor}>
                <SelectTrigger>
                  <SelectValue placeholder="בחר קומה" />
                </SelectTrigger>
                <SelectContent>
                  {floors.map(f => (
                    <SelectItem key={f} value={f}>קומה {f}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>שם דירה</Label>
              <Input
                value={newAptLabel}
                onChange={(e) => setNewAptLabel(e.target.value)}
                placeholder="לדוגמה: 3"
                dir="rtl"
              />
            </div>
            <div>
              <Label>מספר פתחים</Label>
              <Input
                type="number"
                min={1}
                max={35}
                value={newAptOpenings}
                onChange={(e) => setNewAptOpenings(Math.max(1, Math.min(35, parseInt(e.target.value) || 1)))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddApartmentOpen(false)}>ביטול</Button>
            <Button onClick={addApartment}>הוסף דירה</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default MeasurementEditor;
