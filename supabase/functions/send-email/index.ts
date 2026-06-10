import { createClient } from 'npm:@supabase/supabase-js@2.58.0';

interface EmailRequest {
  to: string;
  subject: string;
  html: string;
  from?: string;
}

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
    // Authentification obligatoire: sans secret partage, cette fonction serait un
    // relais email ouvert (envoi d'emails arbitraires avec la cle Resend de l'org).
    const functionSecret = Deno.env.get('EMAIL_FUNCTION_SECRET');
    const provided = req.headers.get('x-function-secret') || '';
    if (!functionSecret || provided !== functionSecret) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get Resend API key from settings
    const { data: settings, error: settingsError } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'resend_api_key')
      .maybeSingle();

    if (settingsError || !settings?.value) {
      throw new Error('Resend API key not configured');
    }

    const resendApiKey = settings.value;

    // Parse request body
    const emailData: EmailRequest = await req.json();

    // Validation minimale du destinataire et du contenu
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailData?.to || typeof emailData.to !== 'string' || !emailRegex.test(emailData.to)) {
      return new Response(
        JSON.stringify({ success: false, error: 'Destinataire invalide' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    if (!emailData.subject || !emailData.html) {
      return new Response(
        JSON.stringify({ success: false, error: 'subject et html requis' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get default from email if not provided
    const { data: fromSettings } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'support_email')
      .maybeSingle();

    const fromEmail = emailData.from || fromSettings?.value || 'noreply@example.com';

    // Send email via Resend
    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify({
        from: fromEmail,
        to: emailData.to,
        subject: emailData.subject,
        html: emailData.html,
      }),
    });

    const resendData = await resendResponse.json();

    if (!resendResponse.ok) {
      throw new Error(`Resend API error: ${JSON.stringify(resendData)}`);
    }

    return new Response(
      JSON.stringify({ success: true, id: resendData.id }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  } catch (error) {
    console.error('Email sending error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  }
});