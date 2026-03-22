import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Better error serialization
function errJSON(e: unknown) {
  if (!e) return { message: "Unknown error" };
  if (e instanceof Error) return { message: e.message, stack: e.stack };
  try { return JSON.parse(JSON.stringify(e)); } catch { return { message: String(e) }; }
}

function respond(status: number, body: any) {
  return new Response(JSON.stringify(body), { 
    status, 
    headers: { "content-type": "application/json", ...corsHeaders }
  });
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const JWT_SECRET = Deno.env.get("JWT_SECRET") || "";

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// Use production domain for scan URLs
function getOriginFromRequest(_req: Request): string {
  return 'https://kostika.lovable.app';
}

// Short random token
function randBase64Url(bytes = 16) {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  const b64 = btoa(String.fromCharCode(...a))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return b64;
}

// HMAC helper
async function hmacHex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('');
}

// Exact name mapping (from client template)
// Monoblock no longer includes '04' (מסילות)
const NAME_TO_CODES: Record<string, string[]> = {
  "דלת": ["00","03","04"],
  "דלת מונובלוק": ["01","02","03","05"],
  "חלון": ["00"],
  "ממד": ["01","02"],
  "קיפ": ["00"],
  "חלון מונובלוק": ["01","02"],
};

// IMPORTANT: Door types now get single labels for PDF generation
// but still use required_codes for progress tracking during scanning
// All item types now generate exactly 1 label (LOAD or IN subpart)
// The manual parts confirmation in scan mode handles which codes were scanned

// Check if item type requires single-label loading (now ALL types use single label)
function isSingleLabelLoading(_itemType: string | null | undefined): boolean {
  // All items now get single label - Door/Monoblock handles parts confirmation in scan UI
  return true;
}

// Keyword-based subpart detection (fallback)
const SUBPART_KEYWORDS: Record<string, string[]> = {
  '01': ['משקוף'],
  '02': ['כנף', 'כנפ', 'כנפיים'],
  '03': ['תריס', 'גלילה'],
  '04': ['מסילה', 'מסילות'],
  '05': ['ארגז'],
};

function itemRequiresSubpart(item: any, sp: string): boolean {
  // Use item_type for exact match to known names (preferred over notes which is now height-from-floor)
  const itemType = (item.item_type || '').trim();
  if (itemType && NAME_TO_CODES[itemType]) {
    return NAME_TO_CODES[itemType].includes(sp);
  }
  
  // Fallback to keyword detection in item_code and location (skip notes - it's numeric now)
  const hay = [item.item_code, item.location]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  const kw = SUBPART_KEYWORDS[sp] || [];
  return kw.some(k => hay.includes(k.toLowerCase()));
}

interface GenerateRequest {
  projectId: number;
  scope: 'project' | 'floor' | 'apartment' | 'items';
  ids: number[];
  subparts?: string[];
  mode?: 'load_roll_100x50' | 'load_a4_100x70' | 'install_a4_50x30' | 'install_two_up_roll' | 'install_twin_roll';
}

if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !JWT_SECRET) {
  console.error("[labels-generate-start] Missing env", { 
    SUPABASE_URL: !!SUPABASE_URL, 
    SERVICE_ROLE_KEY: !!SERVICE_ROLE_KEY, 
    JWT_SECRET: !!JWT_SECRET 
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return respond(200, { ok: true });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { projectId, scope, ids = [], subparts = [], mode = 'load_roll_100x50' } = body || {};
    
    // Determine layout and format from mode
    const isInstallMode = mode.startsWith('install_');
    const layout = isInstallMode ? 'install' : 'factory';
    const format = mode; // Store the mode directly as format

    // Use client origin (from frontend) or PUBLIC_APP_URL env var
    const clientOrigin =
      typeof body?.clientOrigin === 'string' && body.clientOrigin.startsWith('http')
        ? body.clientOrigin
        : (Deno.env.get('PUBLIC_APP_URL') || '').replace(/\/+$/,'');

    if (!clientOrigin) {
      return respond(400, { 
        success: false, 
        error: 'Missing app origin: pass "clientOrigin" from the UI or set PUBLIC_APP_URL' 
      });
    }

    console.log("[labels-generate-start] input", { 
      projectId, 
      scope, 
      idsLen: ids?.length, 
      subparts,
      mode
    });

    if (!projectId) {
      return respond(400, { success: false, error: "projectId is required" });
    }

    if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !JWT_SECRET) {
      return respond(500, { success: false, error: "Missing required env vars" });
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return respond(401, { success: false, error: 'Missing authorization header' });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await admin.auth.getUser(token);
    if (authError || !user) {
      console.error("[auth error]", errJSON(authError));
      return respond(401, { success: false, error: 'Unauthorized' });
    }

    console.log(`[labels-generate-start] Starting job for project ${projectId}, scope: ${scope}`);

    // Query items based on scope - include item_type for single-label decision
    let query = admin
      .from('items')
      .select(`
        id,
        item_code,
        location,
        opening_no,
        notes,
        item_type,
        project_id,
        floor_id,
        apt_id,
        floors:floor_id(floor_code),
        apartments:apt_id(apt_number),
        projects:project_id(name, building_code)
      `)
      .eq('project_id', projectId);

    if (scope === 'items' && Array.isArray(ids) && ids.length) {
      query = query.in('id', ids);
    } else if (scope === 'floor' && Array.isArray(ids) && ids.length) {
      query = query.in('floor_id', ids);
    } else if (scope === 'apartment' && Array.isArray(ids) && ids.length) {
      query = query.in('apt_id', ids);
    }

    const { data: rawItems, error: itemsError } = await query;
    if (itemsError) {
      console.error('[items query error]', errJSON(itemsError));
      return respond(500, { success: false, error: itemsError.message });
    }

    if (!rawItems || rawItems.length === 0) {
      return respond(200, { 
        success: true, 
        jobId: null, 
        total: 0, 
        message: 'No items found for selection.' 
      });
    }

    // Preserve the order from the incoming ids array when scope is 'items'
    let items = rawItems;
    if (scope === 'items' && Array.isArray(ids) && ids.length) {
      const idOrder = new Map(ids.map((id, idx) => [id, idx]));
      items = [...rawItems].sort((a, b) => {
        const orderA = idOrder.get(a.id) ?? Infinity;
        const orderB = idOrder.get(b.id) ?? Infinity;
        return orderA - orderB;
      });
    }

    console.log(`[labels-generate-start] Found ${items.length} items`);

    // Build label data
    const labelData: Array<{
      itemId: number;
      subpart: string;
      scanUrl: string;
      tokenPlain: string;
    }> = [];

    const t0 = Date.now();

    // Prepare all label specs (without DB operations yet)
    const labelSpecs: Array<{
      itemId: number;
      subpart: string;
      tokenPlain: string;
      tokenHash: string;
      scanUrl: string;
    }> = [];

    // Install layout: one label per item with virtual 'IN' subpart
    if (layout === 'install') {
      console.log(`[labels-generate-start] Install mode: generating one label per item with 'IN' subpart`);
      
      for (const item of items) {
        const sp = 'IN'; // Virtual install subpart
        const tokenPlain = randBase64Url(16);
        const tokenHash = await hmacHex(JWT_SECRET, tokenPlain);
        const slug = `${item.id}-${sp}`;
        const scanUrl = `${clientOrigin}/s/${slug}?t=${encodeURIComponent(tokenPlain)}&s=install`;

        labelSpecs.push({ itemId: item.id, subpart: sp, tokenPlain, tokenHash, scanUrl });
      }
    } else {
      // Factory (loading) layout
      // Single-label for all items EXCEPT דלת and דלת מונובלוק
      const targetSubparts = (subparts && subparts.length > 0)
        ? subparts
        : ['00', '01', '02', '03', '04', '05'];

      const userSelectedSubparts = subparts && subparts.length > 0;

      console.log(`[labels-generate-start] Factory mode, Origin: ${clientOrigin}, User selected: ${userSelectedSubparts}`);

      for (const item of items) {
        const itemType = item.item_type || '';
        const singleLabel = isSingleLabelLoading(itemType);
        
        if (singleLabel) {
          // Single-label loading: create one label with 'LOAD' virtual subpart
          const tokenPlain = randBase64Url(16);
          const tokenHash = await hmacHex(JWT_SECRET, tokenPlain);
          const slug = `${item.id}-LOAD`;
          const scanUrl = `${clientOrigin}/s/${slug}?t=${encodeURIComponent(tokenPlain)}&s=load`;

          labelSpecs.push({ itemId: item.id, subpart: 'LOAD', tokenPlain, tokenHash, scanUrl });
          console.log(`[single-label] Item ${item.id} (${itemType}) -> LOAD subpart`);
        } else {
          // Multi-label loading: create per-subpart labels
          const notes = (item.notes || '').trim();
          const mappedCodes = notes && NAME_TO_CODES[notes] ? NAME_TO_CODES[notes] : null;
          
          for (const sp of targetSubparts) {
            if (userSelectedSubparts) {
              // User explicitly chose subparts, include them all
            } else if (mappedCodes) {
              if (!mappedCodes.includes(sp)) continue;
            } else if (!itemRequiresSubpart(item, sp)) {
              continue;
            }

            const tokenPlain = randBase64Url(16);
            const tokenHash = await hmacHex(JWT_SECRET, tokenPlain);
            const slug = `${item.id}-${sp}`;
            const scanUrl = `${clientOrigin}/s/${slug}?t=${encodeURIComponent(tokenPlain)}&s=load`;

            labelSpecs.push({ itemId: item.id, subpart: sp, tokenPlain, tokenHash, scanUrl });
          }
          console.log(`[multi-label] Item ${item.id} (${itemType}) -> ${mappedCodes?.length || 'detected'} subparts`);
        }
      }
    }

    console.log(`[labels-generate-start] Prepared ${labelSpecs.length} label specs in ${Date.now() - t0}ms`);

    if (labelSpecs.length === 0) {
      return respond(200, { 
        success: true, 
        jobId: null, 
        total: 0, 
        message: 'No labels to generate' 
      });
    }

    // Bulk fetch all existing labels for these item/subpart pairs
    const itemIds = [...new Set(labelSpecs.map(s => s.itemId))];
    const { data: existingLabels, error: existingErr } = await admin
      .from('labels')
      .select('id, item_id, subpart_code, revoked_at')
      .in('item_id', itemIds);

    if (existingErr) {
      console.error('[existing labels query error]', errJSON(existingErr));
      return respond(500, { success: false, error: existingErr.message });
    }

    console.log(`[labels-generate-start] Found ${existingLabels?.length || 0} existing labels`);

    // Build a map of existing labels
    const existingMap = new Map<string, any>();
    (existingLabels || []).forEach(lbl => {
      existingMap.set(`${lbl.item_id}-${lbl.subpart_code}`, lbl);
    });

    // Prepare bulk inserts and updates
    const toInsert: any[] = [];
    const toUpdate: any[] = [];

    for (const spec of labelSpecs) {
      const key = `${spec.itemId}-${spec.subpart}`;
      const existing = existingMap.get(key);

      if (existing && !existing.revoked_at) {
        toUpdate.push({
          id: existing.id,
          qr_token_hash: spec.tokenHash,
          expires_at: null
        });
      } else {
        toInsert.push({
          item_id: spec.itemId,
          subpart_code: spec.subpart,
          qr_token_hash: spec.tokenHash,
          expires_at: null
        });
      }

      labelData.push({
        itemId: spec.itemId,
        subpart: spec.subpart,
        scanUrl: spec.scanUrl,
        tokenPlain: spec.tokenPlain
      });
    }

    // Bulk insert new labels
    if (toInsert.length > 0) {
      const { error: insErr } = await admin.from('labels').insert(toInsert);
      if (insErr) {
        console.error('[bulk insert error]', errJSON(insErr));
        return respond(500, { success: false, error: insErr.message });
      }
      console.log(`[labels-generate-start] Inserted ${toInsert.length} new labels`);
    }

    // Bulk update existing labels (Supabase doesn't support bulk update by id array, do in chunks)
    if (toUpdate.length > 0) {
      for (const upd of toUpdate) {
        const { error: upErr } = await admin.from('labels')
          .update({ qr_token_hash: upd.qr_token_hash, expires_at: upd.expires_at })
          .eq('id', upd.id);
        if (upErr) {
          console.error('[update error]', errJSON(upErr));
          return respond(500, { success: false, error: upErr.message });
        }
      }
      console.log(`[labels-generate-start] Updated ${toUpdate.length} existing labels`);
    }

    console.log(`[labels-generate-start] Built labels`, { 
      items: items.length, 
      labels: labelData.length, 
      inserts: toInsert.length,
      updates: toUpdate.length,
      ms: Date.now() - t0 
    });


    // Create job
    const filePath = `${projectId}/labels-${Date.now()}.pdf`;
    const { data: job, error: jobErr } = await admin
      .from('label_jobs')
      .insert({
        project_id: projectId,
        total: labelData.length,
        done: 0,
        status: 'running',
        pdf_path: filePath,
        layout,
        format
      })
      .select('*')
      .single();

    if (jobErr) {
      console.error('[job insert error]', errJSON(jobErr));
      return respond(500, { success: false, error: jobErr.message });
    }

    console.log(`[labels-generate-start] Created job ${job.id}`);

    // Insert label_job_items in chunks to avoid payload size issues
    const CHUNK_SIZE = 500;
    for (let i = 0; i < labelData.length; i += CHUNK_SIZE) {
      const slice = labelData.slice(i, i + CHUNK_SIZE).map((ld, idx) => ({
        job_id: job.id,
        ord: i + idx,
        item_id: ld.itemId,
        subpart_code: ld.subpart,
        scan_url: ld.scanUrl,
        token_plain: ld.tokenPlain,
        rendered: false
      }));

      const { error: bulkErr } = await admin
        .from('label_job_items')
        .insert(slice);

      if (bulkErr) {
        console.error('[job_items insert error]', errJSON(bulkErr));
        return respond(500, { success: false, error: bulkErr.message });
      }
    }

    console.log(`[labels-generate-start] Inserted ${labelData.length} job items`);

    // Pre-create signed URL (it will be valid once PDF is uploaded)
    const { data: signedData, error: signedError } = await admin.storage
      .from('labels')
      .createSignedUrl(filePath, 3600);

    if (signedError) {
      console.warn('[signed url warning]', errJSON(signedError));
    }

    return respond(200, {
      success: true,
      jobId: job.id,
      total: labelData.length,
      filePath,
      signedUrl: signedData?.signedUrl || null
    });

  } catch (e) {
    console.error('[labels-generate-start] fatal error', errJSON(e));
    return respond(500, { success: false, error: errJSON(e) });
  }
});