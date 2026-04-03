import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildBodyHtml, buildShopifyProduct, categorizeImages, deleteExistingImages, uploadAndAssociateImages } from "./shopify-helpers.ts";

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
    const body = await req.json();
    const { product, listings, imageUrl, variants, shopifyStatus, organizationId, updateFields } = body;

    // Resolve Shopify connection
    let connection = null;
    if (organizationId) {
      const res = await adminClient.from("shopify_connections").select("store_domain, access_token").eq("organization_id", organizationId).maybeSingle();
      connection = res.data;
    }
    if (!connection) {
      const res = await adminClient.from("shopify_connections").select("store_domain, access_token").eq("user_id", user.id).maybeSingle();
      connection = res.data;
    }
    if (!connection) {
      return new Response(JSON.stringify({ error: "No Shopify connection found. Please add your Shopify credentials in Settings." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const shopifyListing = listings?.find((l: { marketplace: string }) => l.marketplace === "shopify");
    const colorVariants: { colorName: string; imageUrl: string }[] = variants || [];
    const actualColorVariants = colorVariants.filter((v) => v.colorName !== "Size Chart");
    const rawDesc = shopifyListing?.description || product.description || "";
    const bulletPoints: string[] = shopifyListing?.bullet_points || shopifyListing?.bulletPoints || [];
    const price = product.price?.replace(/[^0-9.]/g, "") || "0.00";

    const domain = connection.store_domain.replace(/^https?:\/\//, "").replace(/\/$/, "");
    const existingShopifyId = product.shopify_product_id;
    const isUpdate = !!existingShopifyId;

    if (isUpdate) {
      console.log("Updating existing Shopify product while preserving current variant/options matrix");
    }

    const bodyHtml = buildBodyHtml(rawDesc, bulletPoints);
    const shopifyProduct = buildShopifyProduct(product, shopifyListing, bodyHtml, shopifyStatus, colorVariants, price, isUpdate);
    const { imageEntries } = categorizeImages(colorVariants, product, shopifyListing, imageUrl);
    console.log(`Images to upload: ${imageEntries.length}, color variants: ${actualColorVariants.length}`);

    // For updates, delete existing images first so we get clean mockups
    if (isUpdate && imageEntries.length > 0) {
      await deleteExistingImages(domain, connection.access_token, existingShopifyId);
    }

    // Create or update product
    let shopifyResponse = await fetch(
      isUpdate
        ? `https://${domain}/admin/api/2024-01/products/${existingShopifyId}.json`
        : `https://${domain}/admin/api/2024-01/products.json`,
      {
        method: isUpdate ? "PUT" : "POST",
        headers: { "X-Shopify-Access-Token": connection.access_token, "Content-Type": "application/json" },
        body: JSON.stringify({ product: shopifyProduct }),
      },
    );

    // If update returns 404, the product was deleted on Shopify — fall back to create
    if (isUpdate && shopifyResponse.status === 404) {
      console.log("Existing Shopify product not found (404), creating new product instead");
      shopifyResponse = await fetch(
        `https://${domain}/admin/api/2024-01/products.json`,
        {
          method: "POST",
          headers: { "X-Shopify-Access-Token": connection.access_token, "Content-Type": "application/json" },
          body: JSON.stringify({ product: shopifyProduct }),
        },
      );
    }

    if (!shopifyResponse.ok) {
      const errorText = await shopifyResponse.text();
      console.error("Shopify API error:", shopifyResponse.status, errorText);
      throw new Error(`Shopify API error (${shopifyResponse.status}): ${errorText}`);
    }

    const shopifyData = await shopifyResponse.json();
    const createdProduct = shopifyData.product;
    console.log(`Shopify product id: ${createdProduct?.id}, variants: ${createdProduct?.variants?.length || 0}`);

    // Save Shopify product ID back
    if (createdProduct?.id && product.id) {
      await adminClient.from("products").update({ shopify_product_id: createdProduct.id }).eq("id", product.id);
    }

    // Upload images and associate with variants (use fresh variant list from response)
    if (createdProduct?.id && imageEntries.length > 0) {
      await uploadAndAssociateImages(
        domain,
        connection.access_token,
        createdProduct.id,
        imageEntries,
        createdProduct.variants || [],
        actualColorVariants,
        product.title,
      );
    }

    return new Response(JSON.stringify({
      success: true,
      shopifyProduct: createdProduct,
      updated: isUpdate,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("push-to-shopify error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
