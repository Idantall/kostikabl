import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolvePDFJS } from "https://esm.sh/pdfjs-serverless@0.6.0";

let pdfjsPromise: Promise<any> | null = null;
const getPdfjs = () => (pdfjsPromise ??= resolvePDFJS());

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Types for parsed data
interface ProfileRow {
  ident: string;
  qty: number;
  orientation: string;
  cut_length: string;
  role: string;
  profile_code: string;
}

interface MiscRow {
  qty: number;
  unit: string;
  description: string;
  sku_code: string;
}

interface GlassRow {
  code: string;
  size_text: string;
  qty: number;
  description: string;
  sku_name: string | null;
}

interface ParseWarning {
  type: string;
  message: string;
  details?: Record<string, any>;
}

interface ParsedPage {
  page_number: number;
  item_ref: string;
  title: string | null;
  dimensions_meta: string | null;
  quantity_total: number | null;
  technical_text: string | null;
  notes: string | null;
  raw_page_text: string;
  profile_rows: ProfileRow[];
  misc_rows: MiscRow[];
  glass_rows: GlassRow[];
  parse_error?: string;
  parse_warnings?: ParseWarning[]; // Optional detailed diagnostics
}

interface ParsedCutlist {
  project_name: string | null;
  pages: ParsedPage[];
  parse_errors?: { page: number; error: string }[]; // Document-level errors for pages that failed
}

function ms(since: number) {
  return Math.round(performance.now() - since);
}

// ============================================================================
// TEXT ITEM EXTRACTION WITH COORDINATES - NO ROUNDING
// ============================================================================

interface TextItem {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface TextRow {
  y: number;
  items: TextItem[];
  text: string;
}

/**
 * Clean Hebrew text: remove zero-width chars and BiDi markers
 */
function cleanText(s: string): string {
  return s
    .replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Reverse a string (for BiDi-reversed Hebrew detection)
 */
function reverseStr(s: string): string {
  return [...s].reverse().join("");
}

/**
 * Normalize Hebrew for comparison (remove punctuation)
 */
function normHeb(s: string): string {
  return cleanText(s).replace(/["'׳״‐\-–—\u05BE]/g, "");
}

/**
 * Check if text includes a Hebrew token (or its reversed form)
 */
function includesHeb(text: string, token: string): boolean {
  const a = normHeb(text);
  const t = normHeb(token);
  return a.includes(t) || a.includes(reverseStr(t));
}

/**
 * Check if string is exactly N digits
 */
function isDigits(s: string, nMin: number, nMax: number): boolean {
  return new RegExp(`^\\d{${nMin},${nMax}}$`).test(s.trim());
}

// ============================================================================
// DENYLIST: Tokens that should NEVER become profile anchors
// ============================================================================

const ANCHOR_DENYLIST = new Set([
  // Hebrew unit tokens
  "ממ", "מ״מ", "מ''", "מ'", "יח'", "יח", "מטר", "ס\"מ", "ס'", 
  // Dimension-related tokens
  "גובה", "רוחב", "עומק", "אורך",
  // Common noise words
  "עד", "מ-", "ל-", "או", "עם", "של", "על", "את",
  // Orientation letters
  "H", "W", "U", "T", "h", "w", "u", "t",
  // Common profile table text fragments
  "זוית", "פקק", "אטם", "מברשת", "בורג", "סרגל", "מכסה", "אף",
]);

/**
 * Check if a token is in the explicit denylist
 */
function isInDenylist(s: string): boolean {
  const t = (s || "").trim();
  if (ANCHOR_DENYLIST.has(t)) return true;
  // Also check normalized version
  if (ANCHOR_DENYLIST.has(t.replace(/['״׳]/g, "'"))) return true;
  // Check if starts with a denylisted word (e.g., "גובה 20.6 ממ")
  for (const deny of ANCHOR_DENYLIST) {
    if (t.startsWith(deny + " ") || t.startsWith(deny + ".")) return true;
  }
  return false;
}

/**
 * Extract text items with coordinates from PDF page - KEEP FLOATS (no rounding)
 */
async function extractPageItems(pdfDoc: any, pageNum: number): Promise<TextItem[]> {
  const page = await pdfDoc.getPage(pageNum);
  const textContent = await page.getTextContent();
  
  return textContent.items
    .filter((item: any) => item.str && item.str.trim())
    .map((item: any) => ({
      str: cleanText(item.str || ""),
      x: item.transform?.[4] || 0,  // NO rounding - keep float
      y: item.transform?.[5] || 0,  // NO rounding - keep float
      width: item.width || 0,
      height: item.height || 0,
    }))
    .filter((item: TextItem) => item.str.length > 0);
}

/**
 * Group text items into rows based on Y-coordinate proximity
 * Hebrew PDFs are RTL, so we sort items by X descending within each row
 */
function groupIntoRows(items: TextItem[], yTolerance = 5): TextRow[] {
  if (items.length === 0) return [];
  
  // Sort by Y descending (top to bottom in PDF coordinates)
  const sorted = [...items].sort((a, b) => b.y - a.y);
  
  const rows: TextRow[] = [];
  let currentRow: TextItem[] = [sorted[0]];
  let currentY = sorted[0].y;
  
  for (let i = 1; i < sorted.length; i++) {
    const item = sorted[i];
    if (Math.abs(item.y - currentY) <= yTolerance) {
      currentRow.push(item);
    } else {
      // Finalize current row: sort RTL by X descending
      currentRow.sort((a, b) => b.x - a.x);
      rows.push({
        y: currentY,
        items: currentRow,
        text: currentRow.map(i => i.str).join(" "),
      });
      currentRow = [item];
      currentY = item.y;
    }
  }
  
  // Don't forget the last row
  if (currentRow.length > 0) {
    currentRow.sort((a, b) => b.x - a.x);
    rows.push({
      y: currentY,
      items: currentRow,
      text: currentRow.map(i => i.str).join(" "),
    });
  }
  
  return rows;
}

// ============================================================================
// TABLE HEADER DETECTION - TOLERANT (handles reversed text)
// ============================================================================

interface TableHeader {
  rowIndex: number;
  y: number;
  columnPositions: Map<string, number>; // column name -> x position (center)
  tableMinX?: number;  // computed table left boundary
  tableMaxX?: number;  // computed table right boundary
}

/**
 * Find profile table header row(s).
 * Some PDFs render TWO profile tables side-by-side on the same Y row when there are many rows.
 * We detect that by anchoring on every "פרופיל" token in the row and building a header window around it.
 */
function findProfileTableHeaders(rows: TextRow[]): TableHeader[] {
  const headers: TableHeader[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];

    // Find all "פרופיל" tokens on this row (could be 1 or 2 for dual tables)
    const profileTokens = row.items.filter((it) => includesHeb(it.str.trim(), "פרופיל"));
    if (profileTokens.length === 0) continue;

    for (const anchor of profileTokens) {
      // Consider only items near this anchor to isolate a single table header in dual-table layouts.
      const anchorCx = anchor.x + (anchor.width / 2);
      const windowItems = row.items.filter((it) => {
        const c = it.x + (it.width / 2);
        return Math.abs(c - anchorCx) <= 260; // wide enough to include all columns, narrow enough to exclude second table
      });

      const text = windowItems.map((it) => it.str).join(" ");

      // Must contain פרופיל and (תפקיד OR אורך) and (כמ)
      const hasProfile = includesHeb(text, "פרופיל");
      const hasRoleOrLen = includesHeb(text, "תפקיד") || includesHeb(text, "אורך");
      const hasQty = includesHeb(text, "כמ");

      if (!(hasProfile && hasRoleOrLen && hasQty)) continue;

      const cols = new Map<string, number>();
      const headerItems: TextItem[] = [];

      for (const item of windowItems) {
        const s = item.str.trim();
        const centerX = item.x + (item.width / 2);

        if (includesHeb(s, "פרופיל")) {
          cols.set("profile", centerX);
          headerItems.push(item);
        } else if (includesHeb(s, "תפקיד")) {
          cols.set("role", centerX);
          headerItems.push(item);
        } else if (includesHeb(s, "אורך") || includesHeb(s, "חיתוך")) {
          cols.set("length", centerX);
          headerItems.push(item);
        } else if (includesHeb(s, "כמ")) {
          cols.set("qty", centerX);
          headerItems.push(item);
        } else if (includesHeb(s, "זיהוי")) {
          cols.set("ident", centerX);
          headerItems.push(item);
        }
      }

      // Basic sanity: we need at least the profile + qty columns to parse.
      if (!cols.has("profile") || !cols.has("qty")) continue;

      // Compute table X boundaries from HEADER CELLS ONLY (prevents bounds bleeding into drawing/metadata)
      const boundaryItems = headerItems.length >= 2 ? headerItems : windowItems;
      const headerXs = boundaryItems.map((it) => it.x);
      const headerWidths = boundaryItems.map((it) => it.x + it.width);
      const tableMinX = Math.min(...headerXs) - 12;
      const tableMaxX = Math.max(...headerWidths) + 12;

      // De-dupe: avoid adding the exact same header twice (can happen if "פרופיל" is split into multiple items)
      const signature = JSON.stringify(Object.fromEntries(cols));
      const already = headers.some(
        (h) => h.rowIndex === i && JSON.stringify(Object.fromEntries(h.columnPositions)) === signature
      );
      if (already) continue;

      console.log(
        `  Profile header at row ${i}, cols:`,
        Object.fromEntries(cols),
        `tableX: ${tableMinX.toFixed(0)}-${tableMaxX.toFixed(0)}`,
      );
      headers.push({ rowIndex: i, y: row.y, columnPositions: cols, tableMinX, tableMaxX });
    }
  }

  return headers;
}

/**
 * Find the "זיהוי" sub-header for a specific header/table.
 * In dual-table layouts there may be multiple "זיהוי" tokens; we pick the one in the header's X-range.
 */
function findIdentRowForHeader(
  rows: TextRow[],
  afterIndex: number,
  header: TableHeader
): { rowIndex: number; identX: number } | null {
  const centers = Array.from(header.columnPositions.values());
  const minX = (centers.length ? Math.min(...centers) : 0) - 260;
  const maxX = (centers.length ? Math.max(...centers) : 600) + 260;

  // Look in the next 2 rows after header
  for (let i = afterIndex + 1; i < Math.min(afterIndex + 3, rows.length); i++) {
    const row = rows[i];
    for (const item of row.items) {
      if (!includesHeb(item.str.trim(), "זיהוי")) continue;
      const c = item.x + (item.width / 2);
      if (c >= minX && c <= maxX) {
        return { rowIndex: i, identX: c };
      }
    }
  }
  return null;
}

/**
 * Find glass table header (קוד מידות כמ' תאור)
 * Must have מידות to distinguish from misc
 */
function findGlassTableHeader(rows: TextRow[]): TableHeader | null {
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const text = row.text;
    
    if (includesHeb(text, "מידות") && (includesHeb(text, "כמ") || includesHeb(text, "תאור"))) {
      const cols = new Map<string, number>();
      
      for (const item of row.items) {
        const s = item.str.trim();
        const centerX = item.x + (item.width / 2);
        
        if (s === "קוד") cols.set("code", centerX);
        else if (includesHeb(s, "מידות")) cols.set("size", centerX);
        else if (includesHeb(s, "כמ")) cols.set("qty", centerX);
        else if (includesHeb(s, "תאור")) cols.set("desc", centerX);
        else if (includesHeb(s, "שם") || includesHeb(s, "מק")) cols.set("sku", centerX);
      }
      
      // Compute table X boundaries
      const headerXs = row.items.map(it => it.x);
      const headerWidths = row.items.map(it => it.x + it.width);
      const tableMinX = Math.min(...headerXs) - 20;
      const tableMaxX = Math.max(...headerWidths) + 20;
      
      return { rowIndex: i, y: row.y, columnPositions: cols, tableMinX, tableMaxX };
    }
  }
  return null;
}

/**
 * Find misc/accessories table header - TOLERANT
 * Accessories header: תאור + כמות (but may appear reversed)
 */
function findMiscTableHeader(rows: TextRow[], startAt = 0): TableHeader | null {
  for (let i = startAt; i < rows.length; i++) {
    const row = rows[i];
    const text = row.text;
    
    // Accessories header: תאור AND כמות, without פרופיל and without מידות
    const hasDesc = includesHeb(text, "תאור");
    const hasQty = includesHeb(text, "כמות") || includesHeb(text, "כמ");
    const noProfile = !includesHeb(text, "פרופיל");
    const noMidot = !includesHeb(text, "מידות");
    
    if (hasDesc && hasQty && noProfile && noMidot) {
      const cols = new Map<string, number>();
      
      for (const item of row.items) {
        const s = item.str.trim();
        const centerX = item.x + (item.width / 2);
        
        if (includesHeb(s, "שם") || includesHeb(s, "מק")) cols.set("sku", centerX);
        else if (includesHeb(s, "תאור")) cols.set("desc", centerX);
        else if (includesHeb(s, "כמות") || includesHeb(s, "כמ")) cols.set("qty", centerX);
      }
      
      // Compute table X boundaries
      const headerXs = row.items.map(it => it.x);
      const headerWidths = row.items.map(it => it.x + it.width);
      const tableMinX = Math.min(...headerXs) - 20;
      const tableMaxX = Math.max(...headerWidths) + 20;
      
      return { rowIndex: i, y: row.y, columnPositions: cols, tableMinX, tableMaxX };
    }
  }
  return null;
}

/**
 * Find הערות (notes) section - TOLERANT
 */
function findNotesRow(rows: TextRow[]): number {
  for (let i = 0; i < rows.length; i++) {
    if (includesHeb(rows[i].text, "הערות")) return i;
  }
  return -1;
}

// ============================================================================
// SECTION REFERENCE EXTRACTION - EXACT (preserves original formatting)
// ============================================================================

/**
 * Pattern for valid item_ref: Hebrew letter, Latin letter, digits, optional hyphen, optional asterisk
 * Examples: "A-10", "א-6", "9*", "ב-9", "10", "A10"
 */
const ITEM_REF_PATTERN = /^[*]?[א-תA-Za-z]?\-?\d{1,3}[*]?[א-תA-Za-z]?$|^[*]?\d{1,3}\-?[א-תA-Za-z]?[*]?$/;

function isValidItemRef(s: string): boolean {
  const t = s.trim();
  if (!t || t.length > 8) return false;
  return ITEM_REF_PATTERN.test(t);
}

function extractSectionRef(rows: TextRow[], pageNum: number): string {
  // Pattern 1: Look for ק.זיהוי : X explicitly - preserve exact value
  for (const row of rows) {
    // More permissive pattern to capture the full ident value
    const match = row.text.match(/ק\.?\s*זיהוי\s*[:׃]\s*([^\s,]+)/);
    if (match) {
      const ref = cleanText(match[1]);
      if (ref && isValidItemRef(ref)) {
        return ref; // Return EXACTLY as printed
      }
    }
  }
  
  // Pattern 2: Use most common ident from profile rows
  const identCounts = new Map<string, number>();
  const profilePattern = /^0?\d{4,5}$/;
  
  for (const row of rows) {
    const hasProfileCode = row.items.some(item => profilePattern.test(item.str.trim()));
    if (!hasProfileCode) continue;
    
    // Check leftmost items (low X = ident column in RTL)
    const sortedByX = [...row.items].sort((a, b) => a.x - b.x);
    for (let i = 0; i < Math.min(3, sortedByX.length); i++) {
      const s = sortedByX[i].str.trim();
      if (isValidItemRef(s) && !profilePattern.test(s)) {
        identCounts.set(s, (identCounts.get(s) || 0) + 1);
      }
    }
  }
  
  let bestIdent = String(pageNum);
  let maxCount = 0;
  for (const [ident, count] of identCounts) {
    if (count > maxCount) {
      maxCount = count;
      bestIdent = ident;
    }
  }
  
  return bestIdent;
}

// ============================================================================
// METADATA EXTRACTION
// ============================================================================

function extractTitle(rows: TextRow[]): string | null {
  for (let i = 0; i < Math.min(25, rows.length); i++) {
    const text = rows[i].text;
    if (/חלון|תריס|דלת|ויטרינה|מעקה/.test(text)) {
      return cleanText(text
        .replace(/Alum\s*Kos[Ɵt]ika/gi, "")
        .replace(/\d{1,2}\/\d{1,2}\/\d{4}/, "")
        .replace(/מס['']?\s*\d+/, "")
      ).substring(0, 120);
    }
  }
  return null;
}

function extractQuantity(rows: TextRow[]): number | null {
  for (const row of rows) {
    const match = row.text.match(/כמות\s*[:׃]\s*(\d+)/);
    if (match) return parseInt(match[1]);
  }
  return null;
}

function extractNotes(rows: TextRow[], notesIndex: number): string | null {
  if (notesIndex < 0) return null;
  
  const row = rows[notesIndex];
  let noteText = row.text.replace(/.*הערות[:׃]?\s*/, "").trim();
  
  if (noteText.length < 3 && notesIndex + 1 < rows.length) {
    const nextText = rows[notesIndex + 1].text;
    if (!includesHeb(nextText, "שם-מק") && !includesHeb(nextText, "תאור") && !includesHeb(nextText, "כמות")) {
      noteText = nextText;
    }
  }
  
  noteText = noteText
    .replace(/שם-מק['"]ט/g, "")
    .replace(/\bתאור\b/g, "")
    .replace(/\bכמות\b/g, "")
    .replace(/\bמידות\b/g, "")
    .trim();
  
  if (noteText.length > 2 && /[\u0590-\u05FF]/.test(noteText)) {
    return noteText.substring(0, 500);
  }
  
  return null;
}

function extractTechnicalText(rows: TextRow[], profileHeaderIndex: number): string | null {
  const parts: string[] = [];
  const endIndex = profileHeaderIndex > 0 ? profileHeaderIndex : 15;
  
  for (let i = 0; i < Math.min(endIndex, 15); i++) {
    const text = rows[i].text;
    if (/Alum|Kos[tƟ]ika/i.test(text)) continue;
    if (/^\d{1,2}\/\d{1,2}\/\d{4}/.test(text)) continue;
    
    if (/יצרן|סדרות|שם|כמות|צבע|ידית|ציר/.test(text)) {
      parts.push(cleanText(text));
    }
  }
  
  return parts.length > 0 ? parts.join(" | ") : null;
}

function extractProjectName(rows: TextRow[]): string | null {
  for (const row of rows) {
    if (row.text.includes("פרוייקט") || row.text.includes("פרויקט")) {
      let name = row.text
        .replace(/.*פרו?ייקט[:׃\s]*/i, "")
        .replace(/Alum\s*Kos[Ɵt]ika/gi, "")
        .replace(/קוד\s*\d+/, "")
        .replace(/\d{1,2}\/\d{1,2}\/\d{4}/, "")
        .replace(/מס['']?\s*\d+/, "")
        .trim();
      
      if (name.length > 2) return name;
    }
  }
  return null;
}

// ============================================================================
// COLUMN-BASED EXTRACTION HELPERS
// ============================================================================

interface ColumnBounds {
  name: string;
  minX: number;
  maxX: number;
  centerX: number;
}

/**
 * Build column boundaries map from header positions
 * FIXED: Uses header-derived table width, not full page width
 */
function buildColumnBoundsMap(
  columnPositions: Map<string, number>,
  tableMinX: number,
  tableMaxX: number
): Map<string, ColumnBounds> {
  const centers = Array.from(columnPositions.entries())
    .map(([name, x]) => ({ name, x }))
    .sort((a, b) => b.x - a.x); // RTL: higher X first

  const boundsMap = new Map<string, ColumnBounds>();
  const tableWidth = tableMaxX - tableMinX;

  for (let i = 0; i < centers.length; i++) {
    const curr = centers[i];
    const prev = i > 0 ? centers[i - 1] : null; // column to the RIGHT (higher X)
    const next = i < centers.length - 1 ? centers[i + 1] : null; // column to the LEFT (lower X)

    const gapRight = prev ? (prev.x - curr.x) : (tableMaxX - curr.x);
    const gapLeft = next ? (curr.x - next.x) : (curr.x - tableMinX);

    const pad = 18;

    const minX = Math.max(tableMinX - pad, curr.x - gapLeft / 2 - pad);
    const maxX = Math.min(tableMaxX + pad, curr.x + gapRight / 2 + pad);

    boundsMap.set(curr.name, {
      name: curr.name,
      centerX: curr.x,
      minX,
      maxX,
    });
  }

  return boundsMap;
}

// ============================================================================
// HELPER: Check if a header overlaps X-region with profile table
// Uses overlap RATIO to require meaningful intersection
// ============================================================================

function computeOverlapRatio(profileHeader: TableHeader, otherHeader: TableHeader | null): number {
  if (!otherHeader) return 0;
  if (profileHeader.tableMinX === undefined || profileHeader.tableMaxX === undefined) return 1;
  if (otherHeader.tableMinX === undefined || otherHeader.tableMaxX === undefined) return 1;
  
  const pMin = profileHeader.tableMinX;
  const pMax = profileHeader.tableMaxX;
  const oMin = otherHeader.tableMinX;
  const oMax = otherHeader.tableMaxX;
  
  // Compute overlap
  const overlapMin = Math.max(pMin, oMin);
  const overlapMax = Math.min(pMax, oMax);
  const overlapWidth = Math.max(0, overlapMax - overlapMin);
  
  // Compute ratio relative to smaller width
  const profileWidth = pMax - pMin;
  const otherWidth = oMax - oMin;
  const minWidth = Math.min(profileWidth, otherWidth);
  
  if (minWidth <= 0) return 0;
  
  return overlapWidth / minWidth;
}

function headersOverlapX(profileHeader: TableHeader, otherHeader: TableHeader | null, minRatio = 0.3): boolean {
  return computeOverlapRatio(profileHeader, otherHeader) >= minRatio;
}

// ============================================================================
// LENGTH + ORIENTATION EXTRACTION - COLUMN-BOUNDED
// ============================================================================

/**
 * Parse length+orientation from a single token like "1035 H" or "1035H"
 */
function parseLenOriFromToken(s: string): { len: string; ori: string } | null {
  const t = s.trim();
  // "1035 H" / "1035H"
  let m = t.match(/^(\d{3,4})\s*([HWUT])$/i);
  if (m) return { len: m[1], ori: m[2].toUpperCase() };
  // "H 1035"
  m = t.match(/^([HWUT])\s*(\d{3,4})$/i);
  if (m) return { len: m[2], ori: m[1].toUpperCase() };
  return null;
}

/**
 * Get center X of a text item
 */
function cx(it: TextItem): number {
  return it.x + (it.width || 0) / 2;
}

/**
 * Check if item is within column bounds
 */
function inBounds(it: TextItem, b?: ColumnBounds, pad = 10): boolean {
  if (!b) return true;
  const c = cx(it);
  return c >= b.minX - pad && c <= b.maxX + pad;
}

/**
 * Pick best (length, orientation) from row items using column bounds.
 * FIXED: Now restricts to lengthBounds column to avoid drawing contamination
 */
function pickLengthAndOrientation(
  items: TextItem[],
  lengthBounds?: ColumnBounds
): { cut_length: string; orientation: string } {
  const scoped = lengthBounds
    ? items.filter(it => {
        const c = cx(it);
        return c >= lengthBounds.minX - 10 && c <= lengthBounds.maxX + 10;
      })
    : items;

  // Join scoped text for WxH style
  const scopedText = scoped.map(i => i.str.trim()).join(" ");
  const dimMatch = scopedText.match(/\b(\d{3,4})\s*[x×]\s*(\d{3,4})\b/);
  if (dimMatch) {
    return { cut_length: `${dimMatch[1]} x ${dimMatch[2]}`, orientation: "-" };
  }

  // 1) direct token parse
  for (const it of scoped) {
    const parsed = parseLenOriFromToken(it.str);
    if (parsed) return { cut_length: parsed.len, orientation: parsed.ori };
  }

  // 2) proximity pairing inside the scoped column
  const lenCands = scoped
    .filter(it => /^\d{3,4}$/.test(it.str.trim()))
    .map(it => ({ it, cx: cx(it), cy: it.y }));

  const oriCands = scoped
    .filter(it => /^[HWUT]$/i.test(it.str.trim()))
    .map(it => ({ it, cx: cx(it), cy: it.y }));

  let best: { len: string; ori: string; score: number } | null = null;

  for (const l of lenCands) {
    for (const o of oriCands) {
      const dx = Math.abs(l.cx - o.cx);
      const dy = Math.abs(l.cy - o.cy);
      const score = dx + 3 * dy; // prefer same-row alignment
      if (!best || score < best.score) {
        best = { len: l.it.str.trim(), ori: o.it.str.trim().toUpperCase(), score };
      }
    }
  }

  if (best) return { cut_length: best.len, orientation: best.ori };

  // fallback: sometimes there is only a number (no H/W)
  const loneLen = lenCands[0]?.it?.str?.trim();
  return { cut_length: loneLen || "-", orientation: "-" };
}

/**
 * Compute adaptive Y tolerance from anchor gaps to avoid merging real rows.
 */
function computeAnchorTol(ys: number[]): number {
  if (ys.length < 3) return 3;
  const sorted = [...ys].sort((a, b) => b - a);
  const gaps: number[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    gaps.push(Math.abs(sorted[i] - sorted[i + 1]));
  }
  gaps.sort((a, b) => a - b);
  const med = gaps[Math.floor(gaps.length / 2)] || 6;
  // keep conservative; never as large as 7
  return Math.max(1.8, Math.min(4.0, med * 0.35));
}

// ============================================================================
// PROFILE TABLE PARSING - ANCHOR-BAND V5 (multi-token anchors, strict denylist)
// ============================================================================

/**
 * Pick qty from items within column bounds using centerX
 * FIXED: Handles merged tokens like "32 11" by extracting digit groups
 * Picks by closest to qtyBounds.centerX, tie-break by larger number
 */
function pickQtyFromBounds(items: TextItem[], qtyBounds?: ColumnBounds): number {
  if (!qtyBounds) return 0;

  const candidates: { value: number; dist: number }[] = [];

  for (const it of items) {
    const itemCx = cx(it);
    // Check if item is within qty column bounds (with tolerance)
    if (itemCx < qtyBounds.minX - 15 || itemCx > qtyBounds.maxX + 15) continue;
    
    const s = it.str.trim();
    
    // Extract all digit groups from the token (handles "32 11", "32", etc.)
    const digitMatches = s.matchAll(/\d{1,3}/g);
    for (const match of digitMatches) {
      const num = parseInt(match[0], 10);
      if (num > 0 && num <= 999) {
        const dist = Math.abs(itemCx - qtyBounds.centerX);
        candidates.push({ value: num, dist });
      }
    }
  }

  if (candidates.length === 0) return 0;

  // Sort by distance (closest to centerX first), then by value (larger first for tie-break)
  candidates.sort((a, b) => {
    if (Math.abs(a.dist - b.dist) < 5) {
      // Close enough distance, prefer larger value
      return b.value - a.value;
    }
    return a.dist - b.dist;
  });

  return candidates[0].value;
}

/**
 * Check if a token looks like a profile anchor (code)
 * V7: Stricter validation with explicit denylist, better 3-digit handling, 
 *     reject dimension patterns, reject tokens with Hebrew unit tokens embedded
 */
function isLikelyProfileAnchorToken(s: string, strictProfileBounds = false, roleColumnActive = false): boolean {
  const raw = (s || "").trim();
  if (!raw) return false;
  // Strip leading/trailing asterisks before validation — codes like *A03308 or A03308* are valid
  const t = raw.replace(/^\*+|\*+$/g, "");

  // Explicit denylist check FIRST
  if (isInDenylist(t)) return false;

  // Reject tokens containing unit patterns (e.g., "גובה 20.6 ממ", "זוית 1.5*18*30 ממ")
  if (/ממ|מ״מ|מ''|מ'|יח'/i.test(t) && t.length > 3) return false;
  
  // Reject tokens with dimension patterns (e.g., "1.5*18*30", "20.6")
  if (/\d+[.*]\d+[.*]\d+/.test(t)) return false;
  if (/^\d+\.\d+$/.test(t)) return false;
  
  // Reject Hebrew text that looks like description fragments (multiple words with spaces)
  if (/[א-ת]+\s+\d+[.*]\d+/.test(t)) return false;
  if (/\d+[.*]\d+\s+[א-ת]+/.test(t)) return false;

  // Never treat header words as anchors
  if (includesHeb(t, "פרופיל") || includesHeb(t, "תפקיד") || includesHeb(t, "אורך") || 
      includesHeb(t, "חיתוך") || includesHeb(t, "כמ") || includesHeb(t, "זיהוי") ||
      includesHeb(t, "הערות") || includesHeb(t, "מידות") || includesHeb(t, "תאור")) {
    return false;
  }

  // Single orientation letters - always reject
  if (/^[HWUT]$/i.test(t)) return false;
  
  // Single-digit numbers are almost always qty noise
  if (/^[1-9]$/.test(t)) return false;
  
  // Two-digit numbers that aren't valid profile codes (10-99 excluding known codes)
  // 60, 70 are known valid codes
  if (/^\d{2}$/.test(t)) {
    const num = parseInt(t, 10);
    // Only accept 60 and 70 as valid 2-digit codes
    if (num !== 60 && num !== 70) return false;
  }
  
  // Exclude technical color codes (4 digits starting with 9 like 9006)
  if (/^9\d{3}$/.test(t)) return false;
  
  // 3-digit numbers: only accept if they look like profile codes (not role text numbers)
  // This prevents "330" from "עד 330" becoming an anchor
  if (/^\d{3}$/.test(t)) {
    // If we're in strict mode and this is outside profile column, reject
    if (strictProfileBounds || roleColumnActive) return false;
    // Otherwise, be conservative: only accept if it starts with 0 (e.g., "030")
    if (!t.startsWith("0")) return false;
  }
  
  // ROL patterns: ROL.K, K.ROL, 0.3ROL, SROL0.3, SROL, etc.
  if (/^S?ROL[A-Z0-9.]*$/i.test(t)) return true;
  if (/^[0-9.]*ROL[A-Z0-9.]*$/i.test(t)) return true;
  if (/^[A-Z]*ROL[0-9.]*$/i.test(t)) return true;
  
  // Multi-token patterns for merged anchors (e.g., "SROL M", "70 וואלה")
  if (/^S?ROL\s+[A-Z0-9.]{1,3}$/i.test(t)) return true;
  if (/^(60|70)\s+וואלה$/i.test(t)) return true;
  if (/^וואלה\s+(60|70)$/i.test(t)) return true;
  
  // Hebrew: וואלה patterns (with or without number)
  if (/^וואלה$/.test(t)) return true;
  
  // Mixed: number + Hebrew or Hebrew + number (e.g., "60 וואלה", "וואלה 60")
  // But NOT if it has unit tokens
  if (/^\d+\s+[א-ת]+$/.test(t) || /^[א-ת]+\s+\d+$/.test(t)) {
    // Validate: must be a known pattern, not description text
    if (/^(60|70)\s+וואלה$/.test(t) || /^וואלה\s+(60|70)$/.test(t)) return true;
    // Otherwise reject to avoid "גובה 20" etc.
    return false;
  }

  // Numeric profile codes: 4-6 digits (stricter than before)
  // Examples: "03308", "12345", "001234"
  if (/^\d{4,6}$/.test(t)) return true;
  
  // Leading zero makes short codes valid (e.g., "01", "001", "0330")
  if (/^0\d{1,5}$/.test(t)) return true;

  // English/alphanumeric codes: T60, S2000, AR27110, etc.
  if (/^[A-Za-z]\d{2,5}$/i.test(t)) return true;
  if (/^[A-Za-z]{1,4}\d{1,5}$/i.test(t) && t.length >= 3) return true;
  if (/^[A-Za-z]{2}\d{4,6}$/i.test(t)) return true; // AR27110 pattern
  
  // Dotted codes: ROL.K, S.R.O.L, SROL0.3
  if (/^[A-Za-z0-9]+\.[A-Za-z0-9.]+$/i.test(t) && !/ממ|מ'/.test(t)) return true;

  // Pure Hebrew codes (2+ chars, not common words) - but NOT with spaces
  if (/^[א-ת]{2,12}$/.test(t) && !t.includes(" ")) {
    // Exclude common Hebrew words that aren't profile codes
    const excluded = ["חלון", "דלת", "תריס", "כנף", "מסילה", "ארגז", "רשת", "ציר", "ידית", "עליונה", "תחתונה", "אמצעית", "גובה", "רוחב", "עומק", "זוית", "פקק", "אטם", "מברשת", "בורג", "סרגל", "מכסה"];
    if (excluded.some(w => t.includes(w))) return false;
    // Exclude unit tokens
    if (/^(ממ|מ['״]?|יח['']?)$/.test(t)) return false;
    return true;
  }

  return false;
}

/**
 * Check if a profile row is actually header garbage (header words in role)
 * STRENGTHENED: checks for 2+ header keywords or code=length match
 */
function isHeaderGarbageRow(r: ProfileRow): boolean {
  const role = (r.role || "").trim();
  
  // Count header keywords in role
  let headerKeywordCount = 0;
  if (includesHeb(role, "פרופיל")) headerKeywordCount++;
  if (includesHeb(role, "תפקיד")) headerKeywordCount++;
  if (includesHeb(role, "אורך")) headerKeywordCount++;
  if (includesHeb(role, "חיתוך")) headerKeywordCount++;
  if (includesHeb(role, "כמ")) headerKeywordCount++;
  if (includesHeb(role, "זיהוי")) headerKeywordCount++;
  
  // Drop if 2+ header keywords present
  if (headerKeywordCount >= 2) return true;
  
  // Also detect when profile_code equals cut_length (window dimension used as code)
  const codeLengthMatch = !!(r.cut_length && r.cut_length !== "-" && r.profile_code === r.cut_length);
  if (codeLengthMatch) return true;
  
  // Check if role contains concatenated header terms (e.g., "פרופיל תפקיד אורך")
  const concatenatedHeaders = /פרופיל\s*תפקיד|תפקיד\s*אורך|אורך\s*חיתוך|חיתוך\s*כמ/.test(role);
  if (concatenatedHeaders) return true;
  
  // Profile code should never be a unit token
  const code = (r.profile_code || "").trim();
  if (isInDenylist(code)) return true;
  
  return false;
}

interface ProfileParseResult {
  rows: ProfileRow[];
  anchorCodes: string[];
  diagnostics: {
    anchorsFound: number;
    rowsParsed: number;
    rowsAfterDedup: number;
    headerGarbageRemoved: number;
  };
}

/**
 * Merge adjacent tokens in the profile column that form a single code
 * E.g., "SROL" + "M" -> "SROL M", "70" + "וואלה" -> "70 וואלה"
 * 
 * V2: Enhanced to scan all row items within profile column, not just profile column filtered
 */
function mergeMultiTokenAnchors(
  items: TextItem[],
  profileBounds: ColumnBounds | undefined,
  yTol: number
): TextItem[] {
  if (!profileBounds) return items;
  
  // Get all unique Y bands
  const yBands: number[] = [];
  for (const it of items) {
    if (!yBands.some(y => Math.abs(y - it.y) < yTol)) {
      yBands.push(it.y);
    }
  }
  yBands.sort((a, b) => b - a); // Sort descending
  
  const merged: TextItem[] = [...items]; // Start with all items
  const mergedCodes: TextItem[] = [];
  const consumedItems = new Set<string>(); // Track items that were merged
  
  // For each Y band, look for mergeable patterns
  for (const bandY of yBands) {
    const bandItems = items
      .filter(it => Math.abs(it.y - bandY) <= yTol)
      .sort((a, b) => b.x - a.x); // RTL order
    
    // Look for SROL + M pattern
    const srolIdx = bandItems.findIndex(it => /^S?ROL$/i.test(it.str.trim()));
    if (srolIdx >= 0) {
      // Look for adjacent letter (M, K, etc.) or number
      for (let j = 0; j < bandItems.length; j++) {
        if (j === srolIdx) continue;
        const other = bandItems[j];
        const xDist = Math.abs(cx(bandItems[srolIdx]) - cx(other));
        if (xDist < 80 && /^[A-Z0-9.]{1,4}$/i.test(other.str.trim()) && other.str.trim().length <= 3) {
          const srolItem = bandItems[srolIdx];
          const combinedStr = `${srolItem.str.trim()} ${other.str.trim()}`;
          const mergedItem: TextItem = {
            str: combinedStr,
            x: Math.min(srolItem.x, other.x),
            y: bandY,
            width: Math.max(srolItem.x + srolItem.width, other.x + other.width) - Math.min(srolItem.x, other.x),
            height: Math.max(srolItem.height, other.height),
          };
          mergedCodes.push(mergedItem);
          consumedItems.add(`${srolItem.x}|${srolItem.y}|${srolItem.str}`);
          consumedItems.add(`${other.x}|${other.y}|${other.str}`);
          console.log(`  Multi-token merge: "${combinedStr}" from "${srolItem.str}" + "${other.str}"`);
          break;
        }
      }
    }
    
    // Look for וואלה + number (60/70) pattern
    const walaIdx = bandItems.findIndex(it => /וואלה/i.test(it.str.trim()));
    if (walaIdx >= 0) {
      for (let j = 0; j < bandItems.length; j++) {
        if (j === walaIdx) continue;
        const other = bandItems[j];
        const xDist = Math.abs(cx(bandItems[walaIdx]) - cx(other));
        if (xDist < 80 && /^(60|70)$/.test(other.str.trim())) {
          const walaItem = bandItems[walaIdx];
          // Order: number first, then וואלה (like "70 וואלה")
          const combinedStr = `${other.str.trim()} ${walaItem.str.trim()}`;
          const mergedItem: TextItem = {
            str: combinedStr,
            x: Math.min(walaItem.x, other.x),
            y: bandY,
            width: Math.max(walaItem.x + walaItem.width, other.x + other.width) - Math.min(walaItem.x, other.x),
            height: Math.max(walaItem.height, other.height),
          };
          mergedCodes.push(mergedItem);
          consumedItems.add(`${walaItem.x}|${walaItem.y}|${walaItem.str}`);
          consumedItems.add(`${other.x}|${other.y}|${other.str}`);
          console.log(`  Multi-token merge: "${combinedStr}" from "${walaItem.str}" + "${other.str}"`);
          break;
        }
      }
    }
  }
  
  // Return: original items that weren't consumed + merged items
  const result = items.filter(it => !consumedItems.has(`${it.x}|${it.y}|${it.str}`));
  result.push(...mergedCodes);
  
  return result;
}

function parseProfileRowsV4(
  rows: TextRow[],
  items: TextItem[],
  header: TableHeader,
  profileEndY: number,  // Y coordinate (not row index) - end when Y goes below this
  sectionRef: string,
  debug = false
): ProfileParseResult {
  // Use header-derived table boundaries (not full page width!)
  const tableMinX = header.tableMinX ?? 0;
  const tableMaxX = header.tableMaxX ?? 600;
  
  const boundsMap = buildColumnBoundsMap(header.columnPositions, tableMinX, tableMaxX);
  
  // Get all column bounds
  const profileBounds = boundsMap.get("profile");
  const qtyBounds = boundsMap.get("qty");
  const lengthBounds = boundsMap.get("length");
  const roleBounds = boundsMap.get("role");
  const identBounds = boundsMap.get("ident");

  const startY = rows[header.rowIndex].y;

  console.log(`  Profile V5: startY=${startY.toFixed(1)}, endY=${profileEndY === -Infinity ? 'page_bottom' : profileEndY.toFixed(1)}`);
  console.log(`  Table X-range: ${tableMinX.toFixed(1)} - ${tableMaxX.toFixed(1)}`);
  console.log(`  qtyBounds: ${qtyBounds ? `${qtyBounds.minX.toFixed(1)}-${qtyBounds.maxX.toFixed(1)}, center=${qtyBounds.centerX.toFixed(1)}` : 'N/A'}`);
  console.log(`  profileBounds: ${profileBounds ? `${profileBounds.minX.toFixed(1)}-${profileBounds.maxX.toFixed(1)}` : 'N/A'}`);

  // Pre-filter items to table region (Y and X)
  const tableRegionItems = items.filter(it => {
    if (it.y >= startY) return false;
    if (profileEndY !== -Infinity && it.y <= profileEndY) return false;
    const c = cx(it);
    return c >= tableMinX - 30 && c <= tableMaxX + 30;
  });

  // Compute Y tolerance for anchor grouping
  const candidateYs = tableRegionItems
    .filter(it => profileBounds && Math.abs(cx(it) - profileBounds.centerX) < 50)
    .map(it => it.y);
  const yTol = computeAnchorTol(candidateYs);

  // Merge multi-token anchors first
  const mergedItems = mergeMultiTokenAnchors(tableRegionItems, profileBounds, yTol);

  // Collect anchors using isLikelyProfileAnchorToken
  // Check if item is inside role column (for stricter 3-digit validation)
  let anchors = mergedItems
    .filter(it => {
      const s = it.str.trim();
      const c = cx(it);
      
      // Determine if this item is in the role column
      const inRoleColumn = roleBounds && c >= roleBounds.minX - 10 && c <= roleBounds.maxX + 10;
      
      // Use stricter validation if in role column or outside profile column
      const strictMode = inRoleColumn || (profileBounds && Math.abs(c - profileBounds.centerX) > 50);
      
      if (!isLikelyProfileAnchorToken(s, strictMode, inRoleColumn || false)) return false;
      
      // Must be inside the overall table X-range
      if (c < tableMinX - 15 || c > tableMaxX + 15) return false;
      
      // If we have profile column bounds, require being within reasonable distance
      if (profileBounds) {
        if (Math.abs(c - profileBounds.centerX) > 70) return false;
      }
      
      return true;
    })
    .sort((a, b) => b.y - a.y);

  console.log(`  Found ${anchors.length} raw profile code anchors`);
  if (debug && anchors.length > 0 && anchors.length <= 10) {
    console.log(`  Anchor codes: ${anchors.map(a => a.str.trim()).join(", ")}`);
  }

  // Deduplicate anchors by adaptive Y tolerance AND X (for dual-column)
  const uniqueAnchors: TextItem[] = [];
  for (const a of anchors) {
    // Check both Y and X proximity to avoid merging items from different columns
    const exists = uniqueAnchors.some(u => 
      Math.abs(u.y - a.y) <= yTol && Math.abs(cx(u) - cx(a)) < 30
    );
    if (!exists) uniqueAnchors.push(a);
  }

  const anchorCodes = uniqueAnchors.map(a => a.str.trim());
  console.log(`  Deduped to ${uniqueAnchors.length} anchors (yTol=${yTol.toFixed(2)})`);
  
  if (uniqueAnchors.length === 0) {
    return { 
      rows: [], 
      anchorCodes: [],
      diagnostics: { anchorsFound: 0, rowsParsed: 0, rowsAfterDedup: 0, headerGarbageRemoved: 0 }
    };
  }

  // Build Y-bands using Voronoi-like midpoints
  const sortedAnchors = [...uniqueAnchors].sort((a, b) => b.y - a.y);
  const bands: { y: number; top: number; bottom: number; anchor: TextItem }[] = [];

  for (let i = 0; i < sortedAnchors.length; i++) {
    const cur = sortedAnchors[i];
    const prevY = i === 0 ? null : sortedAnchors[i - 1].y;
    const nextY = i === sortedAnchors.length - 1 ? null : sortedAnchors[i + 1].y;

    const top = prevY == null ? cur.y + yTol * 3 : (cur.y + prevY) / 2;
    const bottom = nextY == null ? cur.y - yTol * 3 : (cur.y + nextY) / 2;

    bands.push({ y: cur.y, top, bottom, anchor: cur });
  }

  // Collect all table items - RESTRICTED to table X-range (use merged items for role extraction)
  const tableItems = [...tableRegionItems, ...mergedItems.filter(m => 
    !tableRegionItems.some(t => t.x === m.x && t.y === m.y && t.str === m.str)
  )];

  const results: ProfileRow[] = [];

  for (let bandIdx = 0; bandIdx < bands.length; bandIdx++) {
    const band = bands[bandIdx];
    let bandItems = tableItems
      .filter(it => it.y <= band.top && it.y >= band.bottom)
      .filter(it => it.str && it.str.trim());

    // Profile code from anchor
    const profile_code = band.anchor.str.trim();

    // V5: Two-line row assembly
    // Check if this band is missing numeric fields (qty, length) - if so, look at next band
    let qtyFromCol = pickQtyFromBounds(bandItems, qtyBounds);
    let { cut_length, orientation } = pickLengthAndOrientation(bandItems, lengthBounds);
    
    // Detect "code-only" row: has the code but no valid numeric fields
    const isCodeOnlyRow = (
      qtyFromCol === 0 && 
      (cut_length === "-" || !cut_length) &&
      bandIdx < bands.length - 1
    );
    
    if (isCodeOnlyRow) {
      // Look at the NEXT band (lower Y = next row down in PDF) for numeric fields
      const nextBand = bands[bandIdx + 1];
      const nextBandItems = tableItems
        .filter(it => it.y <= nextBand.top && it.y >= nextBand.bottom)
        .filter(it => it.str && it.str.trim());
      
      // Try to extract numeric fields from next band
      const nextQty = pickQtyFromBounds(nextBandItems, qtyBounds);
      const nextLen = pickLengthAndOrientation(nextBandItems, lengthBounds);
      
      // Check if next band has the numeric fields we're missing
      const nextHasNumericFields = (
        nextQty > 0 || 
        (nextLen.cut_length && nextLen.cut_length !== "-")
      );
      
      // Also check: next band should NOT have its own valid profile code anchor
      // (if it does, it's a separate row, not a continuation)
      const nextHasOwnAnchor = nextBandItems.some(it => 
        isLikelyProfileAnchorToken(it.str.trim(), false, false) && 
        it.str.trim() !== profile_code
      );
      
      if (nextHasNumericFields && !nextHasOwnAnchor) {
        console.log(`  Two-line merge: "${profile_code}" code-only row, merging with next row for numeric fields`);
        // Merge: use code/role from current band, numeric fields from next band
        if (nextQty > 0) qtyFromCol = nextQty;
        if (nextLen.cut_length && nextLen.cut_length !== "-") {
          cut_length = nextLen.cut_length;
          orientation = nextLen.orientation;
        }
        // Also include next band items for role extraction
        bandItems = [...bandItems, ...nextBandItems];
        
        // Mark next band as "consumed" by modifying its anchor to empty 
        // (this prevents double-counting)
        // Actually, we'll skip the next band in the loop instead
      }
    }
    
    const qty = qtyFromCol > 0 ? qtyFromCol : 1;

    // ident: always use section ref (page item_ref), per user spec
    // Only override if there's a reliable ident column value matching sectionRef pattern
    let ident = sectionRef;
    if (identBounds) {
      const identCand = bandItems
        .filter(it => inBounds(it, identBounds, 10))
        .map(it => it.str.trim())
        .find(s => isValidItemRef(s) && s === sectionRef);
      // Only use if it matches the page sectionRef
      if (identCand) {
        ident = identCand;
      }
    }

    // role: extract from role column bounds only
    let role = "";
    if (roleBounds) {
      const roleItems = bandItems
        .filter(it => inBounds(it, roleBounds, 15)) // Wider tolerance
        .sort((a, b) => (b.y - a.y) || (b.x - a.x)); // stable
      role = cleanText(roleItems.map(it => it.str.trim()).join(" "));
    } else {
      // fallback: all Hebrew tokens excluding structural fields
      const blacklist = new Set<string>([
        profile_code,
        String(qty),
        ident,
        cut_length,
        orientation,
      ]);
      
      const roleTokens = bandItems
        .map(it => it.str.trim())
        .filter(s => s && /[\u0590-\u05FF]/.test(s))
        .filter(s => !blacklist.has(s))
        // Drop header words if they leaked
        .filter(s => !includesHeb(s, "פרופיל") && !includesHeb(s, "תפקיד") && !includesHeb(s, "אורך") && !includesHeb(s, "כמות") && !includesHeb(s, "כמ") && !includesHeb(s, "זיהוי"));
      
      role = cleanText(roleTokens.join(" "));
    }

    // Validate: must have a valid profile_code and not be in denylist
    if (profile_code && isLikelyProfileAnchorToken(profile_code, false, false) && !isInDenylist(profile_code)) {
      results.push({
        ident,
        qty,
        orientation: orientation || "-",
        cut_length: cut_length || "-",
        role: role || "-",
        profile_code,
      });
    }
  }

  // Filter out header garbage rows
  const beforeGarbageCount = results.length;
  const cleaned = results.filter(r => !isHeaderGarbageRow(r));
  const headerGarbageRemoved = beforeGarbageCount - cleaned.length;
  
  console.log(`  Parsed ${results.length} profile rows, ${headerGarbageRemoved} header garbage removed, final: ${cleaned.length}`);
  if (cleaned.length > 0) {
    const s = cleaned[0];
    console.log(`  Sample: code=${s.profile_code}, qty=${s.qty}, len=${s.cut_length}, ori=${s.orientation}, role="${s.role.substring(0, 40)}"`);
  }

  return {
    rows: cleaned,
    anchorCodes,
    diagnostics: {
      anchorsFound: uniqueAnchors.length,
      rowsParsed: results.length,
      rowsAfterDedup: cleaned.length,
      headerGarbageRemoved,
    }
  };
}

// ============================================================================
// MISC/ACCESSORIES TABLE PARSING
// ============================================================================

function parseMiscRows(
  rows: TextRow[],
  items: TextItem[],
  header: TableHeader | null,
  startRowIndex: number,
  endRowIndex: number
): MiscRow[] {
  if (!header) return [];

  const results: MiscRow[] = [];

  console.log(`  Misc parsing rows ${startRowIndex} to ${endRowIndex}`);

  // Get all items in the table range
  const startY = rows[startRowIndex]?.y ?? 0;
  const endY = endRowIndex < rows.length ? rows[endRowIndex].y : -Infinity;

  // Check if dual-column by looking at header X spread
  const headerRow = rows[header.rowIndex];
  const allHeaderX = headerRow.items.map(i => i.x);
  const headerMaxX = Math.max(...allHeaderX);
  const headerMinX = Math.min(...allHeaderX);
  const headerMidX = (headerMaxX + headerMinX) / 2;

  // Check for dual-column
  const leftHeaderTokens = headerRow.items.filter(i => i.x < headerMidX);
  const rightHeaderTokens = headerRow.items.filter(i => i.x >= headerMidX);
  const isDualColumn = leftHeaderTokens.length >= 2 && rightHeaderTokens.length >= 2;

  console.log(`  Misc dual-column: ${isDualColumn}, headerMidX: ${headerMidX.toFixed(1)}`);

  // Track previous row for continuation merging
  let prevRow: MiscRow | null = null;

  for (let i = startRowIndex; i < endRowIndex; i++) {
    const row = rows[i];
    const rowItems = row.items;

    // Skip if this looks like a glass dimension pattern (don't break, just skip)
    if (/\d{3,4}\s*[x×]\s*\d{3,4}/.test(row.text)) continue;

    // For dual-column: split items and process each side
    const itemGroups = isDualColumn
      ? [
          rowItems.filter(it => it.x >= headerMidX), // Right column (first in RTL)
          rowItems.filter(it => it.x < headerMidX),  // Left column
        ]
      : [rowItems];

    for (const colItems of itemGroups) {
      if (colItems.length === 0) continue;

      const colTokens = colItems.map(it => it.str.trim()).filter(s => s);
      const colText = colTokens.join(" ");

      // Find qty + unit pattern: "יח'24" or "24יח'" or "מ'116" etc.
      const qtyUnitMatch = colText.match(/(יח['']?|מ['']?)\s*(\d+)|(\d+)\s*(יח['']?|מ['']?)/);

      if (!qtyUnitMatch) {
        // This might be a continuation line - merge with previous row
        if (prevRow && colTokens.length > 0) {
          const mergeText = colTokens.join(" ").trim();
          if (mergeText.length > 0 && mergeText.length < 50) {
            prevRow.description = (prevRow.description + " " + mergeText).trim();
          }
        }
        continue;
      }

      const qty = parseInt(qtyUnitMatch[2] || qtyUnitMatch[3], 10);
      const unit = (qtyUnitMatch[1] || qtyUnitMatch[4] || "יח'").replace(/['']$/, "'");

      if (!qty || qty <= 0) continue;

      // Find SKU: alphanumeric pattern
      let sku = "";
      const skuPattern = /^[A-Za-z]?[A-Za-z0-9]{3,}[נפ]?$|^\d{4,6}[נפ]?$/;

      for (const token of colTokens) {
        if (skuPattern.test(token) && !/^\d{1,3}$/.test(token)) {
          sku = token;
          break;
        }
      }
      if (!sku && colTokens.length > 0) {
        const last = colTokens[colTokens.length - 1];
        if (skuPattern.test(last)) sku = last;
      }

      // Description: Hebrew tokens excluding qty/unit/sku patterns
      const descTokens = colTokens.filter(t => {
        if (/^\d+$/.test(t)) return false;
        if (/^(יח|מ)['']?\d*$/.test(t)) return false;
        if (/^\d+(יח|מ)['']?$/.test(t)) return false;
        if (t === sku) return false;
        if (/[\u0590-\u05FF]/.test(t) && t.length > 1) return true;
        return false;
      });

      const description = descTokens.join(" ").trim() || "-";

      const miscRow: MiscRow = {
        qty,
        unit: unit || "יח'",
        description,
        sku_code: sku,
      };

      results.push(miscRow);
      prevRow = miscRow;
    }
  }

  console.log(`  Parsed ${results.length} misc rows`);
  if (results.length > 0) {
    const s = results[0];
    console.log(`  Sample: sku=${s.sku_code}, desc="${s.description}", qty=${s.qty} ${s.unit}`);
  }

  return results;
}

// ============================================================================
// GLASS TABLE PARSING - V2 (coordinate-based extraction)
// ============================================================================

function parseGlassRows(
  rows: TextRow[],
  items: TextItem[],
  header: TableHeader | null,
  startIndex: number,
  endIndex: number,
  sectionRef: string
): GlassRow[] {
  const results: GlassRow[] = [];

  console.log(`  Glass parsing rows ${startIndex} to ${endIndex}`);

  // Dimension pattern: supports both integer and decimal (e.g., 1.400 x 0.900 or 1400 x 900)
  const dimPattern = /(\d{1,4}(?:\.\d{1,3})?)\s*[x×]\s*(\d{1,4}(?:\.\d{1,3})?)/;
  const glassCodePattern = /\b[zv]\d[\-\d]*[a-z]?\d?|[a-z]\d[\-\d]+[a-z]?\d?\b/i;

  // Build column bounds if header available
  const sizeBounds = header?.columnPositions.get("size");
  const codeBounds = header?.columnPositions.get("code");
  const qtyBounds = header?.columnPositions.get("qty");
  const descBounds = header?.columnPositions.get("desc");
  const skuBounds = header?.columnPositions.get("sku");

  const cx = (it: TextItem) => it.x + (it.width / 2);
  const inBoundsX = (item: TextItem, centerX: number | undefined, tolerance = 40) => {
    if (!centerX) return false;
    return Math.abs(cx(item) - centerX) <= tolerance;
  };

  // Get all items in the glass table Y range
  const startY = rows[startIndex]?.y ?? 0;
  const endY = endIndex < rows.length ? rows[endIndex].y : -Infinity;
  
  const tableItems = items.filter(it => it.y <= startY && it.y > endY);

  for (let i = startIndex; i < endIndex; i++) {
    const row = rows[i];
    const text = row.text;

    // Must have dimension pattern (primary filter)
    const dimMatch = text.match(dimPattern);
    if (!dimMatch) continue;

    // Format size: if decimal, convert to mm (e.g., 1.400 -> 1400)
    const dim1 = dimMatch[1].includes('.') ? dimMatch[1].replace('.', '') : dimMatch[1];
    const dim2 = dimMatch[2].includes('.') ? dimMatch[2].replace('.', '') : dimMatch[2];
    const sizeText = `${dim1} x ${dim2}`;

    // Get items in this row for column-based extraction
    const rowItems = row.items;

    // Extract glass code - prefer column-based, fallback to regex
    let code = "";
    if (codeBounds) {
      const codeItems = rowItems.filter(it => inBoundsX(it, codeBounds));
      const codeText = codeItems.map(it => it.str.trim()).join(" ");
      const codeMatch = codeText.match(glassCodePattern);
      if (codeMatch) code = codeMatch[0].toLowerCase();
    }
    if (!code) {
      const codeMatch = text.match(glassCodePattern);
      if (codeMatch) code = codeMatch[0].toLowerCase();
    }

    // Extract quantity - prefer column-based
    let qty = 1;
    if (qtyBounds) {
      const qtyItems = rowItems.filter(it => inBoundsX(it, qtyBounds, 30));
      for (const item of qtyItems) {
        const s = item.str.trim();
        if (/^\d{1,2}$/.test(s)) {
          const num = parseInt(s);
          if (num > 0 && num < 100) {
            qty = num;
            break;
          }
        }
      }
    }
    // Fallback: find any small number not in dimension
    if (qty === 1) {
      for (const item of rowItems) {
        const s = item.str.trim();
        if (/^\d{1,2}$/.test(s)) {
          const num = parseInt(s);
          if (num > 0 && num < 100 && num !== parseInt(dim1) && num !== parseInt(dim2)) {
            qty = num;
            break;
          }
        }
      }
    }

    // Extract description - prefer column-based, fallback to Hebrew text
    let description = "בידודית";
    if (descBounds) {
      const descItems = rowItems.filter(it => inBoundsX(it, descBounds, 50));
      const descText = descItems.map(it => it.str.trim()).filter(s => /[\u0590-\u05FF]/.test(s)).join(" ");
      if (descText) description = descText;
    }
    if (description === "בידודית" && text.includes("בידודית")) {
      // Try to extract more context around בידודית
      const hebrewTokens = rowItems.map(it => it.str.trim()).filter(s => /[\u0590-\u05FF]/.test(s) && s.length > 1);
      if (hebrewTokens.length > 0) {
        description = hebrewTokens.join(" ");
      }
    }

    // Extract SKU name
    let skuName: string | null = null;
    if (skuBounds) {
      const skuItems = rowItems.filter(it => inBoundsX(it, skuBounds, 40));
      const skuText = skuItems.map(it => it.str.trim()).join("");
      if (skuText) skuName = skuText;
    }
    if (!skuName) {
      const skuMatch = text.match(/(\d+v|v\d+)/i);
      skuName = skuMatch ? skuMatch[1].toLowerCase() : `${sectionRef}v`;
    }

    // Avoid duplicate rows with same size and code
    const exists = results.some(r => r.size_text === sizeText && r.code === code);
    if (!exists) {
      results.push({
        code: code || "בידודית",
        size_text: sizeText,
        qty,
        description,
        sku_name: skuName,
      });
    }
  }

  console.log(`  Parsed ${results.length} glass rows`);
  if (results.length > 0) {
    const s = results[0];
    console.log(`  Sample glass: code=${s.code}, size=${s.size_text}, qty=${s.qty}, desc="${s.description}"`);
  }

  return results;
}

// ============================================================================
// PAGE PARSING - V5 (fixed boundary logic, multi-token anchors, diagnostics)
// ============================================================================

function parsePage(pageNum: number, items: TextItem[], debug = false): ParsedPage {
  const rows = groupIntoRows(items);
  const fullText = rows.map(r => r.text).join("\n");

  console.log(`\n=== Page ${pageNum} ===`);
  console.log(`  Total rows: ${rows.length}, total items: ${items.length}`);

  // Find ALL profile table headers (may be 2 for dual-table layouts)
  const profileHeaders = findProfileTableHeaders(rows);
  const glassHeader = findGlassTableHeader(rows);
  const notesIdx = findNotesRow(rows);
  
  // Find misc header AFTER notes (because accessories table is under הערות)
  const miscHeader = findMiscTableHeader(rows, notesIdx >= 0 ? notesIdx : 0);

  // Use first profile header for boundary calculations
  const profileIdx = profileHeaders.length > 0 ? profileHeaders[0].rowIndex : -1;
  const glassIdx = glassHeader?.rowIndex ?? -1;
  const miscIdx = miscHeader?.rowIndex ?? -1;

  console.log(`  Headers: profile=${profileIdx} (${profileHeaders.length} tables), glass=${glassIdx}, misc=${miscIdx}, notes=${notesIdx}`);

  // For each profile header, find its ident sub-header and add to column positions
  for (const header of profileHeaders) {
    const identInfo = findIdentRowForHeader(rows, header.rowIndex, header);
    if (identInfo) {
      header.columnPositions.set("ident", identInfo.identX);
      console.log(`  Added ident column for header at row ${header.rowIndex}, X=${identInfo.identX.toFixed(1)}`);
    }
  }

  // ===== FIXED BOUNDARY CALCULATION V2 =====
  // Profile ends at: glass or misc header ONLY if they overlap X-region with profile table by >= 30%
  // This prevents left-side misc/notes headers from truncating the right-side profile table
  
  let profileEndY = -Infinity; // Default: parse to end of page
  
  if (profileHeaders.length > 0) {
    const mainProfileHeader = profileHeaders[0];
    
    // Only consider glass/misc as boundaries if they overlap X-region significantly
    const glassOverlapRatio = computeOverlapRatio(mainProfileHeader, glassHeader);
    const miscOverlapRatio = computeOverlapRatio(mainProfileHeader, miscHeader);
    
    console.log(`  Overlap ratios: glass=${glassOverlapRatio.toFixed(2)}, misc=${miscOverlapRatio.toFixed(2)}`);
    
    const glassOverlaps = glassOverlapRatio >= 0.3;
    const miscOverlaps = miscOverlapRatio >= 0.3;
    
    // Find the first boundary that overlaps (by row index, which means higher Y in PDF coords)
    const boundaries: { idx: number; y: number; name: string }[] = [];
    
    if (glassOverlaps && glassIdx > profileIdx) {
      boundaries.push({ idx: glassIdx, y: rows[glassIdx].y, name: 'glass' });
    }
    if (miscOverlaps && miscIdx > profileIdx) {
      boundaries.push({ idx: miscIdx, y: rows[miscIdx].y, name: 'misc' });
    }
    
    // Pick the boundary with the lowest row index that's still after profile header
    // (lowest row index after profile = highest Y in PDF coords = first table encountered going down)
    if (boundaries.length > 0) {
      // Sort by row index ascending to get the first boundary after profile
      boundaries.sort((a, b) => a.idx - b.idx);
      profileEndY = boundaries[0].y;
      console.log(`  Profile ends at Y=${profileEndY.toFixed(1)} (row ${boundaries[0].idx}, ${boundaries[0].name} header)`);
    } else {
      console.log(`  Profile ends at page bottom (no overlapping boundaries)`);
    }
  }

  // Glass ends at misc (if misc comes AFTER glass)
  const glassEnd = (glassIdx >= 0 && miscIdx > glassIdx) ? miscIdx : rows.length;

  // Misc ends at page end
  const miscEnd = rows.length;

  console.log(`  Boundaries: profileEndY=${profileEndY === -Infinity ? 'page_bottom' : profileEndY.toFixed(1)}, glassEnd=${glassEnd}, miscEnd=${miscEnd}`);

  // Extract section reference
  const sectionRef = extractSectionRef(rows, pageNum);
  console.log(`  Section ref: ${sectionRef}`);

  // Extract metadata
  const title = extractTitle(rows);
  const quantity = extractQuantity(rows);
  const notes = extractNotes(rows, notesIdx);
  const technicalText = extractTechnicalText(rows, profileIdx >= 0 ? profileIdx : 0);

  // Parse tables using V5 for profiles - now handles MULTIPLE profile tables
  let profileRows: ProfileRow[] = [];
  let glassRows: GlassRow[] = [];
  let miscRows: MiscRow[] = [];
  let parseErrors: string[] = [];
  let parseWarnings: ParseWarning[] = [];
  let allAnchorCodes: string[] = [];
  let totalAnchorsFound = 0;

  // Parse ALL profile tables and merge results
  for (const header of profileHeaders) {
    const result = parseProfileRowsV4(rows, items, header, profileEndY, sectionRef, debug);
    console.log(`  Profile table at row ${header.rowIndex}: ${result.rows.length} rows from ${result.diagnostics.anchorsFound} anchors`);
    profileRows.push(...result.rows);
    allAnchorCodes.push(...result.anchorCodes);
    totalAnchorsFound += result.diagnostics.anchorsFound;
    
    // Add to warnings
    if (result.diagnostics.headerGarbageRemoved > 0) {
      parseWarnings.push({
        type: 'header_garbage_removed',
        message: `Removed ${result.diagnostics.headerGarbageRemoved} header garbage rows`,
        details: { count: result.diagnostics.headerGarbageRemoved }
      });
    }
  }

  // Deduplicate/merge profile rows deterministically (prevents over-count from row-splitting)
  if (profileRows.length > 0) {
    // 1) Exact dedupe for identical rows
    const seen = new Set<string>();
    const exact: ProfileRow[] = [];
    for (const pr of profileRows) {
      const key = `${pr.profile_code}|${pr.cut_length}|${pr.orientation}|${pr.role}|${pr.qty}|${pr.ident}`;
      if (!seen.has(key)) {
        seen.add(key);
        exact.push(pr);
      }
    }

    // 2) Merge "split" duplicates sharing the same code+len+ori where at least one is low-quality
    const groups = new Map<string, ProfileRow[]>();
    for (const pr of exact) {
      const k = `${pr.profile_code}|${pr.cut_length}|${pr.orientation}`;
      const arr = groups.get(k) ?? [];
      arr.push(pr);
      groups.set(k, arr);
    }

    const merged: ProfileRow[] = [];

    const score = (r: ProfileRow) => {
      let s = 0;
      if (r.cut_length && r.cut_length !== "-") s += 2;
      if (r.orientation && r.orientation !== "-") s += 1;
      if (r.role && r.role !== "-" && r.role.trim().length >= 3) s += 1;
      if (typeof r.qty === "number" && r.qty > 1) s += 1;
      s += Math.min(20, (r.role || "").trim().length / 10);
      return s;
    };

    const isLowQuality = (r: ProfileRow) => {
      const role = (r.role || "").trim();
      return (
        !role || role === "-" || role.length < 3 ||
        !r.cut_length || r.cut_length === "-" ||
        !r.orientation || r.orientation === "-"
      );
    };

    for (const [k, arr] of groups) {
      if (arr.length === 1) {
        merged.push(arr[0]);
        continue;
      }

      const hasLow = arr.some(isLowQuality);
      if (!hasLow) {
        // If all rows are "high quality", keep them all (same code can legitimately appear multiple times)
        merged.push(...arr);
        continue;
      }

      let best = arr.reduce((a, b) => (score(b) > score(a) ? b : a));
      for (const r of arr) {
        if (!best.role || best.role === "-" || best.role.trim().length < (r.role || "").trim().length) {
          if (r.role && r.role !== "-") best.role = r.role;
        }
        if (!best.cut_length || best.cut_length === "-") {
          if (r.cut_length && r.cut_length !== "-") best.cut_length = r.cut_length;
        }
        if (!best.orientation || best.orientation === "-") {
          if (r.orientation && r.orientation !== "-") best.orientation = r.orientation;
        }
        best.qty = Math.max(best.qty || 0, r.qty || 0);
        if (best.ident === sectionRef && r.ident !== sectionRef) best.ident = r.ident;
      }

      console.log(`  Merged split profile rows for ${k}: ${arr.length} -> 1`);
      parseWarnings.push({
        type: 'rows_merged',
        message: `Merged ${arr.length} split rows for ${k}`,
        details: { key: k, count: arr.length }
      });
      merged.push(best);
    }

    profileRows = merged;
    console.log(`  Final profile count after merge: ${profileRows.length}`);
  }

  // Check for multiple idents - but don't treat as error, just warning
  const identCounts = new Map<string, number>();
  for (const pr of profileRows) {
    identCounts.set(pr.ident, (identCounts.get(pr.ident) || 0) + 1);
  }
  if (identCounts.size > 1) {
    // Multiple idents detected - normalize all to sectionRef
    const countsObj = Object.fromEntries(identCounts);
    parseWarnings.push({
      type: 'multiple_idents_detected',
      message: `Multiple idents detected, normalizing to ${sectionRef}`,
      details: countsObj
    });
    console.log(`  Multiple idents detected:`, countsObj);
    
    // Normalize all idents to sectionRef (per user requirement)
    for (const pr of profileRows) {
      pr.ident = sectionRef;
    }
  }

  // Validation: check anchors vs rows
  if (totalAnchorsFound > 0 && profileRows.length < totalAnchorsFound) {
    const parsedCodes = new Set(profileRows.map(r => r.profile_code));
    const missingCodes = allAnchorCodes.filter(c => !parsedCodes.has(c)).slice(0, 5);
    
    const diagPayload = {
      page: pageNum,
      item_ref: sectionRef,
      anchors: totalAnchorsFound,
      rows: profileRows.length,
      missing: missingCodes,
    };
    parseErrors.push(`profile_rows_incomplete|${JSON.stringify(diagPayload)}`);
    parseWarnings.push({
      type: 'profile_rows_incomplete',
      message: `Anchors: ${totalAnchorsFound}, Rows: ${profileRows.length}`,
      details: diagPayload
    });
    console.log(`  [DIAG] profile_rows_incomplete:`, diagPayload);
  }

  if (profileHeaders.length > 0 && profileRows.length === 0) {
    parseErrors.push(`Profile table header(s) found but 0 rows parsed`);
  }

  // Log diagnostic line for every page
  console.log(`  [diag] page=${pageNum} item_ref="${sectionRef}" anchors=${totalAnchorsFound} profiles=${profileRows.length} missing=${totalAnchorsFound > profileRows.length ? (totalAnchorsFound - profileRows.length) : 0}`);

  // Validation: check for incomplete rows (missing fields)
  for (let i = 0; i < profileRows.length; i++) {
    const pr = profileRows[i];
    const missing: string[] = [];
    if (!pr.qty || pr.qty === 0) missing.push("qty");
    if (!pr.cut_length || pr.cut_length === "-") missing.push("cut_length");
    if (!pr.orientation || pr.orientation === "-") missing.push("orientation");
    if (!pr.role || pr.role === "-") missing.push("role");

    if (missing.length > 0) {
      parseErrors.push(`Profile row ${i + 1} (${pr.profile_code}) missing: ${missing.join(", ")}`);
    }
  }

  if (glassHeader && glassIdx >= 0) {
    glassRows = parseGlassRows(rows, items, glassHeader, glassIdx + 1, glassEnd, sectionRef);
  }

  if (miscHeader && miscIdx >= 0) {
    miscRows = parseMiscRows(rows, items, miscHeader, miscIdx + 1, miscEnd);

    // Validation: if header exists but no rows
    if (miscRows.length === 0) {
      parseErrors.push(`Misc/accessories header found at row ${miscIdx} but 0 rows parsed`);
    }
  }

  // Build parse_error if any issues
  let parseError: string | undefined;
  if (parseErrors.length > 0) {
    parseError = parseErrors.join("; ");
    console.log(`  Parse warnings: ${parseError}`);
  } else if (profileRows.length === 0 && miscRows.length === 0 && glassRows.length === 0) {
    parseError = "לא נמצאו טבלאות בעמוד זה";
  }

  return {
    page_number: pageNum,
    item_ref: sectionRef,
    title,
    dimensions_meta: null,
    quantity_total: quantity,
    technical_text: technicalText,
    notes,
    raw_page_text: fullText.substring(0, 3000),
    profile_rows: profileRows,
    misc_rows: miscRows,
    glass_rows: glassRows,
    parse_error: parseError,
    parse_warnings: parseWarnings.length > 0 ? parseWarnings : undefined,
  };
}

// ============================================================================
// MAIN HANDLER - Supports chunked parsing via storagePath + startPage/endPage
// ============================================================================

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders, status: 204 });
  }

  const tAll = performance.now();

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ success: false, error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: allowed } = await supabase.rpc("is_email_allowed");
    if (!allowed) {
      return new Response(JSON.stringify({ success: false, error: "User not allowed" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("Authenticated user:", user.email);

    // Check content type to determine mode
    const contentType = req.headers.get("content-type") || "";
    
    let pdfData: Uint8Array;
    let startPage = 1;
    let endPage: number | null = null;
    let mode: "full" | "chunk" | "info" = "full";
    let storagePath: string | null = null;
    let debug = false;
    
    if (contentType.includes("application/json")) {
      // JSON mode: read from storage with page range
      const body = await req.json();
      storagePath = body.storagePath;
      startPage = body.startPage || 1;
      endPage = body.endPage || null;
      mode = body.mode || "chunk"; // "info" just returns page count, "chunk" parses pages
      debug = body.debug === true;
      
      if (!storagePath) {
        return new Response(JSON.stringify({ success: false, error: "storagePath required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      
      console.log(`[chunk] mode=${mode}, storagePath=${storagePath}, pages=${startPage}-${endPage || "end"}, debug=${debug}`);
      
      // Download from storage
      const { data: fileData, error: downloadError } = await supabase.storage
        .from("cutlist-pdfs")
        .download(storagePath);
      
      if (downloadError ||!fileData) {
        console.error("Storage download error:", downloadError);
        return new Response(JSON.stringify({ success: false, error: "Failed to download PDF from storage" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      
      const arrayBuffer = await fileData.arrayBuffer();
      pdfData = new Uint8Array(arrayBuffer);
      console.log(`[storage] downloaded ${pdfData.length} bytes`);
      
    } else {
      // FormData mode: file upload (original behavior)
      const formData = await req.formData();
      const file = formData.get("file") as File;

      if (!file) {
        return new Response(JSON.stringify({ success: false, error: "No file provided" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      console.log("Processing PDF:", file.name, "Size:", file.size);

      const tRead = performance.now();
      const arrayBuffer = await file.arrayBuffer();
      pdfData = new Uint8Array(arrayBuffer);
      console.log(`[read] ${pdfData.length} bytes in ${ms(tRead)}ms`);
    }

    const tParse = performance.now();
    const pdfjs = await getPdfjs();
    const pdfDoc = await pdfjs.getDocument({ 
      data: pdfData, 
      useSystemFonts: true,
    }).promise;
    const pageCount = pdfDoc.numPages;
    console.log(`[pdfjs] loaded ${pageCount} pages in ${ms(tParse)}ms`);

    // Info mode: just return page count for chunking decisions
    if (mode === "info") {
      const firstPageItems = await extractPageItems(pdfDoc, 1);
      const firstPageRows = groupIntoRows(firstPageItems);
      const projectName = extractProjectName(firstPageRows);
      
      return new Response(JSON.stringify({ 
        success: true, 
        data: { 
          pageCount, 
          projectName,
        } 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Determine page range
    const actualEndPage = endPage ? Math.min(endPage, pageCount) : pageCount;
    const actualStartPage = Math.max(1, startPage);
    
    // Extract project name from first page (only if starting from page 1)
    let projectName: string | null = null;
    if (actualStartPage === 1) {
      const firstPageItems = await extractPageItems(pdfDoc, 1);
      const firstPageRows = groupIntoRows(firstPageItems);
      projectName = extractProjectName(firstPageRows);
      console.log("Project name:", projectName);
    }

    const pages: ParsedPage[] = [];
    const pageErrors: { page: number; error: string; stack?: string }[] = [];
    const tPages = performance.now();

    // Process pages sequentially within the chunk
    for (let pageNum = actualStartPage; pageNum <= actualEndPage; pageNum++) {
      try {
        const items = await extractPageItems(pdfDoc, pageNum);
        const page = parsePage(pageNum, items, debug);
        pages.push(page);
        
        // Log progress
        if ((pageNum - actualStartPage + 1) % 5 === 0) {
          const elapsed = performance.now() - tAll;
          console.log(`[progress] page ${pageNum}/${actualEndPage} (${Math.round(elapsed)}ms)`);
        }
      } catch (err) {
        console.error(`[page ${pageNum}] FAILED:`, err);
        const errMsg = err instanceof Error ? err.message : String(err);
        const errStack = err instanceof Error ? err.stack : undefined;
        pageErrors.push({ page: pageNum, error: errMsg, stack: errStack });
        // Do NOT emit fake error-page-* items
        // Instead, just log and skip this page - it will be in pageErrors
        console.log(`[page ${pageNum}] Skipping failed page, will be in parse_errors`);
      }
    }

    if (pageErrors.length > 0) {
      console.warn(`[warning] ${pageErrors.length} pages failed to parse:`, pageErrors.map(e => `page ${e.page}: ${e.error}`));
    }

    console.log(`[pages] parsed=${pages.length} (${actualStartPage}-${actualEndPage}) in ${ms(tPages)}ms`);
    console.log(`[total] done in ${ms(tAll)}ms`);

    const totalProfiles = pages.reduce((sum, p) => sum + p.profile_rows.length, 0);
    const totalMisc = pages.reduce((sum, p) => sum + p.misc_rows.length, 0);
    const totalGlass = pages.reduce((sum, p) => sum + p.glass_rows.length, 0);
    const pagesWithErrors = pages.filter(p => p.parse_error).length;

    console.log(`[summary] profiles=${totalProfiles}, misc=${totalMisc}, glass=${totalGlass}, pagesWithErrors=${pagesWithErrors}`);

    const result: ParsedCutlist = {
      project_name: projectName,
      pages,
      // Include document-level parse errors (pages that failed completely)
      parse_errors: pageErrors.length > 0 ? pageErrors.map(e => ({ page: e.page, error: e.error })) : undefined,
    };

    return new Response(JSON.stringify({ success: true, data: result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Fatal error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    const stack = error instanceof Error ? error.stack : undefined;
    return new Response(JSON.stringify({ 
      success: false, 
      error: message,
      stack,
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
