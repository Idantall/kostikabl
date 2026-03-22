import { useEffect, useState, useMemo } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ArrowRight, Download, Loader2, Filter, Pencil, Check, X, Printer, Tag, ChevronDown, ChevronUp, Eye, Grid3X3, List } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AllocationGrid } from "@/components/allocation/AllocationGrid";
interface SummaryRow {
  normalizedItemCode: string;
  normalizedSide: string | null;
  displaySide: string;
  pocketType: string | null;
  specialDesignation: string | null;
  qty: number;
  width: string | null;
  height: string | null;
  itemIds: number[];
  minOpeningNo: number;
  notes: string | null;
  fieldNotes: string | null;
  location: string | null;
  openingNo: string | null;
  itemType: string | null;
  contractItem: string | null;
  hingeDirection: string | null;
  depth: string | null;
  mamad: string | null;
  isManual: boolean;
}

interface ItemData {
  id: number;
  item_code: string;
  motor_side: string | null;
  width: string | null;
  height: string | null;
  floor_id: number | null;
  apt_id: number | null;
  opening_no: string | null;
  notes: string | null;
  field_notes: string | null;
  location: string | null;
  item_type: string | null;
  contract_item: string | null;
  hinge_direction: string | null;
  depth: string | null;
  mamad: string | null;
  is_manual: boolean;
}

interface FloorData {
  id: number;
  floor_code: string;
}

interface ApartmentData {
  id: number;
  apt_number: string;
  floor_id: number;
}

// Normalize item_code: trim only - keep asterisks to separate "a7" from "a7*"
const normalizeItemCode = (raw: string): string => {
  return raw.trim();
};

// Normalize engine side: trim, uppercase, only allow L/R
const normalizeSide = (raw: string | null | undefined): string | null => {
  if (!raw) return null;
  const trimmed = raw.trim().toUpperCase();
  if (trimmed === "") return null;
  if (trimmed === "L" || trimmed === "LEFT" || trimmed === "שמאל") return "L";
  if (trimmed === "R" || trimmed === "RIGHT" || trimmed === "ימין") return "R";
  if (trimmed === "L" || trimmed === "R") return trimmed;
  return null;
};

// Extract pocket type from notes (for side column)
const extractPocketType = (notes: string | null): string | null => {
  if (!notes) return null;
  const n = notes.trim();
  
  // Order matters: check for triple first
  if (n.includes("☒☐☒")) return "כיס כפול";
  if (n.includes("☐☒")) return "כיס שמאל";
  if (n.includes("☒☐")) return "כיס ימין";
  
  return null;
};

// Extract special designation from notes/item_type for separate grouping
// This captures any meaningful text that should be displayed with the item code
// Excludes "אחר" since it's the most common type and not meaningful
const extractSpecialDesignation = (notes: string | null, itemType: string | null): string | null => {
  // First check item_type - if it has meaningful content, use it
  if (itemType && itemType.trim()) {
    const trimmedType = itemType.trim();
    // Skip "אחר" as it's the default/most common type - check both exact match and includes
    if (trimmedType === 'אחר' || trimmedType.includes('אחר')) {
      return null;
    }
    // Return item_type if it's not just whitespace
    if (trimmedType.length > 0) {
      return trimmedType;
    }
  }
  
  // Then check notes for special designations
  if (notes && notes.trim()) {
    const combined = notes.trim();
    
    // Check for known special designations (case insensitive for Hebrew)
    // חילוץ variants
    if (combined.includes("ח.חילוץ") || combined.includes("ח. חילוץ") || 
        combined.includes("חלון חילוץ") || combined.includes("חילוץ")) {
      return "חילוץ";
    }
    
    // מנואלה
    if (combined.includes("מנואלה")) {
      return "מנואלה";
    }
  }
  
  return null;
};

// Format notes for display - only show text, remove checkbox patterns
const formatNotes = (notes: string | null): string | null => {
  if (!notes) return null;
  
  let n = notes.trim();
  
  // Remove checkbox patterns - order matters
  n = n.replace(/☒☐☒/g, "").replace(/☒☐/g, "").replace(/☐☒/g, "").trim();
  
  // Return null if empty after removing patterns
  if (!n) return null;
  
  return n;
};

const ProjectItemsSummary = () => {
  const navigate = useNavigate();
  const { projectId } = useParams();
  const [loading, setLoading] = useState(true);
  const [project, setProject] = useState<{ name: string; building_code: string | null; status?: string } | null>(null);
  const [allItems, setAllItems] = useState<ItemData[]>([]);
  const [floors, setFloors] = useState<FloorData[]>([]);
  const [apartments, setApartments] = useState<ApartmentData[]>([]);
  const [exporting, setExporting] = useState(false);
  
  // Filter state
  const [selectedFloors, setSelectedFloors] = useState<Set<number>>(new Set());
  const [selectedApartments, setSelectedApartments] = useState<Set<number>>(new Set());
  const [filterOpen, setFilterOpen] = useState(false);

  // Edit mode state
  const [editMode, setEditMode] = useState(false);
  const [editingRowKey, setEditingRowKey] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<{ itemCode: string; motorSide: string | null; height: string; width: string }>({
    itemCode: "",
    motorSide: null,
    height: "",
    width: "",
  });
  const [saving, setSaving] = useState(false);

  // Label printing state
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [labelDialogOpen, setLabelDialogOpen] = useState(false);
  const [labelMode, setLabelMode] = useState<'load_roll_100x50' | 'install_two_up_roll'>('load_roll_100x50');
  const [generating, setGenerating] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [progress, setProgress] = useState({ done: 0, total: 0, percent: 0, status: 'idle' });

  // Items detail popup state
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [detailRow, setDetailRow] = useState<SummaryRow | null>(null);
  const [detailItems, setDetailItems] = useState<ItemData[]>([]);
  const [editingDetailId, setEditingDetailId] = useState<number | null>(null);
  const [detailEditValues, setDetailEditValues] = useState<{ itemCode: string; motorSide: string | null; height: string; width: string; location: string }>({
    itemCode: "",
    motorSide: null,
    height: "",
    width: "",
    location: "",
  });
  const [savingDetail, setSavingDetail] = useState(false);

  // Active tab state
  const [activeTab, setActiveTab] = useState<"summary" | "allocation">("summary");

  // Measurement mode: store raw measurement row IDs for edits
  const [measurementRowMap, setMeasurementRowMap] = useState<Map<number, string>>(new Map());
  

  const isMeasurementMode = project?.status === 'measurement' || project?.status === 'pre_contract' || project?.status === 'blind_jambs';

  useEffect(() => {
    const checkUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate("/login");
        return;
      }
      await fetchData();
      setLoading(false);
    };
    checkUser();
  }, [navigate, projectId]);

  const fetchData = async () => {
    if (!projectId) return;

    const { data: projectData } = await supabase
      .from("projects")
      .select("name, building_code, status")
      .eq("id", parseInt(projectId))
      .single();
    
    if (projectData) {
      setProject(projectData);
    }

    const projectStatus = projectData?.status;
    const isMeasurement = projectStatus === 'measurement' || projectStatus === 'pre_contract' || projectStatus === 'blind_jambs';

    if (isMeasurement) {
      await fetchMeasurementData();
    } else {
      await fetchActiveData();
    }
  };

  const fetchMeasurementData = async () => {
    if (!projectId) return;

    // Fetch all measurement rows
    let rawRows: any[] = [];
    let from = 0;
    const chunkSize = 1000;
    
    while (true) {
      const { data, error } = await supabase
        .from("measurement_rows")
        .select("id, item_code, engine_side, width, height, opening_no, notes, field_notes, floor_label, apartment_label, location_in_apartment, contract_item, hinge_direction, depth, mamad, is_manual")
        .eq("project_id", parseInt(projectId))
        .range(from, from + chunkSize - 1);
      
      if (error) {
        toast.error("שגיאה בטעינת נתונים");
        break;
      }
      if (!data || data.length === 0) break;
      rawRows = [...rawRows, ...data];
      if (data.length < chunkSize) break;
      from += chunkSize;
    }

    // Build synthetic floor and apartment structures from labels
    const floorLabelSet = new Set<string>();
    const aptLabelMap = new Map<string, Set<string>>(); // floor -> apartments

    rawRows.forEach(r => {
      if (r.floor_label) {
        floorLabelSet.add(r.floor_label);
        if (r.apartment_label) {
          if (!aptLabelMap.has(r.floor_label)) aptLabelMap.set(r.floor_label, new Set());
          aptLabelMap.get(r.floor_label)!.add(r.apartment_label);
        }
      }
    });

    // Create synthetic floors with stable IDs (hash-based)
    const floorLabels = [...floorLabelSet].sort((a, b) => {
      const getOrder = (label: string) => {
        const lower = label.toLowerCase();
        if (lower.includes('קרקע') || lower.includes('לובי')) return 0;
        // Hebrew-style negative: "1-", "2-", "3-"
        const negMatch = label.match(/^(\d+)\s*-$/);
        if (negMatch) return -parseInt(negMatch[1]);
        const num = parseInt(label);
        return isNaN(num) ? 999 : num;
      };
      return getOrder(a) - getOrder(b);
    });

    let nextFloorId = 100000;
    let nextAptId = 200000;
    const floorIdMap = new Map<string, number>();
    const aptIdMap = new Map<string, number>(); // "floor|apt" -> id
    
    const syntheticFloors: FloorData[] = floorLabels.map(label => {
      const id = nextFloorId++;
      floorIdMap.set(label, id);
      return { id, floor_code: label };
    });

    const syntheticApartments: ApartmentData[] = [];
    floorLabels.forEach(floorLabel => {
      const apts = aptLabelMap.get(floorLabel);
      if (!apts) return;
      [...apts].sort((a, b) => a.localeCompare(b, 'he', { numeric: true })).forEach(aptLabel => {
        const id = nextAptId++;
        const key = `${floorLabel}|${aptLabel}`;
        aptIdMap.set(key, id);
        syntheticApartments.push({
          id,
          apt_number: aptLabel,
          floor_id: floorIdMap.get(floorLabel)!,
        });
      });
    });

    // Map measurement rows to ItemData format
    const idToMeasurementId = new Map<number, string>();
    let nextItemId = 300000;
    const items: ItemData[] = rawRows.map(r => {
      const syntheticId = nextItemId++;
      idToMeasurementId.set(syntheticId, r.id);
      const floorId = r.floor_label ? floorIdMap.get(r.floor_label) ?? null : null;
      const aptKey = r.floor_label && r.apartment_label ? `${r.floor_label}|${r.apartment_label}` : null;
      const aptId = aptKey ? aptIdMap.get(aptKey) ?? null : null;
      
      return {
        id: syntheticId,
        item_code: r.item_code || '',
        motor_side: r.engine_side,
        width: r.width,
        height: r.height,
        floor_id: floorId,
        apt_id: aptId,
        opening_no: r.opening_no,
        notes: r.notes,
        field_notes: r.field_notes,
        location: r.location_in_apartment,
        item_type: null,
        contract_item: r.contract_item,
        hinge_direction: r.hinge_direction,
        depth: r.depth,
        mamad: r.mamad,
        is_manual: r.is_manual,
      };
    });


    setMeasurementRowMap(idToMeasurementId);
    setFloors(syntheticFloors);
    setApartments(syntheticApartments);
    setAllItems(items);
  };

  const fetchActiveData = async () => {
    if (!projectId) return;

    const { data: floorsData } = await supabase
      .from("floors")
      .select("id, floor_code")
      .eq("project_id", parseInt(projectId))
      .order("floor_code");
    
    if (floorsData) {
      setFloors(floorsData);
    }

    const { data: apartmentsData } = await supabase
      .from("apartments")
      .select("id, apt_number, floor_id")
      .eq("project_id", parseInt(projectId))
      .order("apt_number");
    
    if (apartmentsData) {
      setApartments(apartmentsData);
    }

    // Fetch all items for this project in chunks of 1000
    let items: ItemData[] = [];
    let from = 0;
    const chunkSize = 1000;
    
    while (true) {
      const { data, error } = await supabase
        .from("items")
        .select("id, item_code, motor_side, width, height, floor_id, apt_id, opening_no, notes, field_notes, location, item_type, contract_item, hinge_direction, depth, mamad, is_manual")
        .eq("project_id", parseInt(projectId))
        .range(from, from + chunkSize - 1);
      
      if (error) {
        toast.error("שגיאה בטעינת נתונים");
        break;
      }
      
      if (!data || data.length === 0) break;
      items = [...items, ...data];
      
      if (data.length < chunkSize) break;
      from += chunkSize;
    }

    setAllItems(items);
  };

  // Filter apartments based on selected floors
  const filteredApartments = useMemo(() => {
    if (selectedFloors.size === 0) return apartments;
    return apartments.filter(apt => selectedFloors.has(apt.floor_id));
  }, [apartments, selectedFloors]);

  // Filter items based on selection
  const filteredItems = useMemo(() => {
    if (selectedApartments.size > 0) {
      return allItems.filter(item => item.apt_id && selectedApartments.has(item.apt_id));
    }
    if (selectedFloors.size > 0) {
      return allItems.filter(item => item.floor_id && selectedFloors.has(item.floor_id));
    }
    return allItems;
  }, [allItems, selectedFloors, selectedApartments]);

  // Calculate summary rows from filtered items
  const summaryRows = useMemo(() => {
    const groupMap = new Map<string, { 
      qty: number; 
      width: string | null; 
      height: string | null; 
      itemIds: number[]; 
      minOpeningNo: number; 
      notes: string | null; 
      fieldNotes: string | null;
      location: string | null;
      openingNo: string | null;
      itemType: string | null;
      contractItem: string | null;
      hingeDirection: string | null;
      depth: string | null;
      mamad: string | null;
      isManual: boolean;
    }>();
    
    for (const item of filteredItems) {
      if (!item.item_code || item.item_code.trim() === "") continue;
      
      const normCode = normalizeItemCode(item.item_code);
      const normSide = normalizeSide(item.motor_side);
      const specialDesig = extractSpecialDesignation(item.notes, item.item_type);
      const key = `${normCode}|||${normSide ?? "NULL"}|||${specialDesig ?? "NULL"}`;
      
      const openingNum = item.opening_no ? parseInt(item.opening_no, 10) : Infinity;
      const validOpeningNum = isNaN(openingNum) ? Infinity : openingNum;
      
      const existing = groupMap.get(key);
      if (existing) {
        existing.qty += 1;
        existing.itemIds.push(item.id);
        if (!existing.width && item.width) existing.width = item.width;
        if (!existing.height && item.height) existing.height = item.height;
        if (!existing.notes && item.notes) existing.notes = item.notes;
        if (!existing.fieldNotes && item.field_notes) existing.fieldNotes = item.field_notes;
        if (!existing.location && item.location) existing.location = item.location;
        if (!existing.openingNo && item.opening_no) existing.openingNo = item.opening_no;
        if (!existing.itemType && item.item_type) existing.itemType = item.item_type;
        if (!existing.contractItem && item.contract_item) existing.contractItem = item.contract_item;
        if (!existing.hingeDirection && item.hinge_direction) existing.hingeDirection = item.hinge_direction;
        if (!existing.depth && item.depth) existing.depth = item.depth;
        if (!existing.mamad && item.mamad) existing.mamad = item.mamad;
        if (item.is_manual) existing.isManual = true;
        if (validOpeningNum < existing.minOpeningNo) existing.minOpeningNo = validOpeningNum;
      } else {
        groupMap.set(key, { 
          qty: 1, 
          width: item.width, 
          height: item.height, 
          itemIds: [item.id], 
          minOpeningNo: validOpeningNum, 
          notes: item.notes, 
          fieldNotes: item.field_notes,
          location: item.location,
          openingNo: item.opening_no,
          itemType: item.item_type,
          contractItem: item.contract_item,
          hingeDirection: item.hinge_direction,
          depth: item.depth,
          mamad: item.mamad,
          isManual: item.is_manual,
        });
      }
    }

    const rows: SummaryRow[] = [];
    groupMap.forEach((data, key) => {
      const parts = key.split("|||");
      const normCode = parts[0];
      const sideStr = parts[1];
      const specialDesigStr = parts[2];
      const normSide = sideStr === "NULL" ? null : sideStr;
      const specialDesig = specialDesigStr === "NULL" ? null : specialDesigStr;
      const pocketType = extractPocketType(data.notes);
      rows.push({
        normalizedItemCode: normCode,
        normalizedSide: normSide,
        displaySide: normSide ?? "—",
        pocketType,
        specialDesignation: specialDesig,
        qty: data.qty,
        width: data.width,
        height: data.height,
        itemIds: data.itemIds,
        minOpeningNo: data.minOpeningNo,
        notes: data.notes,
        fieldNotes: data.fieldNotes,
        location: data.location,
        openingNo: data.openingNo,
        itemType: data.itemType,
        contractItem: data.contractItem,
        hingeDirection: data.hingeDirection,
        depth: data.depth,
        mamad: data.mamad,
        isManual: data.isManual,
      });
    });

    // Sorting: when filtered by apartment, sort by opening number (מס פתח) ascending
    // Otherwise, sort by item code (letters first, then numbers)
    const isApartmentFiltered = selectedApartments.size > 0;
    
    rows.sort((a, b) => {
      if (isApartmentFiltered) {
        // Primary sort by opening number when apartment is selected
        if (a.minOpeningNo !== b.minOpeningNo) {
          return a.minOpeningNo - b.minOpeningNo;
        }
        // Secondary: by item code
        const codeCompare = a.normalizedItemCode.localeCompare(b.normalizedItemCode, "he", { numeric: true });
        if (codeCompare !== 0) return codeCompare;
      } else {
        // General view: sort by item code (letters first, then alphanumeric, then pure numbers)
        const codeA = a.normalizedItemCode;
        const codeB = b.normalizedItemCode;
        
        const startsWithLetterA = /^[A-Za-zא-ת]/.test(codeA);
        const startsWithLetterB = /^[A-Za-zא-ת]/.test(codeB);
        
        if (startsWithLetterA && !startsWithLetterB) return -1;
        if (!startsWithLetterA && startsWithLetterB) return 1;
        
        const codeCompare = codeA.localeCompare(codeB, "he", { numeric: true });
        if (codeCompare !== 0) return codeCompare;
      }
      
      // Tertiary: sort by side
      const sideOrder = (s: string | null) => {
        if (s === "L") return 0;
        if (s === "R") return 1;
        return 2;
      };
      return sideOrder(a.normalizedSide) - sideOrder(b.normalizedSide);
    });

    return rows;
  }, [filteredItems, selectedApartments.size]);

  const handleFloorToggle = (floorId: number) => {
    setSelectedFloors(prev => {
      const next = new Set(prev);
      if (next.has(floorId)) {
        next.delete(floorId);
        setSelectedApartments(prevApts => {
          const nextApts = new Set(prevApts);
          apartments.filter(apt => apt.floor_id === floorId).forEach(apt => nextApts.delete(apt.id));
          return nextApts;
        });
      } else {
        next.add(floorId);
      }
      return next;
    });
  };

  const handleApartmentToggle = (aptId: number) => {
    setSelectedApartments(prev => {
      const next = new Set(prev);
      if (next.has(aptId)) {
        next.delete(aptId);
      } else {
        next.add(aptId);
      }
      return next;
    });
  };

  const clearFilters = () => {
    setSelectedFloors(new Set());
    setSelectedApartments(new Set());
  };

  const exportCSV = (mode: 'summary' | 'detailed' = 'summary') => {
    if (mode === 'detailed') {
      return exportDetailedCSV();
    }

    if (summaryRows.length === 0) {
      toast.error("אין נתונים לייצוא");
      return;
    }

    setExporting(true);
    try {
      const BOM = "\uFEFF";
      const headers = "מס' פרט,צד,גובה,רוחב,עומק,כמות,מיקום,מס' פתח,פרט חוזה,כיוון ציר,ממד,מנואלה,סוג פריט,הערות,הערות מהשטח";
      const csvRows = summaryRows.map(row => {
        const sideDisplay = row.pocketType ? `${row.displaySide} (${row.pocketType})` : row.displaySide;
        const itemCodeDisplay = row.specialDesignation 
          ? `${row.normalizedItemCode} (${row.specialDesignation})`
          : row.normalizedItemCode;
        return `${itemCodeDisplay},${sideDisplay},${row.height ?? ""},${row.width ?? ""},${row.depth ?? ""},${row.qty},${row.location ?? ""},${row.openingNo ?? ""},${row.contractItem ?? ""},${row.hingeDirection ?? ""},${row.mamad ?? ""},${row.isManual ? "כן" : ""},${row.itemType ?? ""},${row.notes ?? ""},${row.fieldNotes ?? ""}`;
      });
      const csvContent = BOM + headers + "\n" + csvRows.join("\n");

      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const date = new Date().toISOString().split("T")[0];
      a.href = url;
      a.download = `${project?.name || "project"}-items-summary-${date}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      toast.success("הקובץ הורד בהצלחה");
    } catch (error) {
      toast.error("שגיאה בייצוא");
    } finally {
      setExporting(false);
    }
  };

  const exportDetailedCSV = () => {
    if (filteredItems.length === 0) {
      toast.error("אין נתונים לייצוא");
      return;
    }

    setExporting(true);
    try {
      const BOM = "\uFEFF";
      
      // Build reverse maps: floor_id -> label, apt_id -> label
      const floorIdToLabel = new Map<number, string>();
      floors.forEach(f => floorIdToLabel.set(f.id, f.floor_code));
      
      const aptIdToLabel = new Map<number, string>();
      apartments.forEach(a => aptIdToLabel.set(a.id, a.apt_number));

      const escapeCSV = (val: string | null | undefined) => {
        if (!val) return "";
        // Escape quotes and wrap in quotes if contains comma/quote/newline
        if (val.includes(',') || val.includes('"') || val.includes('\n')) {
          return `"${val.replace(/"/g, '""')}"`;
        }
        return val;
      };

      const headers = "קומה,דירה,מס' פתח,פרט יצור,צד מנוע,גובה,רוחב,עומק עד הפריקסט,מיקום,פרט חוזה,ציר מבט מבפנים,ממד כיס בצד,גליף,מדרגה בשיש,מנואלה,גובה מהריצוף,הערות,כנף פנימית מבט פנים";
      
      // Sort items by floor, then apartment, then opening number
      const sortedItems = [...filteredItems].sort((a, b) => {
        const floorA = a.floor_id ? (floorIdToLabel.get(a.floor_id) || '') : '';
        const floorB = b.floor_id ? (floorIdToLabel.get(b.floor_id) || '') : '';
        
        const getFloorNum = (label: string) => {
          if (label.includes('קרקע') || label.includes('לובי')) return 0;
          const negMatch = label.match(/^(\d+)\s*-$/);
          if (negMatch) return -parseInt(negMatch[1]);
          const num = parseInt(label);
          return isNaN(num) ? 999 : num;
        };
        
        const floorDiff = getFloorNum(floorA) - getFloorNum(floorB);
        if (floorDiff !== 0) return floorDiff;
        
        const aptA = a.apt_id ? (aptIdToLabel.get(a.apt_id) || '') : '';
        const aptB = b.apt_id ? (aptIdToLabel.get(b.apt_id) || '') : '';
        const aptDiff = aptA.localeCompare(aptB, 'he', { numeric: true });
        if (aptDiff !== 0) return aptDiff;
        
        const openA = parseInt(a.opening_no || '999') || 999;
        const openB = parseInt(b.opening_no || '999') || 999;
        return openA - openB;
      });

      const csvRows = sortedItems.map(item => {
        const floorLabel = item.floor_id ? (floorIdToLabel.get(item.floor_id) || '') : '';
        const aptLabel = item.apt_id ? (aptIdToLabel.get(item.apt_id) || '') : '';
        const side = normalizeSide(item.motor_side);
        const sideDisplay = side === 'L' ? 'שמאל' : side === 'R' ? 'ימין' : '';
        
        return [
          escapeCSV(floorLabel),
          escapeCSV(aptLabel),
          escapeCSV(item.opening_no),
          escapeCSV(item.item_code),
          escapeCSV(sideDisplay),
          escapeCSV(item.height),
          escapeCSV(item.width),
          escapeCSV(item.depth),
          escapeCSV(item.location),
          escapeCSV(item.contract_item),
          escapeCSV(item.hinge_direction),
          escapeCSV(item.mamad),
          '',  // glyph - not on items table
          '',  // jamb_height - not on items table
          item.is_manual ? "כן" : "",
          escapeCSV(formatNotes(item.notes)),
          escapeCSV(item.field_notes),
          '',  // internal_wing - not on items table
        ].join(',');
      });

      const csvContent = BOM + headers + "\n" + csvRows.join("\n");

      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const date = new Date().toISOString().split("T")[0];
      a.href = url;
      a.download = `${project?.name || "project"}-detailed-${date}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      toast.success("הקובץ הורד בהצלחה");
    } catch (error) {
      toast.error("שגיאה בייצוא");
    } finally {
      setExporting(false);
    }
  };

  // Edit mode functions
  const getRowKey = (row: SummaryRow) => `${row.normalizedItemCode}|||${row.normalizedSide ?? "NULL"}|||${row.specialDesignation ?? "NULL"}`;

  const startEditing = (row: SummaryRow) => {
    setEditingRowKey(getRowKey(row));
    setEditValues({
      itemCode: row.normalizedItemCode,
      motorSide: row.normalizedSide,
      height: row.height ?? "",
      width: row.width ?? "",
    });
  };

  const cancelEditing = () => {
    setEditingRowKey(null);
    setEditValues({ itemCode: "", motorSide: null, height: "", width: "" });
  };

  const saveEditing = async (row: SummaryRow) => {
    if (!projectId) return;

    setSaving(true);
    try {
      if (isMeasurementMode) {

        // Update measurement_rows individually
        const measurementIds = row.itemIds.map(id => measurementRowMap.get(id)).filter(Boolean) as string[];
        for (const mId of measurementIds) {
          const { error } = await supabase
            .from("measurement_rows")
            .update({
              item_code: editValues.itemCode || row.normalizedItemCode,
              engine_side: editValues.motorSide || null,
              height: editValues.height || null,
              width: editValues.width || null,
            })
            .eq("id", mId);
          if (error) throw error;
        }
      } else {
        const { error } = await supabase
          .from("items")
          .update({
            item_code: editValues.itemCode || row.normalizedItemCode,
            motor_side: editValues.motorSide || null,
            height: editValues.height || null,
            width: editValues.width || null,
          })
          .in("id", row.itemIds);
        if (error) throw error;
      }

      setAllItems(prev =>
        prev.map(item =>
          row.itemIds.includes(item.id)
            ? {
                ...item,
                item_code: editValues.itemCode || row.normalizedItemCode,
                motor_side: editValues.motorSide || null,
                height: editValues.height || null,
                width: editValues.width || null,
              }
            : item
        )
      );

      toast.success(`עודכנו ${row.qty} פריטים`);
      setEditingRowKey(null);
    } catch (error) {
      console.error("Error updating items:", error);
      toast.error("שגיאה בעדכון הפריטים");
    } finally {
      setSaving(false);
    }
  };

  const toggleEditMode = () => {
    if (editMode) {
      cancelEditing();
    }
    setEditMode(!editMode);
  };

  // Row selection functions
  const handleRowSelect = (rowKey: string) => {
    setSelectedRows(prev => {
      const next = new Set(prev);
      if (next.has(rowKey)) {
        next.delete(rowKey);
      } else {
        next.add(rowKey);
      }
      return next;
    });
  };

  const selectAllRows = () => {
    if (selectedRows.size === summaryRows.length) {
      setSelectedRows(new Set());
    } else {
      setSelectedRows(new Set(summaryRows.map(getRowKey)));
    }
  };

  const clearSelection = () => {
    setSelectedRows(new Set());
  };

  // Get selected item IDs
  const getSelectedItemIds = (): number[] => {
    const itemIds: number[] = [];
    for (const row of summaryRows) {
      if (selectedRows.has(getRowKey(row))) {
        itemIds.push(...row.itemIds);
      }
    }
    return itemIds;
  };

  // Open detail popup for a row
  const openDetailPopup = (row: SummaryRow) => {
    setDetailRow(row);
    const items = allItems.filter(item => row.itemIds.includes(item.id));
    
    // Sort by apartment number (small to big) for the detail popup only
    const sortedItems = [...items].sort((a, b) => {
      const aptA = a.apt_id ? apartments.find(apt => apt.id === a.apt_id)?.apt_number : null;
      const aptB = b.apt_id ? apartments.find(apt => apt.id === b.apt_id)?.apt_number : null;
      
      // Items without apartment go to the end
      if (!aptA && !aptB) return 0;
      if (!aptA) return 1;
      if (!aptB) return -1;
      
      // Parse as numbers for proper numeric sorting
      const numA = parseInt(aptA, 10);
      const numB = parseInt(aptB, 10);
      
      // If both are valid numbers, sort numerically
      if (!isNaN(numA) && !isNaN(numB)) {
        return numA - numB;
      }
      
      // Otherwise sort alphabetically
      return aptA.localeCompare(aptB);
    });
    
    setDetailItems(sortedItems);
    setDetailDialogOpen(true);
    setEditingDetailId(null);
  };

  // Start editing a detail item
  const startDetailEditing = (item: ItemData) => {
    setEditingDetailId(item.id);
    setDetailEditValues({
      itemCode: item.item_code,
      motorSide: item.motor_side,
      height: item.height ?? "",
      width: item.width ?? "",
      location: item.location ?? "",
    });
  };

  // Cancel detail editing
  const cancelDetailEditing = () => {
    setEditingDetailId(null);
    setDetailEditValues({ itemCode: "", motorSide: null, height: "", width: "", location: "" });
  };

  // Save detail item edit
  const saveDetailEditing = async (itemId: number) => {
    setSavingDetail(true);
    try {
      if (isMeasurementMode) {

        const mId = measurementRowMap.get(itemId);
        if (mId) {
          const { error } = await supabase
            .from("measurement_rows")
            .update({
              item_code: detailEditValues.itemCode,
              engine_side: detailEditValues.motorSide || null,
              height: detailEditValues.height || null,
              width: detailEditValues.width || null,
              location_in_apartment: detailEditValues.location || null,
            })
            .eq("id", mId);
          if (error) throw error;
        }
      } else {
        const { error } = await supabase
          .from("items")
          .update({
            item_code: detailEditValues.itemCode,
            motor_side: detailEditValues.motorSide || null,
            height: detailEditValues.height || null,
            width: detailEditValues.width || null,
            location: detailEditValues.location || null,
          })
          .eq("id", itemId);
        if (error) throw error;
      }

      // Update local state
      setAllItems(prev =>
        prev.map(item =>
          item.id === itemId
            ? {
                ...item,
                item_code: detailEditValues.itemCode,
                motor_side: detailEditValues.motorSide || null,
                height: detailEditValues.height || null,
                width: detailEditValues.width || null,
                location: detailEditValues.location || null,
              }
            : item
        )
      );

      // Update detail items list
      setDetailItems(prev =>
        prev.map(item =>
          item.id === itemId
            ? {
                ...item,
                item_code: detailEditValues.itemCode,
                motor_side: detailEditValues.motorSide || null,
                height: detailEditValues.height || null,
                width: detailEditValues.width || null,
                location: detailEditValues.location || null,
              }
            : item
        )
      );

      toast.success("הפריט עודכן בהצלחה");
      setEditingDetailId(null);
    } catch (error) {
      console.error("Error updating item:", error);
      toast.error("שגיאה בעדכון הפריט");
    } finally {
      setSavingDetail(false);
    }
  };

  // Label generation for selected items
  const handleGenerateLabels = async () => {
    const selectedItemIds = getSelectedItemIds();
    if (selectedItemIds.length === 0) {
      toast.error("יש לבחור פריטים להדפסה");
      return;
    }

    setGenerating(true);
    setPdfUrl(null);
    setProgress({ done: 0, total: 0, percent: 0, status: 'running' });

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      console.log('Starting label generation for selected items...', { 
        mode: labelMode, 
        itemCount: selectedItemIds.length 
      });

      const startResponse = await supabase.functions.invoke('labels-generate-start', {
        body: {
          projectId: parseInt(projectId!),
          scope: 'items',
          ids: selectedItemIds,
          subparts: [],
          clientOrigin: window.location.origin,
          mode: labelMode,
        },
      });

      if (startResponse.error) throw startResponse.error;
      if (!startResponse.data?.success) {
        throw new Error(startResponse.data?.error || 'Failed to start job');
      }

      const { jobId, total } = startResponse.data;

      if (!jobId || total === 0) {
        toast.info(startResponse.data.message || 'לא נמצאו פריטים להדפסה');
        setGenerating(false);
        setProgress({ done: 0, total: 0, percent: 0, status: 'idle' });
        return;
      }

      setProgress({ done: 0, total, percent: 0, status: 'running' });
      console.log(`Job ${jobId} started with ${total} labels`);

      const channel = supabase
        .channel('label_jobs')
        .on('postgres_changes', {
          event: 'UPDATE',
          schema: 'public',
          table: 'label_jobs',
          filter: `id=eq.${jobId}`
        }, (payload) => {
          const { done, total: jobTotal } = payload.new as { done: number; total: number };
          const percent = Math.round((done / jobTotal) * 100);
          setProgress({ done, total: jobTotal, percent, status: 'running' });
        })
        .subscribe();

      const chunkSize = 50;
      while (true) {
        const chunkResponse = await supabase.functions.invoke('labels-generate-chunk', {
          body: { jobId, chunkSize },
        });

        if (chunkResponse.error) {
          console.error('Chunk error:', chunkResponse.error);
          throw chunkResponse.error;
        }

        if (!chunkResponse.data?.success) {
          throw new Error(chunkResponse.data?.error || 'Chunk processing failed');
        }

        const { remaining, done, total: jobTotal, status } = chunkResponse.data;
        const percent = Math.round((done / jobTotal) * 100);
        setProgress({ done, total: jobTotal, percent, status });

        if (status === 'done' || remaining === 0) {
          console.log('All chunks processed');
          break;
        }

        await new Promise(resolve => setTimeout(resolve, 250));
      }

      supabase.removeChannel(channel);

      const { data: jobData, error: jobDataError } = await supabase
        .from('label_jobs')
        .select('pdf_path, status')
        .eq('id', jobId)
        .single();

      if (jobDataError || !jobData?.pdf_path) {
        console.error('Error fetching job data:', jobDataError);
        toast.error('שגיאה בטעינת נתוני העבודה');
        setGenerating(false);
        return;
      }

      const { data: signedData, error: signedError } = await supabase.storage
        .from('labels')
        .createSignedUrl(jobData.pdf_path, 3600);

      if (signedError || !signedData?.signedUrl) {
        console.error('Error creating signed URL:', signedError);
        toast.error('שגיאה ביצירת קישור להורדה');
        setGenerating(false);
        return;
      }

      setPdfUrl(signedData.signedUrl);
      toast.success(`נוצרו ${total} תוויות בהצלחה`);
      setGenerating(false);
      
    } catch (error) {
      console.error('Error generating labels:', error);
      toast.error('שגיאה ביצירת התוויות');
      setGenerating(false);
      setProgress({ done: 0, total: 0, percent: 0, status: 'error' });
    }
  };

  // Calculate totals for display
  const totalItems = summaryRows.reduce((sum, row) => sum + row.qty, 0);
  const totalTypes = new Set(summaryRows.map(r => r.normalizedItemCode)).size;
  const hasFilters = selectedFloors.size > 0 || selectedApartments.size > 0;
  const selectedCount = selectedRows.size;
  const selectedItemCount = getSelectedItemIds().length;

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center" dir="rtl">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <nav className="border-b bg-card shadow-sm sticky top-0 z-10">
        <div className="container mx-auto px-3 sm:px-4 py-3 sm:py-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 sm:gap-4 min-w-0">
              <Link to={`/projects/${projectId}`} className="shrink-0">
                <Button variant="ghost" size="icon" className="sm:hidden h-8 w-8">
                  <ArrowRight className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="sm" className="hidden sm:flex">
                  <ArrowRight className="h-4 w-4 ml-2" />
                  חזרה לפרויקט
                </Button>
              </Link>
              <h1 className="text-lg sm:text-2xl font-bold text-primary truncate">סיכום פריטים</h1>
            </div>
            
            <div className="flex items-center gap-2 justify-end flex-wrap">
              {!isMeasurementMode && selectedCount > 0 && (
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => setLabelDialogOpen(true)}
                  className="text-xs sm:text-sm"
                >
                  <Printer className="h-3 w-3 sm:h-4 sm:w-4 ml-1 sm:ml-2" />
                  <span>הדפס תוויות ({selectedItemCount})</span>
                </Button>
              )}
              <Button
                variant={editMode ? "default" : "outline"}
                size="sm"
                onClick={toggleEditMode}
                className="text-xs sm:text-sm"
              >
                <Pencil className="h-3 w-3 sm:h-4 sm:w-4 ml-1 sm:ml-2" />
                <span className="hidden xs:inline">{editMode ? "סיום עריכה" : "מצב עריכה"}</span>
                <span className="xs:hidden">{editMode ? "סיום" : "עריכה"}</span>
              </Button>
              <Popover>
                <PopoverTrigger asChild>
                  <Button 
                    variant="outline" 
                    size="sm"
                    disabled={exporting || (summaryRows.length === 0 && filteredItems.length === 0)}
                    className="text-xs sm:text-sm"
                  >
                    {exporting ? (
                      <Loader2 className="h-3 w-3 sm:h-4 sm:w-4 ml-1 sm:ml-2 animate-spin" />
                    ) : (
                      <Download className="h-3 w-3 sm:h-4 sm:w-4 ml-1 sm:ml-2" />
                    )}
                    <span className="hidden xs:inline">ייצוא CSV</span>
                    <span className="xs:hidden">CSV</span>
                    <ChevronDown className="h-3 w-3 mr-1" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-48 p-1" align="end">
                  <button 
                    className="w-full text-right px-3 py-2 text-sm rounded hover:bg-muted transition-colors"
                    onClick={() => exportCSV('summary')}
                    disabled={summaryRows.length === 0}
                  >
                    סיכום מקובץ
                  </button>
                  <button 
                    className="w-full text-right px-3 py-2 text-sm rounded hover:bg-muted transition-colors"
                    onClick={() => exportCSV('detailed')}
                    disabled={filteredItems.length === 0}
                  >
                    פירוט מלא (קומה/דירה)
                  </button>
                </PopoverContent>
              </Popover>
            </div>
          </div>
        </div>
      </nav>

      <main className="container mx-auto px-3 sm:px-4 py-4 sm:py-8">
        {/* Tab Navigation */}
        <Tabs dir="rtl" value={activeTab} onValueChange={(v) => setActiveTab(v as "summary" | "allocation")} className="w-full">
          <div className="flex justify-center mb-4">
            <TabsList className="grid max-w-md grid-cols-2">
              <TabsTrigger value="summary" className="flex items-center gap-2">
                <List className="h-4 w-4" />
                סיכום פריטים
              </TabsTrigger>
              <TabsTrigger value="allocation" className="flex items-center gap-2">
                <Grid3X3 className="h-4 w-4" />
                טבלת הקצאה
              </TabsTrigger>
            </TabsList>
          </div>

          {/* Summary Tab Content */}
          <TabsContent value="summary" className="space-y-4 sm:space-y-6">
            {/* Filter Section */}
            <Card>
              <Collapsible open={filterOpen} onOpenChange={setFilterOpen}>
                <CollapsibleTrigger asChild>
                  <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors px-3 sm:px-6 py-3 sm:py-4">
                    <CardTitle className="flex items-center justify-between text-base sm:text-lg">
                      <div className="flex items-center gap-2 min-w-0">
                        <Filter className="h-4 w-4 sm:h-5 sm:w-5 shrink-0" />
                        <span className="truncate">סינון לפי קומה/דירה</span>
                        {hasFilters && (
                          <span className="text-xs sm:text-sm font-normal text-muted-foreground whitespace-nowrap">
                            ({selectedFloors.size + selectedApartments.size})
                          </span>
                        )}
                      </div>
                      {filterOpen ? <ChevronUp className="h-4 w-4 sm:h-5 sm:w-5 shrink-0" /> : <ChevronDown className="h-4 w-4 sm:h-5 sm:w-5 shrink-0" />}
                    </CardTitle>
                  </CardHeader>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <CardContent className="pt-0 px-3 sm:px-6">
                    <div className="space-y-4">
                      <div>
                        <Label className="text-sm font-medium mb-2 block">קומות</Label>
                        <div className="flex flex-wrap gap-2 sm:gap-3">
                          {floors.map(floor => (
                            <div key={floor.id} className="flex items-center gap-1.5 sm:gap-2">
                              <Checkbox
                                id={`floor-${floor.id}`}
                                checked={selectedFloors.has(floor.id)}
                                onCheckedChange={() => handleFloorToggle(floor.id)}
                                className="h-4 w-4"
                              />
                              <label 
                                htmlFor={`floor-${floor.id}`}
                                className="text-xs sm:text-sm cursor-pointer whitespace-nowrap"
                              >
                                {floor.floor_code === '0' ? 'קרקע' : `קומה ${floor.floor_code}`}
                              </label>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div>
                        <Label className="text-sm font-medium mb-2 block">דירות</Label>
                        <div className="flex flex-wrap gap-2 sm:gap-3 max-h-32 sm:max-h-40 overflow-y-auto">
                          {filteredApartments.map(apt => (
                            <div key={apt.id} className="flex items-center gap-1.5 sm:gap-2">
                              <Checkbox
                                id={`apt-${apt.id}`}
                                checked={selectedApartments.has(apt.id)}
                                onCheckedChange={() => handleApartmentToggle(apt.id)}
                                className="h-4 w-4"
                              />
                              <label 
                                htmlFor={`apt-${apt.id}`}
                                className="text-xs sm:text-sm cursor-pointer whitespace-nowrap"
                              >
                                דירה {apt.apt_number}
                              </label>
                            </div>
                          ))}
                        </div>
                      </div>

                      {hasFilters && (
                        <Button variant="outline" size="sm" onClick={clearFilters} className="text-xs sm:text-sm">
                          נקה סינון
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </CollapsibleContent>
              </Collapsible>
            </Card>

            <Card className="mb-4 sm:mb-8">
              <CardHeader className="px-3 sm:px-6 py-3 sm:py-4">
                <CardTitle className="text-lg sm:text-xl truncate">{project?.name || "פרויקט"}</CardTitle>
              </CardHeader>
              <CardContent className="px-3 sm:px-6 py-2 sm:py-4">
                <p className="text-sm sm:text-base text-muted-foreground">
                  סה"כ {totalItems} פריטים | {totalTypes} סוגים
                  {hasFilters && " (מסונן)"}
                  {selectedCount > 0 && ` | נבחרו ${selectedCount} סוגים (${selectedItemCount} פריטים)`}
                </p>
              </CardContent>
            </Card>

        <Card>
          <CardContent className="p-2 sm:pt-6 sm:px-6 overflow-x-auto">
            <div className="rounded-md border min-w-[500px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    {!isMeasurementMode && (
                      <TableHead className="text-center text-xs sm:text-sm py-2 px-2 w-10">
                        <Checkbox
                          checked={selectedRows.size === summaryRows.length && summaryRows.length > 0}
                          onCheckedChange={selectAllRows}
                          className="h-4 w-4"
                        />
                      </TableHead>
                    )}
                    <TableHead className="text-right text-xs sm:text-sm py-2 px-2 sm:px-4">מס' פרט</TableHead>
                    <TableHead className="text-right text-xs sm:text-sm py-2 px-2 sm:px-4">מיקום בדירה</TableHead>
                    <TableHead className="text-right text-xs sm:text-sm py-2 px-2 sm:px-4">צד</TableHead>
                    <TableHead className="text-right text-xs sm:text-sm py-2 px-2 sm:px-4">גובה</TableHead>
                    <TableHead className="text-right text-xs sm:text-sm py-2 px-2 sm:px-4">רוחב</TableHead>
                    <TableHead className="text-right text-xs sm:text-sm py-2 px-2 sm:px-4">עומק</TableHead>
                    <TableHead className="text-right text-xs sm:text-sm py-2 px-2 sm:px-4">כמות</TableHead>
                    <TableHead className="text-right text-xs sm:text-sm py-2 px-2 sm:px-4 hidden lg:table-cell">פרט חוזה</TableHead>
                    <TableHead className="text-right text-xs sm:text-sm py-2 px-2 sm:px-4 hidden lg:table-cell">כיוון ציר</TableHead>
                    <TableHead className="text-right text-xs sm:text-sm py-2 px-2 sm:px-4 hidden lg:table-cell">ממד</TableHead>
                    <TableHead className="text-right text-xs sm:text-sm py-2 px-2 sm:px-4 hidden lg:table-cell">מנואלה</TableHead>
                    <TableHead className="text-right text-xs sm:text-sm py-2 px-2 sm:px-4">הערות</TableHead>
                    <TableHead className="text-right text-xs sm:text-sm py-2 px-2 sm:px-4">הערות שטח</TableHead>
                    {editMode && <TableHead className="text-center text-xs sm:text-sm py-2 px-2 sm:px-4 w-20 sm:w-24">פעולות</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summaryRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={editMode ? (isMeasurementMode ? 14 : 15) : (isMeasurementMode ? 13 : 14)} className="text-center text-muted-foreground py-6 sm:py-8 text-sm">
                        {hasFilters ? "אין פריטים בסינון הנוכחי" : "אין פריטים בפרויקט"}
                      </TableCell>
                    </TableRow>
                  ) : (
                    summaryRows.map((row, idx) => {
                      const rowKey = getRowKey(row);
                      const isEditing = editingRowKey === rowKey;
                      const isSelected = selectedRows.has(rowKey);

                      // Build side display with pocket type
                      const sideDisplay = row.pocketType 
                        ? `${row.displaySide !== "—" ? row.displaySide + " " : ""}(${row.pocketType})`
                        : row.displaySide;

                      return (
                          <TableRow key={idx} className={isSelected ? "bg-primary/5" : ""}>
                          {!isMeasurementMode && (
                            <TableCell className="text-center">
                              <Checkbox
                                checked={isSelected}
                                onCheckedChange={() => handleRowSelect(rowKey)}
                                className="h-4 w-4"
                              />
                            </TableCell>
                          )}
                          <TableCell className="font-medium">
                            {isEditing ? (
                              <Input
                                value={editValues.itemCode}
                                onChange={(e) => setEditValues(prev => ({ ...prev, itemCode: e.target.value }))}
                                className="h-8 w-24"
                                placeholder="—"
                              />
                            ) : (
                              row.specialDesignation 
                                ? `${row.normalizedItemCode} (${row.specialDesignation})`
                                : row.normalizedItemCode
                            )}
                          </TableCell>
                          <TableCell className="text-xs sm:text-sm">{row.location ?? "—"}</TableCell>
                          <TableCell>
                            {isEditing ? (
                              <Select
                                value={editValues.motorSide || "none"}
                                onValueChange={(val) => setEditValues(prev => ({ ...prev, motorSide: val === "none" ? null : val }))}
                              >
                                <SelectTrigger className="h-8 w-20">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="none">—</SelectItem>
                                  <SelectItem value="L">L</SelectItem>
                                  <SelectItem value="R">R</SelectItem>
                                </SelectContent>
                              </Select>
                            ) : (
                              sideDisplay
                            )}
                          </TableCell>
                          <TableCell>
                            {isEditing ? (
                              <Input
                                value={editValues.height}
                                onChange={(e) => setEditValues(prev => ({ ...prev, height: e.target.value }))}
                                className="h-8 w-20"
                                placeholder="—"
                              />
                            ) : (
                              row.height ?? "—"
                            )}
                          </TableCell>
                          <TableCell>
                            {isEditing ? (
                              <Input
                                value={editValues.width}
                                onChange={(e) => setEditValues(prev => ({ ...prev, width: e.target.value }))}
                                className="h-8 w-20"
                                placeholder="—"
                              />
                            ) : (
                              row.width ?? "—"
                            )}
                          </TableCell>
                          <TableCell className="text-xs sm:text-sm">{row.depth ?? "—"}</TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 font-medium text-primary hover:text-primary"
                              onClick={() => openDetailPopup(row)}
                            >
                              {row.qty}
                              <Eye className="h-3 w-3 mr-1" />
                            </Button>
                          </TableCell>
                          <TableCell className="text-xs sm:text-sm hidden lg:table-cell">{row.contractItem || "—"}</TableCell>
                          <TableCell className="text-xs sm:text-sm hidden lg:table-cell">{row.hingeDirection || "—"}</TableCell>
                          <TableCell className="text-xs sm:text-sm hidden lg:table-cell">{row.mamad || "—"}</TableCell>
                          <TableCell className="text-xs sm:text-sm hidden lg:table-cell">{row.isManual ? "כן" : "—"}</TableCell>
                          <TableCell className="text-xs sm:text-sm">{formatNotes(row.notes) || "—"}</TableCell>
                          <TableCell className="text-xs sm:text-sm">{row.fieldNotes || "—"}</TableCell>
                          {editMode && (
                            <TableCell>
                              <div className="flex items-center justify-center gap-1">
                                {isEditing ? (
                                  <>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7 text-green-600 hover:text-green-700 hover:bg-green-50"
                                      onClick={() => saveEditing(row)}
                                      disabled={saving}
                                    >
                                      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                                      onClick={cancelEditing}
                                      disabled={saving}
                                    >
                                      <X className="h-4 w-4" />
                                    </Button>
                                  </>
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
                              </div>
                            </TableCell>
                          )}
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
          </TabsContent>

          {/* Allocation Grid Tab Content */}
          <TabsContent value="allocation">
            <AllocationGrid 
              items={allItems}
              floors={floors}
              apartments={apartments}
              projectName={project?.name || "project"}
            />
          </TabsContent>
        </Tabs>
      </main>

      {/* Label Print Dialog */}
      <Dialog open={labelDialogOpen} onOpenChange={setLabelDialogOpen}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Tag className="h-5 w-5" />
              הדפסת תוויות
            </DialogTitle>
            <DialogDescription>
              נבחרו {selectedCount} סוגי פריטים ({selectedItemCount} פריטים בסה"כ)
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>סוג תוויות</Label>
              <Select value={labelMode} onValueChange={(v: 'load_roll_100x50' | 'install_two_up_roll') => setLabelMode(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="load_roll_100x50">העמסה — מדפסת תוויות 100×50 מ״מ (גלילה)</SelectItem>
                  <SelectItem value="install_two_up_roll">התקנה — מדפסת תוויות 2×4" (זוגי)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {generating && progress.total > 0 && (
              <div className="space-y-2">
                <Progress value={progress.percent} className="w-full" />
                <p className="text-sm text-center text-muted-foreground">
                  {progress.done} / {progress.total} תוויות ({progress.percent}%)
                </p>
              </div>
            )}

            {pdfUrl && (
              <Card className="bg-green-50 border-green-200">
                <CardContent className="p-4 flex gap-3 items-center">
                  <Download className="h-5 w-5 text-green-600" />
                  <div className="flex-1">
                    <p className="font-medium text-green-800">התוויות מוכנות!</p>
                  </div>
                  <Button size="sm" asChild>
                    <a href={pdfUrl} download target="_blank" rel="noopener noreferrer">
                      הורד PDF
                    </a>
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => {
              setLabelDialogOpen(false);
              setPdfUrl(null);
            }}>
              סגור
            </Button>
            <Button onClick={handleGenerateLabels} disabled={generating}>
              {generating ? (
                <>
                  <Loader2 className="h-4 w-4 ml-2 animate-spin" />
                  יוצר...
                </>
              ) : (
                <>
                  <Printer className="h-4 w-4 ml-2" />
                  צור תוויות
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Items Detail Dialog */}
      <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              פירוט פריטים - {detailRow?.normalizedItemCode}
              {detailRow?.specialDesignation && ` (${detailRow.specialDesignation})`}
            </DialogTitle>
            <DialogDescription>
              {detailRow?.qty} פריטים מסוג זה | צד: {detailRow?.displaySide}
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4">
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right text-xs py-2 px-1 sm:px-2">מס' פרט</TableHead>
                    <TableHead className="text-right text-xs py-2 px-1 sm:px-2">דירה</TableHead>
                    <TableHead className="text-right text-xs py-2 px-1 sm:px-2">מיקום</TableHead>
                    <TableHead className="text-right text-xs py-2 px-1 sm:px-2">צד</TableHead>
                    <TableHead className="text-right text-xs py-2 px-1 sm:px-2">גובה</TableHead>
                    <TableHead className="text-right text-xs py-2 px-1 sm:px-2">רוחב</TableHead>
                    <TableHead className="text-right text-xs py-2 px-1 sm:px-2 hidden sm:table-cell">עומק</TableHead>
                    <TableHead className="text-right text-xs py-2 px-1 sm:px-2 hidden sm:table-cell">פרט חוזה</TableHead>
                    <TableHead className="text-right text-xs py-2 px-1 sm:px-2 hidden sm:table-cell">ציר</TableHead>
                    <TableHead className="text-right text-xs py-2 px-1 sm:px-2 hidden sm:table-cell">ממד</TableHead>
                    <TableHead className="text-right text-xs py-2 px-1 sm:px-2 hidden sm:table-cell">הערות</TableHead>
                    <TableHead className="text-center text-xs py-2 px-1 sm:px-2 w-16 sm:w-20">פעולות</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detailItems.map((item) => {
                    const isEditing = editingDetailId === item.id;
                    const apartmentName = item.apt_id 
                      ? apartments.find(a => a.id === item.apt_id)?.apt_number ?? "—"
                      : "—";
                    return (
                      <TableRow key={item.id}>
                        <TableCell className="text-xs font-medium px-1 sm:px-2">
                          {isEditing ? (
                            <Input
                              value={detailEditValues.itemCode}
                              onChange={(e) => setDetailEditValues(prev => ({ ...prev, itemCode: e.target.value }))}
                              className="h-7 w-16 sm:w-20 text-xs"
                            />
                          ) : (
                            item.item_code
                          )}
                        </TableCell>
                        <TableCell className="text-xs px-1 sm:px-2">
                          {apartmentName}
                        </TableCell>
                        <TableCell className="text-xs px-1 sm:px-2">
                          {isEditing ? (
                            <Input
                              value={detailEditValues.location}
                              onChange={(e) => setDetailEditValues(prev => ({ ...prev, location: e.target.value }))}
                              className="h-7 w-16 sm:w-24 text-xs"
                            />
                          ) : (
                            item.location ?? "—"
                          )}
                        </TableCell>
                        <TableCell className="text-xs px-1 sm:px-2">
                          {isEditing ? (
                            <Select
                              value={detailEditValues.motorSide || "none"}
                              onValueChange={(val) => setDetailEditValues(prev => ({ ...prev, motorSide: val === "none" ? null : val }))}
                            >
                              <SelectTrigger className="h-7 w-12 sm:w-16 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">—</SelectItem>
                                <SelectItem value="L">L</SelectItem>
                                <SelectItem value="R">R</SelectItem>
                              </SelectContent>
                            </Select>
                          ) : (
                            item.motor_side ?? "—"
                          )}
                        </TableCell>
                        <TableCell className="text-xs px-1 sm:px-2">
                          {isEditing ? (
                            <Input
                              value={detailEditValues.height}
                              onChange={(e) => setDetailEditValues(prev => ({ ...prev, height: e.target.value }))}
                              className="h-7 w-12 sm:w-16 text-xs"
                            />
                          ) : (
                            item.height ?? "—"
                          )}
                        </TableCell>
                        <TableCell className="text-xs px-1 sm:px-2">
                          {isEditing ? (
                            <Input
                              value={detailEditValues.width}
                              onChange={(e) => setDetailEditValues(prev => ({ ...prev, width: e.target.value }))}
                              className="h-7 w-12 sm:w-16 text-xs"
                            />
                          ) : (
                            item.width ?? "—"
                          )}
                        </TableCell>
                        <TableCell className="text-xs hidden sm:table-cell px-1 sm:px-2">{item.depth ?? "—"}</TableCell>
                        <TableCell className="text-xs hidden sm:table-cell px-1 sm:px-2">{item.contract_item ?? "—"}</TableCell>
                        <TableCell className="text-xs hidden sm:table-cell px-1 sm:px-2">{item.hinge_direction ?? "—"}</TableCell>
                        <TableCell className="text-xs hidden sm:table-cell px-1 sm:px-2">{item.mamad ?? "—"}</TableCell>
                        <TableCell className="text-xs max-w-[120px] truncate hidden sm:table-cell px-1 sm:px-2" title={formatNotes(item.notes) || ""}>
                          {formatNotes(item.notes) || "—"}
                        </TableCell>
                        <TableCell className="px-1 sm:px-2">
                          <div className="flex items-center justify-center gap-0.5 sm:gap-1">
                            {isEditing ? (
                              <>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6 text-green-600 hover:text-green-700 hover:bg-green-50"
                                  onClick={() => saveDetailEditing(item.id)}
                                  disabled={savingDetail}
                                >
                                  {savingDetail ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6 text-destructive hover:text-destructive hover:bg-destructive/10"
                                  onClick={cancelDetailEditing}
                                  disabled={savingDetail}
                                >
                                  <X className="h-3 w-3" />
                                </Button>
                              </>
                            ) : (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={() => startDetailEditing(item)}
                              >
                                <Pencil className="h-3 w-3" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setDetailDialogOpen(false);
              setEditingDetailId(null);
            }}>
              סגור
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ProjectItemsSummary;
