import * as XLSX from 'xlsx';
import { NAME_TO_CODES, normalizeNotesValue } from './partMappings';

export interface ParsedItem {
  location: string;
  opening_no: string;
  item_code: string;
  height: string;
  width: string;
  notes: string;
  side_rl: string | null;
  motor_side: string | null;
  subpart_codes: string[]; // This becomes required_codes when saved to DB
  item_type: string; // The detected item type (e.g., "דלת", "חלון מונובלוק")
}

export interface ParsedApartment {
  floor_code: string;
  apt_number: string;
  items: ParsedItem[];
}

export interface ParseError {
  sheet: string;
  rowNumber: number;
  itemCode?: string;
  notesRaw?: string;
  reason: "unknown-name" | "no-subparts-detected" | "missing-required" | "no-headers-found";
  details?: string;
}

export interface ParseResult {
  apartments: ParsedApartment[];
  errors: ParseError[];
  warnings: string[];
}

// Column synonyms for flexible detection
const COLUMN_SYNONYMS = {
  item_code: ['מס\' פרט', 'מספר פרט', 'מספר פריט', 'פרט'],
  location: ['מיקום בדירה', 'מיקום'],
  opening_no: ['מס\' פתח', 'פתח', 'מספר פתח'],
  side_rl: ['ימין/שמאל', 'ימין שמאל', 'r/l', 'צד ר/ל'],
  width: ['רוחב'],
  height: ['גובה'],
  notes: ['הערות'],
  motor_side: ['צד מנוע']
};

// Map floor names
const mapFloorCode = (floorText: string): string => {
  const normalized = floorText.trim();
  if (normalized === 'קרקע' || normalized.toLowerCase() === 'ground') {
    return '0';
  }
  // Handle negative floors (e.g., "-1")
  if (normalized.startsWith('-')) {
    return normalized;
  }
  return normalized;
};

// Normalize side text
const normalizeSide = (sideText: string): string | null => {
  const normalized = sideText.trim().toLowerCase();
  if (normalized.includes('ימין') || normalized.includes('r')) return 'R';
  if (normalized.includes('שמאל') || normalized.includes('l')) return 'L';
  return null;
};

// Classify subpart codes based on keywords (fallback)
const classifySubparts = (item: ParsedItem): string[] => {
  const codes: string[] = [];
  const searchText = `${item.item_code} ${item.notes} ${item.location}`.toLowerCase();
  
  if (searchText.includes('משקוף')) codes.push('01');
  if (searchText.includes('כנפי') || searchText.includes('כנף')) codes.push('02');
  if (searchText.includes('תריס') || searchText.includes('גלילה')) codes.push('03');
  if (searchText.includes('מסילו') || searchText.includes('מסיל')) codes.push('04');
  if (searchText.includes('ארגז')) codes.push('05');
  
  // Default to all subparts if nothing detected
  return codes.length > 0 ? codes : ['01', '02', '03', '04', '05'];
};

// Extract apartment number from sheet name
const extractApartmentFromSheetName = (sheetName: string): string | null => {
  // Try patterns like "דירה 5", "5", "D2", "12B"
  const patterns = [
    /דירה:?\s*([א-ת\w\d]+)/i,
    /apartment:?\s*([א-ת\w\d]+)/i,
    /^([א-ת\w\d]+)$/
  ];
  
  for (const pattern of patterns) {
    const match = sheetName.match(pattern);
    if (match) return match[1].trim();
  }
  
  return null;
};

// Parse metadata from first rows (floor, apartment)
const parseMetadata = (sheet: XLSX.WorkSheet, sheetName: string): { floor: string; apartment: string } | null => {
  const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1');
  let floor: string | null = null;
  let apartment: string | null = null;
  
  // Search first 10 rows for קומה: and דירה:
  for (let row = 0; row < Math.min(10, range.e.r); row++) {
    for (let col = 0; col < range.e.c; col++) {
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
  
  // Fallback: try to extract apartment from sheet name
  if (!apartment) {
    apartment = extractApartmentFromSheetName(sheetName);
  }
  
  // Default floor to 0 if not found
  if (!floor) {
    floor = '0';
  }
  
  return apartment ? { floor, apartment } : null;
};

// Find table header row using column synonyms
const findTableHeader = (sheet: XLSX.WorkSheet): number => {
  const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1');
  
  for (let row = 0; row < Math.min(15, range.e.r); row++) {
    const rowData: string[] = [];
    for (let col = 0; col <= range.e.c; col++) {
      const cellAddress = XLSX.utils.encode_cell({ r: row, c: col });
      const cell = sheet[cellAddress];
      // Normalize whitespace consistently
      rowData.push(cell ? String(cell.v || '').trim().toLowerCase().replace(/\s+/g, ' ') : '');
    }
    
    const rowText = rowData.join(' ');
    
    // Check if this row has required columns (item_code is essential)
    let matchCount = 0;
    for (const synonym of COLUMN_SYNONYMS.item_code) {
      const normalizedSynonym = synonym.toLowerCase().replace(/\s+/g, ' ');
      if (rowText.includes(normalizedSynonym)) {
        matchCount += 2; // item_code is most important
        break;
      }
    }
    for (const synonym of COLUMN_SYNONYMS.location) {
      const normalizedSynonym = synonym.toLowerCase().replace(/\s+/g, ' ');
      if (rowText.includes(normalizedSynonym)) {
        matchCount += 1;
        break;
      }
    }
    
    if (matchCount >= 2) {
      return row;
    }
  }
  
  return -1;
};

// Map column indices using synonyms
interface ColumnMap {
  location?: number;
  opening_no?: number;
  item_code?: number;
  height?: number;
  width?: number;
  notes?: number;
  side_rl?: number;
  motor_side?: number;
}

const mapColumns = (sheet: XLSX.WorkSheet, headerRow: number): ColumnMap => {
  const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1');
  const map: ColumnMap = {};
  
  for (let col = 0; col <= range.e.c; col++) {
    const cellAddress = XLSX.utils.encode_cell({ r: headerRow, c: col });
    const cell = sheet[cellAddress];
    if (!cell) continue;
    
    const header = String(cell.v || '').trim().toLowerCase().replace(/\s+/g, ' ');
    
    // Check each column type against its synonyms
    for (const [key, synonyms] of Object.entries(COLUMN_SYNONYMS)) {
      if (map[key as keyof ColumnMap] !== undefined) continue; // Already found
      
      for (const synonym of synonyms) {
        // Normalize synonym whitespace the same way we normalize header
        const normalizedSynonym = synonym.toLowerCase().replace(/\s+/g, ' ');
        if (header.includes(normalizedSynonym)) {
          map[key as keyof ColumnMap] = col;
          break;
        }
      }
    }
  }
  
  return map;
};

// Parse data rows with error tracking
const parseDataRows = (
  sheet: XLSX.WorkSheet,
  headerRow: number,
  columnMap: ColumnMap,
  sheetName: string,
  errors: ParseError[]
): ParsedItem[] => {
  const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1');
  const items: ParsedItem[] = [];
  
  for (let row = headerRow + 1; row <= range.e.r; row++) {
    const getCell = (col: number | undefined): string => {
      if (col === undefined) return '';
      const cellAddress = XLSX.utils.encode_cell({ r: row, c: col });
      const cell = sheet[cellAddress];
      return cell ? String(cell.v || '').trim().replace(/\s+/g, ' ') : '';
    };
    
    const item_code = getCell(columnMap.item_code);
    
    // Skip empty rows
    if (!item_code) continue;
    
    const location = getCell(columnMap.location);
    const opening_no = getCell(columnMap.opening_no);
    const height = getCell(columnMap.height);
    const width = getCell(columnMap.width);
    const notes = getCell(columnMap.notes);
    const side_rl = normalizeSide(getCell(columnMap.side_rl));
    const motor_side = normalizeSide(getCell(columnMap.motor_side));
    
    const item: ParsedItem = {
      location,
      opening_no,
      item_code,
      height,
      width,
      notes,
      side_rl,
      motor_side,
      subpart_codes: [],
      item_type: '' // Will be set below
    };
    
    // Resolve subpart codes and item_type
    if (notes) {
      const normalized = normalizeNotesValue(notes);
      const mappedCodes = NAME_TO_CODES[normalized];
      
      if (mappedCodes) {
        // Found mapping - use those codes
        item.subpart_codes = [...mappedCodes];
        item.item_type = normalized; // Set the item type
      } else {
        // Unknown notes value - use keyword fallback and keep the original notes
        item.subpart_codes = classifySubparts(item);
        item.item_type = 'אחר'; // Generic type for unrecognized notes
      }
    } else {
      // No notes - use keyword detection fallback
      item.subpart_codes = classifySubparts(item);
      item.item_type = 'אחר'; // Generic type for keyword-detected items
    }
    
    // If still no subparts detected, use default single code
    if (item.subpart_codes.length === 0) {
      item.subpart_codes = ['00']; // Default to single complete item code
    }
    
    items.push(item);
  }
  
  return items;
};

// Detect template type
const detectTemplateType = (sheet: XLSX.WorkSheet): 'client' | 'system' | 'unknown' => {
  const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1');
  let hasNotesColumn = false;
  let hasSystemPattern = false;
  
  // Check first 15 rows
  for (let row = 0; row < Math.min(15, range.e.r); row++) {
    for (let col = 0; col <= range.e.c; col++) {
      const cellAddress = XLSX.utils.encode_cell({ r: row, c: col });
      const cell = sheet[cellAddress];
      if (!cell) continue;
      
      const value = String(cell.v || '').trim().toLowerCase();
      
      // Client template has "הערות" column and often "קומה:" pattern
      if (value.includes('הערות')) hasNotesColumn = true;
      
      // System template has simpler "קומה: X דירה: Y" pattern in early rows
      if (value.match(/קומה:\s*\d+\s+דירה:\s*\d+/)) hasSystemPattern = true;
    }
  }
  
  // Both templates have notes column, so check for other patterns
  if (hasSystemPattern) return 'system';
  if (hasNotesColumn) return 'client';
  
  return 'unknown';
};

// Main parser
export const parseExcelFile = async (file: File): Promise<ParseResult> => {
  const warnings: string[] = [];
  const errors: ParseError[] = [];
  const apartments: ParsedApartment[] = [];
  
  try {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });
    
    if (workbook.SheetNames.length === 0) {
      errors.push({
        sheet: '',
        rowNumber: 0,
        reason: 'no-headers-found',
        details: 'הקובץ ריק או לא מכיל גיליונות'
      });
      return { apartments, errors, warnings };
    }
    
    // Detect template type from first sheet
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    const templateType = detectTemplateType(firstSheet);
    
    if (templateType === 'unknown') {
      errors.push({
        sheet: workbook.SheetNames[0],
        rowNumber: 0,
        reason: 'no-headers-found',
        details: 'לא התגלה מבנה קובץ תקין. יש להשתמש בתבנית המערכת או בתבנית הלקוח.'
      });
      return { apartments, errors, warnings };
    }
    
    // Process each sheet
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      
      // For system template, skip sheets without numbers
      if (templateType === 'system' && !/\d/.test(sheetName)) {
        warnings.push(`דילגתי על גיליון "${sheetName}" - אין מספר בשם הגיליון`);
        continue;
      }
      
      // Parse metadata (floor and apartment)
      const metadata = parseMetadata(sheet, sheetName);
      if (!metadata) {
        warnings.push(`גיליון "${sheetName}": לא נמצאו פרטי קומה ודירה`);
        continue;
      }
      
      // Find table header
      const headerRow = findTableHeader(sheet);
      if (headerRow === -1) {
        warnings.push(`גיליון "${sheetName}": לא נמצאה כותרת טבלה`);
        continue;
      }
      
      // Map columns
      const columnMap = mapColumns(sheet, headerRow);
      if (columnMap.item_code === undefined) {
        warnings.push(`גיליון "${sheetName}": לא נמצאה עמודת מס' פרט`);
        continue;
      }
      
      // Parse data rows
      const items = parseDataRows(sheet, headerRow, columnMap, sheetName, errors);
      
      if (items.length === 0) {
        warnings.push(`גיליון "${sheetName}": לא נמצאו פריטים תקינים`);
        continue;
      }
      
      apartments.push({
        floor_code: metadata.floor,
        apt_number: metadata.apartment,
        items
      });
    }
    
    if (apartments.length === 0 && errors.length === 0) {
      warnings.push('לא נמצאו דירות תקינות בקובץ');
    }
    
  } catch (error: any) {
    errors.push({
      sheet: '',
      rowNumber: 0,
      reason: 'no-headers-found',
      details: `שגיאה בקריאת הקובץ: ${error.message}`
    });
  }
  
  return { apartments, errors, warnings };
};