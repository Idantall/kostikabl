import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SCAN_PASSWORD = "1234";

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const jwtSecret = Deno.env.get("JWT_SECRET") || "default-secret-change-me";
    const supabase = createClient(supabaseUrl, serviceKey);

    const body = await req.json();
    const { slug, token, password, selectedItemIds, installStatus, issueCode, issueNote, actorEmail } = body;

    // Validate password
    if (password !== SCAN_PASSWORD) {
      return new Response(
        JSON.stringify({ success: false, error: 'invalid_password', message: 'סיסמה שגויה' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse slug: apt-{projectId}-{aptId}
    const match = slug?.match(/^apt-(\d+)-(\d+)$/);
    if (!match) {
      return new Response(
        JSON.stringify({ success: false, error: 'invalid_slug', message: 'קוד QR לא תקף' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const projectId = parseInt(match[1]);
    const aptId = parseInt(match[2]);

    // Verify token via HMAC
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey('raw', enc.encode(jwtSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sig = await crypto.subtle.sign('HMAC', key, enc.encode(token));
    const tokenHash = [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('');

    // Look up apt_label
    const { data: aptLabel, error: labelErr } = await supabase
      .from('apt_labels')
      .select('id, project_id, apt_id, expires_at, revoked_at')
      .eq('qr_token_hash', tokenHash)
      .eq('project_id', projectId)
      .eq('apt_id', aptId)
      .maybeSingle();

    if (labelErr || !aptLabel) {
      console.error('Label lookup error:', labelErr);
      return new Response(
        JSON.stringify({ success: false, error: 'invalid_token', message: 'קוד QR לא תקף או פג תוקף' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (aptLabel.revoked_at) {
      return new Response(
        JSON.stringify({ success: false, error: 'revoked', message: 'מדבקה בוטלה' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (aptLabel.expires_at && new Date(aptLabel.expires_at) < new Date()) {
      return new Response(
        JSON.stringify({ success: false, error: 'expired', message: 'מדבקה פגת תוקף' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // If no selectedItemIds, return the apartment items for selection (preview mode)
    if (!selectedItemIds || selectedItemIds.length === 0) {
      // Fetch apartment info
      const { data: apt } = await supabase
        .from('apartments')
        .select('id, apt_number, floor_id, floors:floor_id(floor_code)')
        .eq('id', aptId)
        .single();

      // Fetch items in this apartment
      const { data: items, error: itemsErr } = await supabase
        .from('items')
        .select('id, item_code, item_type, location, opening_no, width, height, install_status_cached')
        .eq('project_id', projectId)
        .eq('apt_id', aptId)
        .order('item_code');

      if (itemsErr) {
        console.error('Items fetch error:', itemsErr);
        return new Response(
          JSON.stringify({ success: false, error: 'db_error', message: 'שגיאה בטעינת פריטים' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          mode: 'preview',
          apartment: {
            id: apt?.id,
            number: apt?.apt_number,
            floor: (apt?.floors as any)?.floor_code || '',
          },
          items: (items || []).map(i => ({
            id: i.id,
            code: i.item_code,
            type: i.item_type,
            location: i.location,
            openingNo: i.opening_no,
            width: i.width,
            height: i.height,
            installStatus: i.install_status_cached,
          })),
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Process install confirmation for selected items
    const clientIP = req.headers.get('x-forwarded-for') || req.headers.get('cf-connecting-ip') || 'unknown';
    const ipHashData = enc.encode(clientIP + jwtSecret);
    const ipHashBuffer = await crypto.subtle.digest('SHA-256', ipHashData);
    const ipHash = [...new Uint8Array(ipHashBuffer)].map(b => b.toString(16).padStart(2, '0')).join('');

    let confirmedCount = 0;
    let duplicateCount = 0;
    const confirmedItems: Array<{ id: number; code: string }> = [];

    for (const itemId of selectedItemIds) {
      // Verify item belongs to this apt and project
      const { data: item } = await supabase
        .from('items')
        .select('id, item_code, project_id, apt_id')
        .eq('id', itemId)
        .eq('project_id', projectId)
        .eq('apt_id', aptId)
        .maybeSingle();

      if (!item) {
        console.log(`Item ${itemId} not found in apt ${aptId}`);
        continue;
      }

      // Insert scan record (idempotent via unique constraint on item_id+subpart_code+source)
      const { data: scanInsert, error: scanErr } = await supabase
        .from('scans')
        .insert({
          item_id: itemId,
          subpart_code: 'IN',
          source: 'install',
          ip_hash: ipHash,
        })
        .select('id, scanned_at')
        .maybeSingle();

      if (scanErr && scanErr.code === '23505') {
        duplicateCount++;
        continue;
      } else if (scanErr) {
        console.error(`Scan insert error for item ${itemId}:`, scanErr);
        continue;
      }

      confirmedCount++;
      confirmedItems.push({ id: item.id, code: item.item_code });

      // Record scan event
      const resolvedStatus = installStatus || 'INSTALLED';
      await supabase
        .from('scan_events')
        .insert({
          project_id: projectId,
          item_id: itemId,
          subpart_code: 'IN',
          mode: 'install',
          source: 'install',
          installed_status: resolvedStatus,
          issue_code: resolvedStatus === 'ISSUE' ? (issueCode || null) : null,
          issue_note: issueNote || null,
          actor_email: actorEmail || null,
          ip_hash: ipHash,
        });

      // Update cached status
      await supabase
        .from('items')
        .update({ install_status_cached: resolvedStatus })
        .eq('id', itemId);

      console.log(`[apt-scan] Confirmed item ${itemId} (${item.item_code}) as ${resolvedStatus}`);
    }

    // Broadcast realtime
    const channel = supabase.channel(`project:${projectId}`);
    for (const ci of confirmedItems) {
      await channel.send({
        type: 'broadcast',
        event: 'install.progress',
        payload: { item_id: ci.id, item_code: ci.code, scanned: 1, required: 1, ready: true },
      });
    }

    const totalItems = selectedItemIds.length;
    const allDuplicate = confirmedCount === 0 && duplicateCount > 0;

    return new Response(
      JSON.stringify({
        success: true,
        mode: 'confirm',
        is_duplicate: allDuplicate,
        message: allDuplicate
          ? 'כל הפריטים כבר אושרו בעבר'
          : `${confirmedCount} פריטים אושרו בהצלחה`,
        confirmed: confirmedCount,
        duplicates: duplicateCount,
        total: totalItems,
        source: 'install',
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[scan-confirm-apt] Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: 'server_error', message: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
