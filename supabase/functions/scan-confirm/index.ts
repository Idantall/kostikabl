import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Load issue codes
const LOAD_ISSUE_CODES = ['LACK_SHUTTER', 'LACK_WINGS', 'BROKEN_GLASS', 'ANGLES', 'SHUTTER_RAILS'];

// Multi-label loading types
const MULTI_LABEL_TYPES = ['דלת', 'דלת מונובלוק'];

interface ScanRequest {
  slug: string;
  token: string;
  password: string;
  source: 'load' | 'install';
  mode?: 'loading' | 'install'; // deprecated, use source
  installStatus?: 'INSTALLED' | 'PARTIAL' | 'ISSUE';
  issueCode?: string;
  issueNote?: string;
  actorEmail?: string;
  // Load issues payload
  loadIssues?: {
    issue_codes?: string[];
    free_text?: string;
  };
}

interface TokenData {
  pid: number;
  iid: number;
  sp: string;
  lid?: number;
  nonce: string;
  exp: number;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const jwtSecret = Deno.env.get("JWT_SECRET") || "default-secret-change-me";

    const supabase = createClient(supabaseUrl, serviceKey);

    const body: ScanRequest = await req.json();
    let { slug, token, password, source, mode, installStatus, issueCode, issueNote, actorEmail, loadIssues } = body;

    // Normalize source from mode if not provided
    if (!source && mode) {
      source = mode === 'loading' ? 'load' : 'install';
    }
    if (!source) {
      source = 'install'; // default fallback
    }

    console.log(`Processing scan for slug: ${slug}, source: ${source}`);

    // Validate password
    const SCAN_PASSWORD = "1234"; // TODO: Move to environment variable
    if (password !== SCAN_PASSWORD) {
      console.log('Invalid password provided');
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'invalid_password',
          message: 'סיסמה שגויה'
        }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

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

    console.log(`Token hash: ${tokenHash.substring(0, 16)}...`);

    // Parse slug to extract item_id and subpart_code
    const slugParts = slug.split('-');
    if (slugParts.length < 2) {
      throw new Error('Invalid slug format');
    }

    const itemId = parseInt(slugParts[0]);
    let labelSubpartCode = slugParts[1] === '0' ? '00' : slugParts[1]; // Normalize - this is what's on the label
    
    // Normalize virtual subpart codes for label lookup
    if (labelSubpartCode.toUpperCase() === 'IN') {
      labelSubpartCode = 'IN';
    }
    if (labelSubpartCode.toUpperCase() === 'LOAD') {
      labelSubpartCode = 'LOAD';
    }

    // Determine the effective subpart code for scanning based on source
    // This allows using a LOAD label for installation (maps to 'IN') or vice versa
    let scanSubpartCode: string;
    if (source === 'install') {
      // Installation always uses 'IN' virtual subpart regardless of label type
      scanSubpartCode = 'IN';
    } else if (source === 'load') {
      // Loading uses 'LOAD' for single-label items, or the actual subpart for multi-label
      // If scanning an IN label for load, treat it as 'LOAD'
      scanSubpartCode = labelSubpartCode === 'IN' ? 'LOAD' : labelSubpartCode;
    } else {
      scanSubpartCode = labelSubpartCode;
    }

    console.log(`Item ID: ${itemId}, Label Subpart: ${labelSubpartCode}, Scan Subpart: ${scanSubpartCode}, Source: ${source}`);

    // Find label by token hash and verify not revoked
    const { data: label, error: labelError } = await supabase
      .from('labels')
      .select('id, item_id, subpart_code, expires_at, revoked_at, qr_token_hash')
      .eq('qr_token_hash', tokenHash)
      .eq('item_id', itemId)
      .eq('subpart_code', labelSubpartCode)
      .maybeSingle();

    if (labelError) {
      console.error('Label lookup error:', labelError);
      throw new Error('Database error');
    }

    if (!label) {
      console.log('Label not found or token invalid');
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'invalid_token',
          message: 'תווית לא תקפה או פג תוקפה'
        }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Check if revoked
    if (label.revoked_at) {
      console.log('Label revoked at:', label.revoked_at);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'revoked',
          message: 'תווית זו בוטלה'
        }),
        {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Check expiration
    if (label.expires_at) {
      const expiresAt = new Date(label.expires_at);
      if (expiresAt < new Date()) {
        console.log('Label expired at:', label.expires_at);
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: 'expired',
            message: 'תוקף התווית פג'
          }),
          {
            status: 403,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }
    }

    // Get item details including required_codes and item_type
    const { data: item, error: itemError } = await supabase
      .from('items')
      .select('id, project_id, item_code, required_codes, item_type')
      .eq('id', itemId)
      .single();

    if (itemError || !item) {
      console.error('Item not found:', itemError);
      throw new Error('Item not found');
    }

    // Get canonical required codes, normalize them
    const requiredCodes = (item.required_codes || []).map((c: string) => c === '0' ? '00' : c);
    
    // Determine if this is a single-label or multi-label loading item
    const itemType = item.item_type || '';
    const isMultiLabelType = MULTI_LABEL_TYPES.includes(itemType);
    const isInstallScan = scanSubpartCode === 'IN';
    const isSingleLoadScan = scanSubpartCode === 'LOAD';
    
    // Get client IP for tracking (hashed for privacy)
    const clientIP = req.headers.get('x-forwarded-for') || 
                     req.headers.get('cf-connecting-ip') || 
                     'unknown';
    
    const ipHashData = encoder.encode(clientIP + jwtSecret);
    const ipHashBuffer = await crypto.subtle.digest('SHA-256', ipHashData);
    const ipHash = Array.from(new Uint8Array(ipHashBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    // Attempt idempotent insert with source
    const { data: scanInsert, error: scanInsertError } = await supabase
      .from('scans')
      .insert({
        item_id: itemId,
        label_id: label.id,
        subpart_code: scanSubpartCode,
        source,
        ip_hash: ipHash,
      })
      .select('id, scanned_at')
      .maybeSingle();

    let isDuplicate = false;
    let firstScannedAt: string;
    let scanId: number | null = null;

    if (scanInsertError && scanInsertError.code === '23505') {
      // Duplicate scan for this source
      isDuplicate = true;
      console.log(`Duplicate scan detected for source: ${source}`);
      
      // Fetch the original scan timestamp and ID
      const { data: existingScan } = await supabase
        .from('scans')
        .select('id, scanned_at')
        .eq('item_id', itemId)
        .eq('label_id', label.id)
        .eq('subpart_code', scanSubpartCode)
        .eq('source', source)
        .single();
      
      firstScannedAt = existingScan?.scanned_at || new Date().toISOString();
      scanId = existingScan?.id || null;
    } else if (scanInsertError) {
      console.error('Error inserting scan:', scanInsertError);
      throw scanInsertError;
    } else {
      firstScannedAt = scanInsert?.scanned_at || new Date().toISOString();
      scanId = scanInsert?.id || null;
      console.log(`New scan recorded: source=${source}, item=${itemId}, subpart=${scanSubpartCode}`);
    }

    // Compute progress
    let scannedCount: number;
    let requiredCount: number;
    let ready: boolean;

    if (isInstallScan) {
      // Install scans ('IN' subpart): denominator = 1
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
      console.log(`Install progress: ${scannedCount}/${requiredCount}, ready=${ready}`);
    } else if (isSingleLoadScan) {
      // Single-label loading ('LOAD' subpart): check for ANY load scan for this item
      // This handles 'אחר', 'חילוץ', windows, etc. - all single-label items scanned with LOAD
      const { data: loadScans } = await supabase
        .from('scans')
        .select('id')
        .eq('item_id', itemId)
        .eq('source', 'load')
        .limit(1);

      scannedCount = (loadScans && loadScans.length > 0) ? 1 : 0;
      requiredCount = 1;
      ready = scannedCount === 1;
      console.log(`Single-label load progress: ${scannedCount}/${requiredCount}, ready=${ready}`);
    } else {
      // Multi-label loading (door items with specific subpart codes like 01, 02, 03...): use required_codes
      const { data: scannedRows } = await supabase
        .from('scans')
        .select('subpart_code')
        .eq('item_id', itemId)
        .eq('source', source);

      const scannedSet = new Set((scannedRows || []).map(r => r.subpart_code === '0' ? '00' : r.subpart_code));
      scannedCount = requiredCodes.filter((c: string) => scannedSet.has(c)).length;
      requiredCount = requiredCodes.length;
      ready = requiredCount > 0 && scannedCount === requiredCount;
      console.log(`Multi-label load progress for ${source}: ${scannedCount}/${requiredCount}, ready=${ready}`);
    }

    // Handle load issues if provided
    let loadIssuesSaved = false;
    if (source === 'load' && loadIssues && scanId) {
      const hasIssues = (loadIssues.issue_codes && loadIssues.issue_codes.length > 0) || 
                        (loadIssues.free_text && loadIssues.free_text.trim());
      
      if (hasIssues) {
        // Validate issue codes
        const validIssueCodes = (loadIssues.issue_codes || []).filter(c => LOAD_ISSUE_CODES.includes(c));
        
        // Insert load issue record
        const { error: issueInsertError } = await supabase
          .from('load_issues')
          .insert({
            project_id: item.project_id,
            item_id: itemId,
            scan_id: scanId,
            source: 'load',
            issue_codes: validIssueCodes,
            free_text: loadIssues.free_text?.trim() || null,
            created_by_ip_hash: ipHash,
          });

        if (issueInsertError) {
          console.error('Error inserting load issue:', issueInsertError);
          // Don't fail the scan, just log the error
        } else {
          loadIssuesSaved = true;
          console.log(`Load issues saved for item ${itemId}: codes=${validIssueCodes.join(',')}, hasText=${!!loadIssues.free_text}`);
        }
      }
    }

    // Update cached status
    if (!isDuplicate) {
      if (source === 'load') {
        // Check if there are any load issues for this item
        const { data: existingIssues } = await supabase
          .from('load_issues')
          .select('id')
          .eq('item_id', itemId)
          .limit(1);
        
        const hasLoadIssues = (existingIssues && existingIssues.length > 0) || loadIssuesSaved;
        
        if (ready) {
          // Loading complete - set to LOADED or keep tracking issues separately
          await supabase
            .from('items')
            .update({ loading_status_cached: hasLoadIssues ? 'LOADED' : 'LOADED' })
            .eq('id', itemId);
          
          console.log(`Updated loading_status_cached to LOADED for item ${itemId} (has_issues=${hasLoadIssues})`);
        }
      } else if (source === 'install') {
        // Installation: update immediately based on status
        let statusValue: string | null = null;
        
        if (installStatus === 'ISSUE') {
          // Always set to ISSUE immediately when an issue is reported
          statusValue = 'ISSUE';
        } else if (ready) {
          // Only update to INSTALLED/PARTIAL when all parts scanned
          statusValue = installStatus || 'INSTALLED';
        } else {
          // Don't update if not complete and no issue
          statusValue = null;
        }
        
        if (statusValue) {
          await supabase
            .from('items')
            .update({ install_status_cached: statusValue })
            .eq('id', itemId);
          
          console.log(`Updated install_status_cached to ${statusValue} for item ${itemId}`);
        }
      }
    }

    // Record scan event (only for new scans, not duplicates)
    if (!isDuplicate) {
      await supabase
        .from('scan_events')
        .insert({
          project_id: item.project_id,
          item_id: itemId,
          subpart_code: scanSubpartCode,
          label_id: label.id,
          mode: source === 'load' ? 'loading' : 'install',
          source: source,
          installed_status: source === 'install' ? installStatus : null,
          issue_code: source === 'install' ? issueCode : null,
          issue_note: source === 'install' ? issueNote : null,
          actor_email: actorEmail,
          ip_hash: ipHash,
          loading_mark: source === 'load' ? true : null,
        });
      
      console.log(`Scan event recorded for item ${itemId}, source ${source}`);
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

    // Return enriched response
    return new Response(
      JSON.stringify({
        success: true,
        source,
        is_duplicate: isDuplicate,
        first_scanned_at: firstScannedAt,
        item: {
          id: item.id,
          code: item.item_code,
        },
        subpart: {
          code: scanSubpartCode,
        },
        progress: {
          scanned: scannedCount,
          required: requiredCount,
        },
        ready,
        message: isDuplicate 
          ? `נסרק בעבר (${source === 'load' ? 'העמסה' : 'התקנה'})` 
          : 'נסרק בהצלחה',
        // Load issues response
        issues: loadIssuesSaved ? {
          saved: true,
          issue_codes: loadIssues?.issue_codes || [],
          free_text: loadIssues?.free_text || null,
        } : undefined,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Scan confirm error:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: 'server_error',
        message: errorMessage 
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});