import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const CREDIT_PACKS: Record<string, { priceId: string; credits: number }> = {
  "10": { priceId: "price_1TEYg0JJmvlin3UXzJ9etm9B", credits: 10 },
  "50": { priceId: "price_1TEYh4JJmvlin3UXD6GBvmF5", credits: 50 },
  "200": { priceId: "price_1TEYhRJJmvlin3UXX6hBTSx3", credits: 200 },
};

// Server-side allowlist of valid subscription price IDs. Must match TIER_CONFIG on the client.
const ALLOWED_SUBSCRIPTION_PRICE_IDS = new Set<string>([
  "price_1TEdLUJJmvlin3UXUBU44XE8", // starter
  "price_1TEdLrJJmvlin3UX00I7FbQX", // pro
]);

const ALLOWED_ORIGINS = new Set<string>([
  "https://brandaura.syncopateddynamics.com",
  "https://seo-spark-commerce.lovable.app",
  "https://id-preview--eb06a1c3-53d9-4b7e-8736-6817bf737974.lovable.app",
]);
const DEFAULT_ORIGIN = "https://brandaura.syncopateddynamics.com";

function safeOrigin(req: Request): string {
  const origin = req.headers.get("origin") || "";
  if (ALLOWED_ORIGINS.has(origin)) return origin;
  try {
    const host = new URL(origin).hostname;
    if (host.endsWith(".lovableproject.com") || host.endsWith(".lovable.app")) return origin;
  } catch (_) {}
  return DEFAULT_ORIGIN;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? ""
  );

  try {
    const authHeader = req.headers.get("Authorization")!;
    const token = authHeader.replace("Bearer ", "");
    const { data } = await supabaseClient.auth.getUser(token);
    const user = data.user;
    if (!user?.email) throw new Error("User not authenticated");

    const body = await req.json();
    const { pack, priceId, mode } = body;

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });

    const customers = await stripe.customers.list({ email: user.email, limit: 1 });
    let customerId: string | undefined;
    if (customers.data.length > 0) {
      customerId = customers.data[0].id;
    }

    let session;
    const origin = safeOrigin(req);

    if (mode === "subscription" && priceId) {
      if (!ALLOWED_SUBSCRIPTION_PRICE_IDS.has(priceId)) {
        throw new Error("Invalid subscription price");
      }
      // Subscription checkout
      session = await stripe.checkout.sessions.create({
        customer: customerId,
        customer_email: customerId ? undefined : user.email,
        line_items: [{ price: priceId, quantity: 1 }],
        mode: "subscription",
        success_url: `${origin}/?subscription_activated=true`,
        cancel_url: `${origin}/`,
        metadata: { user_id: user.id },
      });
    } else if (pack) {
      // Credit pack checkout
      const packInfo = CREDIT_PACKS[pack];
      if (!packInfo) throw new Error("Invalid credit pack");

      session = await stripe.checkout.sessions.create({
        customer: customerId,
        customer_email: customerId ? undefined : user.email,
        line_items: [{ price: packInfo.priceId, quantity: 1 }],
        mode: "payment",
        success_url: `${origin}/?credits_purchased=${packInfo.credits}`,
        cancel_url: `${origin}/`,
        metadata: {
          user_id: user.id,
          credits: String(packInfo.credits),
        },
      });
    } else {
      throw new Error("Invalid checkout parameters");
    }

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    console.error('[edge-error]', (error as Error).message);
    return new Response(JSON.stringify({ error: 'An internal error occurred. Please try again.' }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
