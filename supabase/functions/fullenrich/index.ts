import { createClient } from 'npm:@supabase/supabase-js@2.58.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

interface EnrichRequest {
  firstname: string;
  lastname: string;
  company_name?: string;
  domain?: string;
  linkedin_url?: string;
}

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
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    let fullenrichApiKey = Deno.env.get('FULLENRICH_API_KEY');

    const { data: apiKeySetting } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'fullenrich_api_key')
      .maybeSingle();

    if (apiKeySetting && apiKeySetting.value) {
      fullenrichApiKey = apiKeySetting.value;
    }

    if (!fullenrichApiKey) {
      return new Response(
        JSON.stringify({
          error: 'FullEnrich API key not configured. Please add it in Admin Settings > API Keys.'
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const url = new URL(req.url);
    const action = url.searchParams.get('action');

    if (action === 'enrich' && req.method === 'POST') {
      const enrichData: EnrichRequest = await req.json();

      const { data: profile } = await supabase
        .from('profiles')
        .select('credits_balance, is_admin')
        .eq('id', user.id)
        .maybeSingle();

      if (!profile) {
        return new Response(
          JSON.stringify({ error: 'Profile not found' }),
          {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      const minCreditsRequired = 1;
      if (!profile.is_admin && profile.credits_balance < minCreditsRequired) {
        return new Response(
          JSON.stringify({ error: 'Insufficient credits. Minimum 1 credit required.' }),
          {
            status: 402,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      const person_name = `${enrichData.firstname} ${enrichData.lastname}`;

      const { data: existingContact } = await supabase
        .from('enriched_contacts')
        .select('*')
        .eq('user_id', user.id)
        .eq('person_name', person_name)
        .eq('company_name', enrichData.company_name || '')
        .eq('status', 'completed')
        .maybeSingle();

      if (existingContact) {
        return new Response(
          JSON.stringify({
            success: true,
            cached: true,
            contact: existingContact,
          }),
          {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      const fullenrichPayload = {
        name: `Enrichment for ${person_name}`,
        datas: [
          {
            firstname: enrichData.firstname,
            lastname: enrichData.lastname,
            company_name: enrichData.company_name,
            domain: enrichData.domain,
            linkedin_url: enrichData.linkedin_url,
            enrich_fields: ['contact.emails', 'contact.personal_emails', 'contact.phones'],
          },
        ],
      };

      const fullenrichResponse = await fetch(
        'https://app.fullenrich.com/api/v1/contact/enrich/bulk',
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${fullenrichApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(fullenrichPayload),
        }
      );

      if (!fullenrichResponse.ok) {
        const errorText = await fullenrichResponse.text();
        console.error('FullEnrich API error:', errorText);
        return new Response(
          JSON.stringify({ error: 'Failed to initiate enrichment', details: errorText }),
          {
            status: fullenrichResponse.status,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      const { enrichment_id } = await fullenrichResponse.json();

      const { data: contactRecord, error: insertError } = await supabase
        .from('enriched_contacts')
        .insert({
          user_id: user.id,
          person_name,
          company_name: enrichData.company_name || null,
          linkedin_url: enrichData.linkedin_url || null,
          enrichment_id,
          status: 'pending',
        })
        .select()
        .single();

      if (insertError) {
        console.error('Failed to insert contact record:', insertError);
        return new Response(
          JSON.stringify({ error: 'Failed to save enrichment record' }),
          {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          enrichment_id,
          contact_id: contactRecord.id,
          message: 'Enrichment started. Use the status endpoint to check progress.',
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    if (action === 'status' && req.method === 'GET') {
      const enrichmentId = url.searchParams.get('enrichment_id');

      if (!enrichmentId) {
        return new Response(
          JSON.stringify({ error: 'Missing enrichment_id parameter' }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      const fullenrichResponse = await fetch(
        `https://app.fullenrich.com/api/v1/contact/enrich/bulk/${enrichmentId}`,
        {
          headers: {
            'Authorization': `Bearer ${fullenrichApiKey}`,
          },
        }
      );

      if (!fullenrichResponse.ok) {
        const errorText = await fullenrichResponse.text();
        return new Response(
          JSON.stringify({ error: 'Failed to fetch enrichment status', details: errorText }),
          {
            status: fullenrichResponse.status,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      const enrichmentData = await fullenrichResponse.json();

      if (enrichmentData.status === 'completed' && enrichmentData.results?.length > 0) {
        const result = enrichmentData.results[0];
        const workEmails = result.contact?.emails || [];
        const personalEmails = result.contact?.personal_emails || [];
        const phones = result.contact?.phones || [];

        let creditsUsed = 0;
        if (workEmails.length > 0) creditsUsed += 1;
        if (personalEmails.length > 0) creditsUsed += 3;
        if (phones.length > 0) creditsUsed += 10;

        const { data: contact } = await supabase
          .from('enriched_contacts')
          .select('*')
          .eq('enrichment_id', enrichmentId)
          .maybeSingle();

        if (contact) {
          const { error: updateError } = await supabase
            .from('enriched_contacts')
            .update({
              status: 'completed',
              work_emails: workEmails,
              personal_emails: personalEmails,
              phones: phones,
              credits_used: creditsUsed,
              raw_data: result,
              completed_at: new Date().toISOString(),
            })
            .eq('id', contact.id);

          if (updateError) {
            console.error('Failed to update contact:', updateError);
          }

          const { data: profile } = await supabase
            .from('profiles')
            .select('is_admin')
            .eq('id', contact.user_id)
            .maybeSingle();

          if (!profile?.is_admin && creditsUsed > 0) {
            const { error: creditError } = await supabase.rpc('deduct_credits', {
              user_id: contact.user_id,
              amount: creditsUsed,
            });

            if (creditError) {
              console.error('Failed to deduct credits:', creditError);
            }
          }
        }
      }

      return new Response(
        JSON.stringify(enrichmentData),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    if (action === 'list' && req.method === 'GET') {
      const { data: contacts, error } = await supabase
        .from('enriched_contacts')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) {
        return new Response(
          JSON.stringify({ error: error.message }),
          {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      return new Response(
        JSON.stringify({ contacts }),
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
    console.error('FullEnrich function error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});