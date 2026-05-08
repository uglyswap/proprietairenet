import { createClient } from 'npm:@supabase/supabase-js@2.58.0';

interface PricingPlan {
  id: string;
  name: string;
  credits: number;
  price: number;
  currency: string;
  features: string[];
  stripe_price_id?: string;
  stripe_product_id?: string;
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
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const authHeader = req.headers.get('Authorization');

    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: {
        headers: { Authorization: authHeader },
      },
    });

    // Verify user is admin
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      throw new Error('Unauthorized');
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .maybeSingle();

    if (profileError || !profile?.is_admin) {
      throw new Error('Admin access required');
    }

    // Get Stripe API key from settings
    const { data: settings, error: settingsError } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'stripe_secret_key')
      .maybeSingle();

    if (settingsError || !settings?.value) {
      throw new Error('Stripe API key not configured');
    }

    const stripeApiKey = settings.value;

    // Get pricing plan to sync
    const { plan_id } = await req.json();

    if (!plan_id) {
      throw new Error('plan_id is required');
    }

    const { data: plan, error: planError } = await supabase
      .from('pricing_plans')
      .select('*')
      .eq('id', plan_id)
      .maybeSingle();

    if (planError || !plan) {
      throw new Error('Pricing plan not found');
    }

    const typedPlan = plan as unknown as PricingPlan;

    // Create or update Stripe product
    let productId = typedPlan.stripe_product_id;

    if (!productId) {
      // Create new product
      const productResponse = await fetch('https://api.stripe.com/v1/products', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${stripeApiKey}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          name: typedPlan.name,
          description: `${typedPlan.credits} credits - ${typedPlan.features.join(', ')}`,
        }),
      });

      const productData = await productResponse.json();
      if (!productResponse.ok) {
        throw new Error(`Stripe product error: ${JSON.stringify(productData)}`);
      }

      productId = productData.id;
    } else {
      // Update existing product
      await fetch(`https://api.stripe.com/v1/products/${productId}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${stripeApiKey}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          name: typedPlan.name,
          description: `${typedPlan.credits} credits - ${typedPlan.features.join(', ')}`,
        }),
      });
    }

    // Create new price (Stripe prices are immutable)
    const priceResponse = await fetch('https://api.stripe.com/v1/prices', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${stripeApiKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        product: productId,
        unit_amount: Math.round(typedPlan.price * 100).toString(),
        currency: typedPlan.currency.toLowerCase(),
      }),
    });

    const priceData = await priceResponse.json();
    if (!priceResponse.ok) {
      throw new Error(`Stripe price error: ${JSON.stringify(priceData)}`);
    }

    // Archive old price if exists
    if (typedPlan.stripe_price_id) {
      await fetch(`https://api.stripe.com/v1/prices/${typedPlan.stripe_price_id}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${stripeApiKey}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          active: 'false',
        }),
      });
    }

    // Update pricing plan with Stripe IDs
    const { error: updateError } = await supabase
      .from('pricing_plans')
      .update({
        stripe_product_id: productId,
        stripe_price_id: priceData.id,
      })
      .eq('id', plan_id);

    if (updateError) throw updateError;

    return new Response(
      JSON.stringify({ 
        success: true, 
        product_id: productId,
        price_id: priceData.id 
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  } catch (error) {
    console.error('Stripe sync error:', error);
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