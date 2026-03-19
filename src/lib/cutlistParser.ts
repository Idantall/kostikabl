/**
 * Kostika Cut-List Parser
 * Parses raw text from Alum Kostika PDF cut-lists into structured data
 */

export interface CutlistItem {
  profile_code: string;
  description: string;
  dimensions: string;
  quantity: number;
}

export interface CutlistSection {
  section_ref: string;
  section_name: string | null;
  notes: string | null;
  items: CutlistItem[];
}

export interface ParsedCutlist {
  project_name: string | null;
  sections: CutlistSection[];
  raw_text: string;
}

/**
 * Clean up Hebrew text - remove extra spaces and normalize
 */
function cleanHebrewText(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .replace(/[\u200B-\u200D\uFEFF]/g, '') // Remove zero-width chars
    .trim();
}

/**
 * Extract quantity from text, handling Hebrew and various formats
 */
function extractQuantity(text: string): number {
  // Remove Hebrew units like יח' (pieces), מ' (meters)
  const cleaned = text.replace(/יח['׳]?|מ['׳]?/g, '').trim();
  const match = cleaned.match(/(\d+)/);
  return match ? parseInt(match[1], 10) : 1;
}

/**
 * Check if text looks like a profile code (numeric or alphanumeric)
 */
function isProfileCode(text: string): boolean {
  const trimmed = text.trim();
  // Profile codes: 2-6 digit numbers, optionally with Hebrew/English suffix
  // Also handles codes like "03316", "4543", "AR59676", "83102"
  return /^[0-9]{2,6}[א-תA-Za-z]?$/.test(trimmed) || 
         /^[A-Z]{2,3}\d+$/.test(trimmed) ||
         /^\d{3,5}[נפ]?$/.test(trimmed); // Handles codes like "4308נ", "4308פ"
}

/**
 * Check if text looks like a dimension (number + W or H)
 */
function isDimension(text: string): boolean {
  const trimmed = text.trim();
  return /^\d+\s*[WHwh]$/.test(trimmed) || /^\d+\s*x\s*\d+$/i.test(trimmed);
}

/**
 * Extract section ID (זיהוי) from text or table cell
 */
function extractSectionRef(text: string): string | null {
  const trimmed = text.trim();
  // Pattern: single digit or digit with asterisk (e.g., "8", "9*")
  const match = trimmed.match(/^(\d{1,2})\*?$/);
  if (match) {
    return match[1];
  }
  return null;
}

/**
 * Parse a table row from markdown format
 */
function parseTableRow(row: string): string[] {
  if (!row.includes('|')) return [];
  return row
    .split('|')
    .map(cell => cleanHebrewText(cell))
    .filter(cell => cell.length > 0 && !cell.match(/^-+$/));
}

/**
 * Determine which column contains what based on headers
 */
interface ColumnMapping {
  profile: number;
  description: number;
  dimensions: number;
  quantity: number;
  identifier: number;
}

function detectColumnMapping(headerRow: string[]): ColumnMapping | null {
  const mapping: Partial<ColumnMapping> = {};
  
  headerRow.forEach((header, index) => {
    const h = header.trim();
    // Match various column header variations
    if (h.includes('פרופיל') || h === 'קוד') mapping.profile = index;
    if (h.includes('תפקיד')) mapping.description = index;
    if (h.includes('אורך') || h.includes('חיתוך')) mapping.dimensions = index;
    if (h.includes('כמ')) mapping.quantity = index;
    if (h.includes('זיהוי')) mapping.identifier = index;
  });
  
  // Handle case where "קוד" is separate from "פרופיל"
  // In some tables: קוד | פרופיל | תפקיד | אורך חיתוך | כמ' | זיהוי
  if (mapping.profile === undefined) {
    // Try to find first column that looks like it has codes
    headerRow.forEach((header, index) => {
      if (header.trim() === 'קוד' && mapping.profile === undefined) {
        mapping.profile = index;
      }
    });
  }
  
  // If we found at least profile, try to infer others from position
  if (mapping.profile !== undefined) {
    return {
      profile: mapping.profile,
      description: mapping.description ?? mapping.profile + 1,
      dimensions: mapping.dimensions ?? -1,
      quantity: mapping.quantity ?? -1,
      identifier: mapping.identifier ?? -1,
    };
  }
  
  return null;
}

/**
 * Main parser function - converts raw PDF text to structured data
 */
export function parseKostikaFormat(text: string): ParsedCutlist {
  const lines = text.split('\n');
  const result: ParsedCutlist = {
    project_name: null,
    sections: [],
    raw_text: text,
  };
  
  // Extract project name
  const projectMatch = text.match(/פרוייקט[:\s]*([^\n]+)/);
  if (projectMatch) {
    result.project_name = cleanHebrewText(projectMatch[1]);
  }
  
  // Track current section
  let currentSection: CutlistSection | null = null;
  let columnMapping: ColumnMapping | null = null;
  let inTable = false;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trim();
    
    // Check for section identifier in text
    const sectionRef = extractSectionRef(trimmedLine);
    if (sectionRef && !inTable) {
      // Save previous section
      if (currentSection && currentSection.items.length > 0) {
        result.sections.push(currentSection);
      }
      currentSection = {
        section_ref: sectionRef,
        section_name: null,
        notes: null,
        items: [],
      };
      continue;
    }
    
    // Check if this is a table header row
    if (trimmedLine.includes('|') && 
        (trimmedLine.includes('פרופיל') || trimmedLine.includes('תפקיד'))) {
      const headerCells = parseTableRow(trimmedLine);
      columnMapping = detectColumnMapping(headerCells);
      inTable = true;
      continue;
    }
    
    // Skip separator rows
    if (trimmedLine.match(/^\|[\s\-|]+\|$/)) {
      continue;
    }
    
    // Parse table data rows
    if (inTable && trimmedLine.includes('|') && columnMapping) {
      const cells = parseTableRow(trimmedLine);
      
      if (cells.length >= 2) {
        // Smart extraction - look for profile code, dimension, quantity in any position
        let profileCode = '';
        let description = '';
        let dimensions = '';
        let quantity = 1;
        let sectionId: string | null = null;
        
        // First pass: identify cell types
        for (let j = 0; j < cells.length; j++) {
          const cell = cells[j].trim();
          
          if (!cell) continue;
          
          // Check for section identifier (single digit like "8" or "9*")
          const ref = extractSectionRef(cell);
          if (ref && !sectionId) {
            sectionId = ref;
            continue;
          }
          
          // Check for profile code
          if (!profileCode && isProfileCode(cell)) {
            profileCode = cell;
            continue;
          }
          
          // Check for dimension (e.g., "1328 W", "1035 H")
          if (!dimensions && isDimension(cell)) {
            dimensions = cell;
            continue;
          }
          
          // Check for quantity (just a number)
          if (/^\d+$/.test(cell)) {
            quantity = parseInt(cell, 10);
            continue;
          }
          
          // Otherwise it's probably description
          if (!description && cell.length > 2) {
            description = cell;
          }
        }
        
        // Update current section if we found an identifier
        if (sectionId) {
          if (!currentSection || currentSection.section_ref !== sectionId) {
            if (currentSection && currentSection.items.length > 0) {
              result.sections.push(currentSection);
            }
            currentSection = {
              section_ref: sectionId,
              section_name: null,
              notes: null,
              items: [],
            };
          }
        }
        
        // Add item if we have a valid profile code
        if (profileCode && currentSection) {
          currentSection.items.push({
            profile_code: profileCode,
            description: cleanHebrewText(description),
            dimensions: cleanHebrewText(dimensions),
            quantity: quantity,
          });
        }
      }
    }
    
    // Check for notes section
    if (trimmedLine === '# הערות' || trimmedLine === 'הערות') {
      inTable = false;
      // Next lines are notes until a new table starts
      continue;
    }
    
    // Exit table mode on empty lines or new section headers
    if (trimmedLine === '' || trimmedLine.startsWith('##')) {
      inTable = false;
    }
  }
  
  // Don't forget the last section
  if (currentSection && currentSection.items.length > 0) {
    result.sections.push(currentSection);
  }
  
  // Merge sections with same ref
  const mergedSections = new Map<string, CutlistSection>();
  for (const section of result.sections) {
    const existing = mergedSections.get(section.section_ref);
    if (existing) {
      existing.items.push(...section.items);
    } else {
      mergedSections.set(section.section_ref, { ...section });
    }
  }
  result.sections = Array.from(mergedSections.values());
  
  // Sort sections by ref (numeric)
  result.sections.sort((a, b) => {
    const numA = parseInt(a.section_ref, 10) || 0;
    const numB = parseInt(b.section_ref, 10) || 0;
    return numA - numB;
  });
  
  return result;
}

/**
 * Validate if text appears to be a Kostika format document
 */
export function isKostikaFormat(text: string): boolean {
  const hasKostikaHeader = /alum\s*kos[tŧ]ika/i.test(text);
  const hasProfileColumn = /פרופיל/i.test(text);
  const hasQuantityColumn = /כמ['\u2019]?/i.test(text);
  
  return hasKostikaHeader || (hasProfileColumn && hasQuantityColumn);
}
