import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  corsHeaders,
  buildHtmlDescription,
  buildShopifyProduct,
  uploadImagesToShopify,
  associateImagesWithVariants,
  type ShopifyVariant,
} from "./_shared/shopify-helpers.ts";

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
    const { product, listings, imageUrl, variants, shopifyStatus, organizationId } = body;

    // Resolve Shopify connection (org-scoped first, then user-scoped)
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
      return new Response(
        JSON.stringify({ error: "No Shopify connection found. Please add your Shopify credentials in Settings." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const shopifyListing = listings?.find((l: { marketplace: string }) => l.marketplace === "shopify");
    const colorVariants: ShopifyVariant[] = variants || [];
    const actualColorVariants = colorVariants.filter((v) => v.colorName !== "Size Chart");

    // Build product payload
    const rawDesc = shopifyListing?.description || product.description || "";
    const bulletPoints: string[] = shopifyListing?.bullet_points || shopifyListing?.bulletPoints || [];
    const bodyHtml = buildHtmlDescription(rawDesc, bulletPoints);
    const shopifyProduct = buildShopifyProduct(product, shopifyListing, bodyHtml, actualColorVariants, shopifyStatus);

    // Collect images
    const variantImages = colorVariants
      .filter((v) => v.colorName !== "Size Chart")
      .map((v) => ({ url: v.imageUrl, alt: `${product.title} - ${v.colorName}`, colorName: v.colorName }));
    const extraImages = colorVariants
      .filter((v) => v.colorName === "Size Chart")
      .map((v) => ({ url: v.imageUrl, alt: "Size Chart" }));
    const imageEntries: { url: string; alt: string; colorName?: string }[] = [...variantImages, ...extraImages];
    if (imageEntries.length === 0 && imageUrl) {
      imageEntries.push({ url: imageUrl, alt: shopifyListing?.alt_text || product.title });
    }

    // Create or update product
    const domain = connection.store_domain.replace(/^https?:\/\//, "").replace(/\/$/, "");
    const isUpdate = !!product.shopify_product_id;
    const endpoint = isUpdate
      ? `https://${domain}/admin/api/2024-01/products/${product.shopify_product_id}.json`
      : `https://${domain}/admin/api/2024-01/products.json`;

    const shopifyResponse = await fetch(endpoint, {
      method: isUpdate ? "PUT" : "POST",
      headers: { "X-Shopify-Access-Token": connection.access_token, "Content-Type": "application/json" },
      body: JSON.stringify({ product: shopifyProduct }),
    });

    if (!shopifyResponse.ok) {
      const errorText = await shopifyResponse.text();
      console.error("Shopify API error:", shopifyResponse.status, errorText);
      throw new Error(`Shopify API error (${shopifyResponse.status}): ${errorText}`);
    }

    const { product: createdProduct } = await shopifyResponse.json();

    // Save Shopify product ID back to DB
    if (createdProduct?.id && product.id) {
      await adminClient.from("products").update({ shopify_product_id: createdProduct.id }).eq("id", product.id);
    }

    // Upload images & associate with variants
    let uploadedImages: Array<{ id: number; alt: string; colorName?: string } | null> = [];
    if (createdProduct?.id && imageEntries.length > 0) {
      uploadedImages = await uploadImagesToShopify(domain, connection.access_token, createdProduct.id, imageEntries);
      console.log(`Uploaded ${uploadedImages.filter(Boolean).length}/${imageEntries.length} images`);
    }

    if (actualColorVariants.length > 0 && createdProduct?.variants?.length && uploadedImages.some(Boolean)) {
      await associateImagesWithVariants(domain, connection.access_token, createdProduct.variants, uploadedImages);
    }

    return new Response(
      JSON.stringify({ success: true, shopifyProduct: createdProduct, updated: isUpdate }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("push-to-shopify error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
