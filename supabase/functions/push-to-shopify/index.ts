import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing authorization header");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabaseClient = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) throw new Error("Unauthorized");

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: connection, error: connError } = await adminClient
      .from("shopify_connections")
      .select("store_domain, access_token")
      .eq("user_id", user.id)
      .single();

    if (connError || !connection) {
      return new Response(JSON.stringify({ error: "No Shopify connection found. Please add your Shopify credentials in Settings." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { product, listings, imageUrl } = await req.json();

    // Find Shopify-specific listing data
    const shopifyListing = listings?.find((l: { marketplace: string }) => l.marketplace === "shopify");

    // Build Shopify product payload with full SEO
    const shopifyProduct: Record<string, unknown> = {
      title: shopifyListing?.title || product.title,
      body_html: shopifyListing?.description
        ? `<p>${shopifyListing.description}</p>`
        : `<p>${product.description}</p>`,
      product_type: product.category,
      tags: shopifyListing?.tags?.length
        ? shopifyListing.tags.join(", ")
        : product.keywords,
      handle: shopifyListing?.url_handle || undefined,
      variants: [{ price: product.price?.replace(/[^0-9.]/g, "") || "0.00" }],
      metafields_global_title_tag: shopifyListing?.seo_title || undefined,
      metafields_global_description_tag: shopifyListing?.seo_description || undefined,
    };

    // Add image with alt text
    if (imageUrl) {
      shopifyProduct.images = [{
        src: imageUrl,
        alt: shopifyListing?.alt_text || product.title,
      }];
    }

    const domain = connection.store_domain.replace(/^https?:\/\//, "").replace(/\/$/, "");

    const shopifyResponse = await fetch(`https://${domain}/admin/api/2024-01/products.json`, {
      method: "POST",
      headers: {
        "X-Shopify-Access-Token": connection.access_token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ product: shopifyProduct }),
    });

    if (!shopifyResponse.ok) {
      const errorText = await shopifyResponse.text();
      console.error("Shopify API error:", shopifyResponse.status, errorText);
      throw new Error(`Shopify API error (${shopifyResponse.status}): ${errorText}`);
    }

    const shopifyData = await shopifyResponse.json();

    return new Response(JSON.stringify({ success: true, shopifyProduct: shopifyData.product }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("push-to-shopify error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
