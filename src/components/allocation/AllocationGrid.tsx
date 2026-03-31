import { useMemo, useState, useCallback } from "react";
import { Download, Loader2, Grid3X3, Printer, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import ExcelJS from "exceljs";

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
  const exportXLSX = async () => {
    if (filteredRows.length === 0) {
      toast.error("אין נתונים לייצוא");
      return;
    }

    setExporting(true);
    try {
      // Load branding images
      const [headerRes, footerRes] = await Promise.all([
        fetch('/branding/allocation-header.jpg'),
        fetch('/branding/allocation-footer.jpg'),
      ]);
      const headerBuf = await headerRes.arrayBuffer();
      const footerBuf = await footerRes.arrayBuffer();

      const wb = new ExcelJS.Workbook();
      wb.creator = 'Kostika System';
      const ws = wb.addWorksheet('הקצאה', {
        views: [{ rightToLeft: true }],
      });

      const colCount = 2 + columnHeaders.length + 1;
      const boldFont: Partial<ExcelJS.Font> = { name: 'Calibri', size: 11, bold: true };
      const centerAlign: Partial<ExcelJS.Alignment> = { horizontal: 'center', vertical: 'middle', wrapText: true };
      const thinBorder: Partial<ExcelJS.Borders> = {
        top: { style: 'thin' },
        bottom: { style: 'thin' },
        left: { style: 'thin' },
        right: { style: 'thin' },
      };

      // ── Header image (rows 1-4 reserved) ──
      const HEADER_ROWS = 4;
      for (let i = 0; i < HEADER_ROWS; i++) {
        const r = ws.addRow([]);
        r.height = 22;
      }
      // Place header image spanning across top rows
      const headerId = wb.addImage({
        buffer: headerBuf,
        extension: 'jpeg',
      });
      // Calculate total width in Excel units for image placement
      const totalWidthPx = 12 * 7.5 + 12 * 7.5 + columnHeaders.length * 8 * 7.5 + 8 * 7.5;
      ws.addImage(headerId, {
        tl: { col: 0, row: 0 },
        ext: { width: Math.min(totalWidthPx, 900), height: 85 },
      });

      // ── Date + Addressee fields (תאריך / לכבוד / אתר / לידי) ──
      const addressFont: Partial<ExcelJS.Font> = { name: 'Calibri', size: 12, bold: true };
      const addressAlign: Partial<ExcelJS.Alignment> = { horizontal: 'right', vertical: 'middle' };

      // Date row
      const dateRow = ws.addRow([]);
      dateRow.height = 20;
      ws.mergeCells(dateRow.number, 1, dateRow.number, colCount);
      const dateCell = dateRow.getCell(1);
      const now = new Date();
      dateCell.value = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;
      dateCell.font = addressFont;
      dateCell.alignment = addressAlign;

      const fieldLabels = ['לכבוד:', 'אתר:', 'לידי:'];
      for (const label of fieldLabels) {
        const addrRow = ws.addRow([]);
        addrRow.height = 20;
        ws.mergeCells(addrRow.number, 1, addrRow.number, colCount);
        const addrCell = addrRow.getCell(1);
        addrCell.value = label;
        addrCell.font = addressFont;
        addrCell.alignment = addressAlign;
      }

      // Empty spacer row before table
      const spacerRow = ws.addRow([]);
      spacerRow.height = 8;

      // ── Data header rows ──
      // Floor group headers
      const row1Data: string[] = ['מידות', 'מספר פרט'];
      for (const span of floorSpans) {
        row1Data.push(span.label);
        for (let i = 1; i < span.colspan; i++) row1Data.push('');
      }
      row1Data.push('סה״כ');
      const exRow1 = ws.addRow(row1Data);

      // Row HEADER_ROWS+2: apartment numbers
      const row2Data: string[] = ['', ''];
      for (const col of columnHeaders) {
        row2Data.push(`דירה ${col.label}`);
      }
      row2Data.push('');
      const exRow2 = ws.addRow(row2Data);

      const dataHeaderRow = exRow1.number;
      // Merges: מידות, מספר פרט, סה״כ span 2 rows
      ws.mergeCells(dataHeaderRow, 1, dataHeaderRow + 1, 1);
      ws.mergeCells(dataHeaderRow, 2, dataHeaderRow + 1, 2);
      ws.mergeCells(dataHeaderRow, colCount, dataHeaderRow + 1, colCount);

      // Merge floor group headers
      let aptColStart = 3;
      for (const span of floorSpans) {
        if (span.colspan > 1) {
          ws.mergeCells(dataHeaderRow, aptColStart, dataHeaderRow, aptColStart + span.colspan - 1);
        }
        aptColStart += span.colspan;
      }

      // Style header rows
      [exRow1, exRow2].forEach(r => {
        r.eachCell({ includeEmpty: true }, cell => {
          cell.font = boldFont;
          cell.alignment = centerAlign;
          cell.border = thinBorder;
        });
      });

      // Data rows
      for (const row of filteredRows) {
        const rowData: (string | number)[] = [row.dimensions, row.itemCode];
        for (const col of columnHeaders) {
          rowData.push(getCellValue(row.itemCode, col.aptId));
        }
        rowData.push(getRowTotal(row.itemCode));
        const exRow = ws.addRow(rowData);
        exRow.eachCell({ includeEmpty: true }, cell => {
          cell.font = boldFont;
          cell.alignment = centerAlign;
          cell.border = thinBorder;
        });
      }

      // Totals row
      const totalsData: (string | number)[] = ['', 'סה״כ'];
      for (const col of columnHeaders) {
        totalsData.push(columnTotals.get(col.aptId) || 0);
      }
      totalsData.push(grandTotal);
      const totalsExRow = ws.addRow(totalsData);
      totalsExRow.eachCell({ includeEmpty: true }, cell => {
        cell.font = boldFont;
        cell.alignment = centerAlign;
        cell.border = thinBorder;
      });

      // ── Footer: signature text + brand logos ──
      const lastDataRow = ws.rowCount;
      // Empty spacer row
      ws.addRow([]);
      // Signature text rows
      const sigRow1 = ws.addRow([]);
      ws.mergeCells(sigRow1.number, 1, sigRow1.number, colCount);
      const sigCell1 = sigRow1.getCell(1);
      sigCell1.value = 'לאישורך לביצוע';
      sigCell1.font = { name: 'Calibri', size: 14, bold: true };
      sigCell1.alignment = { horizontal: 'center', vertical: 'middle' };

      const sigRow2 = ws.addRow([]);
      ws.mergeCells(sigRow2.number, 1, sigRow2.number, colCount);
      const sigCell2 = sigRow2.getCell(1);
      sigCell2.value = 'יריב קוסטיקה';
      sigCell2.font = { name: 'Calibri', size: 14, bold: true };
      sigCell2.alignment = { horizontal: 'center', vertical: 'middle' };

      // Empty spacer
      ws.addRow([]);

      // Footer brand logos image
      const footerId = wb.addImage({
        buffer: footerBuf,
        extension: 'jpeg',
      });
      const footerRow = ws.rowCount;
      ws.getRow(footerRow).height = 30;
      ws.addImage(footerId, {
        tl: { col: 0, row: footerRow - 1 },
        ext: { width: Math.min(totalWidthPx, 900), height: 45 },
      });

      // Column widths
      ws.getColumn(1).width = 12;
      ws.getColumn(2).width = 12;
      for (let i = 3; i <= 2 + columnHeaders.length; i++) {
        ws.getColumn(i).width = 8;
      }
      ws.getColumn(colCount).width = 8;

      // Generate and download
      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const date = new Date().toISOString().split('T')[0];
      a.href = url;
      a.download = `${projectName}-allocation-${date}.xlsx`;
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

  // Export to PDF (looks like Excel printout with branding)
  const exportPDF = async () => {
    if (filteredRows.length === 0) {
      toast.error("אין נתונים לייצוא");
      return;
    }

    setExporting(true);
    try {
      const { default: jsPDF } = await import('jspdf');
      const html2canvas = (await import('html2canvas')).default;

      // Load branding images as base64 data URLs
      const [headerRes, footerRes] = await Promise.all([
        fetch('/branding/allocation-header.jpg'),
        fetch('/branding/allocation-footer.jpg'),
      ]);
      const headerBuf = await headerRes.arrayBuffer();
      const footerBuf = await footerRes.arrayBuffer();
      const toDataUrl = (buf: ArrayBuffer, mime = 'image/jpeg') => {
        const bytes = new Uint8Array(buf);
        let binary = '';
        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
        return `data:${mime};base64,${btoa(binary)}`;
      };
      const headerDataUrl = toDataUrl(headerBuf);
      const footerDataUrl = toDataUrl(footerBuf);

      // Build an off-screen HTML table — visible to html2canvas but clipped from user view
      const container = document.createElement('div');
      container.style.cssText = 'position:fixed;left:0;top:0;z-index:9999;direction:rtl;font-family:Arial,sans-serif;background:#fff;padding:12px;white-space:nowrap;clip:rect(0,0,0,0);overflow:hidden;';

      // Header image
      const headerImg = document.createElement('img');
      headerImg.src = headerDataUrl;
      headerImg.style.cssText = 'width:100%;height:auto;display:block;margin-bottom:6px;';
      container.appendChild(headerImg);

      // Date + Addressee fields
      const now2 = new Date();
      const dateStr = `${String(now2.getDate()).padStart(2, '0')}/${String(now2.getMonth() + 1).padStart(2, '0')}/${now2.getFullYear()}`;
      const fieldsDiv = document.createElement('div');
      fieldsDiv.style.cssText = 'direction:rtl;text-align:right;font-size:14px;font-weight:bold;margin:8px 4px;line-height:1.8;';
      fieldsDiv.innerHTML = `${dateStr}<br/>לכבוד:<br/>אתר:<br/>לידי:`;
      container.appendChild(fieldsDiv);

      // Build the table
      const table = document.createElement('table');
      table.style.cssText = 'border-collapse:collapse;font-size:11px;direction:rtl;text-align:center;';

      // Floor group header row
      const thead = document.createElement('thead');
      const tr1 = document.createElement('tr');
      const cellStyle = 'border:1px solid #000;padding:3px 4px;font-weight:bold;text-align:center;';
      const headerBg = 'background:#dce6f1;';

      // מידות (rowspan 2)
      const thDim = document.createElement('th');
      thDim.rowSpan = 2;
      thDim.style.cssText = cellStyle + headerBg + 'min-width:60px;';
      thDim.textContent = 'מידות';
      tr1.appendChild(thDim);

      // מספר פרט (rowspan 2)
      const thCode = document.createElement('th');
      thCode.rowSpan = 2;
      thCode.style.cssText = cellStyle + headerBg + 'min-width:60px;';
      thCode.textContent = 'מספר פרט';
      tr1.appendChild(thCode);

      // Floor spans
      for (const span of floorSpans) {
        const th = document.createElement('th');
        th.colSpan = span.colspan;
        th.style.cssText = cellStyle + headerBg;
        th.textContent = span.label;
        tr1.appendChild(th);
      }

      // סה״כ (rowspan 2)
      const thTotal = document.createElement('th');
      thTotal.rowSpan = 2;
      thTotal.style.cssText = cellStyle + headerBg + 'min-width:40px;';
      thTotal.textContent = 'סה״כ';
      tr1.appendChild(thTotal);
      thead.appendChild(tr1);

      // Apartment numbers row
      const tr2 = document.createElement('tr');
      for (const col of columnHeaders) {
        const th = document.createElement('th');
        th.style.cssText = cellStyle + 'background:#eef2f7;font-size:10px;min-width:28px;';
        th.textContent = `דירה ${col.label}`;
        tr2.appendChild(th);
      }
      thead.appendChild(tr2);
      table.appendChild(thead);

      // Data rows
      const tbody = document.createElement('tbody');
      filteredRows.forEach((row, idx) => {
        const tr = document.createElement('tr');
        const rowBg = idx % 2 === 0 ? '' : 'background:#f5f5f5;';

        const tdDim = document.createElement('td');
        tdDim.style.cssText = cellStyle + rowBg + 'font-family:monospace;font-size:10px;';
        tdDim.textContent = row.dimensions;
        tr.appendChild(tdDim);

        const tdCode = document.createElement('td');
        tdCode.style.cssText = cellStyle + rowBg;
        tdCode.textContent = row.itemCode;
        tr.appendChild(tdCode);

        for (const col of columnHeaders) {
          const td = document.createElement('td');
          td.style.cssText = cellStyle + rowBg + 'min-width:28px;';
          const v = getCellValue(row.itemCode, col.aptId);
          td.textContent = v > 0 ? String(v) : '';
          tr.appendChild(td);
        }

        const tdRowTotal = document.createElement('td');
        tdRowTotal.style.cssText = cellStyle + rowBg + 'font-weight:bold;background:#eef2f7;';
        tdRowTotal.textContent = String(getRowTotal(row.itemCode));
        tr.appendChild(tdRowTotal);

        tbody.appendChild(tr);
      });

      // Totals row
      const trTotals = document.createElement('tr');
      const tdEmpty = document.createElement('td');
      tdEmpty.style.cssText = cellStyle + headerBg;
      tdEmpty.textContent = '';
      trTotals.appendChild(tdEmpty);

      const tdTotalLabel = document.createElement('td');
      tdTotalLabel.style.cssText = cellStyle + headerBg;
      tdTotalLabel.textContent = 'סה״כ';
      trTotals.appendChild(tdTotalLabel);

      for (const col of columnHeaders) {
        const td = document.createElement('td');
        td.style.cssText = cellStyle + headerBg;
        td.textContent = String(columnTotals.get(col.aptId) || 0);
        trTotals.appendChild(td);
      }

      const tdGrand = document.createElement('td');
      tdGrand.style.cssText = cellStyle + 'background:#c5d9f1;font-weight:bold;';
      tdGrand.textContent = String(grandTotal);
      trTotals.appendChild(tdGrand);

      tbody.appendChild(trTotals);
      table.appendChild(tbody);
      container.appendChild(table);

      // Signature text
      const sigDiv = document.createElement('div');
      sigDiv.style.cssText = 'text-align:center;margin-top:12px;font-size:16px;font-weight:bold;direction:rtl;';
      sigDiv.innerHTML = 'לאישורך לביצוע<br/>יריב קוסטיקה';
      container.appendChild(sigDiv);

      // Footer image
      const footerImg = document.createElement('img');
      footerImg.src = footerDataUrl;
      footerImg.style.cssText = 'width:100%;height:auto;display:block;margin-top:12px;';
      container.appendChild(footerImg);

      document.body.appendChild(container);

      // Wait for images inside the container to fully load
      const imgs = container.querySelectorAll('img');
      await Promise.all(Array.from(imgs).map(img =>
        img.complete ? Promise.resolve() : new Promise(r => { img.onload = r; img.onerror = r; })
      ));
      // Extra tick for layout
      await new Promise(r => setTimeout(r, 100));

      // Render to canvas
      const canvas = await html2canvas(container, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
      });

      document.body.removeChild(container);

      // Create PDF sized to fit the entire content on one page (A3 landscape proportions)
      const A3_W = 420;
      const A3_H = 297;
      const margin = 6;

      // Scale content to fit A3 width, then check if height fits — if not, extend page height
      const contentW = canvas.width;
      const contentH = canvas.height;
      const imgW = A3_W - margin * 2;
      const imgH = (contentH * imgW) / contentW;

      // Use A3 landscape width but extend height if needed to fit everything on one page
      const pageH = Math.max(A3_H, imgH + margin * 2);

      const doc = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: [A3_W, pageH],
      });
      const imgData = canvas.toDataURL('image/jpeg', 0.92);
      doc.addImage(imgData, 'JPEG', margin, margin, imgW, imgH);

      const date = new Date().toISOString().split('T')[0];
      doc.save(`${projectName}-allocation-${date}.pdf`);

      toast.success("הקובץ הורד בהצלחה");
    } catch (error) {
      console.error("PDF export error:", error);
      toast.error("שגיאה בייצוא PDF");
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

  // Identify the first apartment index of each floor group (for thick border)
  const floorBoundaryIndices = useMemo(() => {
    const indices = new Set<number>();
    let prevFloorId: number | null = null;
    for (let i = 0; i < columnHeaders.length; i++) {
      if (columnHeaders[i].floorId !== prevFloorId) {
        if (prevFloorId !== null) indices.add(i); // not the very first group
        prevFloorId = columnHeaders[i].floorId;
      }
    }
    return indices;
  }, [columnHeaders]);

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
                onClick={exportPDF}
                disabled={exporting}
              >
                {exporting ? <Loader2 className="h-4 w-4 ml-2 animate-spin" /> : <FileText className="h-4 w-4 ml-2" />}
                PDF
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
                  {floorSpans.map((span, spanIdx) => (
                    <th
                      key={span.floorId}
                      colSpan={span.colspan}
                      className={`bg-primary/10 border-b border-l px-2 py-2 text-center font-semibold ${spanIdx > 0 ? 'border-r-[3px] border-r-gray-500' : ''}`}
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
                  {columnHeaders.map((col, colIdx) => (
                    <th
                      key={col.aptId}
                      className={`bg-muted/70 border-b border-l px-1 py-1.5 text-center font-medium text-xs ${floorBoundaryIndices.has(colIdx) ? 'border-r-[3px] border-r-gray-500' : ''}`}
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
                      {columnHeaders.map((col, colIdx) => {
                        const value = getCellValue(row.itemCode, col.aptId);
                        return (
                          <td
                            key={col.aptId}
                            className={`border-b border-l px-1 py-1.5 text-center tabular-nums ${floorBoundaryIndices.has(colIdx) ? 'border-r-[3px] border-r-gray-500' : ''}`}
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
                    {columnHeaders.map((col, colIdx) => (
                      <td
                        key={col.aptId}
                        className={`border-t-2 border-l px-1 py-2 text-center tabular-nums ${floorBoundaryIndices.has(colIdx) ? 'border-r-[3px] border-r-gray-500' : ''}`}
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
