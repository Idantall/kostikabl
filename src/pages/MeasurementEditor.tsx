import { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowRight, Plus, Loader2, Trash2, ChevronDown, Building2, Home, FileText, Package } from "lucide-react";
import { toast } from "sonner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { useOfflineSync, getAllPendingData } from "@/hooks/useOfflineSync";
import { useDebouncedSync } from "@/hooks/useDebouncedSync";
import { ConnectionStatusBadge } from "@/components/ConnectionStatusBadge";
import { BankEditorDialog, BankItem } from "@/components/measurement/BankEditorDialog";
import { MeasurementRowCard, MeasurementRowData } from "@/components/measurement/MeasurementRowCard";

interface MeasurementRow extends MeasurementRowData {
  project_id: number;
  sheet_name: string | null;
}

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
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;
  const [rowToDelete, setRowToDelete] = useState<string | null>(null);
  const [addFloorOpen, setAddFloorOpen] = useState(false);
  const [addApartmentOpen, setAddApartmentOpen] = useState(false);
  const [bankEditorOpen, setBankEditorOpen] = useState(false);
  
  // Rename confirmation state
  const [renameConfirm, setRenameConfirm] = useState<{
    rowId: string;
    field: 'floor_label' | 'apartment_label';
    oldValue: string | null;
    newValue: string | null;
    matchingCount: number;
    isNewLabel: boolean;
    selectedExisting: string;
  } | null>(null);
  
  // Project metadata (types + bank)
  const [bankItems, setBankItems] = useState<BankItem[]>([]);
  const [apartmentTypes, setApartmentTypes] = useState<any[]>([]);
  const [floorTypes, setFloorTypes] = useState<any[]>([]);
  
  // Add floor dialog state
  const [newFloorLabel, setNewFloorLabel] = useState('');
  const [newFloorAptCount, setNewFloorAptCount] = useState(1);
  const [newFloorAptLabels, setNewFloorAptLabels] = useState<string[]>(['1']);
  const [newFloorOpeningsPerApt, setNewFloorOpeningsPerApt] = useState(1);
  const [newFloorTypeId, setNewFloorTypeId] = useState<string>('none');
  
  // Add apartment dialog state
  const [newAptFloor, setNewAptFloor] = useState('');
  const [newAptLabel, setNewAptLabel] = useState('');
  const [newAptOpenings, setNewAptOpenings] = useState(1);
  const [newAptTypeId, setNewAptTypeId] = useState<string>('none');
  
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
      .select("name, status, project_metadata")
      .eq("id", parseInt(projectId))
      .single();
    
    if (!projectData || !['measurement', 'blind_jambs', 'pre_contract'].includes(projectData.status)) {
      toast.error("פרויקט לא נמצא או אינו במצב מתאים לעריכה");
      navigate("/projects");
      return;
    }
    setProject(projectData);
    
    // Load project metadata (types + bank)
    const meta = (projectData as any).project_metadata || {};
    setApartmentTypes(meta.apartmentTypes || []);
    setFloorTypes(meta.floorTypes || []);
    
    // Load bank items from metadata, or reconstruct from measurement_rows if empty
    if (meta.bankItems && meta.bankItems.length > 0) {
      setBankItems(meta.bankItems);
    } else {
      // Reconstruct bank from distinct contract_item values in measurement_rows
      const { data: distinctItems } = await supabase
        .from("measurement_rows")
        .select("contract_item, height, width, notes")
        .eq("project_id", parseInt(projectId))
        .not("contract_item", "is", null)
        .neq("contract_item", "");
      
      if (distinctItems && distinctItems.length > 0) {
        const seen = new Map<string, BankItem>();
        for (const row of distinctItems) {
          const key = row.contract_item!;
          if (!seen.has(key)) {
            seen.set(key, {
              id: crypto.randomUUID(),
              item_no: key,
              height: row.height || '',
              width: row.width || '',
              floor_height: row.notes || '',
            });
          }
        }
        setBankItems(Array.from(seen.values()));
      }
    }

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
    const sortedFloors = uniqueFloors.sort((a, b) => {
      const getOrder = (label: string) => {
        const lower = label.toLowerCase();
        if (lower.includes('קרקע') || lower.includes('לובי') || lower.includes('lobby') || lower.includes('ground')) return 0;
        return parseInt(label) || 999;
      };
      return getOrder(a) - getOrder(b);
    });
    setFloors(sortedFloors);
    setApartments(uniqueApartments.sort((a, b) => a.localeCompare(b, 'he', { numeric: true })));
    
    // Auto-select first floor when there are many rows to prevent rendering 1000+ cards
    if ((rowsData || []).length > 50 && sortedFloors.length > 0) {
      setSelectedFloor(sortedFloors[0]);
    }
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

  const totalPages = Math.ceil(filteredRows.length / PAGE_SIZE);
  const paginatedRows = filteredRows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const filteredApartments = selectedFloor === 'all' 
    ? apartments 
    : [...new Set(rows.filter(r => r.floor_label === selectedFloor).map(r => r.apartment_label).filter(Boolean))] as string[];

  const updateRow = useCallback((id: string, field: keyof MeasurementRow, value: string | boolean | null) => {
    setRows(prev => {
      const index = prev.findIndex(row => row.id === id);
      if (index === -1) return prev;
      const current = prev[index];
      if ((current as any)[field] === value) return prev;
      const next = [...prev];
      next[index] = { ...current, [field]: value };
      return next;
    });

    debouncedQueueUpdate(id, 'measurement_rows', { [field]: value });
  }, [debouncedQueueUpdate]);

  const recalcFilters = useCallback((updatedRows: MeasurementRow[]) => {
    const uniqueFloors = [...new Set(updatedRows.map(r => r.floor_label).filter(Boolean))] as string[];
    const sortedFloors = uniqueFloors.sort((a, b) => {
      const getOrder = (label: string) => {
        const lower = label.toLowerCase();
        if (lower.includes('קרקע') || lower.includes('לובי') || lower.includes('lobby') || lower.includes('ground')) return 0;
        return parseInt(label) || 999;
      };
      return getOrder(a) - getOrder(b);
    });
    setFloors(sortedFloors);
    const uniqueApartments = [...new Set(updatedRows.map(r => r.apartment_label).filter(Boolean))] as string[];
    setApartments(uniqueApartments.sort((a, b) => a.localeCompare(b, 'he', { numeric: true })));
  }, []);

  const handleLabelChange = useCallback((rowId: string, field: 'floor_label' | 'apartment_label', oldValue: string | null, newValue: string | null) => {
    if (oldValue === newValue) return;
    // Count how many other rows share the old label value
    const matchingCount = rows.filter(r => r[field] === oldValue && r.id !== rowId).length;
    if (matchingCount > 0) {
      setRenameConfirm({ rowId, field, oldValue, newValue, matchingCount });
    } else {
      // Only one row had this value, just recalc filters
      recalcFilters(rows);
    }
  }, [rows, recalcFilters]);

  const applyBatchRename = useCallback(() => {
    if (!renameConfirm) return;
    const { field, oldValue, newValue } = renameConfirm;
    setRows(prev => {
      const updated = prev.map(r =>
        r[field] === oldValue ? { ...r, [field]: newValue } : r
      );
      recalcFilters(updated);
      return updated;
    });
    // Queue DB updates for all matching rows
    rows.forEach(r => {
      if (r[field] === oldValue) {
        debouncedQueueUpdate(r.id, 'measurement_rows', { [field]: newValue });
      }
    });
    // Update selected filter if it was the renamed value
    if (field === 'floor_label' && selectedFloor === oldValue) {
      setSelectedFloor(newValue || 'all');
    }
    if (field === 'apartment_label' && selectedApartment === oldValue) {
      setSelectedApartment(newValue || 'all');
    }
    setRenameConfirm(null);
    toast.success(`שונה בכל השורות`);
  }, [renameConfirm, rows, debouncedQueueUpdate, recalcFilters, selectedFloor, selectedApartment]);

  const skipBatchRename = useCallback(() => {
    // Just recalc filters for the single-row change already applied
    recalcFilters(rows);
    setRenameConfirm(null);
  }, [rows, recalcFilters]);

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
    
    const selectedFloorType = newFloorTypeId !== 'none' ? floorTypes.find((t: any) => t.id === newFloorTypeId) : null;
    
    let newRows: any[];
    if (selectedFloorType) {
      // Type-aware: create rows from floor type template
      newRows = selectedFloorType.apartments.flatMap((apt: any, aptIdx: number) => {
        const aptLabel = apt.label?.replace('דירה ', '') || String(aptIdx + 1);
        return (apt.rows || []).map((row: any, rowIdx: number) => ({
          project_id: parseInt(projectId),
          floor_label: newFloorLabel.trim(),
          apartment_label: aptLabel,
          sheet_name: 'ידני',
          opening_no: String(row.opening_no || rowIdx + 1),
          location_in_apartment: row.location_in_apartment || null,
          contract_item: row.contract_item || null,
          item_code: row.item_code || null,
          height: row.height || null,
          width: row.width || null,
          notes: row.notes || null,
          hinge_direction: row.hinge_direction || null,
          mamad: row.mamad || null,
          glyph: row.glyph || null,
          jamb_height: row.jamb_height || null,
          depth: row.depth || null,
          is_manual: row.is_manual || false,
          engine_side: row.engine_side || null,
          field_notes: row.field_notes || null,
          internal_wing: row.internal_wing || null,
          wing_position: row.wing_position || null,
          wing_position_out: row.wing_position_out || null,
        }));
      });
    } else {
      const validLabels = newFloorAptLabels.filter(l => l.trim());
      if (validLabels.length === 0) { toast.error("יש להזין לפחות דירה אחת"); return; }
      newRows = validLabels.flatMap(aptLabel =>
        Array.from({ length: newFloorOpeningsPerApt }, (_, i) => ({
          project_id: parseInt(projectId),
          floor_label: newFloorLabel.trim(),
          apartment_label: aptLabel.trim(),
          sheet_name: 'ידני',
          opening_no: String(i + 1),
          is_manual: true,
        }))
      );
    }
    
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
    const allAptLabels = [...new Set((data || []).map((r: any) => r.apartment_label).filter(Boolean))] as string[];
    const newApts = allAptLabels.filter(l => !apartments.includes(l));
    if (newApts.length > 0) {
      setApartments(prev => [...prev, ...newApts].sort((a, b) => a.localeCompare(b, 'he', { numeric: true })));
    }
    setAddFloorOpen(false);
    setNewFloorLabel(''); setNewFloorAptCount(1); setNewFloorAptLabels(['1']); setNewFloorOpeningsPerApt(1); setNewFloorTypeId('none');
    
    // Auto-navigate to new floor if no type was used
    if (!selectedFloorType) {
      setSelectedFloor(newFloorLabel.trim());
      setSelectedApartment('all');
    }
    toast.success(`קומה ${newFloorLabel} נוספה`);
  };

  const addApartment = async () => {
    if (!projectId || !newAptFloor || !newAptLabel.trim()) { toast.error("יש לבחור קומה ולהזין שם דירה"); return; }
    if (connectionStatus === 'offline') { toast.error("לא ניתן להוסיף במצב אופליין"); return; }
    
    const selectedAptType = newAptTypeId !== 'none' ? apartmentTypes.find((t: any) => t.id === newAptTypeId) : null;
    
    let newRows: any[];
    if (selectedAptType) {
      // Type-aware: create rows from apartment type template
      newRows = (selectedAptType.rows || []).map((row: any, idx: number) => ({
        project_id: parseInt(projectId),
        floor_label: newAptFloor,
        apartment_label: newAptLabel.trim(),
        sheet_name: 'ידני',
        opening_no: String(row.opening_no || idx + 1),
        location_in_apartment: row.location_in_apartment || null,
        contract_item: row.contract_item || null,
        item_code: row.item_code || null,
        height: row.height || null,
        width: row.width || null,
        notes: row.notes || null,
        hinge_direction: row.hinge_direction || null,
        mamad: row.mamad || null,
        glyph: row.glyph || null,
        jamb_height: row.jamb_height || null,
        depth: row.depth || null,
        is_manual: row.is_manual || false,
        engine_side: row.engine_side || null,
        field_notes: row.field_notes || null,
        internal_wing: row.internal_wing || null,
        wing_position: row.wing_position || null,
        wing_position_out: row.wing_position_out || null,
      }));
    } else {
      newRows = Array.from({ length: newAptOpenings }, (_, i) => ({
        project_id: parseInt(projectId),
        floor_label: newAptFloor,
        apartment_label: newAptLabel.trim(),
        sheet_name: 'ידני',
        opening_no: String(i + 1),
        is_manual: true,
      }));
    }
    
    const { data, error } = await supabase.from("measurement_rows").insert(newRows).select();
    if (error) { toast.error("שגיאה בהוספת דירה"); return; }
    setRows(prev => [...prev, ...(data || [])]);
    if (!apartments.includes(newAptLabel.trim())) {
      setApartments(prev => [...prev, newAptLabel.trim()].sort((a, b) => a.localeCompare(b, 'he', { numeric: true })));
    }
    setAddApartmentOpen(false);
    setNewAptFloor(''); setNewAptLabel(''); setNewAptOpenings(1); setNewAptTypeId('none');
    
    // Auto-navigate to new apartment if no type was used
    if (!selectedAptType) {
      setSelectedFloor(newAptFloor);
      setSelectedApartment(newAptLabel.trim());
    }
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
            <Select value={selectedFloor} onValueChange={(v) => { setSelectedFloor(v); setSelectedApartment('all'); setPage(0); }}>
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

            <Select value={selectedApartment} onValueChange={(v) => { setSelectedApartment(v); setPage(0); }}>
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

            <Button variant="outline" size="sm" className="gap-1" onClick={() => setBankEditorOpen(true)} disabled={connectionStatus === 'offline'}>
              <Package className="h-4 w-4" />
              בנק פרטים
            </Button>

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
            {paginatedRows.map((row) => (
              <MeasurementRowCard
                key={row.id}
                row={row}
                projectStatus={project?.status}
                connectionStatus={connectionStatus}
                onFieldChange={updateRow as any}
                onDelete={setRowToDelete}
                onLabelChange={handleLabelChange}
              />
            ))}
            {/* Pagination controls */}
            {totalPages > 1 && (
              <div className="flex justify-center items-center gap-3 py-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  disabled={page === 0}
                >
                  הקודם
                </Button>
                <span className="text-sm text-muted-foreground">
                  עמוד {page + 1} מתוך {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                >
                  הבא
                </Button>
              </div>
            )}
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

      {/* Rename Confirmation */}
      <AlertDialog open={!!renameConfirm} onOpenChange={(open) => { if (!open) skipBatchRename(); }}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>שינוי {renameConfirm?.field === 'floor_label' ? 'קומה' : 'דירה'}</AlertDialogTitle>
            <AlertDialogDescription>
              {renameConfirm?.matchingCount} שורות נוספות עם {renameConfirm?.field === 'floor_label' ? 'קומה' : 'דירה'} &quot;{renameConfirm?.oldValue}&quot;.
              האם לעדכן את כולן ל-&quot;{renameConfirm?.newValue}&quot;?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={skipBatchRename}>רק שורה זו</AlertDialogCancel>
            <AlertDialogAction onClick={applyBatchRename}>עדכן הכל</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
            {floorTypes.length > 0 && (
              <div>
                <Label>טיפוס קומה</Label>
                <Select value={newFloorTypeId} onValueChange={setNewFloorTypeId}>
                  <SelectTrigger>
                    <SelectValue placeholder="ללא טיפוס" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">ללא טיפוס</SelectItem>
                    {floorTypes.map((t: any) => (
                      <SelectItem key={t.id} value={t.id}>{t.name} ({t.apartments?.length || 0} דירות)</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {newFloorTypeId === 'none' && (
              <>
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
              </>
            )}
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
            {apartmentTypes.length > 0 && (
              <div>
                <Label>טיפוס דירה</Label>
                <Select value={newAptTypeId} onValueChange={setNewAptTypeId}>
                  <SelectTrigger>
                    <SelectValue placeholder="ללא טיפוס" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">ללא טיפוס</SelectItem>
                    {apartmentTypes.map((t: any) => (
                      <SelectItem key={t.id} value={t.id}>{t.name} ({t.rows?.length || 0} פתחים)</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {newAptTypeId === 'none' && (
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
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddApartmentOpen(false)}>ביטול</Button>
            <Button onClick={addApartment}>הוסף דירה</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bank Editor Dialog */}
      {projectId && (
        <BankEditorDialog
          open={bankEditorOpen}
          onOpenChange={setBankEditorOpen}
          projectId={parseInt(projectId)}
          bankItems={bankItems}
          onBankItemsChange={setBankItems}
          onRowsUpdated={fetchData}
        />
      )}
    </div>
  );
};

export default MeasurementEditor;
