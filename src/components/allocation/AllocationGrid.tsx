import { useMemo, useState, useCallback } from "react";
import { Download, Loader2, Grid3X3, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import * as XLSX from "xlsx";

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

interface AllocationGridProps {
  items: ItemData[];
  floors: FloorData[];
  apartments: ApartmentData[];
  projectName: string;
}

// Item row represents a unique item_code with dimensions
interface ItemRow {
  itemCode: string;
  dimensions: string; // "height/width"
  height: string | null;
  width: string | null;
}

// Grid cell: count of item in a specific apartment
type AllocationMap = Map<string, Map<number, number>>; // itemCode -> aptId -> count

// Sort floors naturally: קרקע/לובי first (as floor 0), then numbers, then text
const sortFloors = (a: FloorData, b: FloorData): number => {
  const getOrder = (code: string): number => {
    const lower = code.toLowerCase();
    // Ground floor / lobby should come before floor 1
    if (lower.includes('קרקע') || lower.includes('לובי') || lower.includes('lobby') || lower.includes('ground')) {
      return 0;
    }
    const num = parseInt(code, 10);
    return isNaN(num) ? 999 : num;
  };
  
  return getOrder(a.floor_code) - getOrder(b.floor_code);
};

// Sort apartments numerically
const sortApartments = (a: ApartmentData, b: ApartmentData): number => {
  const numA = parseInt(a.apt_number, 10);
  const numB = parseInt(b.apt_number, 10);
  
  if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
  return a.apt_number.localeCompare(b.apt_number, "he");
};

export function AllocationGrid({ items, floors, apartments, projectName }: AllocationGridProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [exporting, setExporting] = useState(false);

  // Sort floors and apartments
  const sortedFloors = useMemo(() => [...floors].sort(sortFloors), [floors]);
  
  const sortedApartments = useMemo(() => {
    return [...apartments].sort((a, b) => {
      // First sort by floor order
      const floorIndexA = sortedFloors.findIndex(f => f.id === a.floor_id);
      const floorIndexB = sortedFloors.findIndex(f => f.id === b.floor_id);
      if (floorIndexA !== floorIndexB) return floorIndexA - floorIndexB;
      // Then by apartment number
      return sortApartments(a, b);
    });
  }, [apartments, sortedFloors]);

  // Build allocation map and unique item rows
  const { allocationMap, itemRows } = useMemo(() => {
    const map: AllocationMap = new Map();
    const itemsMap = new Map<string, { height: string | null; width: string | null }>();

    for (const item of items) {
      if (!item.item_code || item.item_code.trim() === "") continue;
      if (!item.apt_id) continue; // Skip items without apartment

      const code = item.item_code.trim();
      
      // Track dimensions (first occurrence wins)
      if (!itemsMap.has(code)) {
        itemsMap.set(code, { height: item.height, width: item.width });
      }

      // Build allocation count
      if (!map.has(code)) {
        map.set(code, new Map());
      }
      const aptMap = map.get(code)!;
      aptMap.set(item.apt_id, (aptMap.get(item.apt_id) || 0) + 1);
    }

    // Convert to sorted rows
    const rows: ItemRow[] = [];
    for (const [code, dims] of itemsMap.entries()) {
      const h = dims.height ?? "";
      const w = dims.width ?? "";
      const dimensions = h || w ? `${h}/${w}` : "—";
      rows.push({ itemCode: code, dimensions, height: dims.height, width: dims.width });
    }

    // Sort rows: letters first, then alphanumeric
    rows.sort((a, b) => {
      const startsWithLetterA = /^[A-Za-zא-ת]/.test(a.itemCode);
      const startsWithLetterB = /^[A-Za-zא-ת]/.test(b.itemCode);
      
      if (startsWithLetterA && !startsWithLetterB) return -1;
      if (!startsWithLetterA && startsWithLetterB) return 1;
      
      return a.itemCode.localeCompare(b.itemCode, "he", { numeric: true });
    });

    return { allocationMap: map, itemRows: rows };
  }, [items]);

  // Filter rows by search
  const filteredRows = useMemo(() => {
    if (!searchTerm.trim()) return itemRows;
    const term = searchTerm.trim().toLowerCase();
    return itemRows.filter(row => row.itemCode.toLowerCase().includes(term));
  }, [itemRows, searchTerm]);

  // Calculate totals per apartment (column totals)
  const columnTotals = useMemo(() => {
    const totals = new Map<number, number>();
    for (const [, aptMap] of allocationMap.entries()) {
      for (const [aptId, count] of aptMap.entries()) {
        totals.set(aptId, (totals.get(aptId) || 0) + count);
      }
    }
    return totals;
  }, [allocationMap]);

  // Calculate totals per item row (row totals)
  const getRowTotal = (itemCode: string): number => {
    const aptMap = allocationMap.get(itemCode);
    if (!aptMap) return 0;
    let total = 0;
    for (const count of aptMap.values()) {
      total += count;
    }
    return total;
  };

  // Grand total
  const grandTotal = useMemo(() => {
    let total = 0;
    for (const t of columnTotals.values()) {
      total += t;
    }
    return total;
  }, [columnTotals]);

  // Floor display name
  const getFloorDisplayName = (floorCode: string): string => {
    if (floorCode === "0") return "קרקע";
    return `קומה ${floorCode}`;
  };

  // Build column headers grouped by floor
  const columnHeaders = useMemo(() => {
    const headers: { aptId: number; label: string; floorLabel: string; floorId: number }[] = [];
    for (const apt of sortedApartments) {
      const floor = sortedFloors.find(f => f.id === apt.floor_id);
      headers.push({
        aptId: apt.id,
        label: apt.apt_number,
        floorLabel: floor ? getFloorDisplayName(floor.floor_code) : "",
        floorId: apt.floor_id,
      });
    }
    return headers;
  }, [sortedApartments, sortedFloors]);

  // Get cell value
  const getCellValue = (itemCode: string, aptId: number): number => {
    return allocationMap.get(itemCode)?.get(aptId) || 0;
  };

  // Export to XLSX
  const exportXLSX = () => {
    if (filteredRows.length === 0) {
      toast.error("אין נתונים לייצוא");
      return;
    }

    setExporting(true);
    try {
      // Build header row
      const headers = ["מידות", "מספר פרט"];
      for (const col of columnHeaders) {
        headers.push(`${col.floorLabel} - ${col.label}`);
      }
      headers.push("סה״כ");

      // Build data rows
      const dataRows = filteredRows.map(row => {
        const rowData: (string | number)[] = [row.dimensions, row.itemCode];
        for (const col of columnHeaders) {
          rowData.push(getCellValue(row.itemCode, col.aptId));
        }
        rowData.push(getRowTotal(row.itemCode));
        return rowData;
      });

      // Add totals row
      const totalsRow: (string | number)[] = ["", "סה״כ"];
      for (const col of columnHeaders) {
        totalsRow.push(columnTotals.get(col.aptId) || 0);
      }
      totalsRow.push(grandTotal);

      // Create worksheet
      const wsData = [headers, ...dataRows, totalsRow];
      const ws = XLSX.utils.aoa_to_sheet(wsData);

      // Style: bold header row
      const range = XLSX.utils.decode_range(ws["!ref"] || "A1");
      for (let col = range.s.c; col <= range.e.c; col++) {
        const cellRef = XLSX.utils.encode_cell({ r: 0, c: col });
        if (!ws[cellRef]) continue;
        ws[cellRef].s = { font: { bold: true } };
      }

      // Set column widths
      ws["!cols"] = [
        { wch: 12 }, // מידות
        { wch: 12 }, // מספר פרט
        ...columnHeaders.map(() => ({ wch: 10 })),
        { wch: 8 }, // סה״כ
      ];

      // Create workbook
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "הקצאה");

      // Generate file
      const date = new Date().toISOString().split("T")[0];
      XLSX.writeFile(wb, `${projectName}-allocation-${date}.xlsx`);
      
      toast.success("הקובץ הורד בהצלחה");
    } catch (error) {
      console.error("Export error:", error);
      toast.error("שגיאה בייצוא");
    } finally {
      setExporting(false);
    }
  };

  // Export to CSV
  const exportCSV = () => {
    if (filteredRows.length === 0) {
      toast.error("אין נתונים לייצוא");
      return;
    }

    setExporting(true);
    try {
      const BOM = "\uFEFF";
      
      // Build header row
      const headers = ["מידות", "מספר פרט"];
      for (const col of columnHeaders) {
        headers.push(`${col.floorLabel} - ${col.label}`);
      }
      headers.push("סה״כ");

      // Build data rows
      const csvRows = filteredRows.map(row => {
        const rowData: (string | number)[] = [row.dimensions, row.itemCode];
        for (const col of columnHeaders) {
          rowData.push(getCellValue(row.itemCode, col.aptId));
        }
        rowData.push(getRowTotal(row.itemCode));
        return rowData.join(",");
      });

      // Add totals row
      const totalsRow: (string | number)[] = ["", "סה״כ"];
      for (const col of columnHeaders) {
        totalsRow.push(columnTotals.get(col.aptId) || 0);
      }
      totalsRow.push(grandTotal);

      const csvContent = BOM + headers.join(",") + "\n" + csvRows.join("\n") + "\n" + totalsRow.join(",");

      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const date = new Date().toISOString().split("T")[0];
      a.href = url;
      a.download = `${projectName}-allocation-${date}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      toast.success("הקובץ הורד בהצלחה");
    } catch (error) {
      console.error("Export error:", error);
      toast.error("שגיאה בייצוא");
    } finally {
      setExporting(false);
    }
  };

  // Calculate floor spans for grouped header
  const floorSpans = useMemo(() => {
    const spans: { floorId: number; label: string; colspan: number }[] = [];
    let currentFloorId: number | null = null;
    let currentSpan = 0;
    
    for (const col of columnHeaders) {
      if (col.floorId !== currentFloorId) {
        if (currentFloorId !== null && currentSpan > 0) {
          const floor = sortedFloors.find(f => f.id === currentFloorId);
          spans.push({
            floorId: currentFloorId,
            label: floor ? getFloorDisplayName(floor.floor_code) : "",
            colspan: currentSpan,
          });
        }
        currentFloorId = col.floorId;
        currentSpan = 1;
      } else {
        currentSpan++;
      }
    }
    
    // Push last span
    if (currentFloorId !== null && currentSpan > 0) {
      const floor = sortedFloors.find(f => f.id === currentFloorId);
      spans.push({
        floorId: currentFloorId,
        label: floor ? getFloorDisplayName(floor.floor_code) : "",
        colspan: currentSpan,
      });
    }
    
    return spans;
  }, [columnHeaders, sortedFloors]);

  // Print mode
  const handlePrint = useCallback(() => {
    // Inject print styles if not already present
    let styleEl = document.getElementById('allocation-print-styles');
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = 'allocation-print-styles';
      styleEl.textContent = `
        @media print {
          @page { size: A3 landscape; margin: 8mm; }
          body.allocation-print-active * {
            visibility: hidden;
          }
          body.allocation-print-active .allocation-print-zone,
          body.allocation-print-active .allocation-print-zone * {
            visibility: visible;
          }
          body.allocation-print-active .allocation-print-zone {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            overflow: visible !important;
            max-height: none !important;
          }
          body.allocation-print-active .allocation-print-zone .no-print {
            display: none !important;
          }
          body.allocation-print-active .allocation-print-zone table {
            font-size: 8pt !important;
            border-collapse: collapse !important;
            width: 100% !important;
            min-width: 0 !important;
          }
          body.allocation-print-active .allocation-print-zone th,
          body.allocation-print-active .allocation-print-zone td {
            border: 0.5pt solid #999 !important;
            padding: 2px 4px !important;
            position: static !important;
          }
          body.allocation-print-active .allocation-print-zone thead {
            position: static !important;
          }
          body.allocation-print-active .allocation-print-zone .print-header {
            display: flex !important;
            visibility: visible !important;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 8px;
            font-size: 11pt;
          }
          body.allocation-print-active .allocation-print-zone .print-header h2 { font-weight: 700; font-size: 14pt; }
        }
      `;
      document.head.appendChild(styleEl);
    }

    // Mark root for print visibility
    document.body.classList.add('allocation-print-active');
    window.print();
    document.body.classList.remove('allocation-print-active');
  }, []);

  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="text-center text-muted-foreground">
            <Grid3X3 className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>אין פריטים בפרויקט להצגת הקצאה</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4 allocation-print-zone">
      {/* Print-only header */}
      <div className="hidden print-header">
        <h2>טבלת הקצאה — {projectName}</h2>
        <span>{new Date().toLocaleDateString('he-IL')}</span>
      </div>

      {/* Controls */}
      <Card className="no-print">
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Grid3X3 className="h-5 w-5" />
              טבלת הקצאה
            </CardTitle>
            <div className="flex items-center gap-2 flex-wrap">
              <Input
                placeholder="חפש מספר פרט..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-40 h-9"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={handlePrint}
              >
                <Printer className="h-4 w-4 ml-2" />
                הדפסה A3
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={exportXLSX}
                disabled={exporting}
              >
                {exporting ? <Loader2 className="h-4 w-4 ml-2 animate-spin" /> : <Download className="h-4 w-4 ml-2" />}
                XLSX
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={exportCSV}
                disabled={exporting}
              >
                {exporting ? <Loader2 className="h-4 w-4 ml-2 animate-spin" /> : <Download className="h-4 w-4 ml-2" />}
                CSV
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground pb-3">
          {filteredRows.length} סוגי פריטים | {sortedApartments.length} יחידות | סה״כ {grandTotal} פריטים
        </CardContent>
      </Card>

      {/* Grid Table */}
      <Card className="overflow-hidden">
        <CardContent className="p-0">
          <div className="overflow-auto max-h-[70vh]">
            <table className="w-full border-collapse text-sm" style={{ minWidth: `${200 + columnHeaders.length * 60}px` }}>
              {/* Header Row 1: Floor groups */}
              <thead className="sticky top-0 z-20 bg-muted">
                <tr>
                  {/* Sticky columns headers - floor row */}
                  <th 
                    className="sticky right-0 z-30 bg-muted border-b border-l px-2 py-2 text-right font-semibold"
                    rowSpan={2}
                    style={{ minWidth: "80px" }}
                  >
                    מידות
                  </th>
                  <th 
                    className="sticky z-30 bg-muted border-b border-l px-2 py-2 text-right font-semibold"
                    rowSpan={2}
                    style={{ right: "80px", minWidth: "80px" }}
                  >
                    מספר פרט
                  </th>
                  {/* Floor group headers */}
                  {floorSpans.map((span) => (
                    <th
                      key={span.floorId}
                      colSpan={span.colspan}
                      className="bg-primary/10 border-b border-l px-2 py-2 text-center font-semibold"
                    >
                      {span.label}
                    </th>
                  ))}
                  {/* Total header */}
                  <th 
                    className="bg-muted border-b px-2 py-2 text-center font-semibold"
                    rowSpan={2}
                    style={{ minWidth: "60px" }}
                  >
                    סה״כ
                  </th>
                </tr>
                {/* Header Row 2: Apartment numbers */}
                <tr>
                  {columnHeaders.map((col) => (
                    <th
                      key={col.aptId}
                      className="bg-muted/70 border-b border-l px-1 py-1.5 text-center font-medium text-xs"
                      style={{ minWidth: "50px" }}
                    >
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              
              {/* Data Rows */}
              <tbody>
                {filteredRows.length === 0 ? (
                  <tr>
                    <td 
                      colSpan={columnHeaders.length + 3} 
                      className="text-center py-8 text-muted-foreground"
                    >
                      לא נמצאו פריטים
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((row, idx) => (
                    <tr key={row.itemCode} className={idx % 2 === 0 ? "bg-background" : "bg-muted/30"}>
                      {/* Sticky: מידות */}
                      <td 
                        className="sticky right-0 z-10 border-b border-l px-2 py-1.5 text-right font-mono text-xs"
                        style={{ 
                          minWidth: "80px",
                          backgroundColor: idx % 2 === 0 ? "hsl(var(--background))" : "hsl(var(--muted) / 0.3)"
                        }}
                      >
                        {row.dimensions}
                      </td>
                      {/* Sticky: מספר פרט */}
                      <td 
                        className="sticky z-10 border-b border-l px-2 py-1.5 text-right font-medium"
                        style={{ 
                          right: "80px", 
                          minWidth: "80px",
                          backgroundColor: idx % 2 === 0 ? "hsl(var(--background))" : "hsl(var(--muted) / 0.3)"
                        }}
                      >
                        {row.itemCode}
                      </td>
                      {/* Data cells */}
                      {columnHeaders.map((col) => {
                        const value = getCellValue(row.itemCode, col.aptId);
                        return (
                          <td
                            key={col.aptId}
                            className="border-b border-l px-1 py-1.5 text-center tabular-nums"
                          >
                            {value > 0 ? value : ""}
                          </td>
                        );
                      })}
                      {/* Row total */}
                      <td className="border-b px-2 py-1.5 text-center font-semibold tabular-nums bg-muted/50">
                        {getRowTotal(row.itemCode)}
                      </td>
                    </tr>
                  ))
                )}
                
                {/* Totals Row */}
                {filteredRows.length > 0 && (
                  <tr className="bg-muted font-semibold">
                    <td 
                      className="sticky right-0 z-10 bg-muted border-t-2 px-2 py-2 text-right"
                      style={{ minWidth: "80px" }}
                    >
                    </td>
                    <td 
                      className="sticky z-10 bg-muted border-t-2 border-l px-2 py-2 text-right"
                      style={{ right: "80px", minWidth: "80px" }}
                    >
                      סה״כ
                    </td>
                    {columnHeaders.map((col) => (
                      <td
                        key={col.aptId}
                        className="border-t-2 border-l px-1 py-2 text-center tabular-nums"
                      >
                        {columnTotals.get(col.aptId) || 0}
                      </td>
                    ))}
                    <td className="border-t-2 px-2 py-2 text-center tabular-nums bg-primary/10">
                      {grandTotal}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
