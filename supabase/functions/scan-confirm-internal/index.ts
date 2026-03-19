import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Multi-label loading types
const MULTI_LABEL_TYPES = ['דלת', 'דלת מונובלוק'];

interface ConfirmRequest {
  project_id: number;
  slug: string;
  token: string;
  source: 'load' | 'install';
  // Optional: present_codes for Door/Monoblock manual parts confirmation
  present_codes?: string[];
  // Optional: load issues for reporting problems during loading
  load_issues?: {
    issue_codes: string[];
    free_text?: string;
  };
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
        JSON.stringify({ status: 'error', message: 'Authorization required' }),
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
        JSON.stringify({ status: 'error', message: 'Invalid token' }),
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
        JSON.stringify({ status: 'error', message: 'User not authorized' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body: ConfirmRequest = await req.json();
    const { project_id, slug, token, source, present_codes, load_issues } = body;

    console.log(`Confirm request: user=${user.email}, project=${project_id}, slug=${slug}, source=${source}, present_codes=${present_codes?.join(',')}, load_issues=${load_issues ? JSON.stringify(load_issues) : 'none'}`);

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
        JSON.stringify({ status: 'error', message: 'Invalid QR format' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const itemId = parseInt(slugParts[0]);
    let subpartCode = slugParts[1] === '0' ? '00' : slugParts[1];
    
    // Normalize virtual subpart codes
    if (subpartCode.toUpperCase() === 'IN') subpartCode = 'IN';
    if (subpartCode.toUpperCase() === 'LOAD') subpartCode = 'LOAD';

    console.log(`Parsed: itemId=${itemId}, subpart=${subpartCode}`);

    // Find label by token hash and verify not revoked
    const { data: label, error: labelError } = await supabase
      .from('labels')
      .select('id, item_id, subpart_code, expires_at, revoked_at')
      .eq('qr_token_hash', tokenHash)
      .eq('item_id', itemId)
      .eq('subpart_code', subpartCode)
      .maybeSingle();

    if (labelError) {
      console.error('Label lookup error:', labelError);
      throw new Error('Database error');
    }

    if (!label) {
      console.log('Label not found or token invalid');
      return new Response(
        JSON.stringify({ status: 'error', message: 'QR code not valid' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if revoked
    if (label.revoked_at) {
      return new Response(
        JSON.stringify({ status: 'error', message: 'Label revoked' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check expiration
    if (label.expires_at && new Date(label.expires_at) < new Date()) {
      return new Response(
        JSON.stringify({ status: 'error', message: 'Label expired' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get item details
    const { data: item, error: itemError } = await supabase
      .from('items')
      .select('id, project_id, item_code, required_codes, item_type')
      .eq('id', itemId)
      .single();

    if (itemError || !item) {
      console.error('Item not found:', itemError);
      return new Response(
        JSON.stringify({ status: 'error', message: 'Item not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify item belongs to requested project
    if (item.project_id !== project_id) {
      return new Response(
        JSON.stringify({ status: 'error', message: 'Item belongs to different project' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if Door/Monoblock type requires present_codes for loading
    const itemType = item.item_type || '';
    const isDoorType = MULTI_LABEL_TYPES.includes(itemType);
    const isSingleLoadLabel = subpartCode === 'LOAD';
    
    // For Door/Monoblock with LOAD label and loading source, require present_codes
    if (isDoorType && isSingleLoadLabel && source === 'load') {
      if (!present_codes || present_codes.length === 0) {
        return new Response(
          JSON.stringify({ status: 'error', message: 'Parts selection required for door items' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Get client IP for tracking
    const clientIP = req.headers.get('x-forwarded-for') || 
                     req.headers.get('cf-connecting-ip') || 
                     'unknown';
    const ipHashData = encoder.encode(clientIP + jwtSecret);
    const ipHashBuffer = await crypto.subtle.digest('SHA-256', ipHashData);
    const ipHash = Array.from(new Uint8Array(ipHashBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    // Determine which codes to record scans for
    // For Door/Monoblock with LOAD label: use present_codes
    // For other items: use the label's subpart_code
    const codesToRecord: string[] = (isDoorType && isSingleLoadLabel && source === 'load' && present_codes)
      ? present_codes.map((c: string) => c === '0' ? '00' : c)
      : [subpartCode];

    console.log(`Codes to record: ${codesToRecord.join(', ')}`);

    let totalNewScans = 0;
    let totalDuplicates = 0;
    let firstScannedAt: string = new Date().toISOString();
    let firstScanId: number | null = null;

    // Insert scans for each code
    for (const code of codesToRecord) {
      const { data: scanInsert, error: scanInsertError } = await supabase
        .from('scans')
        .insert({
          item_id: itemId,
          label_id: label.id,
          subpart_code: code,
          source,
          ip_hash: ipHash,
        })
        .select('id, scanned_at')
        .maybeSingle();

      if (scanInsertError && scanInsertError.code === '23505') {
        totalDuplicates++;
        console.log(`Duplicate scan detected for code: ${code}`);
      } else if (scanInsertError) {
        console.error('Error inserting scan:', scanInsertError);
        throw scanInsertError;
      } else {
        totalNewScans++;
        if (scanInsert?.scanned_at) {
          firstScannedAt = scanInsert.scanned_at;
        }
        if (scanInsert?.id && !firstScanId) {
          firstScanId = scanInsert.id;
        }
        console.log(`New scan recorded: source=${source}, item=${itemId}, code=${code}`);

        // Record scan event for new scans
        await supabase
          .from('scan_events')
          .insert({
            project_id: item.project_id,
            item_id: itemId,
            subpart_code: code,
            label_id: label.id,
            mode: source === 'load' ? 'loading' : 'install',
            source: source,
            loading_mark: source === 'load' ? true : null,
            actor_email: user.email,
            ip_hash: ipHash,
          });
        console.log(`Scan event recorded for item ${itemId}, code ${code}`);
      }
    }

    // Save load issues if provided (only for load source and if there are any issues)
    let savedIssues: { saved: boolean; issue_codes: string[]; free_text: string | null } | null = null;
    if (source === 'load' && load_issues && (load_issues.issue_codes.length > 0 || load_issues.free_text)) {
      // Get a scan ID to link issues to - either from this request or find existing
      let scanIdForIssues = firstScanId;
      if (!scanIdForIssues) {
        // If all scans were duplicates, find an existing scan
        const { data: existingScan } = await supabase
          .from('scans')
          .select('id')
          .eq('item_id', itemId)
          .eq('source', 'load')
          .limit(1)
          .maybeSingle();
        scanIdForIssues = existingScan?.id || null;
      }

      if (scanIdForIssues) {
        const { error: issueError } = await supabase
          .from('load_issues')
          .insert({
            scan_id: scanIdForIssues,
            item_id: itemId,
            project_id: item.project_id,
            source: 'internal',
            issue_codes: load_issues.issue_codes,
            free_text: load_issues.free_text || null,
            created_by_ip_hash: ipHash,
          });

        if (issueError) {
          console.error('Error saving load issues:', issueError);
        } else {
          savedIssues = {
            saved: true,
            issue_codes: load_issues.issue_codes,
            free_text: load_issues.free_text || null,
          };
          console.log(`Load issues saved for item ${itemId}: ${load_issues.issue_codes.join(', ')}`);
        }
      } else {
        console.log('No scan ID available to link load issues');
      }
    }

    const isDuplicate = totalNewScans === 0 && totalDuplicates > 0;

    // Calculate progress
    const requiredCodes = (item.required_codes || []).map((c: string) => c === '0' ? '00' : c);
    const isInstallLabel = subpartCode === 'IN';

    let scannedCount: number;
    let requiredCount: number;
    let ready: boolean;

    if (isInstallLabel) {
      // Install scans: denominator = 1
      const { data: installScans } = await supabase
        .from('scans')
        .select('id')
        .eq('item_id', itemId)
        .eq('subpart_code', 'IN')
        .eq('source', 'install')
        .limit(1);
      scannedCount = (installScans && installScans.length > 0) ? 1 : 0;
      requiredCount = 1;
      ready = scannedCount === 1;
    } else if (isDoorType && isSingleLoadLabel && source === 'load') {
      // Door/Monoblock with LOAD label and present_codes: track by required_codes
      // Scans are recorded with specific subpart codes (01, 02, 03...), not LOAD
      const { data: scannedRows } = await supabase
        .from('scans')
        .select('subpart_code')
        .eq('item_id', itemId)
        .eq('source', 'load');
      const scannedSet = new Set((scannedRows || []).map((r: any) => r.subpart_code === '0' ? '00' : r.subpart_code));
      scannedCount = requiredCodes.filter((c: string) => scannedSet.has(c)).length;
      requiredCount = requiredCodes.length;
      ready = requiredCount > 0 && scannedCount === requiredCount;
      console.log(`Door loading progress: ${scannedCount}/${requiredCount}, scannedSet=${[...scannedSet].join(',')}`);
    } else if (isSingleLoadLabel) {
      // Single-label items (non-door) with LOAD subpart: denominator = 1
      // Check for ANY load scan: either LOAD or specific codes
      const { data: loadScans } = await supabase
        .from('scans')
        .select('id')
        .eq('item_id', itemId)
        .eq('source', 'load')
        .limit(1);
      scannedCount = (loadScans && loadScans.length > 0) ? 1 : 0;
      requiredCount = 1;
      ready = scannedCount === 1;
      console.log(`Single-label load progress: ${scannedCount}/${requiredCount}`);
    } else {
      // Multi-label items with specific subpart codes (01, 02, 03...): count by required_codes
      const { data: scannedRows } = await supabase
        .from('scans')
        .select('subpart_code')
        .eq('item_id', itemId)
        .eq('source', source);
      const scannedSet = new Set((scannedRows || []).map((r: any) => r.subpart_code === '0' ? '00' : r.subpart_code));
      scannedCount = requiredCodes.filter((c: string) => scannedSet.has(c)).length;
      requiredCount = requiredCodes.length;
      ready = requiredCount > 0 && scannedCount === requiredCount;
    }

    // Update cached status for new scans
    if (totalNewScans > 0 && source === 'load') {
      if (ready) {
        await supabase
          .from('items')
          .update({ loading_status_cached: 'LOADED' })
          .eq('id', itemId);
        console.log(`Updated loading_status_cached to LOADED for item ${itemId}`);
      } else if (scannedCount > 0) {
        await supabase
          .from('items')
          .update({ loading_status_cached: 'PARTIAL' })
          .eq('id', itemId);
        console.log(`Updated loading_status_cached to PARTIAL for item ${itemId}`);
      }
    }

    // Broadcast realtime events
    const channel = supabase.channel(`project:${item.project_id}`);
    
    await channel.send({
      type: 'broadcast',
      event: source === 'load' ? 'load.progress' : 'install.progress',
      payload: {
        item_id: itemId,
        item_code: item.item_code,
        scanned: scannedCount,
        required: requiredCount,
        ready,
      },
    });

    if (ready) {
      await channel.send({
        type: 'broadcast',
        event: source === 'load' ? 'load.ready' : 'install.ready',
        payload: {
          item_id: itemId,
          item_code: item.item_code,
        },
      });
    }

    // Return response
    return new Response(
      JSON.stringify({
        status: isDuplicate ? 'duplicate' : 'ok',
        message: isDuplicate ? 'Already scanned' : (savedIssues ? 'Scan confirmed with issues' : 'Scan confirmed'),
        item: {
          id: item.id,
          code: item.item_code,
        },
        subpart: subpartCode,
        progress: {
          scanned: scannedCount,
          required: requiredCount,
        },
        ready,
        first_scanned_at: firstScannedAt,
        issues: savedIssues,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Confirm error:', error);
    return new Response(
      JSON.stringify({ status: 'error', message: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
