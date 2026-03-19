import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolvePDFJS } from "https://esm.sh/pdfjs-serverless@0.6.0";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";

let pdfjsPromise: Promise<any> | null = null;
const getPdfjs = () => (pdfjsPromise ??= resolvePDFJS());

// Vision-based part ID extraction using Lovable AI
interface VisionPartId {
  text: string;
  segment_index: number;
  confidence: number;
}

interface VisionExtractionResult {
  success: boolean;
  part_ids: VisionPartId[];
  error?: string;
  raw_response?: string;
}

async function extractPartIdsWithVision(
  pdfArrayBuffer: ArrayBuffer,
  pageNum: number,
  segmentCount: number,
  debug: boolean
): Promise<VisionExtractionResult> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  
  if (!LOVABLE_API_KEY) {
    return { success: false, part_ids: [], error: "LOVABLE_API_KEY not configured" };
  }
  
  try {
    // For now, we'll use a text-based approach with the existing PDF data
    // In the future, this could render pages to images first
    // Since pdfjs-serverless doesn't support canvas rendering in Deno,
    // we'll use a structured prompt to analyze the text content
    
    const pdfjs = await getPdfjs();
    const pdfDoc = await pdfjs.getDocument({
      data: new Uint8Array(pdfArrayBuffer),
      disableWorker: true,
    }).promise;
    
    const page = await pdfDoc.getPage(pageNum);
    const textContent = await page.getTextContent();
    
    // Build a structured text representation with positions
    const items: { str: string; x: number; y: number }[] = [];
    for (const item of textContent.items) {
      if (!item.str || item.str.trim() === "") continue;
      const transform = item.transform;
      items.push({
        str: item.str.trim(),
        x: Math.round(transform[4]),
        y: Math.round(transform[5]),
      });
    }
    
    // Sort by Y descending (top to bottom) then X ascending
    items.sort((a, b) => b.y - a.y || a.x - b.x);
    
    // Create a text representation for the AI to analyze
    const textData = items.map(i => `"${i.str}" at (${i.x}, ${i.y})`).join("\n");
    
    const prompt = `Analyze this optimization PDF page data and extract part IDs.

Part IDs are Hebrew codes like "א-2", "ב-3", "ג-1" etc. that appear BELOW the cutting segment boxes.
Each segment box shows a length (like "1234") and may have part IDs underneath it.

The page has ${segmentCount} segments. For each segment (0 to ${segmentCount - 1}), list any part IDs that appear below it.

Text items with positions (x, y where y decreases going down the page):
${textData.slice(0, 8000)}

Respond with a JSON array of objects:
[{"segment_index": 0, "part_ids": ["א-2", "ב-3"]}, {"segment_index": 1, "part_ids": ["ג-1"]}]

Only include segments that have part IDs. Return [] if no part IDs found.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "You are a document parser. Respond with ONLY valid JSON, no markdown." },
          { role: "user", content: prompt },
        ],
        max_tokens: 4096,
      }),
    });
    
    if (!response.ok) {
      const errText = await response.text();
      console.error(`[vision] AI API error: ${response.status} ${errText}`);
      return { success: false, part_ids: [], error: `AI API error: ${response.status}` };
    }
    
    const aiResult = await response.json();
    const content = aiResult.choices?.[0]?.message?.content || "";
    
    if (debug) {
      console.log(`[vision] AI response: ${content.slice(0, 500)}`);
    }
    
    // Extract JSON from response - handle markdown code blocks
    let jsonStr = content;
    
    // Remove markdown code block if present
    const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      jsonStr = codeBlockMatch[1].trim();
    }
    
    // Find the JSON array - use greedy match for complete arrays
    const jsonMatch = jsonStr.match(/\[\s*[\s\S]*\]/);
    if (!jsonMatch) {
      return { success: false, part_ids: [], error: "No JSON array found in response", raw_response: content };
    }
    
    let parsed;
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch (parseError) {
      // Try to salvage partial JSON by finding complete objects
      const partialMatch = jsonStr.match(/\[\s*([\s\S]*)/);
      if (partialMatch) {
        // Find all complete objects in the partial array
        const objectMatches = partialMatch[1].matchAll(/\{\s*"segment_index"\s*:\s*(\d+)\s*,\s*"part_ids"\s*:\s*\[((?:"[^"]*"(?:\s*,\s*)?)*)\]\s*\}/g);
        parsed = [];
        for (const match of objectMatches) {
          const segmentIndex = parseInt(match[1]);
          const partIdsStr = match[2];
          const partIds = partIdsStr.match(/"([^"]*)"/g)?.map((s: string) => s.replace(/"/g, "")) || [];
          parsed.push({ segment_index: segmentIndex, part_ids: partIds });
        }
        if (parsed.length === 0) {
          return { success: false, part_ids: [], error: `JSON parse failed: ${parseError instanceof Error ? parseError.message : String(parseError)}`, raw_response: content };
        }
        console.log(`[vision] Recovered ${parsed.length} objects from partial JSON`);
      } else {
        return { success: false, part_ids: [], error: `JSON parse failed: ${parseError instanceof Error ? parseError.message : String(parseError)}`, raw_response: content };
      }
    }
    
    const result: VisionPartId[] = [];
    
    for (const item of parsed) {
      if (typeof item.segment_index === "number" && Array.isArray(item.part_ids)) {
        for (const partId of item.part_ids) {
          result.push({
            text: partId,
            segment_index: item.segment_index,
            confidence: 0.8,
          });
        }
      }
    }
    
    return { success: true, part_ids: result };
    
  } catch (error) {
    console.error("[vision] Error:", error);
    return { success: false, part_ids: [], error: error instanceof Error ? error.message : String(error) };
  }
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface TextItem {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

// Cut type with optional angle metadata for forward compatibility
type CutType = "straight" | "angled" | "unknown";

interface CutInfo {
  type: CutType;
  angle_deg?: number | null;
  slope?: "in" | "out" | null;
}

// Enhanced segment structure with cut indicators and part IDs
interface EnhancedSegment {
  length_mm: number;
  cut_left: CutInfo;
  cut_right: CutInfo;
  part_ids?: string[];  // Part IDs displayed under this segment
}

// Boundary between segments with part IDs
interface Boundary {
  between: [number, number];
  cut_type: CutType;
  angle_deg?: number | null;
  slope?: "in" | "out" | null;
  part_ids: string[];
}

interface ParsedPattern {
  pattern_index: number;
  rod_count: number;
  segments_mm: number[];
  segments: EnhancedSegment[];
  boundaries: Boundary[];
  used_mm: number | null;
  remainder_mm: number | null;
  raw_text: string;
  parse_warnings: string[];
  // Internal metadata
  segment_infos?: SegmentInfo[];
  row_y?: number;
  row_bbox?: { x0: number; y0: number; x1: number; y1: number };
}

interface ParsedProfile {
  profile_code: string;
  total_rods: number | null;
  patterns: ParsedPattern[];
}

interface RowDiagnostics {
  row_index: number;
  row_bbox: { x0: number; y0: number; x1: number; y1: number };
  raw_lines_count: number;
  diagonal_candidates_count: number;
  boundary_decisions: { between: [number, number]; decision: CutType; reason: string }[];
  fallback_reason: string | null;
  part_ids_mapped: { boundary_index: number; part_ids: string[] }[];
}

interface PageDiagnostics {
  page: number;
  found_profiles: number;
  found_patterns: number;
  warnings: string[];
  anchors_sample?: string[];
  part_ids_total?: number;
  angle_boundaries_found?: number;
  unknown_boundaries_found?: number;
  operator_parsing_used?: boolean;
  image_diagram_detected?: boolean;
  construct_path_ops?: number;
  direct_line_ops?: number;
  row_diagnostics?: RowDiagnostics[];
}

// Hebrew rod count header variants
const ROD_COUNT_HEADERS = [
  "כמות מוטות",
  "מס' מוטות",
  "מספר מוטות",
  "'מוט",
  "מוטות",
];

// Total rods pattern
const TOTAL_RODS_PATTERN = /סה"?כ\s*מוטות|מוטות:?\s*סה"?כ/;

// Bar length patterns
const BAR_LENGTH_PATTERNS = [
  /bar\s*length/i,
  /אורך\s*מוט/,
  /אורך\s*ברזל/,
  /6000\s*מ['"]?מ/,
];

// Unit tokens to exclude from segments
const UNIT_TOKENS = ["מ''מ", "מ\"מ", "ממ", "מ'", "mm", "מ״מ"];

// Part ID pattern: Hebrew letter(s) + optional dash + 1-4 digits + optional Latin letter
const PART_ID_PATTERN = /^[א-ת]{1,3}[-]?\d{1,4}[A-Za-z]?$/;

function cleanText(str: string): string {
  return str
    .replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractTextItems(textContent: any): TextItem[] {
  const items: TextItem[] = [];
  
  for (const item of textContent.items) {
    if (!item.str || item.str.trim() === "") continue;
    
    const transform = item.transform;
    const x = transform[4];
    const y = transform[5];
    const width = item.width || 0;
    const height = item.height || Math.abs(transform[0]);
    
    items.push({
      str: cleanText(item.str),
      x,
      y,
      width,
      height,
    });
  }
  
  return items;
}

function isSegmentLength(value: number, barLength: number | null): boolean {
  if (value < 100 || value > 5000) return false;
  if (barLength && Math.abs(value - barLength) < 50) return false;
  return true;
}

function isUnitToken(str: string): boolean {
  const cleaned = str.toLowerCase().replace(/['"״]/g, "'");
  return UNIT_TOKENS.some(u => cleaned.includes(u.toLowerCase()));
}

function isPartId(str: string): boolean {
  if (isUnitToken(str)) return false;
  return PART_ID_PATTERN.test(str);
}

function findProfileBlocks(items: TextItem[], debug: boolean): { code: string; startY: number; endY: number; items: TextItem[] }[] {
  const blocks: { code: string; startY: number; endY: number; items: TextItem[] }[] = [];
  
  const profileHeaderCandidates: { code: string; y: number }[] = [];
  
  for (const item of items) {
    const match = item.str.match(/^(\d{5,6})$/);
    if (match) {
      profileHeaderCandidates.push({ code: match[1], y: item.y });
    }
  }
  
  if (debug) {
    console.log(`[diag] Found ${profileHeaderCandidates.length} profile candidates`);
  }
  
  profileHeaderCandidates.sort((a, b) => b.y - a.y);
  
  for (let i = 0; i < profileHeaderCandidates.length; i++) {
    const current = profileHeaderCandidates[i];
    const next = profileHeaderCandidates[i + 1];
    
    const startY = current.y + 20;
    const endY = next ? next.y : 0;
    
    const blockItems = items.filter(item => item.y <= startY && item.y > endY);
    
    blocks.push({
      code: current.code,
      startY,
      endY,
      items: blockItems,
    });
  }
  
  return blocks;
}

interface SegmentInfo {
  value: number;
  x: number;
  width: number;
  rangeStartX: number;
  rangeEndX: number;
}

function parsePatternRow(
  rowItems: TextItem[],
  barLength: number | null,
  rodCountColumnX: number | null,
  allBlockItems: TextItem[],
  rowY: number,
  debug: boolean
): ParsedPattern | null {
  const sorted = [...rowItems].sort((a, b) => a.x - b.x);
  
  const segments: number[] = [];
  const segmentInfos: SegmentInfo[] = [];
  let rodCount: number | null = null;
  let usedMm: number | null = null;
  let remainderMm: number | null = null;
  
  const numericItems: { value: number; x: number; isDecimal: boolean; str: string; width: number }[] = [];
  
  for (const item of sorted) {
    if (isUnitToken(item.str)) continue;
    if (isPartId(item.str)) continue;
    
    const numMatch = item.str.match(/^(\d+(?:[.,]\d+)?)$/);
    if (numMatch) {
      const strValue = numMatch[1].replace(",", ".");
      const value = parseFloat(strValue);
      const isDecimal = strValue.includes(".");
      numericItems.push({ value, x: item.x, isDecimal, str: item.str, width: item.width || 0 });
    }
  }
  
  for (const numItem of numericItems) {
    const value = numItem.value;
    
    if (barLength && Math.abs(value - barLength) < 50) continue;
    
    if (rodCountColumnX !== null) {
      const distToRodCol = Math.abs(numItem.x - rodCountColumnX);
      
      if (distToRodCol < 40 && value >= 1 && value <= 999 && !numItem.isDecimal) {
        rodCount = Math.round(value);
        continue;
      }
    }
    
    if (numItem.isDecimal) {
      if (usedMm === null && value > 1000) {
        usedMm = value;
      } else if (remainderMm === null && value < 1000) {
        remainderMm = value;
      }
      continue;
    }
    
    if (isSegmentLength(value, barLength)) {
      segments.push(Math.round(value));
      segmentInfos.push({
        value: Math.round(value),
        x: numItem.x,
        width: numItem.width,
        rangeStartX: 0,
        rangeEndX: 0,
      });
    } else if (value >= 1 && value <= 50 && rodCount === null) {
      rodCount = Math.round(value);
    }
  }
  
  // Calculate segment X-ranges for boundary detection
  if (segmentInfos.length > 0) {
    for (let i = 0; i < segmentInfos.length; i++) {
      const current = segmentInfos[i];
      const prev = segmentInfos[i - 1];
      const next = segmentInfos[i + 1];
      
      if (prev) {
        current.rangeStartX = (prev.x + prev.width + current.x) / 2;
      } else {
        current.rangeStartX = current.x - 50;
      }
      
      if (next) {
        current.rangeEndX = (current.x + current.width + next.x) / 2;
      } else {
        current.rangeEndX = current.x + current.width + 50;
      }
    }
  }
  
  // Build initial boundaries (cut_type will be determined by angle detection)
  const boundaries: Boundary[] = [];
  for (let i = 0; i < segmentInfos.length - 1; i++) {
    boundaries.push({
      between: [i, i + 1],
      cut_type: "unknown", // Default to unknown, will be updated by angle detection
      part_ids: [],
    });
  }
  
  // Build enhanced segments with unknown cuts by default
  const enhancedSegments: EnhancedSegment[] = segmentInfos.map(() => ({
    length_mm: 0,
    cut_left: { type: "unknown" as CutType },
    cut_right: { type: "unknown" as CutType },
  }));
  
  // Set segment lengths
  for (let i = 0; i < segmentInfos.length; i++) {
    enhancedSegments[i].length_mm = segmentInfos[i].value;
  }
  
  if (segments.length === 0 || rodCount === null) {
    return null;
  }
  
  // Calculate row bounding box for angle detection
  const rowMinX = Math.min(...segmentInfos.map(s => s.rangeStartX));
  const rowMaxX = Math.max(...segmentInfos.map(s => s.rangeEndX));
  
  return {
    pattern_index: 0,
    rod_count: rodCount,
    segments_mm: segments,
    segments: enhancedSegments,
    boundaries,
    used_mm: usedMm,
    remainder_mm: remainderMm,
    raw_text: sorted.map(i => i.str).join(" "),
    parse_warnings: [],
    segment_infos: segmentInfos,
    row_y: rowY,
    row_bbox: {
      x0: rowMinX,
      y0: rowY - 30,
      x1: rowMaxX,
      y1: rowY + 30,
    },
  };
}

function findRodCountColumnX(items: TextItem[]): number | null {
  for (const item of items) {
    const str = item.str.toLowerCase();
    for (const header of ROD_COUNT_HEADERS) {
      if (str.includes(header.toLowerCase()) || item.str.includes(header)) {
        return item.x + (item.width || 0) / 2;
      }
    }
  }
  return null;
}

function extractTotalRods(items: TextItem[]): number | null {
  for (const item of items) {
    if (TOTAL_RODS_PATTERN.test(item.str)) {
      const nearbyItems = items.filter(i => 
        Math.abs(i.y - item.y) < 15 && 
        i.x !== item.x
      );
      
      for (const nearby of nearbyItems) {
        const match = nearby.str.match(/^(\d+)$/);
        if (match) {
          return parseInt(match[1], 10);
        }
      }
    }
  }
  return null;
}

function extractBarLength(items: TextItem[]): number | null {
  for (const item of items) {
    const match = item.str.match(/6000/);
    if (match) {
      const nearbyItems = items.filter(i => 
        Math.abs(i.y - item.y) < 30 &&
        Math.abs(i.x - item.x) < 200
      );
      
      for (const nearby of nearbyItems) {
        if (BAR_LENGTH_PATTERNS.some(p => p.test(nearby.str))) {
          return 6000;
        }
      }
      
      if (item.str.includes("מ''מ") || item.str.includes("מ\"מ")) {
        return 6000;
      }
    }
  }
  
  for (const item of items) {
    if (item.str === "6000") {
      return 6000;
    }
  }
  
  return null;
}

function groupItemsIntoRows(items: TextItem[], tolerance: number = 8): { items: TextItem[]; y: number }[] {
  if (items.length === 0) return [];
  
  const sorted = [...items].sort((a, b) => b.y - a.y);
  const rows: { items: TextItem[]; y: number }[] = [];
  let currentRow: TextItem[] = [sorted[0]];
  let currentY = sorted[0].y;
  
  for (let i = 1; i < sorted.length; i++) {
    const item = sorted[i];
    if (Math.abs(item.y - currentY) <= tolerance) {
      currentRow.push(item);
    } else {
      rows.push({ items: currentRow, y: currentY });
      currentRow = [item];
      currentY = item.y;
    }
  }
  
  if (currentRow.length > 0) {
    rows.push({ items: currentRow, y: currentY });
  }
  
  return rows;
}

// Line segment extracted from PDF operators
interface LineSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

interface LineExtractionResult {
  segments: LineSegment[];
  directLineOps: number;
  constructPathOps: number;
  imageObjectsCount: number;
  fallbackReason: string | null;
}

// Extract line segments from PDF operator list
async function extractPageLineSegments(page: any, debug: boolean): Promise<LineExtractionResult> {
  const result: LineExtractionResult = {
    segments: [],
    directLineOps: 0,
    constructPathOps: 0,
    imageObjectsCount: 0,
    fallbackReason: null,
  };
  
  try {
    const operatorList = await page.getOperatorList();
    const pdfjs = await getPdfjs();
    const OPS = pdfjs.OPS;
    
    // Guardrail: large operator lists can exceed compute limits - reduced to prevent CPU timeout
    const maxOps = 50_000;
    if (operatorList.fnArray.length > maxOps) {
      result.fallbackReason = `operator_list_too_large_${operatorList.fnArray.length}`;
      if (debug) {
        console.log(`[diag] Skipping operator parsing: fnArray too large (${operatorList.fnArray.length})`);
      }
      return result;
    }
    
    let currentX = 0;
    let currentY = 0;
    let pathStartX = 0;
    let pathStartY = 0;
    const maxSegments = 12_000;
    
    // Transform stack for coordinate transforms
    const transformStack: number[][] = [[1, 0, 0, 1, 0, 0]];
    
    const applyTransform = (x: number, y: number): [number, number] => {
      const m = transformStack[transformStack.length - 1];
      return [
        m[0] * x + m[2] * y + m[4],
        m[1] * x + m[3] * y + m[5]
      ];
    };
    
    for (let i = 0; i < operatorList.fnArray.length; i++) {
      const op = operatorList.fnArray[i];
      const args = operatorList.argsArray[i];
      
      // Track image objects
      if (op === OPS.paintImageXObject || op === OPS.paintImageXObjectRepeat) {
        result.imageObjectsCount++;
      }
      
      // Handle save/restore for transform stack
      if (op === OPS.save) {
        transformStack.push([...transformStack[transformStack.length - 1]]);
        continue;
      }
      if (op === OPS.restore && transformStack.length > 1) {
        transformStack.pop();
        continue;
      }
      
      // Handle transform matrix
      if (op === OPS.transform && args && args.length >= 6) {
        const current = transformStack[transformStack.length - 1];
        const [a, b, c, d, e, f] = args;
        const newMatrix = [
          current[0] * a + current[2] * b,
          current[1] * a + current[3] * b,
          current[0] * c + current[2] * d,
          current[1] * c + current[3] * d,
          current[0] * e + current[2] * f + current[4],
          current[1] * e + current[3] * f + current[5],
        ];
        transformStack[transformStack.length - 1] = newMatrix;
        continue;
      }
      
      // Direct moveTo
      if (op === OPS.moveTo && args && args.length >= 2) {
        const [x, y] = applyTransform(args[0], args[1]);
        currentX = x;
        currentY = y;
        pathStartX = x;
        pathStartY = y;
        result.directLineOps++;
        continue;
      }
      
      // Direct lineTo
      if (op === OPS.lineTo && args && args.length >= 2) {
        const [x2, y2] = applyTransform(args[0], args[1]);
        result.directLineOps++;
        
        if (result.segments.length < maxSegments) {
          result.segments.push({ x1: currentX, y1: currentY, x2, y2 });
        }
        
        currentX = x2;
        currentY = y2;
        continue;
      }
      
      // Handle closePath
      if (op === OPS.closePath) {
        if (result.segments.length < maxSegments) {
          result.segments.push({ x1: currentX, y1: currentY, x2: pathStartX, y2: pathStartY });
        }
        currentX = pathStartX;
        currentY = pathStartY;
        continue;
      }
      
      // Handle bezier curves (approximate as line from start to end)
      if ((op === OPS.curveTo || op === OPS.curveTo2 || op === OPS.curveTo3) && args) {
        const x2 = args[args.length - 2];
        const y2 = args[args.length - 1];
        const [tx2, ty2] = applyTransform(x2, y2);
        
        if (result.segments.length < maxSegments) {
          result.segments.push({ x1: currentX, y1: currentY, x2: tx2, y2: ty2 });
        }
        
        currentX = tx2;
        currentY = ty2;
        continue;
      }
      
      // Handle constructPath operator - embeds path commands as sub-ops
      if (op === OPS.constructPath && args && args.length >= 2) {
        const subOps = args[0];
        const subArgs = args[1];
        
        if (Array.isArray(subOps) && Array.isArray(subArgs)) {
          result.constructPathOps++;
          
          let argIdx = 0;
          for (const subOp of subOps) {
            const isMoveTo = subOp === OPS.moveTo || subOp === 13;
            const isLineTo = subOp === OPS.lineTo || subOp === 14;
            const isCurveTo = subOp === OPS.curveTo || subOp === 15 || subOp === 16 || subOp === 17;
            const isClosePath = subOp === OPS.closePath || subOp === 18;
            const isRectangle = subOp === OPS.rectangle || subOp === 19;
            
            if (isMoveTo && argIdx + 1 < subArgs.length) {
              const [x, y] = applyTransform(subArgs[argIdx], subArgs[argIdx + 1]);
              currentX = x;
              currentY = y;
              pathStartX = x;
              pathStartY = y;
              argIdx += 2;
            } else if (isLineTo && argIdx + 1 < subArgs.length) {
              const [x2, y2] = applyTransform(subArgs[argIdx], subArgs[argIdx + 1]);
              
              if (result.segments.length < maxSegments) {
                result.segments.push({ x1: currentX, y1: currentY, x2, y2 });
              }
              
              currentX = x2;
              currentY = y2;
              argIdx += 2;
            } else if (isCurveTo && argIdx + 5 < subArgs.length) {
              const [x2, y2] = applyTransform(subArgs[argIdx + 4], subArgs[argIdx + 5]);
              
              if (result.segments.length < maxSegments) {
                result.segments.push({ x1: currentX, y1: currentY, x2, y2 });
              }
              
              currentX = x2;
              currentY = y2;
              argIdx += 6;
            } else if (isRectangle && argIdx + 3 < subArgs.length) {
              const rx = subArgs[argIdx];
              const ry = subArgs[argIdx + 1];
              const rw = subArgs[argIdx + 2];
              const rh = subArgs[argIdx + 3];
              
              const [x1, y1] = applyTransform(rx, ry);
              const [x2, y2] = applyTransform(rx + rw, ry);
              const [x3, y3] = applyTransform(rx + rw, ry + rh);
              const [x4, y4] = applyTransform(rx, ry + rh);
              
              if (result.segments.length < maxSegments - 4) {
                result.segments.push({ x1, y1, x2, y2 });
                result.segments.push({ x1: x2, y1: y2, x2: x3, y2: y3 });
                result.segments.push({ x1: x3, y1: y3, x2: x4, y2: y4 });
                result.segments.push({ x1: x4, y1: y4, x2: x1, y2: y1 });
              }
              
              currentX = x1;
              currentY = y1;
              pathStartX = x1;
              pathStartY = y1;
              argIdx += 4;
            } else if (isClosePath) {
              if (result.segments.length < maxSegments) {
                result.segments.push({ x1: currentX, y1: currentY, x2: pathStartX, y2: pathStartY });
              }
              currentX = pathStartX;
              currentY = pathStartY;
            } else {
              argIdx += 2;
            }
          }
        }
      }
      
      if (result.segments.length >= maxSegments) {
        if (debug) {
          console.log(`[diag] Hit max segments limit (${maxSegments})`);
        }
        break;
      }
    }
    
    if (debug) {
      console.log(`[diag] Extracted ${result.segments.length} line segments (direct: ${result.directLineOps}, constructPath: ${result.constructPathOps}, images: ${result.imageObjectsCount})`);
    }
    
    // If many image objects but few lines, diagram might be rasterized
    if (result.imageObjectsCount > 3 && result.segments.length < 50) {
      result.fallbackReason = "diagram_rendered_as_image";
    }
    
    return result;
  } catch (error) {
    if (debug) {
      console.log(`[diag] Operator extraction failed: ${error}`);
    }
    result.fallbackReason = `operator_extraction_error: ${error}`;
    return result;
  }
}

// Map part IDs to boundaries using adaptive threshold
function mapPartIdsToBoundaries(
  partIdItems: TextItem[],
  segmentInfos: SegmentInfo[],
  rowY: number,
  debug: boolean
): { boundary_index: number; part_ids: string[] }[] {
  const result: { boundary_index: number; part_ids: string[] }[] = [];
  
  if (segmentInfos.length < 2) return result;
  
  // Part IDs appear BELOW the rod diagram
  const bandHeight = 25;
  const partIdsInBand = partIdItems.filter(item => {
    const itemY = item.y;
    // Y coordinates in PDF are inverted, so "below" means lower Y value
    return itemY < rowY && itemY > rowY - bandHeight - 10;
  });
  
  if (debug && partIdsInBand.length > 0) {
    console.log(`[diag] Part IDs in band: ${partIdsInBand.map(p => `${p.str}@${p.x.toFixed(0)}`).join(", ")}`);
  }
  
  // Calculate boundary X positions and adaptive thresholds
  const boundaryData: { index: number; x: number; threshold: number }[] = [];
  
  for (let i = 0; i < segmentInfos.length - 1; i++) {
    const current = segmentInfos[i];
    const next = segmentInfos[i + 1];
    const boundaryX = (current.x + current.width + next.x) / 2;
    
    // Adaptive threshold: based on local segment widths
    const avgLocalWidth = ((current.rangeEndX - current.rangeStartX) + (next.rangeEndX - next.rangeStartX)) / 2;
    const threshold = Math.min(40, avgLocalWidth * 0.4);
    
    boundaryData.push({ index: i, x: boundaryX, threshold });
    result.push({ boundary_index: i, part_ids: [] });
  }
  
  // Assign each part ID to nearest boundary within threshold
  for (const partIdItem of partIdsInBand) {
    const partIdCenterX = partIdItem.x + (partIdItem.width || 0) / 2;
    
    let bestBoundary: { index: number; distance: number } | null = null;
    
    for (const bd of boundaryData) {
      const distance = Math.abs(partIdCenterX - bd.x);
      if (distance <= bd.threshold) {
        if (!bestBoundary || distance < bestBoundary.distance) {
          bestBoundary = { index: bd.index, distance };
        }
      }
    }
    
    if (bestBoundary !== null) {
      const entry = result.find(r => r.boundary_index === bestBoundary!.index);
      if (entry && !entry.part_ids.includes(partIdItem.str)) {
        entry.part_ids.push(partIdItem.str);
      }
    }
  }
  
  // Sort part IDs left-to-right within each boundary
  for (const entry of result) {
    if (entry.part_ids.length > 1) {
      const sortedItems = partIdsInBand
        .filter(p => entry.part_ids.includes(p.str))
        .sort((a, b) => a.x - b.x);
      entry.part_ids = [...new Set(sortedItems.map(p => p.str))];
    }
  }
  
  return result;
}

// Map part IDs to segments (centered under each segment box)
// This is the main way part IDs appear in optimization PDFs - under each cut box
function mapPartIdsToSegments(
  partIdItems: TextItem[],
  segmentInfos: SegmentInfo[],
  rowY: number,
  debug: boolean
): { segment_index: number; part_ids: string[] }[] {
  const result: { segment_index: number; part_ids: string[] }[] = [];
  
  if (segmentInfos.length === 0) return result;
  
  // Part IDs appear BELOW the rod diagram in multiple rows
  const bandHeight = 40; // Expanded to catch multiple lines of part IDs
  const partIdsInBand = partIdItems.filter(item => {
    const itemY = item.y;
    // Y coordinates in PDF are inverted, so "below" means lower Y value
    return itemY < rowY && itemY > rowY - bandHeight - 10;
  });
  
  if (debug && partIdsInBand.length > 0) {
    console.log(`[diag] Part IDs for segments: ${partIdsInBand.map(p => `${p.str}@${p.x.toFixed(0)}`).join(", ")}`);
  }
  
  // Initialize result for each segment
  for (let i = 0; i < segmentInfos.length; i++) {
    result.push({ segment_index: i, part_ids: [] });
  }
  
  // Assign each part ID to the segment whose X range contains it
  for (const partIdItem of partIdsInBand) {
    const partIdCenterX = partIdItem.x + (partIdItem.width || 0) / 2;
    
    // Find which segment this part ID belongs to based on X position
    for (let i = 0; i < segmentInfos.length; i++) {
      const seg = segmentInfos[i];
      // Use a generous range: the segment's text X position ± half the segment width
      const segCenterX = seg.x + seg.width / 2;
      const segHalfWidth = Math.max(30, (seg.rangeEndX - seg.rangeStartX) / 2);
      
      if (partIdCenterX >= segCenterX - segHalfWidth && partIdCenterX <= segCenterX + segHalfWidth) {
        const entry = result.find(r => r.segment_index === i);
        if (entry && !entry.part_ids.includes(partIdItem.str)) {
          entry.part_ids.push(partIdItem.str);
        }
        break;
      }
    }
  }
  
  // Sort part IDs by Y position (top to bottom, higher Y first in PDF coords)
  for (const entry of result) {
    if (entry.part_ids.length > 1) {
      const sortedItems = partIdsInBand
        .filter(p => entry.part_ids.includes(p.str))
        .sort((a, b) => b.y - a.y);  // Higher Y first (top to bottom in display)
      entry.part_ids = sortedItems.map(p => p.str);
    }
  }
  
  return result;
}

// Simplified slant detection: just check if boundary line is vertical or diagonal
// Slanted = |y2 - y1| > threshold AND short line (boundary marker)
// Straight = |y2 - y1| <= threshold (vertical line)
function detectAngledSeparators(
  lineResult: LineExtractionResult,
  segmentInfos: SegmentInfo[],
  rowY: number,
  rowBbox: { x0: number; y0: number; x1: number; y1: number },
  rowIndex: number,
  debug: boolean
): { boundaries: { index: number; cut_type: CutType; angle_deg?: number; slope?: "in" | "out"; reason: string }[]; diagnostics: RowDiagnostics } {
  const boundaries: { index: number; cut_type: CutType; angle_deg?: number; slope?: "in" | "out"; reason: string }[] = [];
  
  const diagnostics: RowDiagnostics = {
    row_index: rowIndex,
    row_bbox: rowBbox,
    raw_lines_count: 0,
    diagonal_candidates_count: 0,
    boundary_decisions: [],
    fallback_reason: lineResult.fallbackReason,
    part_ids_mapped: [],
  };
  
  // If diagram is image-based or extraction failed, mark ALL as unknown (never straight)
  if (lineResult.fallbackReason) {
    for (let i = 0; i < segmentInfos.length - 1; i++) {
      const reason = `unknown: ${lineResult.fallbackReason}`;
      boundaries.push({ index: i, cut_type: "unknown", reason });
      diagnostics.boundary_decisions.push({
        between: [i, i + 1],
        decision: "unknown",
        reason,
      });
    }
    return { boundaries, diagnostics };
  }
  
  // Expand Y range significantly - graphics may be at different Y than text
  // Use X-coordinate matching primarily since that's more reliable
  const expandedBbox = {
    x0: rowBbox.x0 - 10,
    y0: 0,     // Search entire page height
    x1: rowBbox.x1 + 10,
    y1: 900,   // PDF pages typically up to 800-850pt
  };
  
  // First pass: find lines that overlap the X range
  const xMatchingLines = lineResult.segments.filter(line => {
    const lineMinX = Math.min(line.x1, line.x2);
    const lineMaxX = Math.max(line.x1, line.x2);
    
    // Line must be within or overlapping the row's X range
    const xOverlap = lineMaxX >= expandedBbox.x0 && lineMinX <= expandedBbox.x1;
    return xOverlap;
  });
  
  // Second pass: cluster lines by Y to find the rod diagram band
  // Group lines by their Y center into bands
  const yBands = new Map<number, typeof xMatchingLines>();
  for (const line of xMatchingLines) {
    const yCenterBin = Math.round((line.y1 + line.y2) / 2 / 20) * 20; // 20pt bins
    if (!yBands.has(yCenterBin)) yBands.set(yCenterBin, []);
    yBands.get(yCenterBin)!.push(line);
  }
  
  // Find the band with the most lines - that's likely the diagram area
  let bestBand: typeof xMatchingLines = [];
  let bestBandY = 0;
  for (const [y, lines] of yBands) {
    if (lines.length > bestBand.length) {
      bestBand = lines;
      bestBandY = y;
    }
  }
  
  // Expand the best band to include nearby Y bands
  const rowLines: typeof xMatchingLines = [];
  for (const [y, lines] of yBands) {
    if (Math.abs(y - bestBandY) <= 40) {  // Within 40pt of best band
      rowLines.push(...lines);
    }
  }
  
  diagnostics.raw_lines_count = rowLines.length;
  
  // SIMPLIFIED: A line is "slanted" if it has significant Y change
  // Threshold: if dy > 3px AND the line is short (boundary marker, not long rod edge)
  const SLANT_DY_THRESHOLD = 3;  // Minimum Y delta to count as slanted
  const MAX_LINE_LENGTH = 60;    // Boundary markers are short, not full rod edges
  
  const slantCandidates = rowLines.filter(line => {
    const dx = Math.abs(line.x2 - line.x1);
    const dy = Math.abs(line.y2 - line.y1);
    const length = Math.sqrt(dx * dx + dy * dy);
    
    // Slant candidate: has Y movement AND is a short-ish line (boundary marker)
    return dy > SLANT_DY_THRESHOLD && length < MAX_LINE_LENGTH && length > 3;
  });
  
  diagnostics.diagonal_candidates_count = slantCandidates.length;
  
  if (debug) {
    console.log(`[slant] Row ${rowIndex}: ${rowLines.length} lines in bbox, ${slantCandidates.length} slant candidates`);
    if (slantCandidates.length > 0) {
      console.log(`[slant] Candidates: ${slantCandidates.slice(0, 5).map(l => 
        `(${l.x1.toFixed(0)},${l.y1.toFixed(0)})->(${l.x2.toFixed(0)},${l.y2.toFixed(0)}) dy=${Math.abs(l.y2-l.y1).toFixed(1)}`
      ).join("; ")}`);
    }
  }
  
  // Determine if we have enough data to make decisions
  const hasEnoughVectorData = rowLines.length >= 2;
  
  // For each boundary between segments, check for slanted lines nearby
  for (let i = 0; i < segmentInfos.length - 1; i++) {
    const current = segmentInfos[i];
    const next = segmentInfos[i + 1];
    const boundaryX = (current.x + current.width + next.x) / 2;
    
    // Search window around the boundary - adaptive based on segment width
    const avgSegWidth = ((current.rangeEndX - current.rangeStartX) + (next.rangeEndX - next.rangeStartX)) / 2;
    const windowX = Math.max(15, Math.min(40, avgSegWidth * 0.3));
    
    let foundSlant = false;
    let slope: "in" | "out" | undefined;
    let reason = "";
    
    for (const line of slantCandidates) {
      const lineCenterX = (line.x1 + line.x2) / 2;
      const lineMinX = Math.min(line.x1, line.x2);
      const lineMaxX = Math.max(line.x1, line.x2);
      
      // Check if this slanted line is at/near this boundary
      const distToBoundary = Math.abs(lineCenterX - boundaryX);
      const crossesBoundary = lineMinX <= boundaryX && lineMaxX >= boundaryX;
      
      if (distToBoundary < windowX || crossesBoundary) {
        foundSlant = true;
        
        // Determine slope direction based on which way the slant goes
        const dx = line.x2 - line.x1;
        const dy = line.y2 - line.y1;
        // If dx and dy have same sign = slanting one way, opposite = other way
        slope = (dx * dy > 0) ? "out" : "in";
        
        reason = `slanted: dy=${Math.abs(dy).toFixed(1)} at x=${lineCenterX.toFixed(0)}`;
        break;
      }
    }
    
    if (!foundSlant) {
      if (hasEnoughVectorData) {
        // We have vector data and found no slants at this boundary - it's straight
        reason = "straight: no slanted lines at boundary";
        boundaries.push({ index: i, cut_type: "straight", reason });
      } else {
        // Not enough data to determine
        reason = "unknown: insufficient vector data";
        boundaries.push({ index: i, cut_type: "unknown", reason });
      }
    } else {
      boundaries.push({ 
        index: i, 
        cut_type: "angled", 
        slope, 
        reason 
      });
    }
    
    diagnostics.boundary_decisions.push({
      between: [i, i + 1],
      decision: boundaries[boundaries.length - 1].cut_type,
      reason,
    });
  }
  
  if (debug && boundaries.some(b => b.cut_type === "angled")) {
    console.log(`[slant] Detected slants at indices: ${boundaries.filter(b => b.cut_type === "angled").map(b => b.index).join(", ")}`);
  }
  
  return { boundaries, diagnostics };
}

async function parsePage(
  page: any,
  pageNum: number,
  barLengthDefault: number | null,
  debug: boolean,
  cachedItems?: TextItem[],
  lineResultOverride?: LineExtractionResult | null
): Promise<{ profiles: ParsedProfile[]; diagnostics: PageDiagnostics; items: TextItem[] }> {
  const items = cachedItems ?? extractTextItems(await page.getTextContent());
  
  const diagnostics: PageDiagnostics = {
    page: pageNum,
    found_profiles: 0,
    found_patterns: 0,
    warnings: [],
    part_ids_total: 0,
    angle_boundaries_found: 0,
    unknown_boundaries_found: 0,
    operator_parsing_used: false,
    image_diagram_detected: false,
    construct_path_ops: 0,
    direct_line_ops: 0,
    row_diagnostics: [],
  };
  
  if (debug) {
    diagnostics.anchors_sample = items.slice(0, 20).map(i => `${i.str}@(${Math.round(i.x)},${Math.round(i.y)})`);
  }
  
  const barLength = extractBarLength(items) || barLengthDefault;
  const rodCountColumnX = findRodCountColumnX(items);
  
  const lineResult = lineResultOverride ?? null;
  if (lineResult) {
    diagnostics.operator_parsing_used = true;
    diagnostics.construct_path_ops = lineResult.constructPathOps;
    diagnostics.direct_line_ops = lineResult.directLineOps;
    if (lineResult.fallbackReason === "diagram_rendered_as_image") {
      diagnostics.image_diagram_detected = true;
    }
  }
  
  if (debug) {
    console.log(`[diag] Page ${pageNum}: barLength=${barLength}, rodCountColumnX=${rodCountColumnX}, items=${items.length}`);
  }
  
  const blocks = findProfileBlocks(items, debug);
  
  const pagePartIds = items.filter(i => isPartId(i.str));
  diagnostics.part_ids_total = pagePartIds.length;
  
  const profiles: ParsedProfile[] = [];
  
  for (const block of blocks) {
    const profile: ParsedProfile = {
      profile_code: block.code,
      total_rods: extractTotalRods(block.items),
      patterns: [],
    };
    
    const rows = groupItemsIntoRows(block.items);
    
    let patternIndex = 0;
    let rowIndex = 0;
    
    for (const row of rows) {
      const hasHeaderText = row.items.some(i => 
        ROD_COUNT_HEADERS.some(h => i.str.includes(h)) ||
        i.str.includes("פרופיל") ||
        i.str.includes("צבע")
      );
      
      if (hasHeaderText) continue;
      
      const pattern = parsePatternRow(row.items, barLength, rodCountColumnX, block.items, row.y, debug);
      
      if (pattern) {
        pattern.pattern_index = patternIndex++;
        
        // Map part IDs to segments (under each segment box)
        if (pattern.segment_infos && pattern.segment_infos.length > 0) {
          const segmentPartIdMappings = mapPartIdsToSegments(
            pagePartIds,
            pattern.segment_infos,
            row.y,
            debug
          );
          
          for (const mapping of segmentPartIdMappings) {
            if (pattern.segments[mapping.segment_index]) {
              pattern.segments[mapping.segment_index].part_ids = mapping.part_ids;
            }
          }
          
          // Also map to boundaries (legacy support)
          if (pattern.segment_infos.length > 1) {
            const partIdMappings = mapPartIdsToBoundaries(
              pagePartIds,
              pattern.segment_infos,
              row.y,
              debug
            );
            
            for (const mapping of partIdMappings) {
              if (pattern.boundaries[mapping.boundary_index]) {
                pattern.boundaries[mapping.boundary_index].part_ids = mapping.part_ids;
              }
            }
            
            if (debug && (partIdMappings.some(m => m.part_ids.length > 0) || segmentPartIdMappings.some(m => m.part_ids.length > 0))) {
              diagnostics.row_diagnostics?.push({
                row_index: rowIndex,
                row_bbox: pattern.row_bbox!,
                raw_lines_count: 0,
                diagonal_candidates_count: 0,
                boundary_decisions: [],
                fallback_reason: null,
                part_ids_mapped: partIdMappings,
              });
            }
          }
        }
        
        // Detect angled separators using line extraction
        if (lineResult && pattern.segments.length > 1 && pattern.row_bbox && pattern.segment_infos) {
          const { boundaries: boundaryResults, diagnostics: rowDiag } = detectAngledSeparators(
            lineResult,
            pattern.segment_infos,
            row.y,
            pattern.row_bbox,
            rowIndex,
            debug
          );
          
          // Find or create row diagnostics entry
          let existingRowDiag = diagnostics.row_diagnostics?.find(rd => rd.row_index === rowIndex);
          if (!existingRowDiag) {
            diagnostics.row_diagnostics?.push(rowDiag);
            existingRowDiag = rowDiag;
          } else {
            existingRowDiag.raw_lines_count = rowDiag.raw_lines_count;
            existingRowDiag.diagonal_candidates_count = rowDiag.diagonal_candidates_count;
            existingRowDiag.boundary_decisions = rowDiag.boundary_decisions;
            existingRowDiag.fallback_reason = rowDiag.fallback_reason;
          }
          
          // Apply boundary results to pattern
          for (const br of boundaryResults) {
            if (pattern.boundaries[br.index]) {
              pattern.boundaries[br.index].cut_type = br.cut_type;
              pattern.boundaries[br.index].angle_deg = br.angle_deg;
              pattern.boundaries[br.index].slope = br.slope;
            }
            
            // Update segment cut indicators
            if (pattern.segments[br.index]) {
              pattern.segments[br.index].cut_right = {
                type: br.cut_type,
                angle_deg: br.angle_deg,
                slope: br.slope,
              };
            }
            if (pattern.segments[br.index + 1]) {
              pattern.segments[br.index + 1].cut_left = {
                type: br.cut_type,
                angle_deg: br.angle_deg,
                slope: br.slope,
              };
            }
            
            if (br.cut_type === "angled") {
              diagnostics.angle_boundaries_found = (diagnostics.angle_boundaries_found || 0) + 1;
            } else if (br.cut_type === "unknown") {
              diagnostics.unknown_boundaries_found = (diagnostics.unknown_boundaries_found || 0) + 1;
            }
          }
        }
        
        profile.patterns.push(pattern);
        
        if (barLength) {
          const sum = pattern.segments_mm.reduce((a, b) => a + b, 0);
          if (sum > barLength + 100) {
            diagnostics.warnings.push(
              `Pattern ${pattern.pattern_index} in profile ${block.code}: segment sum ${sum} exceeds bar length ${barLength}`
            );
          }
        }
      }
      
      rowIndex++;
    }
    
    if (profile.total_rods !== null) {
      const computedTotal = profile.patterns.reduce((sum, p) => sum + p.rod_count, 0);
      if (computedTotal !== profile.total_rods) {
        diagnostics.warnings.push(
          `Profile ${block.code}: computed rod total ${computedTotal} != declared ${profile.total_rods}`
        );
      }
    }
    
    if (profile.patterns.length > 0) {
      profiles.push(profile);
      diagnostics.found_patterns += profile.patterns.length;
    }
  }
  
  diagnostics.found_profiles = profiles.length;
  
  return { profiles, diagnostics, items };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  
  try {
    const body = await req.json();
    const { 
      file_path, 
      file_name, 
      project_id, 
      debug = false,
      debug_page = null, // Specific page to debug
      mode = "chunk",
      startPage = 1,
      endPage = null,
      job_id = null,
    } = body;
    
    if (!file_path) {
      return new Response(
        JSON.stringify({ error: "file_path is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // Download PDF from storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from("optimization-pdfs")
      .download(file_path);
    
    if (downloadError || !fileData) {
      console.error("Download error:", downloadError);
      return new Response(
        JSON.stringify({ error: "Failed to download PDF", details: downloadError?.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    const arrayBuffer = await fileData.arrayBuffer();
    const pdfjs = await getPdfjs();
    const pdfDoc = await pdfjs.getDocument({
      data: new Uint8Array(arrayBuffer),
      disableWorker: true,
    }).promise;
    
    const pageCount = pdfDoc.numPages;
    console.log(`[parse-optimization] Loaded PDF with ${pageCount} pages, mode=${mode}, debug=${debug}`);
    
    // Info mode: return page count and bar length
    if (mode === "info") {
      const firstPage = await pdfDoc.getPage(1);
      const textContent = await firstPage.getTextContent();
      const items = extractTextItems(textContent);
      const barLength = extractBarLength(items);
      
      return new Response(JSON.stringify({ 
        success: true, 
        data: { 
          pageCount,
          barLength,
        } 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
    // Angles mode: detect angled separators on specific pages
    if (mode === "angles") {
      if (!job_id) {
        return new Response(
          JSON.stringify({ error: "job_id is required for angles mode" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      const actualStartPage = debug_page ? debug_page : Math.max(1, startPage);
      const actualEndPage = debug_page ? debug_page : (endPage ? Math.min(endPage, pageCount) : actualStartPage);
      
      console.log(`[parse-optimization] Angles mode: pages ${actualStartPage}-${actualEndPage}`);
      
      const { data: existingPatterns, error: fetchError } = await supabase
        .from("optimization_patterns")
        .select("id, profile_code, pattern_index, segments_mm, segments_json, raw_text")
        .eq("job_id", job_id);
      
      if (fetchError) {
        console.error("Fetch patterns error:", fetchError);
        return new Response(
          JSON.stringify({ error: "Failed to fetch patterns", details: fetchError.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      let anglesDetected = 0;
      let unknownDetected = 0;
      let patternsProcessed = 0;
      const updatedPatternIds: string[] = [];
      const allPageDiagnostics: PageDiagnostics[] = [];
      
      for (let pageNum = actualStartPage; pageNum <= actualEndPage; pageNum++) {
        const page = await pdfDoc.getPage(pageNum);
        
        const lineResult = await extractPageLineSegments(page, debug);
        
        console.log(`[angles] Page ${pageNum}: extracted ${lineResult.segments.length} lines (direct: ${lineResult.directLineOps}, constructPath: ${lineResult.constructPathOps}, images: ${lineResult.imageObjectsCount})`);
        
        const { profiles, diagnostics } = await parsePage(page, pageNum, null, debug, undefined, lineResult);
        
        console.log(`[angles] Page ${pageNum}: parsed ${profiles.length} profiles, ${diagnostics.found_patterns} patterns, angled=${diagnostics.angle_boundaries_found}, unknown=${diagnostics.unknown_boundaries_found}`);
        
        if (debug) {
          allPageDiagnostics.push(diagnostics);
        }
        
        // Match parsed patterns with existing DB patterns and update
        for (const profile of profiles) {
          for (const pattern of profile.patterns) {
            const dbPattern = existingPatterns?.find(p => 
              p.profile_code === profile.profile_code &&
              JSON.stringify(p.segments_mm) === JSON.stringify(pattern.segments_mm)
            );
            
            if (!dbPattern) {
              if (debug) {
                console.log(`[angles] No DB match for profile=${profile.profile_code} segments=${JSON.stringify(pattern.segments_mm)}`);
              }
              continue;
            }
            
            // Always update to store the full data with boundaries
            const updatedData = {
              segments: pattern.segments,
              boundaries: pattern.boundaries,
            };
            
            const { error: updateError } = await supabase
              .from("optimization_patterns")
              .update({ segments_json: updatedData })
              .eq("id", dbPattern.id);
            
            if (!updateError) {
              const hasAngles = pattern.boundaries.some(b => b.cut_type === "angled");
              const hasUnknown = pattern.boundaries.some(b => b.cut_type === "unknown");
              
              if (hasAngles) anglesDetected++;
              if (hasUnknown) unknownDetected++;
              
              updatedPatternIds.push(dbPattern.id);
              console.log(`[angles] Updated pattern ${dbPattern.id}`);
            } else {
              console.error(`[angles] Failed to update pattern ${dbPattern.id}:`, updateError);
            }
            
            patternsProcessed++;
          }
        }
      }
      
      const response: any = {
        success: true,
        mode: "angles",
        processedPages: { start: actualStartPage, end: actualEndPage },
        patterns_processed: patternsProcessed,
        angles_detected: anglesDetected,
        unknown_detected: unknownDetected,
        updated_pattern_ids: updatedPatternIds,
      };
      
      if (debug) {
        response.parse_diagnostics = allPageDiagnostics;
        // Also log diagnostics
        console.log(`[angles-debug] Diagnostics:`, JSON.stringify(allPageDiagnostics, null, 2));
      }
      
      return new Response(JSON.stringify(response), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
    // Vision mode: use AI to extract part IDs with OCR/vision
    // Supports chunking via pattern_offset and pattern_limit params
    if (mode === "vision") {
      if (!job_id) {
        return new Response(
          JSON.stringify({ error: "job_id is required for vision mode" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      const patternOffset = parseInt(body.pattern_offset) || 0;
      const patternLimit = parseInt(body.pattern_limit) || 5; // Process 5 patterns per chunk by default
      
      console.log(`[parse-optimization] Vision mode: extracting part IDs with AI (offset=${patternOffset}, limit=${patternLimit})`);
      
      // Fetch existing patterns
      const { data: existingPatterns, error: fetchError } = await supabase
        .from("optimization_patterns")
        .select("id, profile_code, pattern_index, segments_mm, segments_json")
        .eq("job_id", job_id)
        .order("pattern_index");
      
      if (fetchError) {
        console.error("Fetch patterns error:", fetchError);
        return new Response(
          JSON.stringify({ error: "Failed to fetch patterns", details: fetchError.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      if (!existingPatterns || existingPatterns.length === 0) {
        return new Response(
          JSON.stringify({ error: "No patterns found for job" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      const totalPatternCount = existingPatterns.length;
      const patternsToProcess = existingPatterns.slice(patternOffset, patternOffset + patternLimit);
      
      console.log(`[vision] Processing patterns ${patternOffset + 1}-${patternOffset + patternsToProcess.length} of ${totalPatternCount}`);
      
      let patternsUpdated = 0;
      let totalPartIdsFound = 0;
      const visionResults: any[] = [];
      
      // Process each pattern in the chunk
      for (const dbPattern of patternsToProcess) {
        // Parse segments_json to get segment count
        let segmentsData: any = null;
        if (dbPattern.segments_json) {
          if (typeof dbPattern.segments_json === 'string') {
            try { segmentsData = JSON.parse(dbPattern.segments_json); } catch (e) {}
          } else {
            segmentsData = dbPattern.segments_json;
          }
        }
        
        const segmentCount = dbPattern.segments_mm?.length || segmentsData?.segments?.length || 0;
        if (segmentCount === 0) continue;
        
        // Use page 1 for now since we're processing by pattern not by page
        // In future, could store page info with pattern
        const pageNum = 1;
        
        // Use vision to extract part IDs
        const visionResult = await extractPartIdsWithVision(
          arrayBuffer,
          pageNum,
          segmentCount,
          debug
        );
        
        if (debug) {
          console.log(`[vision] Pattern ${dbPattern.pattern_index} (${dbPattern.profile_code}): ${JSON.stringify(visionResult)}`);
          visionResults.push({
            pattern_id: dbPattern.id,
            profile: dbPattern.profile_code,
            pattern_index: dbPattern.pattern_index,
            result: visionResult,
          });
        }
        
        if (visionResult.success && visionResult.part_ids.length > 0) {
          // Build updated segments with vision-extracted part IDs
          const existingSegments = segmentsData?.segments || dbPattern.segments_mm.map((len: number) => ({
            length_mm: len,
            cut_left: { type: "unknown" },
            cut_right: { type: "unknown" },
          }));
          
          const updatedSegments = existingSegments.map((seg: any, idx: number) => ({
            ...seg,
            part_ids: visionResult.part_ids
              .filter(p => p.segment_index === idx)
              .map(p => p.text),
          }));
          
          const updatedData = {
            segments: updatedSegments,
            boundaries: segmentsData?.boundaries || [],
          };
          
          const { error: updateError } = await supabase
            .from("optimization_patterns")
            .update({ segments_json: updatedData })
            .eq("id", dbPattern.id);
          
          if (!updateError) {
            patternsUpdated++;
            totalPartIdsFound += visionResult.part_ids.length;
          } else {
            console.error(`[vision] Update error for pattern ${dbPattern.id}:`, updateError);
          }
        }
      }
      
      const hasMore = (patternOffset + patternLimit) < totalPatternCount;
      const response: any = {
        success: true,
        mode: "vision",
        chunk: {
          offset: patternOffset,
          limit: patternLimit,
          processed: patternsToProcess.length,
          total: totalPatternCount,
          has_more: hasMore,
          next_offset: hasMore ? patternOffset + patternLimit : null,
        },
        patterns_updated: patternsUpdated,
        total_part_ids_found: totalPartIdsFound,
      };
      
      if (debug) {
        response.vision_results = visionResults;
      }
      
      return new Response(JSON.stringify(response), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
    // Chunk mode: parse specific page range
    const actualStartPage = debug_page ? debug_page : Math.max(1, startPage);
    const actualEndPage = debug_page ? debug_page : (endPage ? Math.min(endPage, pageCount) : pageCount);
    
    console.log(`[parse-optimization] Processing pages ${actualStartPage}-${actualEndPage}, debug=${debug}`);
    
    const allProfiles: ParsedProfile[] = [];
    const allDiagnostics: PageDiagnostics[] = [];
    let globalBarLength: number | null = null;
    
    for (let pageNum = actualStartPage; pageNum <= actualEndPage; pageNum++) {
      const page = await pdfDoc.getPage(pageNum);
      
      // ALWAYS extract line segments for angle detection during chunk mode
      const lineResult = await extractPageLineSegments(page, debug);
      
      if (debug) {
        console.log(`[chunk] Page ${pageNum}: extracted ${lineResult.segments.length} lines (direct: ${lineResult.directLineOps}, constructPath: ${lineResult.constructPathOps}, images: ${lineResult.imageObjectsCount}, fallback: ${lineResult.fallbackReason || 'none'})`);
      }
      
      // Pass lineResult to parsePage for angle detection
      const { profiles, diagnostics, items } = await parsePage(page, pageNum, globalBarLength, debug, undefined, lineResult);
      
      if (debug) {
        console.log(`[chunk] Page ${pageNum}: ${profiles.length} profiles, ${diagnostics.found_patterns} patterns, angled=${diagnostics.angle_boundaries_found}, unknown=${diagnostics.unknown_boundaries_found}`);
      }
      
      if (pageNum === actualStartPage && !globalBarLength) {
        const foundBarLength = extractBarLength(items);
        if (foundBarLength) {
          globalBarLength = foundBarLength;
        }
      }
      
      allProfiles.push(...profiles);
      allDiagnostics.push(diagnostics);
      
      if (debug) {
        console.log(`[diag] Page ${pageNum}: ${profiles.length} profiles, ${diagnostics.found_patterns} patterns`);
      }
    }
    
    // Merge profiles with same code across pages
    const mergedProfiles: Map<string, ParsedProfile> = new Map();
    
    for (const profile of allProfiles) {
      const existing = mergedProfiles.get(profile.profile_code);
      if (existing) {
        const startIndex = existing.patterns.length;
        for (const pattern of profile.patterns) {
          pattern.pattern_index = startIndex + pattern.pattern_index;
          existing.patterns.push(pattern);
        }
        if (profile.total_rods !== null) {
          existing.total_rods = (existing.total_rods || 0) + profile.total_rods;
        }
      } else {
        mergedProfiles.set(profile.profile_code, { ...profile });
      }
    }
    
    const finalProfiles = Array.from(mergedProfiles.values());
    const allWarnings = allDiagnostics.flatMap(d => d.warnings);
    
    // Create job if first chunk
    let currentJobId = job_id;
    
    if (!currentJobId && project_id) {
      const { data: job, error: jobError } = await supabase
        .from("optimization_jobs")
        .insert({
          project_id: parseInt(project_id, 10),
          source_file_path: file_path,
          source_file_name: file_name || file_path.split("/").pop(),
          status: "parsing",
          bar_length_mm: globalBarLength,
          parse_warnings: allWarnings,
        })
        .select()
        .single();
      
      if (jobError) {
        console.error("Job insert error:", jobError);
        return new Response(
          JSON.stringify({ error: "Failed to create job", details: jobError.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      currentJobId = job.id;
      console.log(`[parse-optimization] Created job ${currentJobId}`);
    }
    
    // Insert patterns
    const patternsToInsert = [];
    
    for (const profile of finalProfiles) {
      for (const pattern of profile.patterns) {
        const segmentsData = {
          segments: pattern.segments,
          boundaries: pattern.boundaries,
        };
        
        patternsToInsert.push({
          job_id: currentJobId,
          profile_code: profile.profile_code,
          pattern_index: pattern.pattern_index,
          rod_count: pattern.rod_count,
          segments_mm: pattern.segments_mm,
          segments_json: segmentsData,
          used_mm: pattern.used_mm,
          remainder_mm: pattern.remainder_mm,
          raw_text: pattern.raw_text,
        });
      }
    }
    
    if (patternsToInsert.length > 0 && currentJobId) {
      const { error: patternsError } = await supabase
        .from("optimization_patterns")
        .insert(patternsToInsert);
      
      if (patternsError) {
        console.error("Patterns insert error:", patternsError);
        allWarnings.push(`Failed to insert some patterns: ${patternsError.message}`);
      }
    }
    
    console.log(`[parse-optimization] Chunk complete: ${finalProfiles.length} profiles, ${patternsToInsert.length} patterns`);
    
    // Build response - minimal without debug, detailed with debug
    const response: any = {
      success: true,
      job_id: currentJobId,
      bar_length_mm: globalBarLength,
      pageCount,
      processedPages: { start: actualStartPage, end: actualEndPage },
      profiles_count: finalProfiles.length,
      patterns_count: patternsToInsert.length,
    };
    
    // Only include warnings if there are any
    if (allWarnings.length > 0) {
      response.warnings = allWarnings;
    }
    
    // Debug mode: include full diagnostics and log them
    if (debug) {
      response.profiles = finalProfiles.map(p => ({
        profile_code: p.profile_code,
        total_rods: p.total_rods,
        patterns: p.patterns.map(pat => ({
          pattern_index: pat.pattern_index,
          rod_count: pat.rod_count,
          segments_mm: pat.segments_mm,
          segments: pat.segments,
          boundaries: pat.boundaries,
          used_mm: pat.used_mm,
          remainder_mm: pat.remainder_mm,
          parse_warnings: pat.parse_warnings,
        })),
      }));
      response.parse_diagnostics = {
        pages: allDiagnostics,
        summary: {
          total_part_ids: allDiagnostics.reduce((sum, d) => sum + (d.part_ids_total || 0), 0),
          total_angle_boundaries: allDiagnostics.reduce((sum, d) => sum + (d.angle_boundaries_found || 0), 0),
          total_unknown_boundaries: allDiagnostics.reduce((sum, d) => sum + (d.unknown_boundaries_found || 0), 0),
        },
      };
      
      // Log diagnostics
      console.log(`[chunk-debug] Diagnostics summary:`, JSON.stringify(response.parse_diagnostics.summary));
    }
    
    return new Response(
      JSON.stringify(response),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
    
  } catch (error) {
    console.error("Parse error:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return new Response(
      JSON.stringify({ error: "Parse failed", details: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
