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
    const { organizationId, collectionId } = await req.json();

    let connection = null;
    if (organizationId) {
      const res = await adminClient
        .from("shopify_connections")
        .select("store_domain, access_token")
        .eq("organization_id", organizationId)
        .maybeSingle();
      connection = res.data;
    }
    if (!connection) {
      const res = await adminClient
        .from("shopify_connections")
        .select("store_domain, access_token")
        .eq("user_id", user.id)
        .maybeSingle();
      connection = res.data;
    }

    if (!connection) {
      return new Response(JSON.stringify({ error: "No Shopify connection found." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const domain = connection.store_domain.replace(/^https?:\/\//, "").replace(/\/$/, "");
    const shopifyHeaders = { "X-Shopify-Access-Token": connection.access_token, "Content-Type": "application/json" };

    // If collectionId is provided, fetch product IDs for that collection
    if (collectionId) {
      const collectsRes = await fetch(
        `https://${domain}/admin/api/2024-01/collects.json?collection_id=${collectionId}&limit=250&fields=product_id`,
        { headers: shopifyHeaders }
      );
      if (!collectsRes.ok) throw new Error(`Shopify API error: ${collectsRes.status}`);
      const collectsData = await collectsRes.json();
      const productIds = (collectsData.collects || []).map((c: any) => c.product_id);
      return new Response(JSON.stringify({ productIds }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch both custom collections and smart collections in parallel
    const [customRes, smartRes] = await Promise.all([
      fetch(`https://${domain}/admin/api/2024-01/custom_collections.json?limit=250&fields=id,title,handle,body_html,image,products_count,published_at,sort_order,updated_at`, {
        headers: shopifyHeaders,
      }),
      fetch(`https://${domain}/admin/api/2024-01/smart_collections.json?limit=250&fields=id,title,handle,body_html,image,products_count,published_at,sort_order,updated_at,rules,disjunctive`, {
        headers: shopifyHeaders,
      }),
    ]);

    if (!customRes.ok && !smartRes.ok) {
      throw new Error(`Shopify API error: ${customRes.status}`);
    }

    const customData = customRes.ok ? await customRes.json() : { custom_collections: [] };
    const smartData = smartRes.ok ? await smartRes.json() : { smart_collections: [] };

    const collections = [
      ...(customData.custom_collections || []).map((c: any) => ({ ...c, collection_type: "custom" })),
      ...(smartData.smart_collections || []).map((c: any) => ({ ...c, collection_type: "smart" })),
    ].sort((a, b) => a.title.localeCompare(b.title));

    return new Response(JSON.stringify({ collections }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
