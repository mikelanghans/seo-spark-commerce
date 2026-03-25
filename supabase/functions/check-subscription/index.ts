import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const TIERS: Record<string, { name: string; credits: number }> = {
  prod_UD3S6uDlK4MVKO: { name: "starter", credits: 175 },
  prod_UD3SXkUfbBbDNn: { name: "pro", credits: 700 },
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");
    const token = authHeader.replace("Bearer ", "");

    // Use anon client to validate the JWT and extract claims
    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    );
    const { data: claimsData, error: claimsError } = await anonClient.auth.getUser(token);
    if (claimsError || !claimsData?.user) throw new Error("Auth session missing!");
    const user = claimsData.user;
    if (!user?.email) throw new Error("User not authenticated");

    // Check F&F redemption first
    const { data: ffRedemption } = await supabaseClient
      .from("ff_redemptions")
      .select("tier")
      .eq("user_id", user.id)
      .maybeSingle();

    if (ffRedemption) {
      const tierInfo = ffRedemption.tier === "pro"
        ? { name: "pro", credits: 700 }
        : { name: "starter", credits: 175 };
      return new Response(JSON.stringify({
        subscribed: true,
        tier: tierInfo.name,
        credits_limit: tierInfo.credits,
        subscription_end: null,
        is_ff: true,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check Stripe subscription
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY not set");

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    const customers = await stripe.customers.list({ email: user.email, limit: 1 });

    if (customers.data.length === 0) {
      return new Response(JSON.stringify({
        subscribed: false, tier: "free", credits_limit: 25,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const customerId = customers.data[0].id;
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId, status: "active", limit: 1,
    });

    if (subscriptions.data.length === 0) {
      return new Response(JSON.stringify({
        subscribed: false, tier: "free", credits_limit: 25,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sub = subscriptions.data[0];
    const productId = sub.items.data[0].price.product as string;
    const tierInfo = TIERS[productId] || { name: "starter", credits: 175 };

    return new Response(JSON.stringify({
      subscribed: true,
      tier: tierInfo.name,
      credits_limit: tierInfo.credits,
      subscription_end: new Date(sub.current_period_end * 1000).toISOString(),
      is_ff: false,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
