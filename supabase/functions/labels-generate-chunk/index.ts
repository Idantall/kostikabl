import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PDFDocument, rgb, StandardFonts } from "https://esm.sh/pdf-lib@1.17.1";
import fontkit from "https://esm.sh/@pdf-lib/fontkit@1.1.1";
import QRCode from "https://esm.sh/qrcode@1.5.3";
import { hebrewPdf } from "./hebrew-utils.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const FONT_ENV = Deno.env.get("FONT_HEB_TTF_BASE64") || "";
const STORAGE_BUCKET = "assets";
const STORAGE_PATH_REGULAR = "fonts/NotoSansHebrew-Regular.ttf";
const STORAGE_PATH_BOLD = "fonts/NotoSansHebrew-Bold.ttf";

// Units
const mm = (val: number) => val * 2.834645669291339; // 1mm = 2.834645669…pt (precise conversion)
const mm2pt = mm; // alias for backward compatibility

// A4 portrait in mm
const A4_MM = { w: 210, h: 297 };
// A4 in points
const A4_W = mm(210);
const A4_H = mm(297);

// Label presets (physical sizes + grid + spacing)
const LABEL_PRESETS = {
  big: {
    // Loading labels - A4: 100×70mm, 2×4 grid = 8 labels/page
    labelWmm: 100,
    labelHmm: 70,
    cols: 2,
    rows: 4,
    gutterXmm: 0,
    gutterYmm: 0,
    qrSizemm: 24,
    padmm: 3,
    fontPt: { line: 10, item: 12, subpart: 9 },
    marginXmm: 5,
    marginYmm: 8.5,
  },
  small: {
    // Install labels - A4: 50×30mm, 3×9 grid = 27 labels/page
    labelWmm: 50,
    labelHmm: 30,
    cols: 3,
    rows: 9,
    gutterXmm: 5,
    gutterYmm: 2,
    qrSizemm: 22,
    padmm: 3,
    fontPt: { line: 10, item: 11, subpart: 8 },
    marginXmm: 5,
    marginYmm: 5,
  },
  roll: {
    // Roll labels - 100×50mm, 1 page per label
    labelWmm: 100,
    labelHmm: 50,
    cols: 1,
    rows: 1,
    gutterXmm: 0,
    gutterYmm: 0,
    qrSizemm: 38,  // Larger QR for roll labels
    padmm: 2,
    fontPt: { line: 9, item: 10, subpart: 8 },  // Reduced font sizes to fit text
    marginXmm: 2,
    marginYmm: 2,
  },
  install_two_up: {
    // Install two-up roll labels - 2"×4" (50.8×101.6mm), 2 labels per page with 10mm gutter
    labelWmm: 101.6,  // 4 inches
    labelHmm: 50.8,   // 2 inches
    cols: 2,
    rows: 1,
    gutterXmm: 10,    // 10mm gap between labels
    gutterYmm: 0,
    qrSizemm: 24,
    padmm: 5,
    fontPt: { line: 11, item: 12, subpart: 9 },
    marginXmm: 0,
    marginYmm: 0,
  },
  install_twin: {
    // Install twin roll labels - 87mm × 20mm page, 2× 40×20mm labels, 4mm gutter
    // QR on RIGHT side (18mm), text on LEFT with larger fonts (10pt)
    labelWmm: 40,
    labelHmm: 20,
    cols: 2,
    rows: 1,
    gutterXmm: 4,     // 4mm gap between labels
    gutterYmm: 0,
    qrSizemm: 18,     // 18mm QR for better readability (was 13mm)
    padmm: 2,
    fontPt: { line: 10, item: 10, subpart: 8 },  // Increased from 8.5/9
    marginXmm: 1.5,   // Side margins: (87 - 40*2 - 4) / 2 = 1.5mm
    marginYmm: 0,
  },
} as const;

type Preset = typeof LABEL_PRESETS[keyof typeof LABEL_PRESETS];

function layoutForPreset(p: Preset) {
  const pageW = A4_W;
  const pageH = A4_H;

  const w = mm(p.labelWmm);
  const h = mm(p.labelHmm);
  const gx = mm(p.gutterXmm);
  const gy = mm(p.gutterYmm);

  // Use preset-specific margins for exact positioning
  const mL = mm((p as any).marginXmm || 5);
  const mR = mm((p as any).marginXmm || 5);
  const mT = mm((p as any).marginYmm || 5);
  const mB = mm((p as any).marginYmm || 5);

  // Total grid span (without outer margins)
  const gridW = p.cols * w + (p.cols - 1) * gx;
  const gridH = p.rows * h + (p.rows - 1) * gy;

  // Position grid with computed margins (no additional centering)
  const x0 = mL;
  const yTop = pageH - mT; // start from top

  return { pageW, pageH, mL, mR, mT, mB, w, h, gx, gy, gridW, gridH, x0, yTop };
}

const DISPLAY_NAMES: Record<string, string> = {
  '00': 'חלון מושלם',
  '01': 'משקוף',
  '02': 'כנפיים',
  '03': 'תריס גלילה',
  '04': 'מסילות',
  '05': 'ארגז',
};

let cachedHebFontBytes: Uint8Array | null = null;
let cachedHebFontBoldBytes: Uint8Array | null = null;

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    out[i] = bin.charCodeAt(i);
  }
  return out;
}

async function loadHebFontBytes(admin: any, bold = false): Promise<Uint8Array> {
  const cache = bold ? cachedHebFontBoldBytes : cachedHebFontBytes;
  if (cache) {
    return cache;
  }

  const storagePath = bold ? STORAGE_PATH_BOLD : STORAGE_PATH_REGULAR;
  const bundleName = bold ? "NotoSansHebrew-Bold.ttf" : "NotoSansHebrew-Regular.ttf";

  if (FONT_ENV.length > 0 && !bold) {
    try {
      const bytes = b64ToBytes(FONT_ENV);
      console.log(`[labels-generate-chunk] ENV font loaded, bytes: ${bytes.byteLength}`);
      if (!bold) cachedHebFontBytes = bytes;
      return bytes;
    } catch (e) {
      console.error("[labels-generate-chunk] ENV font decode failed:", (e as Error)?.message || e);
    }
  }

  if (SUPABASE_URL && SERVICE_ROLE) {
    const { data, error } = await admin.storage.from(STORAGE_BUCKET).download(storagePath);
    if (!error && data) {
      const buf = new Uint8Array(await data.arrayBuffer());
      if (buf.byteLength > 0) {
        if (bold) cachedHebFontBoldBytes = buf;
        else cachedHebFontBytes = buf;
        return buf;
      }
    }
  }

  try {
    const url = new URL(`./${bundleName}`, import.meta.url);
    const buf = await Deno.readFile(url);
    if (buf.byteLength > 0) {
      if (bold) cachedHebFontBoldBytes = buf;
      else cachedHebFontBytes = buf;
      return buf;
    }
  } catch (e) {
    console.error(`[labels-generate-chunk] Bundled ${bundleName} read failed:`, (e as Error)?.message || e);
  }

  // If bold font not found, fall back to regular font
  if (bold) {
    console.log('[labels-generate-chunk] Bold font not found, falling back to regular font');
    return loadHebFontBytes(admin, false);
  }

  throw new Error(`Hebrew font (regular) not found`);
}

// Optimized QR renderer
async function drawQrMatrix(
  page: any,
  text: string,
  x: number,
  y: number,
  size: number,
  dark = rgb(0, 0, 0)
) {
  const qr = QRCode.create(text, {
    errorCorrectionLevel: "M"
  });
  const cells = qr.modules;
  const count = cells.size;
  const scale = size / count;

  for (let r = 0; r < count; r++) {
    let startCol = -1;
    for (let c = 0; c <= count; c++) {
      const isDark = c < count && cells.get(r, c);

      if (isDark && startCol === -1) {
        startCol = c;
      } else if (!isDark && startCol !== -1) {
        page.drawRectangle({
          x: x + startCol * scale,
          y: y + (count - 1 - r) * scale,
          width: (c - startCol) * scale,
          height: scale,
          color: dark,
          borderWidth: 0,
        });
        startCol = -1;
      }
    }
  }
}

// Rotated QR renderer for rotated roll format
// Draws QR at (x, y) with 90° clockwise rotation
async function drawQrMatrixRotated(
  page: any,
  text: string,
  x: number,
  y: number,
  size: number,
  rotation: any,
  dark = rgb(0, 0, 0)
) {
  const qr = QRCode.create(text, {
    errorCorrectionLevel: "M"
  });
  const cells = qr.modules;
  const count = cells.size;
  const scale = size / count;

  // For 90° CW rotation: original (col, row) maps to new position
  // We transform the drawing coordinates
  for (let r = 0; r < count; r++) {
    let startCol = -1;
    for (let c = 0; c <= count; c++) {
      const isDark = c < count && cells.get(r, c);

      if (isDark && startCol === -1) {
        startCol = c;
      } else if (!isDark && startCol !== -1) {
        // In rotated space: swap x/y and adjust
        // Original: x + startCol*scale, y + (count-1-r)*scale
        // For 90° CW: newX = y + (count-1-r)*scale, newY = x + startCol*scale
        const rectX = x + (count - 1 - r) * scale;
        const rectY = y + startCol * scale;
        const rectW = scale;
        const rectH = (c - startCol) * scale;
        
        page.drawRectangle({
          x: rectX,
          y: rectY,
          width: rectW,
          height: rectH,
          color: dark,
          borderWidth: 0,
        });
        startCol = -1;
      }
    }
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      throw new Error('Unauthorized');
    }

    const body: { jobId: number; chunkSize?: number } = await req.json();
    const { jobId, chunkSize = 50 } = body;

    console.log(`[labels-generate-chunk] Processing job ${jobId}, chunk size ${chunkSize}`);

    // Fetch next batch of unrendered items
    const { data: rows, error: rowsError } = await supabase
      .from('label_job_items')
      .select('*')
      .eq('job_id', jobId)
      .eq('rendered', false)
      .order('ord', { ascending: true })
      .limit(chunkSize);

    if (rowsError) throw rowsError;

    if (!rows || rows.length === 0) {
      console.log(`[labels-generate-chunk] No more items to render, finalizing job ${jobId}`);

      // Purge tokens and mark as done
      await supabase.from('label_job_items')
        .update({ token_plain: null })
        .eq('job_id', jobId);

      await supabase.from('label_jobs')
        .update({ status: 'done' })
        .eq('id', jobId);

      return new Response(
        JSON.stringify({ success: true, remaining: 0, done: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[labels-generate-chunk] Rendering ${rows.length} labels`);

    // Get job info
    const { data: jobData, error: jobError } = await supabase
      .from('label_jobs')
      .select('pdf_path, project_id, layout, format')
      .eq('id', jobId)
      .single();

    if (jobError) throw jobError;

    const filePath = jobData.pdf_path;
    const layout = jobData.layout || 'factory';
    const mode = jobData.format || 'load_roll_100x50'; // Mode is stored in format column
    
    // Determine rendering mode from the stored mode value
    const isLoadRoll = mode === 'load_roll_100x50';
    const isLoadA4 = mode === 'load_a4_100x70';
    const isInstallA4 = mode === 'install_a4_50x30';
    const isInstallTwoUp = mode === 'install_two_up_roll';
    const isInstallTwin = mode === 'install_twin_roll';
    
    // Legacy support for old format values
    const isRollFormat = isLoadRoll || mode === 'roll_100x50' || mode === 'roll_100x50_rotated';
    const isRotatedRoll = mode === 'roll_100x50_rotated';

    // Select preset based on mode
    let presetKey: 'big' | 'small' | 'roll' | 'install_two_up' | 'install_twin';
    if (isInstallTwin) {
      presetKey = 'install_twin';
    } else if (isInstallTwoUp) {
      presetKey = 'install_two_up';
    } else if (isLoadRoll || isRollFormat) {
      presetKey = 'roll';
    } else if (isInstallA4 || layout === 'install') {
      presetKey = 'small';
    } else {
      presetKey = 'big';
    }
    const preset = LABEL_PRESETS[presetKey];
    const geo = layoutForPreset(preset);
    
    // For roll format, each label is its own page
    // Standard: 100×50mm (landscape), Rotated: 50×100mm (portrait) with content rotated 90°
    const rollPageW = isRotatedRoll ? mm(50) : mm(100);
    const rollPageH = isRotatedRoll ? mm(100) : mm(50);
    
    // Logical dimensions for content layout (always 100×50 in content space)
    const contentW = mm(100);
    const contentH = mm(50);

    console.log(`[labels-generate-chunk] Using mode: ${mode}, presetKey: ${presetKey}, ${preset.cols}×${preset.rows}, ${preset.labelWmm}×${preset.labelHmm}mm`);

    // Load or create PDF
    let pdfDoc: any;
    const { data: existingFile, error: downloadError } = await supabase.storage
      .from('labels')
      .download(filePath);

    if (existingFile && !downloadError) {
      console.log(`[labels-generate-chunk] Loading existing PDF`);
      pdfDoc = await PDFDocument.load(await existingFile.arrayBuffer());
    } else {
      console.log(`[labels-generate-chunk] Creating new PDF`);
      pdfDoc = await PDFDocument.create();
    }

    (pdfDoc as any).registerFontkit(fontkit);

    // Load Hebrew fonts (disable subsetting to preserve BiDi marks)
    let fontBold;
    try {
      const fontBoldBytes = await loadHebFontBytes(supabase, true);
      fontBold = await pdfDoc.embedFont(fontBoldBytes, { subset: false });
      console.log('[labels-generate-chunk] Hebrew bold font embedded:', fontBold.name || 'custom');
    } catch (e) {
      console.log('[labels-generate-chunk] Bold font failed, using regular font as fallback');
      const fontRegularBytes = await loadHebFontBytes(supabase, false);
      fontBold = await pdfDoc.embedFont(fontRegularBytes, { subset: false });
    }
    
    // Embed Helvetica-Bold for Latin/numbers (has all glyphs)
    const latinFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    console.log('[labels-generate-chunk] Latin font embedded: Helvetica-Bold');

    // Get item details for rendering
    const itemIds = [...new Set(rows.map(r => r.item_id))];
    const { data: items, error: itemsError } = await supabase
      .from('items')
      .select(`
        id,
        item_code,
        location,
        opening_no,
        notes,
        motor_side,
        floor_id,
        apt_id,
        floors:floor_id(floor_code),
        apartments:apt_id(apt_number),
        projects:project_id(name, building_code)
      `)
      .in('id', itemIds);

    if (itemsError) throw itemsError;

    const itemMap = new Map(items?.map(i => [i.id, i]) || []);

    // Helper to draw right-aligned mixed Hebrew+Latin text with proper fonts
    function drawHebrewRightAligned(page: any, text: string, xRight: number, y: number, size: number, hebrewFont: any, latinFont: any, color: any = rgb(0, 0, 0)) {
      const safe = hebrewPdf(text);
      
      // Split into Hebrew and non-Hebrew segments
      const segments: Array<{ text: string; isHebrew: boolean }> = [];
      const hebrewRegex = /[\u0590-\u05FF]+/g;
      let lastIndex = 0;
      let match;
      
      while ((match = hebrewRegex.exec(safe)) !== null) {
        // Add non-Hebrew before this match
        if (match.index > lastIndex) {
          segments.push({ text: safe.substring(lastIndex, match.index), isHebrew: false });
        }
        // Add Hebrew match
        segments.push({ text: match[0], isHebrew: true });
        lastIndex = match.index + match[0].length;
      }
      // Add remaining non-Hebrew
      if (lastIndex < safe.length) {
        segments.push({ text: safe.substring(lastIndex), isHebrew: false });
      }
      
      // Calculate total width
      let totalWidth = 0;
      for (const seg of segments) {
        const font = seg.isHebrew ? hebrewFont : latinFont;
        totalWidth += font.widthOfTextAtSize(seg.text, size);
      }
      
      // Draw from right to left
      let currentX = xRight - totalWidth;
      for (const seg of segments) {
        const font = seg.isHebrew ? hebrewFont : latinFont;
        page.drawText(seg.text, { x: currentX, y, size, font, color });
        currentX += font.widthOfTextAtSize(seg.text, size);
      }
    }

    /**
     * Draw line as: [ ... value ][ space ][ key ]  (right-aligned as a whole),
     * but **key** is rendered rightmost (closest to xRight), then the value to its left.
     * Uses mixed fonts: Hebrew with fontBold, Latin/numbers with latinFont.
     */
    function drawKeyValueRTL(
      page: any,
      keyHeb: string,
      rawValue: string | number | undefined,
      xRight: number,
      y: number,
      hebrewFont: any,
      latinFont: any,
      baseSize: number,
      color: any,
      minSize = 8.5
    ) {
      const key = hebrewPdf(keyHeb.trim());
      let val = hebrewPdf(String(rawValue ?? '').trim());

      // width budget for text column
      const widthLimit = mm(preset.labelWmm) - mm((preset as any).qrSizemm) - mm(preset.padmm * 3);
      let size = baseSize;

      // Calculate mixed font widths
      const measureText = (text: string) => {
        let width = 0;
        const hebrewRegex = /[\u0590-\u05FF]+/g;
        let lastIndex = 0;
        let match;
        while ((match = hebrewRegex.exec(text)) !== null) {
          if (match.index > lastIndex) {
            width += latinFont.widthOfTextAtSize(text.substring(lastIndex, match.index), size);
          }
          width += hebrewFont.widthOfTextAtSize(match[0], size);
          lastIndex = match.index + match[0].length;
        }
        if (lastIndex < text.length) {
          width += latinFont.widthOfTextAtSize(text.substring(lastIndex), size);
        }
        return width;
      };

      const GAPW = latinFont.widthOfTextAtSize(' ', size);

      // shrink-to-fit
      while ((measureText(key) + GAPW + measureText(val)) > widthLimit && size > minSize) size -= 0.25;

      // Helper to draw mixed text
      const drawMixed = (text: string, xStart: number) => {
        const hebrewRegex = /[\u0590-\u05FF]+/g;
        let lastIndex = 0;
        let currentX = xStart;
        let match;
        
        while ((match = hebrewRegex.exec(text)) !== null) {
          if (match.index > lastIndex) {
            const latinText = text.substring(lastIndex, match.index);
            page.drawText(latinText, { x: currentX, y, size, font: latinFont, color });
            currentX += latinFont.widthOfTextAtSize(latinText, size);
          }
          page.drawText(match[0], { x: currentX, y, size, font: hebrewFont, color });
          currentX += hebrewFont.widthOfTextAtSize(match[0], size);
          lastIndex = match.index + match[0].length;
        }
        if (lastIndex < text.length) {
          const latinText = text.substring(lastIndex);
          page.drawText(latinText, { x: currentX, y, size, font: latinFont, color });
        }
      };

      // 1) draw key right-aligned at xRight
      const keyWidth = measureText(key);
      const keyX = xRight - keyWidth;
      drawMixed(key, keyX);

      // 2) draw value to the LEFT of the key
      const valWidth = measureText(val);
      const valX = keyX - GAPW - valWidth;
      drawMixed(val, valX);
    }

    // Install two-up format: 2"×4" labels, two identical per page (same item)
    // Page size = 2 labels + 10mm gutter = 101.6*2 + 10mm gap
    const inToPt = (v: number) => v * 72; // 1 inch = 72pt
    const TWOUP_LABEL_W = inToPt(4);     // 4" = 288pt
    const TWOUP_LABEL_H = inToPt(2);     // 2" = 144pt
    const TWOUP_GUTTER = mm(10);          // 10mm gap
    const TWOUP_PAGE_W = TWOUP_LABEL_W * 2 + TWOUP_GUTTER;
    const TWOUP_PAGE_H = TWOUP_LABEL_H;

    // Helper to draw a single install two-up label at a given x offset
    const drawInstallTwoUpLabel = async (
      page: any, 
      labelInfo: any, 
      item: any, 
      xLeft: number
    ) => {
      const projectName = (item.projects as any)?.name || '';
      const floor = (item.floors as any)?.floor_code || '';
      const apt = (item.apartments as any)?.apt_number || '';
      
      const pad = mm(3);
      const qrSize = mm(42);  // Much bigger QR - ~42mm in 50.8mm (2") height
      const fontSize = 13;
      const lineGap = mm(7);
      const black = rgb(0, 0, 0);

      // QR on LEFT side of label, VERTICALLY CENTERED
      const qrX = xLeft + pad;
      const qrY = (TWOUP_LABEL_H - qrSize) / 2;  // Center vertically
      await drawQrMatrix(page, labelInfo.scan_url, qrX, qrY, qrSize);

      // Text on RIGHT side of label, right-aligned to edge
      const textRight = xLeft + TWOUP_LABEL_W - pad;
      
      // Center text block vertically (3 lines + project name = 4 lines)
      const totalTextHeight = lineGap * 3;
      let textY = (TWOUP_LABEL_H / 2) + (totalTextHeight / 2);

      // Line 1: מס' פרט
      drawKeyValueRTL(page, "מס' פרט", item.item_code, textRight, textY, fontBold, latinFont, fontSize + 1, black);
      textY -= lineGap;

      // Line 2: קומה
      drawKeyValueRTL(page, 'קומה', floor, textRight, textY, fontBold, latinFont, fontSize, black);
      textY -= lineGap;

      // Line 3: דירה
      drawKeyValueRTL(page, 'דירה', apt, textRight, textY, fontBold, latinFont, fontSize, black);
      textY -= lineGap;

      // Line 4: Project name (small footer)
      if (projectName) {
        drawHebrewRightAligned(page, projectName, textRight, textY, fontSize - 2, fontBold, latinFont, black);
      }
    };

    // Render labels
    let currentPage: any;
    let col = 0, row = 0;

    for (let i = 0; i < rows.length; i++) {
      const labelInfo = rows[i];
      const item = itemMap.get(labelInfo.item_id);

      if (!item) {
        console.warn(`[labels-generate-chunk] Item ${labelInfo.item_id} not found`);
        continue;
      }

      const projectName = (item.projects as any)?.name || '';
      const building = (item.projects as any)?.building_code || '';
      const floor = (item.floors as any)?.floor_code || '';
      const apt = (item.apartments as any)?.apt_number || '';

      // Install two-up roll format: 2"×4" labels, two identical per page
      if (isInstallTwoUp) {
        currentPage = pdfDoc.addPage([TWOUP_PAGE_W, TWOUP_PAGE_H]);
        
        // Draw left label
        await drawInstallTwoUpLabel(currentPage, labelInfo, item, 0);
        
        // Draw right label (identical)
        await drawInstallTwoUpLabel(currentPage, labelInfo, item, TWOUP_LABEL_W + TWOUP_GUTTER);
        
        continue; // Skip other rendering logic
      }

      // Install twin roll format: 87×20mm page, 2× 40×20mm labels, 4mm gutter
      // QR on RIGHT side, positioned at TOP, text on LEFT side
      if (isInstallTwin) {
        const TWIN_LABEL_W = mm(40);
        const TWIN_LABEL_H = mm(20);
        const TWIN_GUTTER = mm(4);
        const TWIN_PAGE_W = mm(87);
        const TWIN_PAGE_H = mm(20);
        const TWIN_SIDE_MARGIN = (TWIN_PAGE_W - (TWIN_LABEL_W * 2 + TWIN_GUTTER)) / 2; // ~1.5mm
        
        currentPage = pdfDoc.addPage([TWIN_PAGE_W, TWIN_PAGE_H]);
        
        const twinPad = mm(0.5);         // Minimal padding
        const twinQrSize = mm(19);       // 19mm QR - nearly full height of 20mm label
        const twinFontSize = 12;         // 12pt font
        const twinLineGap = mm(5);       // Adjusted line spacing
        const textQrGutter = mm(1);      // Gap between text block and QR
        const black = rgb(0, 0, 0);

        // Helper to draw a single twin label at x offset
        const drawTwinLabel = async (xLeft: number) => {
          // QR on RIGHT side of label, VERTICALLY CENTERED
          const qrX = xLeft + TWIN_LABEL_W - twinPad - twinQrSize;
          const qrY = (TWIN_LABEL_H - twinQrSize) / 2;  // Center vertically
          await drawQrMatrix(currentPage, labelInfo.scan_url, qrX, qrY, twinQrSize);

          // Text block on LEFT side, vertically centered with the QR
          const textRight = qrX - textQrGutter;  // Right edge of text block (before QR)
          const textBlockHeight = twinFontSize + (twinLineGap * 2);  // 3 lines
          let textY = (TWIN_LABEL_H / 2) + (textBlockHeight / 2) - mm(1);  // Start centered

          // Line 1: מס' פרט (bold)
          drawKeyValueRTL(currentPage, "מס' פרט", item.item_code, textRight, textY, fontBold, latinFont, twinFontSize, black, 7);
          textY -= twinLineGap;

          // Line 2: קומה
          drawKeyValueRTL(currentPage, 'קומה', floor, textRight, textY, fontBold, latinFont, twinFontSize, black, 7);
          textY -= twinLineGap;

          // Line 3: דירה
          drawKeyValueRTL(currentPage, 'דירה', apt, textRight, textY, fontBold, latinFont, twinFontSize, black, 7);
        };

        // Draw left label
        await drawTwinLabel(TWIN_SIDE_MARGIN);
        
        // Draw right label (identical)
        await drawTwinLabel(TWIN_SIDE_MARGIN + TWIN_LABEL_W + TWIN_GUTTER);
        
        continue; // Skip other rendering logic
      }

      // Roll format: one page per label
      if (isRollFormat) {
        currentPage = pdfDoc.addPage([rollPageW, rollPageH]);
        const pad = mm(preset.padmm);
        const qrSize = mm((preset as any).qrSizemm);
        const fontSize = preset.fontPt.line;
        const black = rgb(0, 0, 0);
        const lineGap = mm(5);  // Reduced line spacing
        
        // For rotated format, we need to transform coordinates
        // Page is 50×100mm portrait, but we draw as if it were 100×50mm landscape
        // and rotate each element 90° clockwise
        if (isRotatedRoll) {
          // Import degrees for rotation
          const { degrees } = await import("https://esm.sh/pdf-lib@1.17.1");
          
          // In rotated mode: page is 50w×100h, but content is laid out as 100w×50h
          // We draw elements with 90° rotation
          // Transform: logical (lx, ly) in 100×50 space -> page coords with rotation
          // After 90° CW rotation around origin: (lx, ly) -> (ly, -lx)
          // Then translate to fit in page: add (0, pageW) = (0, 50mm)
          // Final: pageX = ly, pageY = 50mm - lx
          
          const toPageX = (lx: number, ly: number) => ly;
          const toPageY = (lx: number, ly: number) => rollPageW - lx;
          
          // QR position in logical 100×50 space: left side, vertically centered
          const qrLogicalX = pad;
          const qrLogicalY = (contentH - qrSize) / 2;
          
          // Draw QR with rotation
          // For QR, we need to account for the rotation origin
          const qrPageX = toPageX(qrLogicalX, qrLogicalY);
          const qrPageY = toPageY(qrLogicalX, qrLogicalY);
          
          // When rotating, pdf-lib rotates around the element's origin
          // We need to adjust for this
          await drawQrMatrixRotated(currentPage, labelInfo.scan_url, qrPageX, qrPageY - qrSize, qrSize, degrees(90));

          // Text positions in logical space
          const textLogicalRight = contentW - pad;
          let textLogicalY = contentH - mm(5);  // Move text block up

          // Helper to draw rotated text
          const drawRotatedKeyValue = async (keyHeb: string, rawValue: string | number | undefined, logicalY: number, size: number = fontSize) => {
            const key = hebrewPdf(keyHeb.trim());
            const val = hebrewPdf(String(rawValue ?? '').trim());
            
            const measureText = (text: string, sz: number) => {
              let width = 0;
              const hebrewRegex = /[\u0590-\u05FF]+/g;
              let lastIndex = 0;
              let match;
              while ((match = hebrewRegex.exec(text)) !== null) {
                if (match.index > lastIndex) {
                  width += latinFont.widthOfTextAtSize(text.substring(lastIndex, match.index), sz);
                }
                width += fontBold.widthOfTextAtSize(match[0], sz);
                lastIndex = match.index + match[0].length;
              }
              if (lastIndex < text.length) {
                width += latinFont.widthOfTextAtSize(text.substring(lastIndex), sz);
              }
              return width;
            };
            
            const GAPW = latinFont.widthOfTextAtSize(' ', size);
            const keyWidth = measureText(key, size);
            const valWidth = val ? measureText(val, size) : 0;
            
            // In logical space, text is right-aligned at textLogicalRight
            // Key starts at textLogicalRight - keyWidth
            // Value is to the left of key
            const keyLogicalX = textLogicalRight - keyWidth;
            const valLogicalX = val ? keyLogicalX - GAPW - valWidth : keyLogicalX;
            
            // Draw key (rotated)
            const drawRotatedMixed = (text: string, logX: number, logY: number, sz: number) => {
              const hebrewRegex = /[\u0590-\u05FF]+/g;
              let lastIndex = 0;
              let currentLogX = logX;
              let match;
              
              while ((match = hebrewRegex.exec(text)) !== null) {
                if (match.index > lastIndex) {
                  const latinText = text.substring(lastIndex, match.index);
                  const px = toPageX(currentLogX, logY);
                  const py = toPageY(currentLogX, logY);
                  currentPage.drawText(latinText, { 
                    x: px, 
                    y: py, 
                    size: sz, 
                    font: latinFont, 
                    color: black,
                    rotate: degrees(90)
                  });
                  currentLogX += latinFont.widthOfTextAtSize(latinText, sz);
                }
                const px = toPageX(currentLogX, logY);
                const py = toPageY(currentLogX, logY);
                currentPage.drawText(match[0], { 
                  x: px, 
                  y: py, 
                  size: sz, 
                  font: fontBold, 
                  color: black,
                  rotate: degrees(90)
                });
                currentLogX += fontBold.widthOfTextAtSize(match[0], sz);
                lastIndex = match.index + match[0].length;
              }
              if (lastIndex < text.length) {
                const latinText = text.substring(lastIndex);
                const px = toPageX(currentLogX, logY);
                const py = toPageY(currentLogX, logY);
                currentPage.drawText(latinText, { 
                  x: px, 
                  y: py, 
                  size: sz, 
                  font: latinFont, 
                  color: black,
                  rotate: degrees(90)
                });
              }
            };
            
            drawRotatedMixed(key, keyLogicalX, logicalY, size);
            if (val) {
              drawRotatedMixed(val, valLogicalX, logicalY, size);
            }
          };

          // Line 1: בניין {building} • {project_name}
          const combinedBuilding = building && projectName 
            ? `${building} • ${projectName}` 
            : building || projectName;
          await drawRotatedKeyValue('בניין', combinedBuilding, textLogicalY);
          textLogicalY -= lineGap;

          // Line 2: קומה
          await drawRotatedKeyValue('קומה', floor, textLogicalY);
          textLogicalY -= lineGap;

          // Line 3: דירה
          await drawRotatedKeyValue('דירה', apt, textLogicalY);
          textLogicalY -= lineGap;

          // Line 4: מס' פרט
          await drawRotatedKeyValue("מס' פרט", item.item_code, textLogicalY);
          textLogicalY -= lineGap;

          // Line 5: Subpart name
          const subpartText = DISPLAY_NAMES[labelInfo.subpart_code] || labelInfo.subpart_code;
          const subpartSafe = hebrewPdf(subpartText);
          const subpartWidth = fontBold.widthOfTextAtSize(subpartSafe, fontSize - 1);
          const subpartLogicalX = textLogicalRight - subpartWidth;
          const subpartPx = toPageX(subpartLogicalX, textLogicalY);
          const subpartPy = toPageY(subpartLogicalX, textLogicalY);
          currentPage.drawText(subpartSafe, {
            x: subpartPx,
            y: subpartPy,
            size: fontSize - 1,
            font: fontBold,
            color: black,
            rotate: degrees(90)
          });

          // Add motor_side for ALL item types (when available)
          if (item.motor_side) {
            textLogicalY -= lineGap;
            await drawRotatedKeyValue('צד מנוע', item.motor_side, textLogicalY, fontSize - 1);
          }

          // Draw KOSTIKA branding (in logical space: bottom center)
          const brandingText = "KOSTIKA";
          const brandingFontSize = 12;
          const brandingWidth = latinFont.widthOfTextAtSize(brandingText, brandingFontSize);
          const brandingLogicalX = (contentW - brandingWidth) / 2;
          const brandingLogicalY = mm(3);
          const brandingPx = toPageX(brandingLogicalX, brandingLogicalY);
          const brandingPy = toPageY(brandingLogicalX, brandingLogicalY);
          
          currentPage.drawText(brandingText, {
            x: brandingPx,
            y: brandingPy,
            size: brandingFontSize,
            font: latinFont,
            color: black,
            rotate: degrees(90)
          });

        } else {
          // Standard roll format (100×50mm landscape)
          // QR on left, vertically centered
          const qrX = pad;
          const qrY = (rollPageH - qrSize) / 2;
          await drawQrMatrix(currentPage, labelInfo.scan_url, qrX, qrY, qrSize);

          // Text on right side
          const textRight = rollPageW - pad;
          let textY = rollPageH - mm(5);  // Move text block up

          // Line 1: בניין {building} • {project_name}
          const combinedBuilding = building && projectName 
            ? `${building} • ${projectName}` 
            : building || projectName;
          drawKeyValueRTL(currentPage, 'בניין', combinedBuilding, textRight, textY, fontBold, latinFont, fontSize, black);
          textY -= lineGap;

          // Line 2: קומה
          drawKeyValueRTL(currentPage, 'קומה', floor, textRight, textY, fontBold, latinFont, fontSize, black);
          textY -= lineGap;

          // Line 3: דירה
          drawKeyValueRTL(currentPage, 'דירה', apt, textRight, textY, fontBold, latinFont, fontSize, black);
          textY -= lineGap;

          // Line 4: מס' פרט
          drawKeyValueRTL(currentPage, "מס' פרט", item.item_code, textRight, textY, fontBold, latinFont, fontSize, black);
          textY -= lineGap;

          // Line 5: מיקום בדירה (location/area in apt)
          if (item.location) {
            drawKeyValueRTL(currentPage, 'מיקום בדירה', item.location, textRight, textY, fontBold, latinFont, fontSize - 1, black);
            textY -= lineGap;
          } else if (item.opening_no) {
            drawKeyValueRTL(currentPage, "מס' פתח", item.opening_no, textRight, textY, fontBold, latinFont, fontSize - 1, black);
            textY -= lineGap;
          }

          // Line 6: Subpart name
          const subpartText = DISPLAY_NAMES[labelInfo.subpart_code] || labelInfo.subpart_code;
          drawHebrewRightAligned(currentPage, subpartText, textRight, textY, fontSize - 1, fontBold, latinFont, black);

          // Add motor_side for ALL item types (when available)
          if (item.motor_side) {
            textY -= lineGap;
            drawKeyValueRTL(currentPage, 'צד מנוע', item.motor_side, textRight, textY, fontBold, latinFont, fontSize - 1, black);
          }

          // Draw KOSTIKA branding (bottom center)
          const brandingText = "KOSTIKA";
          const brandingFontSize = 12;
          const brandingWidth = latinFont.widthOfTextAtSize(brandingText, brandingFontSize);
          const brandingX = (rollPageW - brandingWidth) / 2;
          const brandingY = mm(3);
          
          currentPage.drawText(brandingText, {
            x: brandingX,
            y: brandingY,
            size: brandingFontSize,
            font: latinFont,
            color: rgb(0, 0, 0),
          });
        }

        continue; // Skip A4 grid logic
      }

      // A4 grid format (existing logic)
      if (i === 0 || (row >= preset.rows)) {
        currentPage = pdfDoc.addPage([geo.pageW, geo.pageH]);
        row = 0;
        col = 0;
      }

      const x = geo.x0 + col * (geo.w + geo.gx);
      const y = geo.yTop - (row * (geo.h + geo.gy)) - geo.h;

      // Draw border
      currentPage.drawRectangle({
        x,
        y,
        width: geo.w,
        height: geo.h,
        borderColor: rgb(0.7, 0.7, 0.7),
        borderWidth: 0.5,
      });

      if (layout === 'install') {
        // Install label (50×30mm): QR left, 4 lines right
        const pad = mm(preset.padmm);
        const qrSize = mm((preset as any).qrSizemm);
        
        // QR on left, positioned lower to avoid overlapping project name
        const qrX = x + pad;
        const qrY = y + (geo.h - qrSize) / 2 - mm2pt(4); // lowered by 4mm for clearance
        await drawQrMatrix(currentPage, labelInfo.scan_url, qrX, qrY, qrSize);

        // Text on right - draw in two chunks (value then key), using BOLD font
        const textRight = x + geo.w - pad;
        const fontSize = preset.fontPt.line;
        const lineGap = mm2pt(4.5);
        let textY = y + geo.h - mm2pt(6);
        const black = rgb(0, 0, 0);

        // Line 1: {project_name} (without "פרויקט" label)
        drawHebrewRightAligned(currentPage, projectName, textRight, textY, fontSize, fontBold, latinFont, black);
        textY -= lineGap;

        // Line 2: מס' פרט {item_code}
        drawKeyValueRTL(currentPage, "מס' פרט", item.item_code, textRight, textY, fontBold, latinFont, fontSize, black);
        textY -= lineGap;

        // Line 3: קומה {floor}
        drawKeyValueRTL(currentPage, "קומה", floor, textRight, textY, fontBold, latinFont, fontSize, black);
        textY -= lineGap;

        // Line 4: דירה {apt}
        drawKeyValueRTL(currentPage, "דירה", apt, textRight, textY, fontBold, latinFont, fontSize, black);

      } else {
        // Factory label (100×70mm): uses BOLD font
        const pad = mm(preset.padmm);
        const textRight = x + geo.w - pad;
        let textY = y + geo.h - mm(8); // start position from top
        const fontSize = preset.fontPt.line;

        // Helper to draw label + value separately using mixed fonts
        const drawLabelValue = (labelText: string, value: string | number, yPos: number, size: number = fontSize) => {
          const safeLabel = hebrewPdf(labelText);
          const valueStr = hebrewPdf(String(value || ''));
          
          // Helper to measure mixed text
          const measureText = (text: string) => {
            let width = 0;
            const hebrewRegex = /[\u0590-\u05FF]+/g;
            let lastIndex = 0;
            let match;
            while ((match = hebrewRegex.exec(text)) !== null) {
              if (match.index > lastIndex) {
                width += latinFont.widthOfTextAtSize(text.substring(lastIndex, match.index), size);
              }
              width += fontBold.widthOfTextAtSize(match[0], size);
              lastIndex = match.index + match[0].length;
            }
            if (lastIndex < text.length) {
              width += latinFont.widthOfTextAtSize(text.substring(lastIndex), size);
            }
            return width;
          };
          
          // Helper to draw mixed text
          const drawMixed = (text: string, xStart: number) => {
            const hebrewRegex = /[\u0590-\u05FF]+/g;
            let lastIndex = 0;
            let currentX = xStart;
            let match;
            
            while ((match = hebrewRegex.exec(text)) !== null) {
              if (match.index > lastIndex) {
                const latinText = text.substring(lastIndex, match.index);
                currentPage.drawText(latinText, { x: currentX, y: yPos, size, font: latinFont, color: rgb(0, 0, 0) });
                currentX += latinFont.widthOfTextAtSize(latinText, size);
              }
              currentPage.drawText(match[0], { x: currentX, y: yPos, size, font: fontBold, color: rgb(0, 0, 0) });
              currentX += fontBold.widthOfTextAtSize(match[0], size);
              lastIndex = match.index + match[0].length;
            }
            if (lastIndex < text.length) {
              const latinText = text.substring(lastIndex);
              currentPage.drawText(latinText, { x: currentX, y: yPos, size, font: latinFont, color: rgb(0, 0, 0) });
            }
          };
          
          if (!valueStr) {
            const labelWidth = measureText(safeLabel);
            drawMixed(safeLabel, textRight - labelWidth);
            return;
          }

          const labelWidth = measureText(safeLabel);
          const labelX = textRight - labelWidth;
          drawMixed(safeLabel, labelX);
          
          const valueWidth = measureText(valueStr);
          const gapWidth = latinFont.widthOfTextAtSize(' ', size);
          const valueX = labelX - gapWidth - valueWidth;
          drawMixed(valueStr, valueX);
        };

        // Line 1: בניין {building} • {project_name}
        const combinedBuilding = building && projectName 
          ? `${building} • ${projectName}` 
          : building || projectName;
        drawLabelValue('בניין', combinedBuilding, textY, fontSize);
        textY -= mm(9);
        drawLabelValue('קומה', floor, textY, fontSize);
        textY -= mm(9);
        drawLabelValue('דירה', apt, textY, fontSize);
        textY -= mm(9);
        drawLabelValue("מס' פרט", item.item_code, textY, fontSize);
        textY -= mm(9);
        
        if (item.location) {
          drawLabelValue('מיקום בדירה', item.location, textY, fontSize);
        } else if (item.opening_no) {
          drawLabelValue("מס' פתח", item.opening_no, textY, fontSize);
        }
        
        // Add motor_side for ALL item types (when available)
        if (item.motor_side) {
          textY -= mm(9);
          drawLabelValue('צד מנוע', item.motor_side, textY, fontSize);
        }

        // Draw KOSTIKA branding (bottom center)
        const brandingText = "KOSTIKA";
        const brandingFontSize = 14;
        const brandingWidth = latinFont.widthOfTextAtSize(brandingText, brandingFontSize);
        const brandingX = x + (geo.w - brandingWidth) / 2;
        const brandingY = y + mm(5);
        
        currentPage.drawText(brandingText, {
          x: brandingX,
          y: brandingY,
          size: brandingFontSize,
          font: latinFont,
          color: rgb(0, 0, 0),
        });

        // Draw QR code (left side, vertically centered)
        const qrSize = mm((preset as any).qrSizemm);
        const qrX = x + pad;
        const qrY = y + (geo.h - qrSize) / 2 - mm(6); // center vertically with offset for subpart text
        await drawQrMatrix(currentPage, labelInfo.scan_url, qrX, qrY, qrSize);

        // Draw subpart name below QR using mixed fonts
        const subpartText = DISPLAY_NAMES[labelInfo.subpart_code] || labelInfo.subpart_code;
        const subpartSafe = hebrewPdf(subpartText);
        
        // Measure with mixed fonts
        let subpartWidth = 0;
        const hebrewRegex = /[\u0590-\u05FF]+/g;
        let lastIndex = 0;
        let match;
        while ((match = hebrewRegex.exec(subpartSafe)) !== null) {
          if (match.index > lastIndex) {
            subpartWidth += latinFont.widthOfTextAtSize(subpartSafe.substring(lastIndex, match.index), preset.fontPt.subpart);
          }
          subpartWidth += fontBold.widthOfTextAtSize(match[0], preset.fontPt.subpart);
          lastIndex = match.index + match[0].length;
        }
        if (lastIndex < subpartSafe.length) {
          subpartWidth += latinFont.widthOfTextAtSize(subpartSafe.substring(lastIndex), preset.fontPt.subpart);
        }
        
        // Draw with mixed fonts
        let currentX = qrX + (qrSize - subpartWidth) / 2;
        lastIndex = 0;
        hebrewRegex.lastIndex = 0;
        while ((match = hebrewRegex.exec(subpartSafe)) !== null) {
          if (match.index > lastIndex) {
            const latinText = subpartSafe.substring(lastIndex, match.index);
            currentPage.drawText(latinText, {
              x: currentX,
              y: y + mm(4),
              size: preset.fontPt.subpart,
              font: latinFont,
              color: rgb(0, 0, 0),
            });
            currentX += latinFont.widthOfTextAtSize(latinText, preset.fontPt.subpart);
          }
          currentPage.drawText(match[0], {
            x: currentX,
            y: y + mm(4),
            size: preset.fontPt.subpart,
            font: fontBold,
            color: rgb(0, 0, 0),
          });
          currentX += fontBold.widthOfTextAtSize(match[0], preset.fontPt.subpart);
          lastIndex = match.index + match[0].length;
        }
        if (lastIndex < subpartSafe.length) {
          const latinText = subpartSafe.substring(lastIndex);
          currentPage.drawText(latinText, {
            x: currentX,
            y: y + mm(4),
            size: preset.fontPt.subpart,
            font: latinFont,
            color: rgb(0, 0, 0),
          });
        }
      }

      col++;
      if (col >= preset.cols) {
        col = 0;
        row++;
      }
    }

    // Save PDF
    console.log(`[labels-generate-chunk] Saving PDF`);
    const pdfBytes = await pdfDoc.save();

    // Upload to storage
    const { error: uploadError } = await supabase.storage
      .from('labels')
      .upload(filePath, pdfBytes, {
        contentType: 'application/pdf',
        upsert: true,
      });

    if (uploadError) throw uploadError;

    // Mark items as rendered BEFORE counting
    const rowIds = rows.map(r => r.id);
    const { error: updateError } = await supabase.from('label_job_items')
      .update({ rendered: true })
      .in('id', rowIds);

    if (updateError) throw updateError;

    // Get job total
    const { data: currentJob } = await supabase
      .from('label_jobs')
      .select('total')
      .eq('id', jobId)
      .single();

    if (!currentJob) throw new Error('Job not found');

    // Count remaining with exact count (head=true for no payload)
    const { count: remainingCount, error: countError } = await supabase
      .from('label_job_items')
      .select('id', { count: 'exact', head: true })
      .eq('job_id', jobId)
      .eq('rendered', false);

    if (countError) throw countError;

    const remaining = remainingCount ?? 0;
    const newDone = currentJob.total - remaining;

    // Update job progress
    await supabase.from('label_jobs')
      .update({ done: newDone })
      .eq('id', jobId);

    // If complete, mark as done
    if (remaining === 0) {
      await supabase.from('label_jobs')
        .update({ status: 'done' })
        .eq('id', jobId);
      
      // Optionally purge tokens
      await supabase.from('label_job_items')
        .update({ token_plain: null })
        .eq('job_id', jobId);
    }

    console.log(`[labels-generate-chunk] Progress: ${newDone}/${currentJob.total}, remaining: ${remaining}`);

    return new Response(
      JSON.stringify({
        success: true,
        renderedNow: rows.length,
        remaining,
        done: newDone,
        total: currentJob.total,
        status: remaining === 0 ? 'done' : 'running'
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('[labels-generate-chunk] Error:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
