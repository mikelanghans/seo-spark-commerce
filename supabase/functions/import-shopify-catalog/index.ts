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

    const { organizationId } = await req.json();
    if (!organizationId) throw new Error("organizationId is required");

    // Helper: map a Shopify product_type string to our ProductTypeKey
    function inferProductType(category: string): string {
      const lower = (category || "").toLowerCase();
      if (lower.includes("hoodie")) return "hoodie";
      if (lower.includes("sweatshirt") || lower.includes("crewneck")) return "sweatshirt";
      if (lower.includes("long sleeve")) return "long-sleeve";
      if (lower.includes("mug") || lower.includes("drinkware") || lower.includes("cup")) return "mug";
      if (lower.includes("tote")) return "tote";
      if (lower.includes("canvas") || lower.includes("wall art")) return "canvas";
      if (lower.includes("journal")) return "journal";
      if (lower.includes("notebook")) return "notebook";
      if (lower.includes("t-shirt") || lower.includes("tee") || lower.includes("shirt")) return "t-shirt";
      return "other";
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: connection, error: connError } = await adminClient
      .from("shopify_connections")
      .select("store_domain, access_token")
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (connError || !connection) {
      return new Response(JSON.stringify({ error: "No Shopify connection found. Please add your Shopify credentials in Settings." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const domain = connection.store_domain.replace(/^https?:\/\//, "").replace(/\/$/, "");

    // Fetch all products from Shopify (paginated)
    const allShopifyProducts: any[] = [];
    let pageInfo: string | null = null;

    do {
      let url: string;
      if (pageInfo) {
        url = `https://${domain}/admin/api/2024-01/products.json?limit=50&page_info=${pageInfo}`;
      } else {
        url = `https://${domain}/admin/api/2024-01/products.json?limit=50&status=active&fields=id,title,body_html,product_type,tags,handle,images,variants,status`;
      }

      const shopifyResponse = await fetch(url, {
        headers: {
          "X-Shopify-Access-Token": connection.access_token,
          "Content-Type": "application/json",
        },
      });

      if (!shopifyResponse.ok) {
        const errorText = await shopifyResponse.text();
        throw new Error(`Shopify API error (${shopifyResponse.status}): ${errorText}`);
      }

      const shopifyData = await shopifyResponse.json();
      allShopifyProducts.push(...(shopifyData.products || []));

      const linkHeader = shopifyResponse.headers.get("Link") || "";
      const nextMatch = linkHeader.match(/<[^>]*page_info=([^&>]+)[^>]*>;\s*rel="next"/);
      pageInfo = nextMatch ? nextMatch[1] : null;
    } while (pageInfo);

    if (allShopifyProducts.length === 0) {
      return new Response(JSON.stringify({ imported: 0, updated: 0, failed: 0, products: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get existing local products with shopify_product_id
    const shopifyIds = allShopifyProducts.map((p: any) => p.id);
    const { data: existingProducts } = await supabaseClient
      .from("products")
      .select("id, shopify_product_id")
      .eq("organization_id", organizationId)
      .in("shopify_product_id", shopifyIds);

    const existingMap = new Map<number, string>();
    for (const ep of existingProducts || []) {
      if (ep.shopify_product_id) {
        existingMap.set(ep.shopify_product_id, ep.id);
      }
    }

    let imported = 0;
    let updated = 0;
    let failed = 0;
    const resultProducts: any[] = [];

    for (const sp of allShopifyProducts) {
      const imageUrl = sp.images?.[0]?.src || null;
      const price = sp.variants?.[0]?.price || "";
      const description = (sp.body_html || "").replace(/<[^>]*>/g, "");

      const productData = {
        title: sp.title,
        description,
        category: sp.product_type || "",
        keywords: sp.tags || "",
        price,
        image_url: imageUrl,
        shopify_product_id: sp.id,
        organization_id: organizationId,
        user_id: user.id,
      };

      try {
        if (existingMap.has(sp.id)) {
          // Update existing
          const localId = existingMap.get(sp.id)!;
          const { title, description, category, keywords, price, image_url } = productData;
          const { error: updateError } = await supabaseClient
            .from("products")
            .update({ title, description, category, keywords, price, image_url })
            .eq("id", localId);

          if (updateError) throw updateError;

          updated++;
          resultProducts.push({ ...productData, id: localId, action: "updated" });
        } else {
          // Insert new
          const { data: inserted, error: insertError } = await supabaseClient
            .from("products")
            .insert(productData)
            .select("id")
            .single();

          if (insertError) throw insertError;

          imported++;
          resultProducts.push({ ...productData, id: inserted?.id, action: "imported" });
        }
      } catch (productError) {
        failed++;
        resultProducts.push({
          ...productData,
          action: "failed",
          error: productError instanceof Error ? productError.message : "Failed to save product",
        });
      }
    }

    // Auto-enable any new product types discovered during import
    const discoveredTypes = new Set<string>();
    for (const sp of allShopifyProducts) {
      const pt = inferProductType(sp.product_type || "");
      if (pt) discoveredTypes.add(pt);
    }

    if (discoveredTypes.size > 0) {
      const { data: orgData } = await adminClient
        .from("organizations")
        .select("enabled_product_types")
        .eq("id", organizationId)
        .single();

      const current = new Set<string>(orgData?.enabled_product_types || ["t-shirt"]);
      const newTypes: string[] = [];
      for (const t of discoveredTypes) {
        if (!current.has(t)) {
          current.add(t);
          newTypes.push(t);
        }
      }

      if (newTypes.length > 0) {
        await adminClient
          .from("organizations")
          .update({ enabled_product_types: [...current] })
          .eq("id", organizationId);
      }
    }

    return new Response(JSON.stringify({ imported, updated, failed, total: allShopifyProducts.length, products: resultProducts }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("import-shopify-catalog error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
