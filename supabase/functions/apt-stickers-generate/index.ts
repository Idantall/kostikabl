import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PDFDocument, rgb, StandardFonts } from "https://esm.sh/pdf-lib@1.17.1";
import fontkit from "https://esm.sh/@pdf-lib/fontkit@1.1.1";
import QRCode from "https://esm.sh/qrcode@1.5.3";
// Inline hebrewPdf to avoid cross-function imports
function visualHebrewMixed(input: string): string {
  if (!input) return "";
  const tokens: string[] = [];
  const re = /([\u0590-\u05FF]+)|([0-9]+(?:[.,][0-9]+)*)|([A-Za-z]+)|([^\s\u0590-\u05FFA-Za-z0-9]+)|(\s+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(input))) tokens.push(m[0]);
  if (!tokens.length) return input;
  return tokens.reverse().join("").replace(/\s{2,}/g, " ").trim();
}
function hebrewPdf(text: string): string {
  const BIDI = /[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g;
  const HYPHENS = /[\u05BE\u2010\u2011\u2212\u2013]/g;
  return visualHebrewMixed(text).replace(BIDI, '').replace(HYPHENS, '-');
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const JWT_SECRET = Deno.env.get("JWT_SECRET") || "";
const STORAGE_BUCKET = "assets";
const STORAGE_PATH_BOLD = "fonts/NotoSansHebrew-Bold.ttf";

const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

// mm to PDF points
const mm = (v: number) => v * 2.834645669291339;

// A4
const A4_W = mm(210);
const A4_H = mm(297);

// Round sticker layout: 4cm diameter, 5 cols × 7 rows = 35 per page
const STICKER_D_MM = 40;
const COLS = 5;
const ROWS = 7;
const GAP_X_MM = (210 - COLS * STICKER_D_MM) / (COLS + 1);
const GAP_Y_MM = (297 - ROWS * STICKER_D_MM) / (ROWS + 1);

function randBase64Url(bytes = 16) {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return btoa(String.fromCharCode(...a))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function hmacHex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('');
}

// Draw QR matrix
function drawQrMatrix(page: any, text: string, cx: number, cy: number, size: number) {
  const qr = QRCode.create(text, { errorCorrectionLevel: "M" });
  const cells = qr.modules;
  const count = cells.size;
  const scale = size / count;
  const x0 = cx - size / 2;
  const y0 = cy - size / 2;

  for (let r = 0; r < count; r++) {
    let startCol = -1;
    for (let c = 0; c <= count; c++) {
      const isDark = c < count && cells.get(r, c);
      if (isDark && startCol === -1) startCol = c;
      else if (!isDark && startCol !== -1) {
        page.drawRectangle({
          x: x0 + startCol * scale,
          y: y0 + (count - 1 - r) * scale,
          width: (c - startCol) * scale,
          height: scale,
          color: rgb(0, 0, 0),
          borderWidth: 0,
        });
        startCol = -1;
      }
    }
  }
}

// Load font
let cachedBoldFont: Uint8Array | null = null;
async function loadBoldFont(): Promise<Uint8Array> {
  if (cachedBoldFont) return cachedBoldFont;
  const { data, error } = await admin.storage.from(STORAGE_BUCKET).download(STORAGE_PATH_BOLD);
  if (error || !data) {
    // Try bundled
    try {
      const url = new URL("../labels-generate-chunk/NotoSansHebrew-Bold.ttf", import.meta.url);
      cachedBoldFont = await Deno.readFile(url);
      return cachedBoldFont;
    } catch {
      throw new Error("Bold Hebrew font not found");
    }
  }
  cachedBoldFont = new Uint8Array(await data.arrayBuffer());
  return cachedBoldFont;
}

// Load logo from storage
let cachedLogo: Uint8Array | null = null;
async function loadLogo(): Promise<Uint8Array> {
  if (cachedLogo) return cachedLogo;
  const { data, error } = await admin.storage.from(STORAGE_BUCKET).download("logo/kostika-logo-new.jpg");
  if (error || !data) throw new Error("Logo not found in storage: " + (error?.message || "unknown"));
  cachedLogo = new Uint8Array(await data.arrayBuffer());
  return cachedLogo;
}

function respond(status: number, body: any) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...corsHeaders },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return respond(200, { ok: true });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return respond(401, { error: 'Unauthorized' });

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authErr } = await admin.auth.getUser(token);
    if (authErr || !user) return respond(401, { error: 'Unauthorized' });

    const body = await req.json();
    const { projectId, scope = 'project', floorId } = body;
    if (!projectId) return respond(400, { error: 'projectId required' });

    const clientOrigin = body.clientOrigin || 'https://kostika.lovable.app';

    // Fetch apartments with floor info
    let query = admin
      .from('apartments')
      .select('id, apt_number, floor_id, floors:floor_id(floor_code)')
      .eq('project_id', projectId)
      .order('floor_id')
      .order('apt_number');

    if (scope === 'floor' && floorId) {
      query = query.eq('floor_id', floorId);
    }

    const { data: apartments, error: aptErr } = await query;
    if (aptErr) return respond(500, { error: aptErr.message });
    if (!apartments || apartments.length === 0) {
      return respond(200, { success: true, total: 0, message: 'לא נמצאו דירות' });
    }

    console.log(`[apt-stickers] Generating stickers for ${apartments.length} apartments in project ${projectId}`);

    // Generate tokens and upsert apt_labels
    const aptData: Array<{
      aptId: number;
      aptNumber: string;
      tokenPlain: string;
      scanUrl: string;
    }> = [];

    for (const apt of apartments) {
      const tokenPlain = randBase64Url(16);
      const tokenHash = await hmacHex(JWT_SECRET, tokenPlain);
      const slug = `apt-${projectId}-${apt.id}`;
      const scanUrl = `${clientOrigin}/s/${slug}?t=${encodeURIComponent(tokenPlain)}`;

      // Upsert apt_label
      const { error: upsertErr } = await admin
        .from('apt_labels')
        .upsert({
          project_id: projectId,
          apt_id: apt.id,
          qr_token_hash: tokenHash,
          expires_at: null,
          revoked_at: null,
        }, { onConflict: 'project_id,apt_id' });

      if (upsertErr) {
        console.error(`[apt-stickers] Upsert error for apt ${apt.id}:`, upsertErr);
        continue;
      }

      aptData.push({
        aptId: apt.id,
        aptNumber: apt.apt_number,
        tokenPlain,
        scanUrl,
      });
    }

    if (aptData.length === 0) {
      return respond(200, { success: true, total: 0, message: 'לא נוצרו מדבקות' });
    }

    // Generate PDF
    const pdfDoc = await PDFDocument.create();
    pdfDoc.registerFontkit(fontkit);

    const boldFontBytes = await loadBoldFont();
    const hebFont = await pdfDoc.embedFont(boldFontBytes);
    const latinFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    // Load and embed logo
    const logoBytes = await loadLogo();
    const logoImage = await pdfDoc.embedJpg(logoBytes);

    const splitByScript = (text: string): Array<{ text: string; isHebrew: boolean }> => {
      const chunks = text.match(/[\u0590-\u05FF]+|[^\u0590-\u05FF]+/g) || [];
      return chunks.map((chunk) => ({
        text: chunk,
        isHebrew: /[\u0590-\u05FF]/.test(chunk),
      }));
    };

    const measureMixedWidth = (text: string, fontSize: number): number => {
      return splitByScript(text).reduce((sum, part) => {
        const font = part.isHebrew ? hebFont : latinFont;
        return sum + font.widthOfTextAtSize(part.text, fontSize);
      }, 0);
    };

    const drawMixed = (page: any, text: string, x: number, y: number, fontSize: number) => {
      let cursor = x;
      for (const part of splitByScript(text)) {
        const font = part.isHebrew ? hebFont : latinFont;
        page.drawText(part.text, {
          x: cursor,
          y,
          size: fontSize,
          font,
          color: rgb(0, 0, 0),
        });
        cursor += font.widthOfTextAtSize(part.text, fontSize);
      }
    };

    const stickersPerPage = COLS * ROWS;
    const totalPages = Math.ceil(aptData.length / stickersPerPage);

    for (let pageIdx = 0; pageIdx < totalPages; pageIdx++) {
      const page = pdfDoc.addPage([A4_W, A4_H]);
      const pageApts = aptData.slice(pageIdx * stickersPerPage, (pageIdx + 1) * stickersPerPage);

      for (let i = 0; i < pageApts.length; i++) {
        const apt = pageApts[i];
        const col = i % COLS;
        const row = Math.floor(i / COLS);

        // Center of sticker in mm
        const cxMm = GAP_X_MM + col * (STICKER_D_MM + GAP_X_MM) + STICKER_D_MM / 2;
        const cyMm = GAP_Y_MM + row * (STICKER_D_MM + GAP_Y_MM) + STICKER_D_MM / 2;

        // PDF coords (y flipped)
        const cx = mm(cxMm);
        const cy = A4_H - mm(cyMm);
        const r = mm(STICKER_D_MM / 2);

        // Draw circle border (subtle guide for cutting)
        page.drawCircle({
          x: cx,
          y: cy,
          size: r,
          borderColor: rgb(0.85, 0.85, 0.85),
          borderWidth: 0.5,
          color: undefined,
        });

        // Logo at top of circle - lowered a bit
        const logoW = mm(22);
        const logoAspect = logoImage.height / logoImage.width;
        const logoH = logoW * logoAspect;
        const logoX = cx - logoW / 2;
        const logoY = cy + r - logoH - mm(5); // 5mm from top edge

        page.drawImage(logoImage, {
          x: logoX,
          y: logoY,
          width: logoW,
          height: logoH,
        });

        // QR code centered in the sticker
        const qrSize = mm(18);
        drawQrMatrix(page, apt.scanUrl, cx, cy, qrSize);

        // Apt number at bottom with mixed-font rendering (Hebrew + digits/Latin)
        const fontSize = 9;
        const textY = cy - r + mm(3);
        const aptText = hebrewPdf(`דירה ${String(apt.aptNumber ?? '')}`.trim());
        const textW = measureMixedWidth(aptText, fontSize);
        const textX = cx - textW / 2;

        drawMixed(page, aptText, textX, textY, fontSize);
      }
    }

    const pdfBytes = await pdfDoc.save();

    // Upload to storage
    const filePath = `${projectId}/apt-stickers-${Date.now()}.pdf`;
    const { error: uploadErr } = await admin.storage
      .from('labels')
      .upload(filePath, pdfBytes, {
        contentType: 'application/pdf',
        upsert: true,
      });

    if (uploadErr) {
      console.error('[apt-stickers] Upload error:', uploadErr);
      return respond(500, { error: 'Failed to upload PDF' });
    }

    // Get signed URL
    const { data: signedData } = await admin.storage
      .from('labels')
      .createSignedUrl(filePath, 3600);

    console.log(`[apt-stickers] Generated ${aptData.length} stickers on ${totalPages} pages`);

    return respond(200, {
      success: true,
      total: aptData.length,
      pages: totalPages,
      pdfPath: filePath,
      signedUrl: signedData?.signedUrl || null,
    });
  } catch (e) {
    console.error('[apt-stickers] Error:', e);
    return respond(500, { error: String(e) });
  }
});
