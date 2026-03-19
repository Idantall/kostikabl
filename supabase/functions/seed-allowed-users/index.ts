import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function generateRandomPassword(length = 16): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%&*';
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => chars[byte % chars.length]).join('');
}

const DEFAULT_USERS = [
  { email: "yossi@kostika.biz" },
  { email: "idantal92@gmail.com" },
  { email: "test@test.com" },
];

serve(async (req) => {
  // Handle CORS preflight requests
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

    // Check if this is a single user creation request
    const body = await req.json().catch(() => ({}));
    
    if (body.email && body.role) {
      // Single user creation mode
      const email = body.email.toLowerCase().trim();
      const role = body.role;
      const password = body.password || 'Worker1234';

      console.log(`Creating user: ${email} with role: ${role}`);

      // First add to allowed_emails if not exists
      const { error: allowedError } = await admin
        .from('allowed_emails')
        .upsert({ email }, { onConflict: 'email' });

      if (allowedError) {
        console.error('Error adding to allowed_emails:', allowedError);
      }

      // Try to create the user in auth
      let userId: string | null = null;
      let userStatus = 'created';

      try {
        const { data: userData, error: createError } = await admin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
        });

        if (createError) {
          throw createError;
        }
        
        userId = userData?.user?.id || null;
      } catch (authError: any) {
        // Check if user already exists
        if (authError?.code === 'email_exists' || 
            authError?.message?.includes('already registered') || 
            authError?.message?.includes('already exists')) {
          console.log(`User ${email} already exists, fetching existing user...`);
          
          // Get existing user
          const { data: existingUsers } = await admin.auth.admin.listUsers();
          const existingUser = existingUsers?.users?.find(u => u.email === email);
          
          if (existingUser) {
            userId = existingUser.id;
            userStatus = 'existing';
            
            // Update password if provided
            if (body.password) {
              const { error: updateError } = await admin.auth.admin.updateUserById(existingUser.id, {
                password: body.password,
              });
              if (updateError) {
                console.error('Error updating password:', updateError);
              } else {
                console.log(`Password updated for ${email}`);
                userStatus = 'password_updated';
              }
            }
          } else {
            return new Response(
              JSON.stringify({ success: false, error: "משתמש קיים אך לא נמצא" }),
              { status: 400, headers: { ...corsHeaders, "content-type": "application/json" } }
            );
          }
        } else {
          throw authError;
        }
      }

      // Add/update role for the user
      if (userId) {
        const { error: roleError } = await admin.from('user_roles').upsert(
          { user_id: userId, role },
          { onConflict: 'user_id' }
        );
        
        if (roleError) {
          console.error('Error setting role:', roleError);
        }
      }

      const message = userStatus === 'created' 
        ? `משתמש נוצר עם סיסמה: ${password}`
        : userStatus === 'password_updated'
        ? 'משתמש קיים, הסיסמה עודכנה'
        : 'משתמש קיים, התפקיד עודכן';

      return new Response(
        JSON.stringify({ 
          success: true, 
          status: userStatus,
          email,
          userId,
          message
        }),
        { headers: { ...corsHeaders, "content-type": "application/json" } }
      );
    }

    // Original seed mode - create all default users
    const results: any[] = [];
    
    for (const u of DEFAULT_USERS) {
      const password = generateRandomPassword();
      console.log(`Creating user: ${u.email}`);
      
      const { data, error } = await admin.auth.admin.createUser({
        email: u.email,
        password,
        email_confirm: true,
      });

      if (error) {
        if (error.message.includes("already registered") || error.message.includes("already exists")) {
          console.log(`User ${u.email} already exists`);
          results.push({ email: u.email, ok: true, status: "existing" });
        } else {
          console.error(`Error creating user ${u.email}:`, error.message);
          results.push({ email: u.email, ok: false, error: error.message });
        }
      } else {
        console.log(`Successfully created user ${u.email} with ID ${data?.user?.id}`);
        results.push({ email: u.email, ok: true, userId: data?.user?.id, status: "created" });
      }
    }

    return new Response(
      JSON.stringify({ success: true, results }, null, 2),
      { 
        headers: { 
          ...corsHeaders,
          "content-type": "application/json" 
        } 
      }
    );
  } catch (error) {
    console.error("Seed users error:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { 
        status: 500,
        headers: { 
          ...corsHeaders,
          "content-type": "application/json" 
        } 
      }
    );
  }
});
