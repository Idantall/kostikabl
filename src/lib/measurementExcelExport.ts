import ExcelJS from 'exceljs';
import { wingPositionToPngBase64 } from '@/components/WingPositionSelector';

// Generate wing images as base64 PNGs using canvas
function getWingImages(): Record<string, string> {
  const images: Record<string, string> = {};
  for (const pos of ['TL', 'TR', 'BL', 'BR', 'TP']) {
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
  blind_jamb_item: string | null;
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
  projectStatus?: string;
}

// Column definition for dynamic column system
interface ColumnDef {
  key: string;
  header: string;
  width: number;
  isWingImage?: boolean;
}

// Build column definitions based on project status
function getColumnDefs(projectStatus?: string): ColumnDef[] {
  const cols: ColumnDef[] = [
    { key: 'location', header: 'מיקום בדירה', width: 7.5 },
    { key: 'opening_no', header: "מס'  פתח", width: 5 },
    { key: 'contract_item', header: 'פרט חוזה', width: 6 },
  ];

  // Add פרט משקופים for blind_jambs and later stages
  if (projectStatus !== 'pre_contract') {
    cols.push({ key: 'blind_jamb_item', header: 'פרט משקופים', width: 6 });
  }

  // Add פרט ייצור for measurement and later stages
  if (projectStatus !== 'pre_contract' && projectStatus !== 'blind_jambs') {
    cols.push({ key: 'item_code', header: 'פרט יצור', width: 6 });
  }

  cols.push(
    { key: 'height', header: 'גובה', width: 13 },
    { key: 'width', header: 'רוחב', width: 5.5 },
    { key: 'notes', header: 'גובה מהריצוף', width: 6.5 },
    { key: 'mamad', header: 'ממד כיס בצד', width: 5.5 },
    { key: 'engine_side', header: 'צד מנוע', width: 5.5 },
    { key: 'internal_wing', header: 'כנף פנימית מבט פנים', width: 7 },
    { key: 'wing_position', header: 'ציר מבט פנים פתיחה פנימה', width: 13, isWingImage: true },
    { key: 'wing_position_out', header: 'ציר מבט פנים פתיחה החוצה', width: 13, isWingImage: true },
    { key: 'glyph', header: 'גליף', width: 5 },
    { key: 'depth', header: 'עומק עד הפריקסט', width: 6.5 },
    { key: 'jamb_height', header: 'מדרגה בשיש', width: 5.5 },
    { key: 'is_manual', header: 'מנואלה', width: 6 },
    { key: 'field_notes', header: 'הערות', width: 40 },
  );

  return cols;
}

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
      case 'blind_jamb_item': return (mr as any).blind_jamb_item || null;
      case 'item_code': return mr.item_code;
      case 'height': return mr.height;
      case 'width': return mr.width;
      case 'notes': return mr.notes;
      case 'mamad': return mr.mamad;
      case 'field_notes': return mr.field_notes;
      case 'wall_thickness': return mr.wall_thickness || null;
      case 'depth': return mr.depth;
      case 'glyph': return mr.glyph;
      case 'jamb_height': return mr.jamb_height;
      case 'is_manual': return mr.is_manual ? 'מנואלה' : null;
      case 'engine_side': return mr.engine_side;
      case 'internal_wing': return mr.internal_wing || null;
      case 'wing_position': return mr.wing_position || null;
      case 'wing_position_out': return mr.wing_position_out || null;
      default: return null;
    }
  } else {
    const ir = row as ItemRow;
    switch (field) {
      case 'location': return ir.location;
      case 'opening_no': return ir.opening_no;
      case 'contract_item': return (ir as any).contract_item || null;
      case 'blind_jamb_item': return null;
      case 'item_code': return ir.item_code;
      case 'height': return ir.height;
      case 'width': return ir.width;
      case 'notes': return ir.notes;
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

// Parse value as number if it's a plain number, otherwise keep as string
function parseNumericOrString(value: string | null): string | number {
  if (!value) return '';
  const trimmed = value.trim();
  if (/[^\d.-]/.test(trimmed)) return trimmed;
  const num = parseFloat(trimmed);
  return isNaN(num) ? trimmed : num;
}

// Create a styled worksheet matching reference file structure
function createWorksheet(
  workbook: ExcelJS.Workbook,
  sheetName: string,
  sheetRows: (MeasurementRow | ItemRow)[],
  project: ProjectMetadata,
  floorLabel: string,
  apartmentLabel: string,
  wingImages: Record<string, string>,
  columnDefs: ColumnDef[],
  projectStatus?: string
): void {
  const cleanName = sheetName.substring(0, 31).replace(/[\\/?*\[\]:]/g, '_');
  const ws = workbook.addWorksheet(cleanName, {
    views: [{ rightToLeft: true }],
    pageSetup: { orientation: 'landscape', horizontalCentered: true },
  });

  const colCount = columnDefs.length;
  const lastColLetter = String.fromCharCode(64 + colCount);

  // Set column widths
  ws.columns = columnDefs.map((def, i) => ({
    width: def.width,
    key: String.fromCharCode(65 + i)
  }));

  // ROW 1: Title row
  ws.mergeCells(`A1:${String.fromCharCode(64 + Math.min(colCount, 12))}1`);
  let titlePrefix = 'דף מידות לביצוע';
  if (projectStatus === 'blind_jambs') {
    titlePrefix = 'דף מידות משקופים';
  } else if (projectStatus === 'pre_contract') {
    titlePrefix = 'דף מידות חוזה';
  }
  const ruleHe = project.measurement_rule === 'conventional' ? 'קונבנציונלי' : 'ברנוביץ';
  const showRule = projectStatus === 'measurement' || projectStatus === 'running';
  const titleCell = ws.getCell('A1');
  titleCell.value = showRule
    ? `${titlePrefix}  -  ${ruleHe}  -   אלום קוסטיקה בע"מ`
    : `${titlePrefix}  -   אלום קוסטיקה בע"מ`;
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  titleCell.font = { name: 'Calibri', size: 11, bold: true };
  ws.getRow(1).height = 15.95;

  // Date cell
  const dateMergeStart = String.fromCharCode(64 + colCount - 1);
  ws.mergeCells(`${dateMergeStart}1:${lastColLetter}1`);
  const dateCell = ws.getCell(`${dateMergeStart}1`);
  dateCell.value = { formula: 'TODAY()' };
  dateCell.numFmt = 'mm-dd-yy';
  dateCell.alignment = { horizontal: 'center', vertical: 'middle' };

  // ROW 2: Empty spacer
  ws.getRow(2).height = 8.25;

  // ROW 3: Metadata row
  ws.mergeCells(`A3:${String.fromCharCode(64 + Math.min(colCount, 14))}3`);
  const metadataCell = ws.getCell('A3');
  const site = project.name || '';
  const building = project.building_code || '';
  // Apartment type is stored directly in apartment_label (e.g. "31 (טיפוס א)")
  // No need to derive from floor label - apartments have their own type
  metadataCell.value = `   לקוח/קבלן:                      באתר:    ${site}                     בניין:  ${building}                 קומה:  ${floorLabel}         דירה:   ${apartmentLabel}                         `;
  metadataCell.alignment = { horizontal: 'center', vertical: 'middle' };
  metadataCell.font = { name: 'Calibri', size: 11, bold: true };
  ws.getRow(3).height = 15.95;

  // ROW 4: Empty spacer
  ws.getRow(4).height = 15;

  // ROW 5: Header row - HORIZONTAL text (no rotation)
  ws.getRow(5).height = 30;

  for (let i = 0; i < columnDefs.length; i++) {
    const col = String.fromCharCode(65 + i);
    const cell = ws.getCell(`${col}5`);
    cell.value = columnDefs[i].header;
    cell.alignment = { horizontal: 'center', vertical: 'top', wrapText: true };
    cell.font = { name: 'Calibri', size: 11, bold: false };
    cell.border = {
      top: { style: 'medium' },
      bottom: { style: 'medium' },
      left: { style: 'medium' },
      right: { style: 'medium' },
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
    ws.getRow(rowIndex).height = 30;

    for (let i = 0; i < columnDefs.length; i++) {
      const def = columnDefs[i];
      const col = String.fromCharCode(65 + i);
      const cell = ws.getCell(`${col}${rowIndex}`);

      let value: string | number = '';
      if (def.key === 'height' || def.key === 'width') {
        value = parseNumericOrString(getField(row, def.key));
      } else if (def.isWingImage) {
        value = ''; // Wing images are embedded separately
      } else {
        value = getField(row, def.key) || '';
      }

      cell.value = value;
      // Match reference styling per column
      if (def.key === 'opening_no') {
        cell.font = { name: 'Calibri', size: 9, bold: false };
      } else if (def.key === 'item_code' || def.key === 'contract_item' || def.key === 'blind_jamb_item') {
        cell.font = { name: 'Calibri', size: 11, bold: true };
      } else {
        cell.font = { name: 'Calibri', size: 11, bold: false };
      }
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = {
        top: { style: 'medium' },
        bottom: { style: 'medium' },
        left: { style: 'medium' },
        right: { style: 'medium' },
      };
    }

    // Embed wing images
    for (let i = 0; i < columnDefs.length; i++) {
      const def = columnDefs[i];
      if (!def.isWingImage) continue;
      const val = getField(row, def.key) || '';
      if (val && wingImages[val]) {
        const imageId = workbook.addImage({
          base64: wingImages[val],
          extension: 'png',
        });
        ws.addImage(imageId, {
          tl: { col: i + 0.1, row: rowIndex - 1 + 0.05 },
          ext: { width: 28, height: 28 },
          editAs: 'oneCell',
        } as any);
      }
    }

    rowIndex++;
  }

  // Pad to ensure minimum 20 data rows
  const minDataRows = 20;
  const rowsToAdd = Math.max(0, minDataRows - sortedRows.length);

  for (let i = 0; i < rowsToAdd; i++) {
    ws.getRow(rowIndex).height = 18;
    for (let c = 0; c < columnDefs.length; c++) {
      const col = String.fromCharCode(65 + c);
      const cell = ws.getCell(`${col}${rowIndex}`);
      cell.value = '';
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.font = { name: 'Calibri', size: 11, bold: false };
      cell.border = {
        top: { style: 'medium' },
        bottom: { style: 'medium' },
        left: { style: 'medium' },
        right: { style: 'medium' },
      };
    }
    rowIndex++;
  }
}

// Main export function
export async function exportMeasurementToExcel(options: ExportOptions): Promise<void> {
  const { rows, project, selectedFloor, selectedApartment, projectStatus } = options;

  // Build column definitions based on project status
  const columnDefs = getColumnDefs(projectStatus);

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

  const apartmentFloorMap = new Map<string, Set<string>>();
  filteredRows.forEach(row => {
    const apt = getApartmentLabel(row) || 'ללא';
    const floor = getFloorLabel(row) || '';
    if (!apartmentFloorMap.has(apt)) apartmentFloorMap.set(apt, new Set());
    apartmentFloorMap.get(apt)!.add(floor);
  });

  const hasCollisions = Array.from(apartmentFloorMap.values()).some(floors => floors.size > 1);

  filteredRows.forEach(row => {
    const floor = getFloorLabel(row) || '';
    const apt = getApartmentLabel(row) || 'ללא';
    
    let sheetKey: string;
    if (hasCollisions && apartmentFloorMap.get(apt)!.size > 1) {
      sheetKey = `${apt}_${floor}`;
    } else {
      sheetKey = apt;
    }

    if (!groupedBySheet.has(sheetKey)) {
      groupedBySheet.set(sheetKey, { rows: [], floorLabel: floor, apartmentLabel: apt });
    }
    groupedBySheet.get(sheetKey)!.rows.push(row);
  });

  // Create workbook
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Kostika System';
  workbook.created = new Date();

  const sortedSheetKeys = Array.from(groupedBySheet.keys()).sort((a, b) => {
    const aNum = parseInt(a) || Infinity;
    const bNum = parseInt(b) || Infinity;
    if (aNum !== bNum) return aNum - bNum;
    return a.localeCompare(b, 'he');
  });

  const wingImages = getWingImages();

  for (const sheetKey of sortedSheetKeys) {
    const { rows: sheetRows, floorLabel, apartmentLabel } = groupedBySheet.get(sheetKey)!;
    createWorksheet(workbook, sheetKey, sheetRows, project, floorLabel, apartmentLabel, wingImages, columnDefs, projectStatus);
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
