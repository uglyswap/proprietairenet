import { createClient } from 'npm:@supabase/supabase-js@2.58.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
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
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const authHeader = req.headers.get('Authorization');

    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const userClient = createClient(supabaseUrl, supabaseServiceKey, {
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    });

    const { data: { user }, error: authError } = await userClient.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const { data: profile } = await userClient
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .maybeSingle();

    if (!profile?.is_admin) {
      return new Response(
        JSON.stringify({ error: 'Forbidden: Admin access required' }),
        {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    const url = new URL(req.url);
    const action = url.searchParams.get('action');

    if (action === 'list') {
      const { data: authUsers, error } = await adminClient.auth.admin.listUsers();

      if (error) {
        throw error;
      }

      return new Response(
        JSON.stringify({ users: authUsers.users }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    if (action === 'create' && req.method === 'POST') {
      const { email, password, is_admin, credits_balance } = await req.json();

      const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        app_metadata: {
          role: is_admin ? 'admin' : 'user'
        }
      });

      if (createError) {
        throw createError;
      }

      if (credits_balance !== undefined || is_admin !== undefined) {
        const profileUpdate: any = { updated_at: new Date().toISOString() };
        if (credits_balance !== undefined) profileUpdate.credits_balance = credits_balance;
        if (is_admin !== undefined) {
          profileUpdate.is_admin = is_admin;
          profileUpdate.role = is_admin ? 'admin' : 'user';
          profileUpdate.subscription_tier = is_admin ? 'enterprise' : 'free';
        }

        const { error: profileError } = await adminClient
          .from('profiles')
          .update(profileUpdate)
          .eq('id', newUser.user.id);

        if (profileError) {
          throw profileError;
        }
      }

      return new Response(
        JSON.stringify({ success: true, user: newUser.user }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    if (action === 'update' && req.method === 'POST') {
      const { userId, email, password, user_metadata, credits_balance, is_admin } = await req.json();

      // Update auth.users if email or password provided
      if (email || password || user_metadata) {
        const updateData: any = {};
        if (email) updateData.email = email;
        if (password) updateData.password = password;
        if (user_metadata) updateData.user_metadata = user_metadata;

        const { error } = await adminClient.auth.admin.updateUserById(
          userId,
          updateData
        );

        if (error) {
          throw error;
        }
      }

      // Update profiles table if credits_balance or is_admin provided
      if (credits_balance !== undefined || is_admin !== undefined) {
        const profileUpdate: any = {};
        if (credits_balance !== undefined) profileUpdate.credits_balance = credits_balance;
        if (is_admin !== undefined) {
          profileUpdate.is_admin = is_admin;
          profileUpdate.role = is_admin ? 'admin' : 'user';
        }

        const { error: profileError } = await adminClient
          .from('profiles')
          .update(profileUpdate)
          .eq('id', userId);

        if (profileError) {
          throw profileError;
        }
      }

      return new Response(
        JSON.stringify({ success: true }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Invalid action' }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Admin users function error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});