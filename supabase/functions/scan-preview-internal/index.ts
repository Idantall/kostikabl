import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Multi-label loading types
const MULTI_LABEL_TYPES = ['דלת', 'דלת מונובלוק'];

interface PreviewRequest {
  project_id: number;
  slug: string;
  token: string;
  source: 'load' | 'install';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const jwtSecret = Deno.env.get("JWT_SECRET") || "default-secret-change-me";

    // Verify JWT from Authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.log('Missing/invalid Authorization header');
      return new Response(
        JSON.stringify({ success: false, error: 'unauthorized', message: 'Authorization required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseAuth = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } }
    });

    // Verify the user is authenticated
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
    if (authError || !user) {
      console.error('Auth error:', authError);
      return new Response(
        JSON.stringify({ success: false, error: 'unauthorized', message: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if user email is in allowed list using service role
    const supabase = createClient(supabaseUrl, serviceKey);
    const { data: allowedEmail } = await supabase
      .from('allowed_emails')
      .select('email')
      .eq('email', user.email)
      .maybeSingle();

    if (!allowedEmail) {
      console.log(`User ${user.email} not in allowed list`);
      return new Response(
        JSON.stringify({ success: false, error: 'forbidden', message: 'User not authorized' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body: PreviewRequest = await req.json();
    const { project_id, slug, token, source } = body;

    console.log(`Preview request: project=${project_id}, slug=${slug}, source=${source}`);

    // Hash the provided token to compare with stored hash
    const encoder = new TextEncoder();
    const tokenData = encoder.encode(token);
    const keyData = encoder.encode(jwtSecret);
    
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    
    const signature = await crypto.subtle.sign('HMAC', cryptoKey, tokenData);
    const tokenHash = Array.from(new Uint8Array(signature))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    // Parse slug to extract item_id and subpart_code
    const slugParts = slug.split('-');
    if (slugParts.length < 2) {
      return new Response(
        JSON.stringify({ success: false, error: 'invalid_slug', message: 'Invalid QR format' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const itemId = parseInt(slugParts[0]);
    let subpartCode = slugParts[1] === '0' ? '00' : slugParts[1];
    
    // Normalize virtual subpart codes
    if (subpartCode.toUpperCase() === 'IN') subpartCode = 'IN';
    if (subpartCode.toUpperCase() === 'LOAD') subpartCode = 'LOAD';

    console.log(`Parsed: itemId=${itemId}, subpart=${subpartCode}`);
    console.log(`Token hash (first 16): ${tokenHash.substring(0, 16)}...`);

    // Find label by token hash and verify not revoked
    const { data: label, error: labelError } = await supabase
      .from('labels')
      .select('id, item_id, subpart_code, expires_at, revoked_at, qr_token_hash')
      .eq('qr_token_hash', tokenHash)
      .eq('item_id', itemId)
      .eq('subpart_code', subpartCode)
      .maybeSingle();

    if (labelError) {
      console.error('Label lookup error:', labelError);
      throw new Error('Database error');
    }

    if (!label) {
      // Debug: fetch label by item_id and subpart to see what hash we have
      const { data: debugLabel } = await supabase
        .from('labels')
        .select('id, qr_token_hash')
        .eq('item_id', itemId)
        .eq('subpart_code', subpartCode)
        .maybeSingle();
      
      console.log(`Label not found. Token hash provided: ${tokenHash.substring(0, 16)}..., DB hash: ${debugLabel?.qr_token_hash?.substring(0, 16) || 'no label found'}...`);
      
      return new Response(
        JSON.stringify({ success: false, error: 'invalid_token', message: 'QR code not valid' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if revoked
    if (label.revoked_at) {
      return new Response(
        JSON.stringify({ success: false, error: 'revoked', message: 'Label revoked' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check expiration
    if (label.expires_at && new Date(label.expires_at) < new Date()) {
      return new Response(
        JSON.stringify({ success: false, error: 'expired', message: 'Label expired' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get item details with floor and apartment
    const { data: item, error: itemError } = await supabase
      .from('items')
      .select(`
        id, project_id, item_code, required_codes, item_type, location, opening_no,
        motor_side, loading_status_cached, install_status_cached,
        floors(floor_code),
        apartments(apt_number)
      `)
      .eq('id', itemId)
      .single();

    if (itemError || !item) {
      console.error('Item not found:', itemError);
      return new Response(
        JSON.stringify({ success: false, error: 'not_found', message: 'Item not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify item belongs to requested project
    if (item.project_id !== project_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'wrong_project', message: 'Item belongs to different project' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Calculate progress
    const requiredCodes = (item.required_codes || []).map((c: string) => c === '0' ? '00' : c);
    const itemType = item.item_type || '';
    const isMultiLabelType = MULTI_LABEL_TYPES.includes(itemType);
    const isInstallLabel = subpartCode === 'IN';
    const isSingleLoadLabel = subpartCode === 'LOAD';

    let scannedCount: number;
    let requiredCount: number;

    if (isInstallLabel) {
      const { data: installScans } = await supabase
        .from('scans')
        .select('id')
        .eq('item_id', itemId)
        .eq('subpart_code', 'IN')
        .eq('source', 'install')
        .limit(1);
      scannedCount = (installScans && installScans.length > 0) ? 1 : 0;
      requiredCount = 1;
    } else if (isSingleLoadLabel) {
      const { data: loadScans } = await supabase
        .from('scans')
        .select('id')
        .eq('item_id', itemId)
        .eq('subpart_code', 'LOAD')
        .eq('source', 'load')
        .limit(1);
      scannedCount = (loadScans && loadScans.length > 0) ? 1 : 0;
      requiredCount = 1;
    } else {
      const { data: scannedRows } = await supabase
        .from('scans')
        .select('subpart_code')
        .eq('item_id', itemId)
        .eq('source', source);
      const scannedSet = new Set((scannedRows || []).map((r: any) => r.subpart_code === '0' ? '00' : r.subpart_code));
      scannedCount = requiredCodes.filter((c: string) => scannedSet.has(c)).length;
      requiredCount = requiredCodes.length;
    }

    // Determine if this is a Door/Monoblock type that requires manual parts confirmation
    const isDoorType = MULTI_LABEL_TYPES.includes(itemType);
    
    // Return preview data with required_codes for Door/Monoblock types
    return new Response(
      JSON.stringify({
        success: true,
        item: {
          id: item.id,
          code: item.item_code,
          type: item.item_type,
          location: item.location || item.opening_no || null,
          motor_side: item.motor_side,
          floor: (item.floors as any)?.floor_code || null,
          apartment: (item.apartments as any)?.apt_number || null,
          loading_status: item.loading_status_cached,
          install_status: item.install_status_cached,
          // Include required_codes for Door/Monoblock manual confirmation
          required_codes: isDoorType ? requiredCodes : null,
        },
        label: {
          id: label.id,
          subpart_code: subpartCode,
        },
        progress: {
          scanned: scannedCount,
          required: requiredCount,
          complete: requiredCount > 0 && scannedCount >= requiredCount,
        },
        // Flag to indicate manual parts confirmation is needed
        requires_parts_confirmation: isDoorType && source === 'load',
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Preview error:', error);
    return new Response(
      JSON.stringify({ success: false, error: 'server_error', message: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
