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
    const { limit = 50, pageInfo, organizationId } = await req.json();
    let connection = null;
    let connError = null;
    if (organizationId) {
      const res = await adminClient
        .from("shopify_connections")
        .select("store_domain, access_token")
        .eq("organization_id", organizationId)
        .maybeSingle();
      connection = res.data;
      connError = res.error;
    }
    if (!connection) {
      const res = await adminClient
        .from("shopify_connections")
        .select("store_domain, access_token")
        .eq("user_id", user.id)
        .maybeSingle();
      connection = res.data;
      connError = res.error;
    }

    if (connError || !connection) {
      return new Response(JSON.stringify({ error: "No Shopify connection found. Please add your Shopify credentials in Settings." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const domain = connection.store_domain.replace(/^https?:\/\//, "").replace(/\/$/, "");

    let url = `https://${domain}/admin/api/2024-01/products.json?limit=${limit}&fields=id,title,body_html,product_type,tags,handle,images,variants,status`;
    if (pageInfo) {
      url = `https://${domain}/admin/api/2024-01/products.json?limit=${limit}&page_info=${pageInfo}`;
    }

    const shopifyResponse = await fetch(url, {
      headers: {
        "X-Shopify-Access-Token": connection.access_token,
        "Content-Type": "application/json",
      },
    });

    if (!shopifyResponse.ok) {
      const errorText = await shopifyResponse.text();
      console.error("Shopify API error:", shopifyResponse.status, errorText);
      throw new Error(`Shopify API error (${shopifyResponse.status}): ${errorText}`);
    }

    const shopifyData = await shopifyResponse.json();

    // Parse pagination from Link header
    const linkHeader = shopifyResponse.headers.get("Link") || "";
    let nextPageInfo: string | null = null;
    const nextMatch = linkHeader.match(/<[^>]*page_info=([^&>]+)[^>]*>;\s*rel="next"/);
    if (nextMatch) nextPageInfo = nextMatch[1];

    return new Response(JSON.stringify({
      products: shopifyData.products || [],
      nextPageInfo,
      total: shopifyData.products?.length || 0,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("fetch-shopify-products error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
