import * as XLSX from 'xlsx';

export interface MeasurementRow {
  id?: string;
  project_id?: number;
  floor_label: string | null;
  apartment_label: string | null;
  sheet_name: string;
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
  wall_thickness: string | null;
  depth: string | null;
  glyph: string | null;
  jamb_height: string | null;
  is_manual: boolean;
  engine_side: string | null;
  internal_wing: string | null;
}

export interface MeasurementParseResult {
  rows: MeasurementRow[];
  warnings: string[];
  errors: string[];
}

// Column synonyms for measurement Excel (Hebrew)
const MEASUREMENT_COLUMNS = {
  location_in_apartment: ['מיקום בדירה', 'מיקום'],
  opening_no: ['מס\' פתח', 'פתח', 'מספר פתח'],
  contract_item: ['פרט חוזה'],
  item_code: ['מס\' פרט', 'מספר פרט', 'מספר פריט', 'פרט', 'פרט יצור'],
  height: ['גובה'],
  width: ['רוחב'],
  notes: ['הערות', 'גובה מהריצוף'],
  hinge_direction: ['כיוון ציר', 'ציר מבט מבפנים'],
  mamad: ['ממד', 'ממד כיס בצד'],
  field_notes: ['הערות מהשטח', 'הערות שטח'],
  wall_thickness: ['עובי קיר', 'עובי'],
  depth: ['עומק', 'עומק עד הפריקסט'],
  glyph: ['גליף'],
  jamb_height: ['גובה יואים', 'גובה יאם', 'מדרגה בשיש'],
  is_manual: ['מנואלה'],
  engine_side: ['צד מנוע', 'צד'],
  internal_wing: ['כנף פנימית מבט פנים', 'כנף פנימית'],
};

// Normalize engine side value
const normalizeEngineSide = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const trimmed = value.trim().toUpperCase();
  if (trimmed === '') return null;
  if (trimmed === 'L' || trimmed === 'LEFT' || trimmed.includes('שמאל')) return 'L';
  if (trimmed === 'R' || trimmed === 'RIGHT' || trimmed.includes('ימין')) return 'R';
  return null;
};

// Normalize internal wing side value
const normalizeInternalWing = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const trimmed = value.trim().toUpperCase();
  if (trimmed === '') return null;
  if (trimmed === 'L' || trimmed === 'LEFT' || trimmed.includes('שמאל')) return 'L';
  if (trimmed === 'R' || trimmed === 'RIGHT' || trimmed.includes('ימין')) return 'R';
  return null;
};

// Normalize hinge direction to L/R
const normalizeHingeDirection = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const trimmed = value.trim().toUpperCase();
  if (trimmed === '') return null;
  if (trimmed === 'L' || trimmed.includes('L') || trimmed.includes('ימין')) return 'L';
  if (trimmed === 'R' || trimmed.includes('R') || trimmed.includes('שמאל')) return 'R';
  return null;
};

// Check if manual flag is set
const isManualValue = (value: string | null | undefined): boolean => {
  if (!value) return false;
  const trimmed = value.trim().toLowerCase();
  return trimmed === 'מנואלה' || trimmed === 'כן' || trimmed === 'yes' || trimmed === 'true' || trimmed === '1';
};

// Map floor code (e.g., "קרקע" -> "0")
const mapFloorCode = (floorText: string): string => {
  const normalized = floorText.trim();
  if (normalized === 'קרקע' || normalized.toLowerCase() === 'ground') {
    return '0';
  }
  return normalized;
};

// Find header row by looking for "מיקום בדירה"
const findHeaderRow = (sheet: XLSX.WorkSheet): number => {
  const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1');
  
  for (let row = 0; row < Math.min(20, range.e.r + 1); row++) {
    for (let col = 0; col <= range.e.c; col++) {
      const cellAddress = XLSX.utils.encode_cell({ r: row, c: col });
      const cell = sheet[cellAddress];
      if (cell) {
        const value = String(cell.v || '').trim();
        if (value === 'מיקום בדירה') {
          return row;
        }
      }
    }
  }
  return -1;
};

// Map column indices from header row
interface ColumnMap {
  [key: string]: number | undefined;
}

const mapColumns = (sheet: XLSX.WorkSheet, headerRow: number): ColumnMap => {
  const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1');
  const map: ColumnMap = {};

  const normalize = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

  for (let col = 0; col <= range.e.c; col++) {
    const cellAddress = XLSX.utils.encode_cell({ r: headerRow, c: col });
    const cell = sheet[cellAddress];
    if (!cell) continue;

    const header = normalize(String(cell.v || ''));
    if (!header) continue;

    // Collect candidates for this column and pick the best match.
    // This avoids ambiguous substring matches like "הערות" matching "הערות מהשטח"
    // and prevents assigning the same column to multiple fields.
    const candidates: Array<{ key: string; score: number; len: number }> = [];

    for (const [key, synonyms] of Object.entries(MEASUREMENT_COLUMNS)) {
      if (map[key] !== undefined) continue;

      let bestScore = 0;
      let bestLen = 0;

      for (const synonym of synonyms) {
        const syn = normalize(synonym);
        if (!syn) continue;

        let score = 0;
        if (header === syn) score = 3;
        else if (header.includes(syn)) score = 2;

        if (score > bestScore || (score === bestScore && syn.length > bestLen)) {
          bestScore = score;
          bestLen = syn.length;
        }
      }

      if (bestScore > 0) {
        candidates.push({ key, score: bestScore, len: bestLen });
      }
    }

    candidates.sort((a, b) => b.score - a.score || b.len - a.len);

    const best = candidates[0];
    if (best) {
      map[best.key] = col;
    }
  }

  // Safety: never allow jamb_height to map to the same column as height.
  if (
    map.jamb_height !== undefined &&
    map.height !== undefined &&
    map.jamb_height === map.height
  ) {
    delete map.jamb_height;
  }

  return map;
};

// Parse floor/apartment metadata from top rows
const parseMetadata = (
  sheet: XLSX.WorkSheet, 
  sheetName: string
): { floor: string | null; apartment: string | null } => {
  const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1');
  let floor: string | null = null;
  let apartment: string | null = null;
  
  // Search first 10 rows
  for (let row = 0; row < Math.min(10, range.e.r + 1); row++) {
    for (let col = 0; col <= range.e.c; col++) {
      const cellAddress = XLSX.utils.encode_cell({ r: row, c: col });
      const cell = sheet[cellAddress];
      if (!cell) continue;
      
      const value = String(cell.v || '');
      
      // Look for קומה: X
      const floorMatch = value.match(/קומה:?\s*([^\s,]+)/i);
      if (floorMatch && !floor) {
        floor = mapFloorCode(floorMatch[1]);
      }
      
      // Look for דירה: Y
      const aptMatch = value.match(/דירה:?\s*([^\s,]+)/i);
      if (aptMatch && !apartment) {
        apartment = aptMatch[1].trim();
      }
    }
  }
  
  // Fallback: try to extract from sheet name
  if (!apartment) {
    const aptMatch = sheetName.match(/דירה:?\s*([א-ת\w\d]+)/i) || 
                     sheetName.match(/^(\d+)$/);
    if (aptMatch) {
      apartment = aptMatch[1].trim();
    }
  }
  
  return { floor, apartment };
};

// Main parser for measurement Excel
export const parseMeasurementExcel = async (file: File): Promise<MeasurementParseResult> => {
  const rows: MeasurementRow[] = [];
  const warnings: string[] = [];
  const errors: string[] = [];
  
  try {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });
    
    if (workbook.SheetNames.length === 0) {
      errors.push('הקובץ ריק או לא מכיל גיליונות');
      return { rows, warnings, errors };
    }
    
    // Process each sheet
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      
      // Find header row
      const headerRow = findHeaderRow(sheet);
      if (headerRow === -1) {
        warnings.push(`גיליון "${sheetName}": לא נמצאה שורת כותרת עם "מיקום בדירה"`);
        continue;
      }
      
      // Map columns
      const columnMap = mapColumns(sheet, headerRow);
      
      // Parse metadata
      const metadata = parseMetadata(sheet, sheetName);
      
      // Parse data rows
      const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1');
      let emptyRowCount = 0;
      
      for (let row = headerRow + 1; row <= range.e.r; row++) {
        const getCell = (key: string): string | null => {
          const col = columnMap[key];
          if (col === undefined) return null;
          const cellAddress = XLSX.utils.encode_cell({ r: row, c: col });
          const cell = sheet[cellAddress];
          if (!cell) return null;
          const value = String(cell.v || '').trim();
          return value || null;
        };
        
        // Check if row has item_code - this is required
        const itemCode = getCell('item_code');
        
        if (!itemCode) {
          emptyRowCount++;
          if (emptyRowCount >= 3) break; // Stop after 3 consecutive empty rows
          continue;
        }
        emptyRowCount = 0;
        
        const location = getCell('location_in_apartment');
        const openingNo = getCell('opening_no');
        const height = getCell('height');
        const width = getCell('width');
        
        rows.push({
          sheet_name: sheetName,
          floor_label: metadata.floor,
          apartment_label: metadata.apartment,
          location_in_apartment: location,
          opening_no: openingNo,
          contract_item: getCell('contract_item'),
          item_code: itemCode,
          height: getCell('height'),
          width: getCell('width'),
          notes: getCell('notes'),
          hinge_direction: normalizeHingeDirection(getCell('hinge_direction')),
          mamad: getCell('mamad'),
          field_notes: getCell('field_notes'),
          wall_thickness: getCell('wall_thickness'),
          depth: getCell('depth'),
          glyph: getCell('glyph'),
          jamb_height: getCell('jamb_height'),
          is_manual: isManualValue(getCell('is_manual')),
          engine_side: normalizeEngineSide(getCell('engine_side')),
          internal_wing: normalizeInternalWing(getCell('internal_wing'))
        });
      }
    }
    
    if (rows.length === 0) {
      errors.push('לא נמצאו שורות נתונים תקינות בקובץ');
    }
    
  } catch (error: any) {
    errors.push(`שגיאה בקריאת הקובץ: ${error.message}`);
  }
  
  return { rows, warnings, errors };
};
