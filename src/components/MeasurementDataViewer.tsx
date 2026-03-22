import { useEffect, useState, forwardRef, useImperativeHandle } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Loader2, FileSpreadsheet, AlertCircle, RefreshCw, Download, Pencil, Check, X, Lock } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { exportMeasurementToExcel } from "@/lib/measurementExcelExport";
interface MeasurementDataViewerProps {
  projectId: number;
}

export interface MeasurementDataViewerHandle {
  enableEditMode: () => void;
}

interface MeasurementRow {
  id: string;
  floor_label: string | null;
  apartment_label: string | null;
  sheet_name: string | null;
  location_in_apartment: string | null;
  opening_no: string | null;
  contract_item: string | null;
  blind_jamb_item: string | null;
  item_code: string | null;
  height: string | null;
  width: string | null;
  notes: string | null;
  hinge_direction: string | null;
  mamad: string | null;
  field_notes: string | null;
  engine_side: string | null;
  glyph: string | null;
  jamb_height: string | null;
  wall_thickness?: string | null;
  depth: string | null;
  is_manual: boolean;
  internal_wing: string | null;
  wing_position: string | null;
  wing_position_out: string | null;
  updated_at: string;
}

// For active projects, we use items data
interface ItemRow {
  id: number;
  floor_id: number | null;
  apt_id: number | null;
  item_code: string;
  location: string | null;
  opening_no: string | null;
  height: string | null;
  width: string | null;
  notes: string | null;
  field_notes: string | null;
  motor_side: string | null;
  floor_code?: string;
  apt_number?: string;
}

export const MeasurementDataViewer = forwardRef<MeasurementDataViewerHandle, MeasurementDataViewerProps>(
  ({ projectId }, ref) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<(MeasurementRow | ItemRow)[]>([]);
  const [floors, setFloors] = useState<string[]>([]);
  const [apartments, setApartments] = useState<string[]>([]);
  const [selectedFloor, setSelectedFloor] = useState<string>('all');
  const [selectedApartment, setSelectedApartment] = useState<string>('all');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [projectStatus, setProjectStatus] = useState<string>('active');
  const [projectMetadata, setProjectMetadata] = useState<{
    name: string;
    building_code?: string | null;
    measurement_rule?: string | null;
  } | null>(null);
  
  

  
  // Edit mode state
  const [editMode, setEditMode] = useState(false);

  // Expose enableEditMode to parent via ref
  useImperativeHandle(ref, () => ({
    enableEditMode: () => setEditMode(true)
  }));
  const [editingRowId, setEditingRowId] = useState<string | number | null>(null);
  const [editValues, setEditValues] = useState<{
    item_code: string;
    height: string;
    width: string;
    engine_side: string | null;
    notes: string;
    field_notes: string;
    location: string;
    glyph: string;
    jamb_height: string;
    apartment_label: string;
    floor_label: string;
    contract_item: string;
    hinge_direction: string | null;
    mamad: string | null;
    depth: string;
    is_manual: boolean;
    internal_wing: string | null;
    wing_position: string | null;
    wing_position_out: string | null;
  }>({
    item_code: "",
    height: "",
    width: "",
    engine_side: null,
    notes: "",
    field_notes: "",
    location: "",
    glyph: "",
    jamb_height: "",
    apartment_label: "",
    floor_label: "",
    contract_item: "",
    hinge_direction: null,
    mamad: null,
    depth: "",
    is_manual: false,
    internal_wing: null,
    wing_position: null,
    wing_position_out: null,
  });
  const [saving, setSaving] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    
    try {
      // First check project status and fetch metadata for export
      const { data: projectData, error: projectError } = await supabase
        .from('projects')
        .select('status, name, building_code, measurement_rule')
        .eq('id', projectId)
        .single();
      
      if (projectError) throw projectError;
      setProjectStatus(projectData?.status || 'active');
      setProjectMetadata({
        name: projectData?.name || '',
        building_code: projectData?.building_code,
        measurement_rule: projectData?.measurement_rule,
      });
      
      // Fetch locked floors for measurement projects
      
      // For active projects, fetch from items table
      if (projectData?.status === 'active') {
        const { data: itemsData, error: itemsError } = await supabase
          .from('items')
          .select(`
            id,
            item_code,
            location,
            opening_no,
            height,
            width,
            notes,
            field_notes,
            motor_side,
            floor_id,
            apt_id,
            floors(floor_code),
            apartments(apt_number)
          `)
          .eq('project_id', projectId)
          .order('floor_id, apt_id, opening_no');
        
        if (itemsError) throw itemsError;
        
        // Transform items to include floor_code and apt_number
        const transformedItems: ItemRow[] = (itemsData || []).map((item: any) => ({
          id: item.id,
          floor_id: item.floor_id,
          apt_id: item.apt_id,
          item_code: item.item_code,
          location: item.location,
          opening_no: item.opening_no,
          height: item.height,
          width: item.width,
          notes: item.notes,
          field_notes: item.field_notes,
          motor_side: item.motor_side,
          floor_code: item.floors?.floor_code,
          apt_number: item.apartments?.apt_number,
        }));
        
        setRows(transformedItems);
        setLastUpdated(new Date());
        
        // Extract unique floors and apartments
        const uniqueFloors = [...new Set(transformedItems.map(r => r.floor_code).filter(Boolean))] as string[];
        const uniqueApartments = [...new Set(transformedItems.map(r => r.apt_number).filter(Boolean))] as string[];
        // Floor sorting: קרקע/לובי come first (as floor 0), then numeric order
        setFloors(uniqueFloors.sort((a, b) => {
          const getOrder = (label: string) => {
            const lower = label.toLowerCase();
            if (lower.includes('קרקע') || lower.includes('לובי') || lower.includes('lobby') || lower.includes('ground')) return 0;
            return parseInt(label) || 999;
          };
          return getOrder(a) - getOrder(b);
        }));
        // Natural numeric sort for apartments (1, 2, 10 instead of 1, 10, 2)
        setApartments(uniqueApartments.sort((a, b) => a.localeCompare(b, 'he', { numeric: true })));
      } else {
        // For measurement projects, fetch from measurement_rows
        const { data, error: fetchError } = await supabase
          .from('measurement_rows')
          .select('*')
          .eq('project_id', projectId)
          .order('floor_label, apartment_label, opening_no');
        
        if (fetchError) throw fetchError;
        
        setRows(data || []);
        setLastUpdated(new Date());
        
        // Extract unique floors and apartments
        const uniqueFloors = [...new Set((data || []).map(r => r.floor_label).filter(Boolean))] as string[];
        const uniqueApartments = [...new Set((data || []).map(r => r.apartment_label).filter(Boolean))] as string[];
        // Floor sorting: קרקע/לובי come first (as floor 0), then numeric order
        setFloors(uniqueFloors.sort((a, b) => {
          const getOrder = (label: string) => {
            const lower = label.toLowerCase();
            if (lower.includes('קרקע') || lower.includes('לובי') || lower.includes('lobby') || lower.includes('ground')) return 0;
            return parseInt(label) || 999;
          };
          return getOrder(a) - getOrder(b);
        }));
        // Natural numeric sort for apartments (1, 2, 10 instead of 1, 10, 2)
        setApartments(uniqueApartments.sort((a, b) => a.localeCompare(b, 'he', { numeric: true })));
      }
      
    } catch (err: any) {
      console.error("Error fetching measurement data:", err);
      setError(err.message || "שגיאה בטעינת הנתונים");
    } finally {
      setLoading(false);
    }
  };


  // Get row floor/apartment labels
  const getRowFloorLabel = (row: MeasurementRow | ItemRow): string | null => {
    if ('floor_label' in row) {
      return row.floor_label;
    }
    return row.floor_code || null;
  };

  const getRowApartmentLabel = (row: MeasurementRow | ItemRow): string | null => {
    if ('apartment_label' in row) {
      return row.apartment_label;
    }
    return row.apt_number || null;
  };

  // Get row properties regardless of type - defined before filteredRows since it's used in sort
  const getRowField = (row: MeasurementRow | ItemRow, field: string): string | null => {
    if ('floor_label' in row) {
      // MeasurementRow
      switch (field) {
        case 'id': return row.id;
        case 'opening_no': return row.opening_no;
        case 'contract_item': return row.contract_item;
        case 'blind_jamb_item': return (row as any).blind_jamb_item || null;
        case 'item_code': return row.item_code;
        case 'location': return row.location_in_apartment;
        case 'height': return row.height;
        case 'width': return row.width;
        case 'engine_side': return row.engine_side;
        case 'notes': return row.notes;
        case 'field_notes': return row.field_notes;
        case 'glyph': return row.glyph;
        case 'jamb_height': return row.jamb_height;
        case 'hinge_direction': return row.hinge_direction;
        case 'mamad': return row.mamad;
        case 'depth': return row.depth;
        case 'is_manual': return row.is_manual ? 'כן' : null;
        case 'internal_wing': return row.internal_wing;
        case 'wing_position': return row.wing_position;
        case 'wing_position_out': return row.wing_position_out;
        default: return null;
      }
    } else {
      // ItemRow
      switch (field) {
        case 'id': return String(row.id);
        case 'opening_no': return row.opening_no;
        case 'contract_item': return (row as any).contract_item || null;
        case 'blind_jamb_item': return null;
        case 'item_code': return row.item_code;
        case 'location': return row.location;
        case 'height': return row.height;
        case 'width': return row.width;
        case 'engine_side': return row.motor_side;
        case 'notes': return row.notes;
        case 'field_notes': return row.field_notes;
        case 'glyph': return null;
        case 'jamb_height': return null;
        case 'hinge_direction': return (row as any).hinge_direction || null;
        case 'mamad': return (row as any).mamad || null;
        case 'depth': return (row as any).depth || null;
        case 'is_manual': return (row as any).is_manual ? 'כן' : null;
        case 'internal_wing': return null;
        case 'wing_position': return null;
        case 'wing_position_out': return null;
        default: return null;
      }
    }
  };

  // Filter rows based on selection
  const filteredRows = rows
    .filter(row => {
      const floorLabel = getRowFloorLabel(row);
      const aptLabel = getRowApartmentLabel(row);
      if (selectedFloor !== 'all' && floorLabel !== selectedFloor) return false;
      if (selectedApartment !== 'all' && aptLabel !== selectedApartment) return false;
      return true;
    })
    .sort((a, b) => {
      const aNum = parseInt(getRowField(a, 'opening_no') || '999999', 10);
      const bNum = parseInt(getRowField(b, 'opening_no') || '999999', 10);
      return aNum - bNum;
    });

  // Get apartments filtered by selected floor
  const filteredApartments = selectedFloor === 'all' 
    ? apartments 
    : [...new Set(rows.filter(r => getRowFloorLabel(r) === selectedFloor).map(r => getRowApartmentLabel(r)).filter(Boolean))] as string[];

  const getRowId = (row: MeasurementRow | ItemRow): string | number => {
    if ('floor_label' in row) {
      return row.id;
    }
    return row.id;
  };

  const startEditing = (row: MeasurementRow | ItemRow) => {
    setEditingRowId(getRowId(row));
    setEditValues({
      item_code: getRowField(row, 'item_code') || '',
      height: getRowField(row, 'height') || '',
      width: getRowField(row, 'width') || '',
      engine_side: getRowField(row, 'engine_side'),
      notes: getRowField(row, 'notes') || '',
      field_notes: getRowField(row, 'field_notes') || '',
      location: getRowField(row, 'location') || '',
      glyph: getRowField(row, 'glyph') || '',
      jamb_height: getRowField(row, 'jamb_height') || '',
      apartment_label: getRowApartmentLabel(row) || '',
      floor_label: getRowFloorLabel(row) || '',
      contract_item: getRowField(row, 'contract_item') || '',
      hinge_direction: getRowField(row, 'hinge_direction'),
      mamad: getRowField(row, 'mamad'),
      depth: getRowField(row, 'depth') || '',
      is_manual: getRowField(row, 'is_manual') === 'כן',
      internal_wing: getRowField(row, 'internal_wing'),
      wing_position: getRowField(row, 'wing_position'),
      wing_position_out: getRowField(row, 'wing_position_out'),
    });
  };

  const cancelEditing = () => {
    setEditingRowId(null);
    setEditValues({
      item_code: "",
      height: "",
      width: "",
      engine_side: null,
      notes: "",
      field_notes: "",
      location: "",
      glyph: "",
      jamb_height: "",
      apartment_label: "",
      floor_label: "",
      contract_item: "",
      hinge_direction: null,
      mamad: null,
      depth: "",
      is_manual: false,
      internal_wing: null,
      wing_position: null,
      wing_position_out: null,
    });
  };

  const saveEditing = async (row: MeasurementRow | ItemRow) => {
    const rowId = getRowId(row);
    setSaving(true);
    
    try {
      if (projectStatus === 'active') {
        const itemRow = row as ItemRow;
        const numericId = typeof rowId === 'number' ? rowId : parseInt(rowId as string);

        const nextAptLabelRaw = (editValues.apartment_label || "").trim();
        const currentAptLabelRaw = (itemRow.apt_number || "").trim();
        const nextFloorLabelRaw = (editValues.floor_label || "").trim();
        const currentFloorLabelRaw = (itemRow.floor_code || "").trim();

        let nextAptId: number | null | undefined = undefined;
        let nextAptLabel: string | null | undefined = undefined;
        let resolvedFloorId: number | null = itemRow.floor_id ?? null;
        let nextFloorCode: string | undefined = undefined;
        const floorChanged = nextFloorLabelRaw !== currentFloorLabelRaw && nextFloorLabelRaw !== "";

        // If floor changed, resolve/create new floor_id
        if (floorChanged) {
          const { data: existingFloor, error: floorErr } = await supabase
            .from('floors')
            .select('id')
            .eq('project_id', projectId)
            .eq('floor_code', nextFloorLabelRaw)
            .maybeSingle();
          if (floorErr) throw floorErr;

          if (existingFloor?.id) {
            resolvedFloorId = existingFloor.id;
          } else {
            const { data: createdFloor, error: createErr } = await supabase
              .from('floors')
              .insert({ project_id: projectId, floor_code: nextFloorLabelRaw })
              .select('id')
              .single();
            if (createErr) throw createErr;
            resolvedFloorId = createdFloor.id;
          }
          nextFloorCode = nextFloorLabelRaw;
        }

        // If apartment label changed or floor changed, update apartment assignment
        if (nextAptLabelRaw !== currentAptLabelRaw || floorChanged) {
          if (nextAptLabelRaw === "") {
            nextAptId = null;
            nextAptLabel = null;
          } else {
            if (!resolvedFloorId) {
              const floorCode = itemRow.floor_code || null;
              if (floorCode) {
                const { data: floorData, error: floorErr } = await supabase
                  .from('floors')
                  .select('id')
                  .eq('project_id', projectId)
                  .eq('floor_code', floorCode)
                  .maybeSingle();
                if (floorErr) throw floorErr;
                resolvedFloorId = floorData?.id ?? null;
              }
            }

            if (!resolvedFloorId) {
              throw new Error('Missing floor_id for apartment update');
            }

            const { data: existingApt, error: existingAptErr } = await supabase
              .from('apartments')
              .select('id')
              .eq('project_id', projectId)
              .eq('floor_id', resolvedFloorId)
              .eq('apt_number', nextAptLabelRaw)
              .maybeSingle();
            if (existingAptErr) throw existingAptErr;

            if (existingApt?.id) {
              nextAptId = existingApt.id;
            } else {
              const { data: createdApt, error: createdAptErr } = await supabase
                .from('apartments')
                .insert({
                  project_id: projectId,
                  floor_id: resolvedFloorId,
                  apt_number: nextAptLabelRaw,
                })
                .select('id')
                .single();
              if (createdAptErr) throw createdAptErr;
              nextAptId = createdApt.id;
            }
            nextAptLabel = nextAptLabelRaw;
          }
        }
        
        const updatePayload: Record<string, any> = {
          item_code: editValues.item_code || null,
          height: editValues.height || null,
          width: editValues.width || null,
          motor_side: editValues.engine_side || null,
          notes: editValues.notes || null,
          field_notes: editValues.field_notes || null,
          location: editValues.location || null,
        };

        if (resolvedFloorId && (floorChanged || nextAptId !== undefined)) {
          updatePayload.floor_id = resolvedFloorId;
        }
        if (nextAptId !== undefined) {
          updatePayload.apt_id = nextAptId;
        }

        const { error } = await supabase
          .from('items')
          .update(updatePayload)
          .eq('id', numericId);
        
        if (error) throw error;
        
        setRows(prev => prev.map(r => {
          if (getRowId(r) === rowId) {
            return {
              ...r,
              item_code: editValues.item_code,
              height: editValues.height || null,
              width: editValues.width || null,
              motor_side: editValues.engine_side,
              notes: editValues.notes || null,
              field_notes: editValues.field_notes || null,
              location: editValues.location || null,
              ...(nextFloorCode !== undefined ? { floor_code: nextFloorCode, floor_id: resolvedFloorId } : {}),
              ...(nextAptId !== undefined
                ? { apt_id: nextAptId, apt_number: nextAptLabel, floor_id: resolvedFloorId }
                : {}),
            } as ItemRow;
          }
          return r;
        }));

        if (nextAptLabel && !apartments.includes(nextAptLabel)) {
          setApartments(prev => [...prev, nextAptLabel!].sort((a, b) => a.localeCompare(b, 'he', { numeric: true })));
        }
        if (nextFloorCode && !floors.includes(nextFloorCode)) {
          setFloors(prev => [...prev, nextFloorCode!].sort((a, b) => {
            const getOrder = (label: string) => {
              const lower = label.toLowerCase();
              if (lower.includes('קרקע') || lower.includes('לובי')) return 0;
              return parseInt(label) || 999;
            };
            return getOrder(a) - getOrder(b);
          }));
        }
      } else {
        // rowId is a string (UUID) for measurement_rows
        const stringId = typeof rowId === 'string' ? rowId : String(rowId);
        
        // Update measurement_rows for measurement projects
        const { error } = await supabase
          .from('measurement_rows')
          .update({
            item_code: editValues.item_code || null,
            height: editValues.height || null,
            width: editValues.width || null,
            engine_side: editValues.engine_side || null,
            notes: editValues.notes || null,
            field_notes: editValues.field_notes || null,
            location_in_apartment: editValues.location || null,
            glyph: editValues.glyph || null,
            jamb_height: editValues.jamb_height || null,
            apartment_label: editValues.apartment_label || null,
            floor_label: editValues.floor_label || null,
            contract_item: editValues.contract_item || null,
            hinge_direction: editValues.hinge_direction || null,
            mamad: editValues.mamad || null,
            depth: editValues.depth || null,
            is_manual: editValues.is_manual,
            internal_wing: editValues.internal_wing || null,
            wing_position: editValues.wing_position || null,
            wing_position_out: editValues.wing_position_out || null,
          })
          .eq('id', stringId);
        
        if (error) throw error;
        
        // Update local state
        setRows(prev => prev.map(r => {
          if (getRowId(r) === rowId) {
            return {
              ...r,
              item_code: editValues.item_code,
              height: editValues.height || null,
              width: editValues.width || null,
              engine_side: editValues.engine_side,
              notes: editValues.notes || null,
              field_notes: editValues.field_notes || null,
              location_in_apartment: editValues.location || null,
              glyph: editValues.glyph || null,
              jamb_height: editValues.jamb_height || null,
              apartment_label: editValues.apartment_label || null,
              floor_label: editValues.floor_label || null,
              contract_item: editValues.contract_item || null,
              hinge_direction: editValues.hinge_direction || null,
              mamad: editValues.mamad || null,
              depth: editValues.depth || null,
              is_manual: editValues.is_manual,
              internal_wing: editValues.internal_wing || null,
              wing_position: editValues.wing_position || null,
              wing_position_out: editValues.wing_position_out || null,
            } as MeasurementRow;
          }
          return r;
        }));
        
        // Update apartments list if new apartment was added
        if (editValues.apartment_label && !apartments.includes(editValues.apartment_label)) {
          setApartments(prev => [...prev, editValues.apartment_label].sort((a, b) => a.localeCompare(b, 'he', { numeric: true })));
        }
        if (editValues.floor_label && !floors.includes(editValues.floor_label)) {
          setFloors(prev => [...prev, editValues.floor_label].sort((a, b) => {
            const getOrder = (label: string) => {
              const lower = label.toLowerCase();
              if (lower.includes('קרקע') || lower.includes('לובי')) return 0;
              return parseInt(label) || 999;
            };
            return getOrder(a) - getOrder(b);
          }));
        }
      }
      
      toast.success("השורה עודכנה בהצלחה");
      setEditingRowId(null);
      setLastUpdated(new Date());
    } catch (err: any) {
      console.error("Error saving row:", err);
      toast.error("שגיאה בשמירת השינויים");
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    fetchData();
    
    // Set up realtime subscription for items (active projects)
    const itemsChannel = supabase
      .channel(`items_${projectId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'items',
          filter: `project_id=eq.${projectId}`
        },
        () => {
          // Refetch on any change (only if not currently editing)
          if (!editingRowId) {
            fetchData();
          }
        }
      )
      .subscribe();
    
    // Set up realtime subscription for measurement_rows
    const measurementChannel = supabase
      .channel(`measurement_rows_${projectId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'measurement_rows',
          filter: `project_id=eq.${projectId}`
        },
        () => {
          // Refetch on any change
          if (!editingRowId) {
            fetchData();
          }
        }
      )
      .subscribe();
    
    return () => {
      supabase.removeChannel(itemsChannel);
      supabase.removeChannel(measurementChannel);
    };
  }, [projectId, editingRowId]);

  if (loading && rows.length === 0) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary ml-3" />
          <span className="text-muted-foreground">טוען נתוני מדידה...</span>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (rows.length === 0) {
    return (
      <Alert>
        <FileSpreadsheet className="h-4 w-4" />
        <AlertDescription>אין נתוני מדידה לפרויקט זה</AlertDescription>
      </Alert>
    );
  }

  const exportToCsv = () => {
    const headers = ['קומה', 'דירה', 'מיקום', 'פתח', 'פרט חוזה', 'פרט יצור', 'גובה', 'רוחב', 'גובה מהריצוף', 'ציר מבט מבפנים', 'ממד כיס בצד', 'גליף', 'עומק עד הפריקסט', 'מדרגה בשיש', 'מנואלה', 'מנוע', 'הערות', 'כנף פנימית מבט פנים', 'ציר מבט פנים פתיחה פנימה', 'ציר מבט פנים פתיחה החוצה'];
    const csvRows = [headers.join(',')];
    
    rows.forEach(row => {
      const floorLabel = getRowFloorLabel(row);
      const aptLabel = getRowApartmentLabel(row);
      
      const values = [
        floorLabel || '',
        aptLabel || '',
        getRowField(row, 'location') || '',
        getRowField(row, 'opening_no') || '',
        getRowField(row, 'contract_item') || '',
        getRowField(row, 'item_code') || '',
        getRowField(row, 'height') || '',
        getRowField(row, 'width') || '',
        (getRowField(row, 'notes') || '').replace(/,/g, ';'),
        getRowField(row, 'hinge_direction') || '',
        getRowField(row, 'mamad') || '',
        getRowField(row, 'glyph') || '',
        getRowField(row, 'depth') || '',
        getRowField(row, 'jamb_height') || '',
        getRowField(row, 'is_manual') || '',
        getRowField(row, 'engine_side') || '',
        (getRowField(row, 'field_notes') || '').replace(/,/g, ';'),
        getRowField(row, 'internal_wing') || '',
        getRowField(row, 'wing_position') || '',
        getRowField(row, 'wing_position_out') || '',
      ];
      csvRows.push(values.join(','));
    });
    
    const csvContent = '\uFEFF' + csvRows.join('\n'); // BOM for Hebrew
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `measurement_data_${projectId}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Export to Excel matching client template structure (ExcelJS with full styling)
  const exportToExcel = async () => {
    if (!projectMetadata) {
      toast.error('נתוני פרויקט לא נטענו');
      return;
    }

    try {
      await exportMeasurementToExcel({
        rows: filteredRows,
        project: projectMetadata,
        selectedFloor,
        selectedApartment,
        projectStatus,
      });
      toast.success('הקובץ הורד בהצלחה');
    } catch (err: any) {
      console.error('Export error:', err);
      toast.error('שגיאה בייצוא הקובץ');
    }
  };

  const toggleEditMode = () => {
    if (editMode) {
      cancelEditing();
    }
    setEditMode(!editMode);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="flex items-center gap-2 text-lg">
            <FileSpreadsheet className="h-5 w-5" />
            נתוני מדידה
          </CardTitle>
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant={editMode ? "default" : "outline"}
              size="sm"
              onClick={toggleEditMode}
            >
              <Pencil className="h-4 w-4 ml-1" />
              {editMode ? "סיום עריכה" : "עריכה"}
            </Button>
            <Button variant="outline" size="sm" onClick={exportToExcel}>
              <Download className="h-4 w-4 ml-1" />
              ייצוא Excel
            </Button>
            <Button variant="ghost" size="sm" onClick={exportToCsv}>
              <Download className="h-4 w-4 ml-1" />
              CSV
            </Button>
            {lastUpdated && (
              <span className="text-xs text-muted-foreground">
                עודכן: {lastUpdated.toLocaleTimeString('he-IL')}
              </span>
            )}
            <Button variant="ghost" size="sm" onClick={fetchData} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        
        
        {/* Floor and Apartment Filters */}
        <div className="flex flex-wrap gap-2 items-center mb-4" dir="rtl">
          <Select 
            value={selectedFloor} 
            onValueChange={(v) => { 
              setSelectedFloor(v); 
              setSelectedApartment('all'); 
            }}
          >
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="קומה" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">כל הקומות</SelectItem>
              {floors.map(f => (
                <SelectItem key={f} value={f}>
                  <span className="flex items-center gap-1">
                    {f === '0' ? 'קרקע' : `קומה ${f}`}
                  </span>
                </SelectItem>
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

          <Badge variant="secondary" className="text-xs mr-auto">
            {filteredRows.length} שורות
          </Badge>
        </div>

        {/* Data Table */}
        <div className="border rounded-lg overflow-hidden">
          <ScrollArea className="w-full">
            <div className="min-w-max" dir="rtl">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    <TableHead className="text-right text-xs font-medium w-16">קומה</TableHead>
                    <TableHead className="text-right text-xs font-medium w-16">דירה</TableHead>
                    <TableHead className="text-right text-xs font-medium w-16">מיקום</TableHead>
                    <TableHead className="text-right text-xs font-medium w-12">פתח</TableHead>
                    <TableHead className="text-right text-xs font-medium w-16">פרט חוזה</TableHead>
                    {projectStatus !== 'pre_contract' && projectStatus !== 'blind_jambs' && (
                      <TableHead className="text-right text-xs font-medium w-20">פרט יצור</TableHead>
                    )}
                    <TableHead className="text-center text-xs font-medium w-20">גובה</TableHead>
                    <TableHead className="text-center text-xs font-medium w-20">רוחב</TableHead>
                    <TableHead className="text-right text-xs font-medium min-w-[80px]">גובה מהריצוף</TableHead>
                    <TableHead className="text-center text-xs font-medium w-16">פרט משקופים</TableHead>
                    <TableHead className="text-center text-xs font-medium w-20">ממד כיס בצד</TableHead>
                    <TableHead className="text-center text-xs font-medium w-16">גליף</TableHead>
                    <TableHead className="text-center text-xs font-medium w-20">עומק עד הפריקסט</TableHead>
                    <TableHead className="text-center text-xs font-medium w-20">מדרגה בשיש</TableHead>
                    <TableHead className="text-center text-xs font-medium w-14">מנואלה</TableHead>
                    <TableHead className="text-center text-xs font-medium w-16">מנוע</TableHead>
                    <TableHead className="text-right text-xs font-medium min-w-[80px]">הערות</TableHead>
                    <TableHead className="text-center text-xs font-medium w-16">כנף פנימית</TableHead>
                    <TableHead className="text-center text-xs font-medium w-20">פתיחה פנימה</TableHead>
                    <TableHead className="text-center text-xs font-medium w-20">פתיחה החוצה</TableHead>
                    {editMode && (
                      <TableHead className="text-center text-xs font-medium w-20">פעולות</TableHead>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRows.map((row) => {
                    const rowId = getRowId(row);
                    const isEditing = editingRowId === rowId;
                    
                    return (
                      <TableRow key={rowId} className="hover:bg-muted/30">
                        {/* קומה */}
                        <TableCell className="text-right text-sm text-muted-foreground">
                          {isEditing ? (
                            <Select
                              value={editValues.floor_label}
                              onValueChange={(val) => setEditValues(prev => ({ ...prev, floor_label: val }))}
                            >
                              <SelectTrigger className="h-7 text-sm w-20">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {floors.map(f => (
                                  <SelectItem key={f} value={f}>
                                    {f === '0' ? 'קרקע' : f}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            getRowFloorLabel(row) === '0' ? 'קרקע' : getRowFloorLabel(row) || '-'
                          )}
                        </TableCell>
                        {/* דירה */}
                        <TableCell className="text-right text-sm text-muted-foreground">
                          {isEditing ? (
                            <Input
                              value={editValues.apartment_label}
                              onChange={(e) => setEditValues(prev => ({ ...prev, apartment_label: e.target.value }))}
                              className="h-7 text-sm w-16"
                            />
                          ) : (
                            getRowApartmentLabel(row) || '-'
                          )}
                        </TableCell>
                        {/* מיקום */}
                        <TableCell className="text-right text-sm text-muted-foreground">
                          {isEditing ? (
                            <Input
                              value={editValues.location}
                              onChange={(e) => setEditValues(prev => ({ ...prev, location: e.target.value }))}
                              className="h-7 text-sm w-16"
                            />
                          ) : (
                            getRowField(row, 'location') || '-'
                          )}
                        </TableCell>
                        {/* פתח */}
                        <TableCell className="text-right text-sm font-medium">
                          {getRowField(row, 'opening_no') || '-'}
                        </TableCell>
                        {/* פרט חוזה */}
                        <TableCell className="text-right text-sm">
                          {isEditing ? (
                            <Input
                              value={editValues.contract_item}
                              onChange={(e) => setEditValues(prev => ({ ...prev, contract_item: e.target.value }))}
                              className="h-7 text-sm w-16"
                            />
                          ) : (
                            getRowField(row, 'contract_item') || '-'
                          )}
                        </TableCell>
                        {/* פרט יצור */}
                        <TableCell className="text-right text-sm">
                          {isEditing ? (
                            <Input
                              value={editValues.item_code}
                              onChange={(e) => setEditValues(prev => ({ ...prev, item_code: e.target.value }))}
                              className="h-7 text-sm w-20"
                            />
                          ) : (
                            getRowField(row, 'item_code') || '-'
                          )}
                        </TableCell>
                        {/* גובה */}
                        <TableCell className="text-center text-sm font-medium">
                          {isEditing ? (
                            <Input
                              value={editValues.height}
                              onChange={(e) => setEditValues(prev => ({ ...prev, height: e.target.value }))}
                              className="h-7 text-sm w-20 text-center"
                              inputMode="tel"
                            />
                          ) : (
                            getRowField(row, 'height') || '-'
                          )}
                        </TableCell>
                        {/* רוחב */}
                        <TableCell className="text-center text-sm font-medium">
                          {isEditing ? (
                            <Input
                              value={editValues.width}
                              onChange={(e) => setEditValues(prev => ({ ...prev, width: e.target.value }))}
                              className="h-7 text-sm w-20 text-center"
                              inputMode="tel"
                            />
                          ) : (
                            getRowField(row, 'width') || '-'
                          )}
                        </TableCell>
                        {/* גובה מהריצוף */}
                        <TableCell className="text-right text-xs text-muted-foreground">
                          {isEditing ? (
                            <Input
                              value={editValues.notes}
                              onChange={(e) => setEditValues(prev => ({ ...prev, notes: e.target.value }))}
                              className="h-7 text-xs min-w-[60px]"
                            />
                          ) : (
                            getRowField(row, 'notes') || '-'
                          )}
                        </TableCell>
                        {/* פרט משקופים */}
                        <TableCell className="text-center text-sm">
                          {isEditing ? (
                            <Input
                              value={(editValues as any).blind_jamb_item || ''}
                              onChange={(e) => setEditValues(prev => ({ ...prev, blind_jamb_item: e.target.value || null } as any))}
                              className="h-7 text-sm w-16"
                            />
                          ) : (
                            getRowField(row, 'blind_jamb_item') || '-'
                          )}
                        </TableCell>
                        {/* ממד כיס בצד */}
                        <TableCell className="text-center text-sm">
                          {isEditing ? (
                            <Select
                              value={editValues.mamad || "none"}
                              onValueChange={(val) => setEditValues(prev => ({ ...prev, mamad: val === "none" ? null : val }))}
                            >
                              <SelectTrigger className="h-7 text-xs w-16">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">—</SelectItem>
                                <SelectItem value="☒☐">☒☐</SelectItem>
                                <SelectItem value="☐☒">☐☒</SelectItem>
                                <SelectItem value="☒☐☒">☒☐☒</SelectItem>
                              </SelectContent>
                            </Select>
                          ) : (
                            getRowField(row, 'mamad') || '-'
                          )}
                        </TableCell>
                        {/* גליף */}
                        <TableCell className="text-center text-sm">
                          {isEditing ? (
                            <Input
                              value={editValues.glyph}
                              onChange={(e) => setEditValues(prev => ({ ...prev, glyph: e.target.value }))}
                              className="h-7 text-sm w-16 text-center"
                              inputMode="tel"
                            />
                          ) : (
                            getRowField(row, 'glyph') || '-'
                          )}
                        </TableCell>
                        {/* עומק עד הפריקסט */}
                        <TableCell className="text-center text-sm">
                          {isEditing ? (
                            <Input
                              value={editValues.depth}
                              onChange={(e) => setEditValues(prev => ({ ...prev, depth: e.target.value }))}
                              className="h-7 text-sm w-16 text-center"
                              inputMode="tel"
                            />
                          ) : (
                            getRowField(row, 'depth') || '-'
                          )}
                        </TableCell>
                        {/* מדרגה בשיש */}
                        <TableCell className="text-center text-sm">
                          {isEditing ? (
                            <Input
                              value={editValues.jamb_height}
                              onChange={(e) => setEditValues(prev => ({ ...prev, jamb_height: e.target.value }))}
                              className="h-7 text-sm w-20 text-center"
                              inputMode="tel"
                            />
                          ) : (
                            getRowField(row, 'jamb_height') || '-'
                          )}
                        </TableCell>
                        {/* מנואלה */}
                        <TableCell className="text-center text-sm">
                          {isEditing ? (
                            <input
                              type="checkbox"
                              checked={editValues.is_manual}
                              onChange={(e) => setEditValues(prev => ({ ...prev, is_manual: e.target.checked }))}
                              className="h-4 w-4 rounded border-border"
                            />
                          ) : (
                            getRowField(row, 'is_manual') || '-'
                          )}
                        </TableCell>
                        {/* מנוע */}
                        <TableCell className="text-center text-sm">
                          {isEditing ? (
                            <Select
                              value={editValues.engine_side || "none"}
                              onValueChange={(val) => setEditValues(prev => ({ 
                                ...prev, 
                                engine_side: val === "none" ? null : val 
                              }))}
                            >
                              <SelectTrigger className="h-7 text-sm w-16">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">—</SelectItem>
                                <SelectItem value="L">L</SelectItem>
                                <SelectItem value="R">R</SelectItem>
                              </SelectContent>
                            </Select>
                          ) : (
                            getRowField(row, 'engine_side') || '-'
                          )}
                        </TableCell>
                        {/* הערות */}
                        <TableCell className="text-right text-xs text-muted-foreground">
                          {isEditing ? (
                            <Input
                              value={editValues.field_notes}
                              onChange={(e) => setEditValues(prev => ({ ...prev, field_notes: e.target.value }))}
                              className="h-7 text-xs min-w-[60px]"
                            />
                          ) : (
                            getRowField(row, 'field_notes') || '-'
                          )}
                        </TableCell>
                        {/* כנף פנימית */}
                        <TableCell className="text-center text-sm">
                          {isEditing ? (
                            <Select
                              value={editValues.internal_wing || "none"}
                              onValueChange={(val) => setEditValues(prev => ({ ...prev, internal_wing: val === "none" ? null : val }))}
                            >
                              <SelectTrigger className="h-7 text-sm w-14">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">—</SelectItem>
                                <SelectItem value="R">ימין</SelectItem>
                                <SelectItem value="L">שמאל</SelectItem>
                              </SelectContent>
                            </Select>
                          ) : (
                            getRowField(row, 'internal_wing') || '-'
                          )}
                        </TableCell>
                        {/* מיקום כנף */}
                        <TableCell className="text-center text-sm">
                          {isEditing ? (
                            <Input
                              value={editValues.wing_position || ''}
                              onChange={(e) => setEditValues(prev => ({ ...prev, wing_position: e.target.value || null }))}
                              className="h-7 text-xs w-14"
                            />
                          ) : (
                            getRowField(row, 'wing_position') || '-'
                          )}
                        </TableCell>
                        {/* ציר מבט פנים פתיחה החוצה */}
                        <TableCell className="text-center text-sm">
                          {isEditing ? (
                            <Input
                              value={editValues.wing_position_out || ''}
                              onChange={(e) => setEditValues(prev => ({ ...prev, wing_position_out: e.target.value || null }))}
                              className="h-7 text-xs w-14"
                            />
                          ) : (
                            getRowField(row, 'wing_position_out') || '-'
                          )}
                        </TableCell>
                        {editMode && (
                          <TableCell className="text-center">
                            {isEditing ? (
                              <div className="flex items-center justify-center gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  onClick={() => saveEditing(row)}
                                  disabled={saving}
                                >
                                  {saving ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <Check className="h-4 w-4 text-green-600" />
                                  )}
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  onClick={cancelEditing}
                                  disabled={saving}
                                >
                                  <X className="h-4 w-4 text-red-600" />
                                </Button>
                              </div>
                            ) : (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => startEditing(row)}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                            )}
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        </div>
        
        <p className="text-xs text-muted-foreground mt-4 text-center">
          סה"כ {rows.length} שורות ב-{floors.length} קומות
          {projectStatus === 'active' && (
            <span className="mr-2">(מקושר לטבלת פריטים)</span>
          )}
        </p>
      </CardContent>
    </Card>
  );
});

MeasurementDataViewer.displayName = 'MeasurementDataViewer';

export default MeasurementDataViewer;
