// Native Deno.serve used below
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PDFDocument, rgb, StandardFonts } from "https://esm.sh/pdf-lib@1.17.1";
import fontkit from "https://esm.sh/@pdf-lib/fontkit@1.1.1";
import QRCode from "https://esm.sh/qrcode@1.5.3";
import { hebrewPdf } from "./hebrew-utils.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Environment variables
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const FONT_ENV = Deno.env.get("FONT_HEB_TTF_BASE64") || "";
const STORAGE_BUCKET = "assets";
const STORAGE_PATH = "fonts/NotoSansHebrew-Regular.ttf";

// Log presence (not values) so we know what's wired
console.log("[labels-generate] ENV present:", {
  SUPABASE_URL: !!SUPABASE_URL,
  SERVICE_ROLE: !!SERVICE_ROLE,
  FONT_HEB_TTF_BASE64: FONT_ENV.length > 0,
});

// Use production domain for scan URLs
function getOriginFromRequest(_req: Request): string {
  return 'https://kostika.lovable.app';
}

// Short random token (base64url ~22 chars for 16 bytes)
function randBase64Url(bytes = 16) {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  const b64 = btoa(String.fromCharCode(...a))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/,'');
  return b64;
}

// Keyword-based subpart detection (simple & fast)
const SUBPART_KEYWORDS: Record<string, string[]> = {
  '01': ['משקוף'],
  '02': ['כנף','כנפ','כנפיים'],
  '03': ['תריס','גלילה'],
  '04': ['מסילה','מסילות'],
  '05': ['ארגז'],
};

function itemRequiresSubpart(item: any, sp: string): boolean {
  const hay = [item.item_code, item.location, item.notes]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  const kw = SUBPART_KEYWORDS[sp] || [];
  // default: if nothing matches, include nothing (or flip to "include all" if you prefer)
  return kw.some(k => hay.includes(k.toLowerCase()));
}

// HMAC helper (hex)
async function hmacHex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return [...new Uint8Array(sig)].map(b=>b.toString(16).padStart(2,'0')).join('');
}

// In-memory cache for Hebrew font (persists across warm invocations)
let cachedHebFontBytes: Uint8Array | null = null;

// Helper to convert base64 to Uint8Array
function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    out[i] = bin.charCodeAt(i);
  }
  return out;
}

// Load Hebrew font with detailed diagnostics (ENV → Storage → Bundled)
async function loadHebFontBytes(admin: any): Promise<Uint8Array> {
  if (cachedHebFontBytes) {
    console.log("[labels-generate] Using cached Hebrew font");
    return cachedHebFontBytes;
  }

  // 1) ENV fallback first (most reliable for debugging)
  if (FONT_ENV.length > 0) {
    console.log("[labels-generate] Using FONT_HEB_TTF_BASE64 env");
    try {
      cachedHebFontBytes = b64ToBytes(FONT_ENV);
      console.log("[labels-generate] ENV font loaded successfully, bytes:", cachedHebFontBytes.byteLength);
      return cachedHebFontBytes;
    } catch (e) {
      console.error("[labels-generate] ENV font decode failed:", (e as Error)?.message || e);
    }
  } else {
    console.log("[labels-generate] FONT_HEB_TTF_BASE64 not set");
  }

  // 2) Storage (service role)
  if (!SUPABASE_URL || !SERVICE_ROLE) {
    console.warn("[labels-generate] Missing SUPABASE_URL or SERVICE_ROLE; cannot load from Storage");
  } else {
    console.log("[labels-generate] Trying Storage download:", `${STORAGE_BUCKET}/${STORAGE_PATH}`);
    const { data, error } = await admin.storage.from(STORAGE_BUCKET).download(STORAGE_PATH);
    if (error) {
      console.error("[labels-generate] Storage download error:", error.message);
    } else if (data) {
      const buf = new Uint8Array(await data.arrayBuffer());
      if (buf.byteLength > 0) {
        console.log("[labels-generate] Storage download OK, bytes:", buf.byteLength);
        cachedHebFontBytes = buf;
        return buf;
      }
      console.error("[labels-generate] Storage download returned 0 bytes");
    } else {
      console.error("[labels-generate] Storage download returned no data");
    }
  }

  // 3) Bundled file (last resort)
  try {
    console.log("[labels-generate] Trying bundled file relative import");
    const url = new URL("./NotoSansHebrew-Regular.ttf", import.meta.url);
    const buf = await Deno.readFile(url);
    if (buf.byteLength > 0) {
      console.log("[labels-generate] Bundled font read OK, bytes:", buf.byteLength);
      cachedHebFontBytes = buf;
      return buf;
    } else {
      console.error("[labels-generate] Bundled font read 0 bytes");
    }
  } catch (e) {
    console.error("[labels-generate] Bundled font read failed:", (e as Error)?.message || e);
  }

  throw new Error("Hebrew font not found: All loading methods failed (ENV/Storage/Bundled). Check function logs for details.");
}

interface GenerateRequest {
  projectId: number;
  scope: 'project' | 'floor' | 'apartment';
  ids: number[];
  subparts?: string[];
  output?: 'pdf' | 'zip';
}

interface Item {
  id: number;
  item_code: string;
  location: string;
  opening_no: string | null;
  notes: string | null;
  project_id: number;
  floor_id: number | null;
  apt_id: number | null;
  floor?: { floor_code: string };
  apartment?: { apt_number: string };
  project?: { building_code: string };
}

interface Label {
  id: number;
  item_id: number;
  subpart_code: string;
  qr_token_hash: string;
}

// Units
const mm2pt = (mm: number) => (mm * 72) / 25.4;

// A4 portrait
const A4_MM = { w: 210, h: 297 };

// Page margins
const PAGE_MARGIN_MM = { top: 5, right: 5, bottom: 5, left: 5 };

// Label presets (100×50mm for loading/factory)
const LABEL_PRESETS = {
  big: {
    labelWmm: 100,
    labelHmm: 50,
    cols: 2,
    rows: 5,
    gutterXmm: 0,
    gutterYmm: 5,
    qrSidemm: 36,
    padmm: 4,
    fontPt: { line: 12, item: 14, subpart: 9 },
  },
} as const;

type Preset = typeof LABEL_PRESETS[keyof typeof LABEL_PRESETS];

function layoutForPreset(p: Preset) {
  const pageW = mm2pt(A4_MM.w);
  const pageH = mm2pt(A4_MM.h);

  const mL = mm2pt(PAGE_MARGIN_MM.left);
  const mR = mm2pt(PAGE_MARGIN_MM.right);
  const mT = mm2pt(PAGE_MARGIN_MM.top);
  const mB = mm2pt(PAGE_MARGIN_MM.bottom);

  const w = mm2pt(p.labelWmm);
  const h = mm2pt(p.labelHmm);
  const gx = mm2pt(p.gutterXmm);
  const gy = mm2pt(p.gutterYmm);

  const gridW = p.cols * w + (p.cols - 1) * gx;
  const gridH = p.rows * h + (p.rows - 1) * gy;

  const contentW = pageW - (mL + mR);
  const contentH = pageH - (mT + mB);

  const x0 = mL + Math.max(0, (contentW - gridW) / 2);
  const yTop = pageH - mT;

  return { pageW, pageH, mL, mR, mT, mB, w, h, gx, gy, gridW, gridH, x0, yTop };
}

const SUBPART_NAMES: Record<string, string> = {
  '01': 'משקוף',
  '02': 'כנפיים',
  '03': 'תריס גלילה',
  '04': 'מסילות',
  '05': 'ארגז',
};

// Optimized canvas-free QR renderer with auto-sizing
async function drawQrMatrix(
  page: any, 
  text: string, 
  x: number, 
  y: number, 
  size: number, 
  dark = rgb(0, 0, 0)
) {
  // Use medium error correction with auto version
  const qr = QRCode.create(text, { 
    errorCorrectionLevel: "M"
  });
  const cells = qr.modules;
  const count = cells.size;
  const scale = size / count;

  // Batch rectangles by row to reduce draw calls
  for (let r = 0; r < count; r++) {
    let startCol = -1;
    for (let c = 0; c <= count; c++) {
      const isDark = c < count && cells.get(r, c);
      
      if (isDark && startCol === -1) {
        startCol = c;
      } else if (!isDark && startCol !== -1) {
        // Draw merged rectangle for consecutive dark cells
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const jwtSecret = Deno.env.get("JWT_SECRET") || "default-secret-change-me";

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

    const body: GenerateRequest = await req.json();
    const { projectId, scope, ids, subparts, output = 'pdf' } = body;

    console.log(`Generating labels for project ${projectId}, scope: ${scope}, ids: ${ids}`);

    // Query items based on scope
    let query = supabase
      .from('items')
      .select(`
        id,
        item_code,
        location,
        opening_no,
        notes,
        project_id,
        floor_id,
        apt_id,
        floors:floor_id(floor_code),
        apartments:apt_id(apt_number),
        projects:project_id(building_code, name)
      `)
      .eq('project_id', projectId);

    if (scope === 'floor') {
      query = query.in('floor_id', ids);
    } else if (scope === 'apartment') {
      query = query.in('apt_id', ids);
    }

    const { data: items, error: itemsError } = await query;
    if (itemsError) throw itemsError;
    if (!items || items.length === 0) {
      throw new Error('No items found');
    }

    console.log(`Found ${items.length} items`);

    // Process each item and subpart with SHORT tokens
    const labelData: Array<{
      item: Item;
      subpart: string;
      labelId: number;
      scanUrl: string;
      token: string;
    }> = [];

    const targetSubparts = (subparts && subparts.length > 0)
      ? subparts
      : ['01','02','03','04','05'];

    const origin = getOriginFromRequest(req);
    const userSelectedSubparts = subparts && subparts.length > 0;
    
    console.log(`Origin: ${origin}, User selected subparts: ${userSelectedSubparts}, Target: ${targetSubparts.join(',')}`);

    // Build label data with filtering and short tokens
    for (const item of items) {
      for (const sp of targetSubparts) {
        // If user didn't explicitly choose subparts, filter by keywords
        if (!userSelectedSubparts && !itemRequiresSubpart(item, sp)) {
          continue;
        }

        // Short token (base64url ~22 chars) and store only its HMAC hash
        const tokenPlain = randBase64Url(16);
        const tokenHash = await hmacHex(jwtSecret, tokenPlain);

        // Upsert label (store hash only, no expiry)
        const { data: existing } = await supabase
          .from('labels')
          .select('id, revoked_at')
          .eq('item_id', item.id)
          .eq('subpart_code', sp)
          .maybeSingle();

        let labelId: number;
        if (existing && !existing.revoked_at) {
          const { error } = await supabase.from('labels')
            .update({ qr_token_hash: tokenHash, expires_at: null })
            .eq('id', existing.id);
          if (error) throw error;
          labelId = existing.id;
        } else {
          const { data: ins, error } = await supabase.from('labels')
            .insert({ item_id: item.id, subpart_code: sp, qr_token_hash: tokenHash, expires_at: null })
            .select('id').single();
          if (error) throw error;
          labelId = ins!.id;
        }

        const slug = `${item.id}-${sp}`;
        const scanUrl = `${origin}/s/${slug}?t=${encodeURIComponent(tokenPlain)}`;

        labelData.push({
          item: item as Item,
          subpart: sp,
          labelId,
          scanUrl,
          token: tokenPlain,
        });
      }
    }

    console.log(`Generated ${labelData.length} label entries`);

    // Create job for progress tracking
    const { data: job, error: jobErr } = await supabase
      .from('label_jobs')
      .insert({ project_id: projectId, total: labelData.length, done: 0, status: 'running' })
      .select('*').single();
    if (jobErr) throw jobErr;

    let done = 0;
    const PROGRESS_CHUNK = 20;

    // Create PDF
    const preset = LABEL_PRESETS.big;
    const geo = layoutForPreset(preset);

    const pdfDoc = await PDFDocument.create();
    (pdfDoc as any).registerFontkit(fontkit);
    
    const fontBytes = await loadHebFontBytes(supabase);
    const fontBold = await pdfDoc.embedFont(fontBytes, { subset: false });
    
    // Embed Helvetica Bold for Latin/numbers
    const latinFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    // Helper to check if a character is Hebrew
    const isHebrew = (char: string) => {
      const code = char.charCodeAt(0);
      return (code >= 0x0590 && code <= 0x05FF) || // Hebrew block
             (code >= 0xFB1D && code <= 0xFB4F);    // Hebrew presentation forms
    };

    // Helper to split text into Hebrew and non-Hebrew segments
    const splitByScript = (text: string): Array<{ text: string; isHebrew: boolean }> => {
      const segments: Array<{ text: string; isHebrew: boolean }> = [];
      let current = '';
      let currentIsHebrew = false;
      
      for (let i = 0; i < text.length; i++) {
        const char = text[i];
        const charIsHebrew = isHebrew(char);
        
        if (i === 0) {
          current = char;
          currentIsHebrew = charIsHebrew;
        } else if (charIsHebrew === currentIsHebrew) {
          current += char;
        } else {
          segments.push({ text: current, isHebrew: currentIsHebrew });
          current = char;
          currentIsHebrew = charIsHebrew;
        }
      }
      
      if (current) {
        segments.push({ text: current, isHebrew: currentIsHebrew });
      }
      
      return segments;
    };

    // Helper to draw mixed Hebrew/Latin text right-aligned
    const drawMixedRightAligned = (
      page: any,
      text: string,
      rightX: number,
      y: number,
      fontSize: number
    ) => {
      const segments = splitByScript(text);
      
      // Calculate total width
      let totalWidth = 0;
      for (const seg of segments) {
        const font = seg.isHebrew ? fontBold : latinFont;
        totalWidth += font.widthOfTextAtSize(seg.text, fontSize);
      }
      
      // Draw segments from right to left
      let currentX = rightX - totalWidth;
      for (const seg of segments) {
        const font = seg.isHebrew ? fontBold : latinFont;
        page.drawText(seg.text, {
          x: currentX,
          y,
          size: fontSize,
          font,
          color: rgb(0, 0, 0),
        });
        currentX += font.widthOfTextAtSize(seg.text, fontSize);
      }
    };

    let currentPage = pdfDoc.addPage([geo.pageW, geo.pageH]);
    let col = 0, row = 0;

    // Draw labels
    for (let i = 0; i < labelData.length; i++) {
      const labelInfo = labelData[i];

      if (row >= preset.rows && i > 0) {
        currentPage = pdfDoc.addPage([geo.pageW, geo.pageH]);
        row = 0;
        col = 0;
      }

      const x = geo.x0 + col * (geo.w + geo.gx);
      const y = geo.yTop - (row * (geo.h + geo.gy)) - geo.h;

      currentPage.drawRectangle({
        x,
        y,
        width: geo.w,
        height: geo.h,
        borderColor: rgb(0.7, 0.7, 0.7),
        borderWidth: 0.5,
      });

      const item = labelInfo.item;
      const building = (item.project as any)?.building_code || '';
      const floor = (item.floor as any)?.floor_code || '';
      const apt = (item.apartment as any)?.apt_number || '';
      
      const pad = mm2pt(preset.padmm);
      const textRight = x + geo.w - pad;
      let textY = y + geo.h - mm2pt(7);
      const fontSize = preset.fontPt.line;

      drawMixedRightAligned(currentPage, hebrewPdf('בניין ' + building), textRight, textY, fontSize);
      textY -= mm2pt(6);

      drawMixedRightAligned(currentPage, hebrewPdf('קומה ' + String(floor)), textRight, textY, fontSize);
      textY -= mm2pt(6);

      drawMixedRightAligned(currentPage, hebrewPdf('דירה ' + String(apt)), textRight, textY, fontSize);
      textY -= mm2pt(6);

      drawMixedRightAligned(currentPage, hebrewPdf("מס' פרט " + item.item_code), textRight, textY, fontSize);
      textY -= mm2pt(6);

      if (item.location) {
        drawMixedRightAligned(currentPage, hebrewPdf('מיקום בדירה ' + item.location), textRight, textY, fontSize);
      } else if (item.opening_no) {
        drawMixedRightAligned(currentPage, hebrewPdf("מס' פתח " + String(item.opening_no)), textRight, textY, fontSize);
      }

      // QR code
      const qrSize = mm2pt(preset.qrSidemm);
      const qrX = x + pad;
      const qrY = y + geo.h - qrSize - mm2pt(7);
      await drawQrMatrix(currentPage, labelInfo.scanUrl, qrX, qrY, qrSize);

      const subpartName = hebrewPdf(SUBPART_NAMES[labelInfo.subpart] || labelInfo.subpart);
      const subpartWidth = fontBold.widthOfTextAtSize(subpartName, preset.fontPt.subpart);
      currentPage.drawText(subpartName, {
        x: qrX + (qrSize - subpartWidth) / 2,
        y: y + mm2pt(3),
        size: preset.fontPt.subpart,
        font: fontBold,
        color: rgb(0, 0, 0),
      });

      col++;
      if (col >= preset.cols) {
        col = 0;
        row++;
      }

      done++;
      if (done % PROGRESS_CHUNK === 0 || done === labelData.length) {
        await supabase.from('label_jobs').update({ done }).eq('id', job.id);
        console.log(`Progress: ${done}/${labelData.length} labels`);
      }
    }

    console.log('Saving PDF...');
    const pdfBytes = await pdfDoc.save();
    const filePath = `${projectId}/labels-${Date.now()}.pdf`;
    
    console.log('Uploading to storage...');
    const { error: uploadError } = await supabase.storage
      .from('labels')
      .upload(filePath, pdfBytes, {
        contentType: 'application/pdf',
        upsert: true,
      });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      await supabase.from('label_jobs').update({ status: 'error', error: uploadError.message }).eq('id', job.id);
      throw new Error(`Storage upload failed: ${uploadError.message}`);
    }

    console.log(`Uploaded PDF: ${filePath}`);

    // Get signed URL from function (service role)
    const { data: signedUrlData, error: signedError } = await supabase.storage
      .from('labels')
      .createSignedUrl(filePath, 3600);

    if (signedError || !signedUrlData) {
      console.error('Signed URL error:', signedError);
      await supabase.from('label_jobs').update({ status: 'error', error: 'Failed to create signed URL' }).eq('id', job.id);
      throw new Error('Failed to create signed URL');
    }

    // Mark job as complete
    await supabase.from('label_jobs').update({ status: 'done', pdf_path: filePath }).eq('id', job.id);

    return new Response(
      JSON.stringify({
        success: true,
        jobId: job.id,
        pdfUrl: signedUrlData.signedUrl,
        labelCount: labelData.length,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error generating labels:', error);
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
