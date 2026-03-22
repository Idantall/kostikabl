import ExcelJS from 'exceljs';
import { wingPositionToPngBase64 } from '@/components/WingPositionSelector';

// Generate wing images as base64 PNGs using canvas
function getWingImages(): Record<string, string> {
  const images: Record<string, string> = {};
  for (const pos of ['TL', 'TR', 'BL', 'BR']) {
    const b64 = wingPositionToPngBase64(pos);
    if (b64) images[pos] = b64;
  }
  return images;
}

// Types for measurement data
interface MeasurementRow {
  id: string;
  floor_label: string | null;
  apartment_label: string | null;
  location_in_apartment: string | null;
  opening_no: string | null;
  contract_item: string | null;
  item_code: string | null;
  height: string | null;
  width: string | null;
  notes: string | null;
  hinge_direction: string | null;
  mamad: string | null;
  field_notes: string | null;
  wall_thickness?: string | null;
  depth: string | null;
  glyph: string | null;
  jamb_height: string | null;
  is_manual: boolean;
  engine_side: string | null;
  internal_wing: string | null;
  wing_position: string | null;
  wing_position_out: string | null;
}

interface ItemRow {
  id: number;
  floor_code?: string;
  apt_number?: string;
  location: string | null;
  opening_no: string | null;
  contract_item?: string | null;
  item_code: string;
  height: string | null;
  width: string | null;
  notes: string | null;
  hinge_direction?: string | null;
  mamad?: string | null;
  field_notes: string | null;
  depth?: string | null;
  is_manual?: boolean;
  motor_side: string | null;
}

interface ProjectMetadata {
  name: string;
  building_code?: string | null;
  measurement_rule?: string | null;
}

interface ExportOptions {
  rows: (MeasurementRow | ItemRow)[];
  project: ProjectMetadata;
  selectedFloor?: string;
  selectedApartment?: string;
}

// Column widths from reference file (A-P)
const COLUMN_WIDTHS = [
  11.75, // A - מיקום בדירה
  9.75,  // B - מס' פתח
  9.5,   // C - פרט חוזה
  8.625, // D - פרט יצור
  16,    // E - גובה (wider for up to 8 digits)
  21.625,// F - רוחב
  8.375, // G - גובה מהריצוף
  9.75,  // H - ממד כיס בצד
  8.25,  // I - גליף
  9.625, // J - עומק עד הפריקסט
  13,    // K - מדרגה בשיש
  8,     // L - מנואלה
  9.625, // M - צד מנוע
  13,    // N - הערות
  11,    // O - כנף פנימית מבט פנים
  11,    // P - ציר מבט פנים פתיחה פנימה
  11,    // Q - ציר מבט פנים פתיחה החוצה
];

// Get floor label from row
const getFloorLabel = (row: MeasurementRow | ItemRow): string | null => {
  if ('floor_label' in row) return row.floor_label;
  return (row as ItemRow).floor_code || null;
};

// Get apartment label from row
const getApartmentLabel = (row: MeasurementRow | ItemRow): string | null => {
  if ('apartment_label' in row) return row.apartment_label;
  return (row as ItemRow).apt_number || null;
};

// Get field value from row
const getField = (row: MeasurementRow | ItemRow, field: string): string | null => {
  if ('floor_label' in row) {
    const mr = row as MeasurementRow;
    switch (field) {
      case 'location': return mr.location_in_apartment;
      case 'opening_no': return mr.opening_no;
      case 'contract_item': return mr.contract_item;
      case 'item_code': return mr.item_code;
      case 'height': return mr.height;
      case 'width': return mr.width;
      case 'notes': return mr.notes;
      case 'hinge_direction': return mr.hinge_direction ? `ציר ${mr.hinge_direction}` : null;
      case 'mamad': return mr.mamad;
      case 'field_notes': return mr.field_notes;
      case 'wall_thickness': return mr.wall_thickness || null;
      case 'depth': return mr.depth;
      case 'glyph': return mr.glyph;
      case 'jamb_height': return mr.jamb_height;
      case 'is_manual': return mr.is_manual ? 'מנואלה' : null;
      case 'engine_side': return mr.engine_side;
      case 'internal_wing': return (mr as any).internal_wing || null;
      case 'wing_position': return (mr as any).wing_position || null;
      case 'wing_position_out': return (mr as any).wing_position_out || null;
      default: return null;
    }
  } else {
    const ir = row as ItemRow;
    switch (field) {
      case 'location': return ir.location;
      case 'opening_no': return ir.opening_no;
      case 'contract_item': return (ir as any).contract_item || null;
      case 'item_code': return ir.item_code;
      case 'height': return ir.height;
      case 'width': return ir.width;
      case 'notes': return ir.notes;
      case 'hinge_direction': return (ir as any).hinge_direction ? `ציר ${(ir as any).hinge_direction}` : null;
      case 'mamad': return (ir as any).mamad || null;
      case 'field_notes': return ir.field_notes;
      case 'wall_thickness': return null;
      case 'depth': return (ir as any).depth || null;
      case 'glyph': return null;
      case 'jamb_height': return null;
      case 'is_manual': return (ir as any).is_manual ? 'מנואלה' : null;
      case 'engine_side': return ir.motor_side;
      case 'internal_wing': return null;
      case 'wing_position': return null;
      case 'wing_position_out': return null;
      default: return null;
    }
  }
};

// Create a styled worksheet matching reference file structure
function createWorksheet(
  workbook: ExcelJS.Workbook,
  sheetName: string,
  sheetRows: (MeasurementRow | ItemRow)[],
  project: ProjectMetadata,
  floorLabel: string,
  apartmentLabel: string,
  wingImages: Record<string, string>
): void {
  // Clean sheet name for Excel (max 31 chars, no special chars)
  const cleanName = sheetName.substring(0, 31).replace(/[\\/?*\[\]:]/g, '_');
  const ws = workbook.addWorksheet(cleanName, {
    views: [{ rightToLeft: true }],
    pageSetup: { orientation: 'landscape' }
  });

  // Set column widths
  ws.columns = COLUMN_WIDTHS.map((width, i) => ({
    width,
    key: String.fromCharCode(65 + i) // A, B, C, etc.
  }));

  // ROW 1: Title row
  ws.mergeCells('A1:L1');
  const ruleHe = project.measurement_rule === 'conventional' ? 'קונבנציונלי' : 'ברנוביץ';
  const titleCell = ws.getCell('A1');
  titleCell.value = `דף מידות לביצוע  -  ${ruleHe}  -   אלום קוסטיקה י.ש בע"מ`;
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  titleCell.font = { name: 'Arial', size: 11, bold: true };
  ws.getRow(1).height = 15.95;

  // Date cell (N1:O1)
  ws.mergeCells('N1:O1');
  const dateCell = ws.getCell('N1');
  dateCell.value = { formula: 'TODAY()' };
  dateCell.numFmt = 'mm-dd-yy';
  dateCell.alignment = { horizontal: 'center', vertical: 'middle' };

  // ROW 2: Empty spacer
  ws.getRow(2).height = 8.25;

  // ROW 3: Metadata row
  ws.mergeCells('A3:N3');
  const metadataCell = ws.getCell('A3');
  const contractor = ''; // Not stored in DB
  const site = project.name || '';
  const building = project.building_code || '';
  metadataCell.value = `   לקוח/קבלן:   ${contractor}                   באתר:    ${site}                     בניין:  ${building}                 קומה:  ${floorLabel}         דירה:   ${apartmentLabel}                         `;
  metadataCell.alignment = { horizontal: 'center', vertical: 'middle' };
  metadataCell.font = { name: 'Arial', size: 11, bold: true };
  ws.getRow(3).height = 15.95;

  // ROW 4: Empty spacer
  ws.getRow(4).height = 15;

  // ROW 5: Header row with merged angle columns
  ws.getRow(5).height = 66;
  
  // Simple headers A-J
  const simpleHeaders: { col: string; value: string }[] = [
    { col: 'A', value: 'מיקום בדירה' },
    { col: 'B', value: "מס'  פתח" },
    { col: 'C', value: 'פרט חוזה' },
    { col: 'D', value: 'פרט יצור' },
    { col: 'E', value: 'גובה' },
    { col: 'F', value: 'רוחב' },
    { col: 'G', value: 'גובה מהריצוף' },
    { col: 'H', value: 'ממד כיס בצד' },
    { col: 'I', value: 'גליף' },
    { col: 'J', value: 'עומק עד הפריקסט' },
    { col: 'K', value: 'מדרגה בשיש' },
    { col: 'L', value: 'מנואלה' },
    { col: 'M', value: 'צד מנוע' },
    { col: 'N', value: 'הערות' },
    { col: 'O', value: 'כנף פנימית מבט פנים' },
    { col: 'P', value: 'ציר מבט פנים פתיחה פנימה' },
    { col: 'Q', value: 'ציר מבט פנים פתיחה החוצה' },
  ];

  // Write header cells
  for (const { col, value } of simpleHeaders) {
    const cell = ws.getCell(`${col}5`);
    cell.value = value;
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true, textRotation: 90 };
    cell.font = { name: 'Arial', size: 10, bold: true };
    cell.border = {
      top: { style: 'thin' },
      bottom: { style: 'thin' },
      left: { style: 'thin' },
      right: { style: 'thin' },
    };
  }

  const sortedRows = [...sheetRows].sort((a, b) => {
    const aNum = parseInt(getField(a, 'opening_no') || '999999', 10);
    const bNum = parseInt(getField(b, 'opening_no') || '999999', 10);
    return aNum - bNum;
  });

  // DATA ROWS (starting at row 6)
  let rowIndex = 6;
  for (const row of sortedRows) {
    ws.getRow(rowIndex).height = 30; // Taller for images

    // Build cell values
    const notesValue = getField(row, 'notes') || '';
    const fieldNotesValue = getField(row, 'field_notes') || '';

    const wingPosVal = getField(row, 'wing_position') || '';
    const wingPosOutVal = getField(row, 'wing_position_out') || '';

    const values: { col: string; value: string | number }[] = [
      { col: 'A', value: getField(row, 'location') || '' },
      { col: 'B', value: getField(row, 'opening_no') || '' },
      { col: 'C', value: getField(row, 'contract_item') || '' },
      { col: 'D', value: getField(row, 'item_code') || '' },
      { col: 'E', value: parseNumericOrString(getField(row, 'height')) },
      { col: 'F', value: parseNumericOrString(getField(row, 'width')) },
      { col: 'G', value: notesValue },
      { col: 'H', value: getField(row, 'mamad') || '' },
      { col: 'I', value: getField(row, 'glyph') || '' },
      { col: 'J', value: getField(row, 'depth') || '' },
      { col: 'K', value: getField(row, 'jamb_height') || '' },
      { col: 'L', value: getField(row, 'is_manual') || '' },
      { col: 'M', value: getField(row, 'engine_side') || '' },
      { col: 'N', value: fieldNotesValue },
      { col: 'O', value: getField(row, 'internal_wing') || '' },
      { col: 'P', value: '' },
      { col: 'Q', value: '' },
    ];

    // Write values to cells
    for (const { col, value } of values) {
      const cell = ws.getCell(`${col}${rowIndex}`);
      cell.value = value;
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.font = { name: 'Arial', size: 14, bold: true };
      cell.border = {
        top: { style: 'thin' },
        bottom: { style: 'thin' },
        left: { style: 'thin' },
        right: { style: 'thin' },
      };
    }

    // Embed wing images in Q and R columns (ExcelJS uses 0-based col index)
    const addWingImage = (val: string, col0: number) => {
      if (val && wingImages[val]) {
        const imageId = workbook.addImage({
          base64: wingImages[val],
          extension: 'png',
        });
        ws.addImage(imageId, {
          tl: { col: col0 + 0.1, row: rowIndex - 1 + 0.05 },
          ext: { width: 28, height: 28 },
          editAs: 'oneCell',
        } as any);
      }
    };
    addWingImage(wingPosVal, 16);    // Q = 0-based index 16
    addWingImage(wingPosOutVal, 17); // R = 0-based index 17

    rowIndex++;
  }

  // Pad to ensure minimum 20 data rows (rows 6-25)
  const minDataRows = 20;
  const dataRowsWritten = sortedRows.length;
  const rowsToAdd = Math.max(0, minDataRows - dataRowsWritten);

  for (let i = 0; i < rowsToAdd; i++) {
    ws.getRow(rowIndex).height = 18;

    // Add empty cells with borders for columns A-O
    ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R'].forEach(col => {
      const cell = ws.getCell(`${col}${rowIndex}`);
      cell.value = '';
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.font = { name: 'Arial', size: 14, bold: true };
      cell.border = {
        top: { style: 'thin' },
        bottom: { style: 'thin' },
        left: { style: 'thin' },
        right: { style: 'thin' },
      };
    });

    rowIndex++;
  }
}

// Parse value as number if it's a plain number, otherwise keep as string
function parseNumericOrString(value: string | null): string | number {
  if (!value) return '';
  const trimmed = value.trim();
  // If contains non-numeric chars like '+', keep as string
  if (/[^\d.-]/.test(trimmed)) {
    return trimmed;
  }
  const num = parseFloat(trimmed);
  return isNaN(num) ? trimmed : num;
}

// Main export function
export async function exportMeasurementToExcel(options: ExportOptions): Promise<void> {
  const { rows, project, selectedFloor, selectedApartment } = options;

  // Filter rows based on selection
  let filteredRows = rows;
  if (selectedFloor && selectedFloor !== 'all') {
    filteredRows = filteredRows.filter(row => getFloorLabel(row) === selectedFloor);
  }
  if (selectedApartment && selectedApartment !== 'all') {
    filteredRows = filteredRows.filter(row => getApartmentLabel(row) === selectedApartment);
  }

  // Group rows by (floor_label, apartment_label)
  const groupedBySheet = new Map<string, { 
    rows: (MeasurementRow | ItemRow)[];
    floorLabel: string;
    apartmentLabel: string;
  }>();

  // Track apartment labels for collision detection
  const apartmentCounts = new Map<string, number>();
  filteredRows.forEach(row => {
    const apt = getApartmentLabel(row) || 'ללא';
    apartmentCounts.set(apt, (apartmentCounts.get(apt) || 0) + 1);
  });

  // Check for collisions (same apartment label across different floors)
  const apartmentFloorMap = new Map<string, Set<string>>();
  filteredRows.forEach(row => {
    const apt = getApartmentLabel(row) || 'ללא';
    const floor = getFloorLabel(row) || '';
    if (!apartmentFloorMap.has(apt)) {
      apartmentFloorMap.set(apt, new Set());
    }
    apartmentFloorMap.get(apt)!.add(floor);
  });

  const hasCollisions = Array.from(apartmentFloorMap.values()).some(floors => floors.size > 1);

  filteredRows.forEach(row => {
    const floor = getFloorLabel(row) || '';
    const apt = getApartmentLabel(row) || 'ללא';
    
    // Sheet name logic: prefer simple apartment label if unique, otherwise include floor
    let sheetKey: string;
    if (hasCollisions && apartmentFloorMap.get(apt)!.size > 1) {
      sheetKey = `${apt}_${floor}`;
    } else {
      sheetKey = apt;
    }

    if (!groupedBySheet.has(sheetKey)) {
      groupedBySheet.set(sheetKey, {
        rows: [],
        floorLabel: floor,
        apartmentLabel: apt
      });
    }
    groupedBySheet.get(sheetKey)!.rows.push(row);
  });

  // Create workbook
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Kostika System';
  workbook.created = new Date();

  // Sort sheet keys for consistent output (numeric first, then alphabetic)
  const sortedSheetKeys = Array.from(groupedBySheet.keys()).sort((a, b) => {
    const aNum = parseInt(a) || Infinity;
    const bNum = parseInt(b) || Infinity;
    if (aNum !== bNum) return aNum - bNum;
    return a.localeCompare(b, 'he');
  });

  // Pre-load wing images
  const wingImages = getWingImages();

  // Create worksheets
  for (const sheetKey of sortedSheetKeys) {
    const { rows: sheetRows, floorLabel, apartmentLabel } = groupedBySheet.get(sheetKey)!;
    createWorksheet(workbook, sheetKey, sheetRows, project, floorLabel, apartmentLabel, wingImages);
  }

  // Generate and download
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { 
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `measurement_sheets_${project.name || 'export'}.xlsx`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
