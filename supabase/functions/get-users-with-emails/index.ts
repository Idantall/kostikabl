import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceKey) {
      throw new Error("Missing environment variables");
    }

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    // Get all users from auth
    const { data: authData, error: authError } = await admin.auth.admin.listUsers();
    if (authError) throw authError;

    // Get all user roles
    const { data: roles, error: rolesError } = await admin
      .from('user_roles')
      .select('*');
    if (rolesError) throw rolesError;

    // Get allowed emails
    const { data: allowedEmails, error: emailsError } = await admin
      .from('allowed_emails')
      .select('email');
    if (emailsError) throw emailsError;

    // Merge data - create a map of user_id to email
    const userEmailMap = new Map<string, string>();
    authData.users.forEach(user => {
      if (user.email) {
        userEmailMap.set(user.id, user.email);
      }
    });

    // Add email to each role
    const rolesWithEmails = roles?.map(role => ({
      ...role,
      email: userEmailMap.get(role.user_id) || null
    })) || [];

    return new Response(
      JSON.stringify({
        success: true,
        roles: rolesWithEmails,
        allowedEmails: allowedEmails?.map(e => e.email) || [],
        authUsers: authData.users.map(u => ({ id: u.id, email: u.email }))
      }),
      { headers: { ...corsHeaders, "content-type": "application/json" } }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : String(error) }),
      { status: 500, headers: { ...corsHeaders, "content-type": "application/json" } }
    );
  }
});
