import { createClient } from 'npm:@supabase/supabase-js@2.58.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    // Authentification obligatoire: cette fonction cree un compte admin avec
    // 10000 credits. Sans secret partage configure et fourni, on refuse (fail-closed),
    // pour empecher toute escalade de privileges par un appelant anonyme.
    const bootstrapSecret = Deno.env.get('BOOTSTRAP_SECRET');
    const provided = req.headers.get('x-bootstrap-secret') || '';
    if (!bootstrapSecret || provided !== bootstrapSecret) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    const { data: existingUsers } = await adminClient.auth.admin.listUsers();
    
    if (existingUsers && existingUsers.users.length > 0) {
      return new Response(
        JSON.stringify({ error: 'Admin user already exists. This endpoint can only be used for initial setup.' }),
        {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const { email, password } = await req.json();

    if (!email || !password) {
      return new Response(
        JSON.stringify({ error: 'Email and password are required' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      app_metadata: {
        role: 'admin'
      }
    });

    if (createError) {
      throw createError;
    }

    await new Promise(resolve => setTimeout(resolve, 1000));

    const { error: profileError } = await adminClient
      .from('profiles')
      .update({
        is_admin: true,
        role: 'admin',
        subscription_tier: 'enterprise',
        credits_balance: 10000,
        updated_at: new Date().toISOString()
      })
      .eq('id', newUser.user.id);

    if (profileError) {
      console.error('Profile update error:', profileError);
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Admin user created successfully',
        user: {
          id: newUser.user.id,
          email: newUser.user.email
        }
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Bootstrap admin error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});