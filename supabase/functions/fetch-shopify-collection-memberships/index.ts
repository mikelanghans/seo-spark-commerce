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
    const { organizationId } = await req.json();

    let connection = null;
    if (organizationId) {
      const { data: roleData } = await adminClient.rpc("get_org_role", { _user_id: user.id, _org_id: organizationId });
      if (!roleData) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
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

    // 1. Fetch all collections (custom + smart) in parallel
    const [customRes, smartRes] = await Promise.all([
      fetch(`https://${domain}/admin/api/2024-01/custom_collections.json?limit=250&fields=id,title,handle,image`, {
        headers: shopifyHeaders,
      }),
      fetch(`https://${domain}/admin/api/2024-01/smart_collections.json?limit=250&fields=id,title,handle,image`, {
        headers: shopifyHeaders,
      }),
    ]);

    const customData = customRes.ok ? await customRes.json() : { custom_collections: [] };
    const smartData = smartRes.ok ? await smartRes.json() : { smart_collections: [] };

    const allCollections = [
      ...(customData.custom_collections || []).map((c: any) => ({ ...c, collection_type: "custom" })),
      ...(smartData.smart_collections || []).map((c: any) => ({ ...c, collection_type: "smart" })),
    ].sort((a: any, b: any) => a.title.localeCompare(b.title));

    // 2. For each collection, fetch product IDs (batch in groups of 5 to avoid rate limits)
    const memberships: Record<string, number[]> = {};
    const batchSize = 5;

    for (let i = 0; i < allCollections.length; i += batchSize) {
      const batch = allCollections.slice(i, i + batchSize);
      const results = await Promise.all(
        batch.map(async (col: any) => {
          try {
            const res = await fetch(
              `https://${domain}/admin/api/2024-01/products.json?collection_id=${col.id}&limit=250&fields=id`,
              { headers: shopifyHeaders }
            );
            if (!res.ok) return { collectionId: col.id, productIds: [] };
            const data = await res.json();
            return {
              collectionId: col.id,
              productIds: (data.products || []).map((p: any) => p.id),
            };
          } catch {
            return { collectionId: col.id, productIds: [] };
          }
        })
      );
      for (const r of results) {
        memberships[r.collectionId] = r.productIds;
      }
    }

    return new Response(JSON.stringify({
      collections: allCollections.map((c: any) => ({
        id: c.id,
        title: c.title,
        handle: c.handle,
        collection_type: c.collection_type,
        image: c.image,
      })),
      memberships,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("fetch-shopify-collection-memberships error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
