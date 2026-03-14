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
    const { shopifyProductId, updates, organizationId } = await req.json();
    let connQuery = adminClient
      .from("shopify_connections")
      .select("store_domain, access_token")
      .eq("user_id", user.id);
    if (organizationId) connQuery = connQuery.eq("organization_id", organizationId);
    const { data: connection, error: connError } = await connQuery.maybeSingle();

    if (connError || !connection) {
      return new Response(JSON.stringify({ error: "No Shopify connection found." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { shopifyProductId, updates } = await req.json();
    const domain = connection.store_domain.replace(/^https?:\/\//, "").replace(/\/$/, "");

    // Build the update payload
    const productPayload: Record<string, unknown> = { id: shopifyProductId };
    if (updates.title) productPayload.title = updates.title;
    if (updates.body_html) productPayload.body_html = updates.body_html;
    if (updates.tags) productPayload.tags = updates.tags;
    if (updates.handle) productPayload.handle = updates.handle;
    if (updates.metafields_global_title_tag) productPayload.metafields_global_title_tag = updates.metafields_global_title_tag;
    if (updates.metafields_global_description_tag) productPayload.metafields_global_description_tag = updates.metafields_global_description_tag;
    if (updates.product_type) productPayload.product_type = updates.product_type;

    // Add images if provided
    if (updates.images?.length) {
      productPayload.images = updates.images;
    }

    const shopifyResponse = await fetch(`https://${domain}/admin/api/2024-01/products/${shopifyProductId}.json`, {
      method: "PUT",
      headers: {
        "X-Shopify-Access-Token": connection.access_token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ product: productPayload }),
    });

    if (!shopifyResponse.ok) {
      const errorText = await shopifyResponse.text();
      console.error("Shopify update error:", shopifyResponse.status, errorText);
      throw new Error(`Shopify API error (${shopifyResponse.status}): ${errorText}`);
    }

    const shopifyData = await shopifyResponse.json();

    return new Response(JSON.stringify({ success: true, product: shopifyData.product }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("update-shopify-product error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
