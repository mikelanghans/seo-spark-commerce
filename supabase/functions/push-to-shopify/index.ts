import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildBodyHtml, buildShopifyProduct, categorizeImages, deleteExistingImages, uploadAndAssociateImages, updateSeoMetafields } from "./shopify-helpers.ts";

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
    const { product, listings, imageUrl, variants, shopifyStatus, organizationId, updateFields, forceVariants } = body;

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
    const effectiveUpdateFields = isUpdate && Array.isArray(updateFields) ? updateFields : undefined;

    if (isUpdate) {
      console.log("Updating existing Shopify product while preserving current variant/options matrix");
    }

    const bodyHtml = buildBodyHtml(rawDesc, bulletPoints);
    // Resolve size pricing: product-level overrides keyed by product type
    const rawSizePricing = product.size_pricing;
    let flatSizePricing: Record<string, string> | null = null;
    if (rawSizePricing && typeof rawSizePricing === "object") {
      // size_pricing can be { "t-shirt": { "S": "24.99", ... } } or flat { "S": "24.99" }
      const category = (product.category || "").toLowerCase().replace(/\s+/g, "-");
      if (rawSizePricing[category] && typeof rawSizePricing[category] === "object") {
        flatSizePricing = rawSizePricing[category];
      } else {
        // Assume flat format
        flatSizePricing = rawSizePricing;
      }
    }

    const shopifyProduct = buildShopifyProduct(product, shopifyListing, bodyHtml, shopifyStatus, colorVariants, price, isUpdate, effectiveUpdateFields, !!forceVariants, flatSizePricing);
    const shouldUpdateImages = !effectiveUpdateFields || effectiveUpdateFields.includes("images");
    const { imageEntries } = categorizeImages(colorVariants, product, shopifyListing, imageUrl);
    console.log(`Images to upload: ${imageEntries.length}, color variants: ${actualColorVariants.length}, updateFields: ${effectiveUpdateFields || "all"}`);

    // For updates, delete existing images first so we get clean mockups
    if (isUpdate && shouldUpdateImages && imageEntries.length > 0) {
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
    if (createdProduct?.id && shouldUpdateImages && imageEntries.length > 0) {
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

    // Disable inventory tracking and apply size-specific pricing on all variants
    if (createdProduct?.id && createdProduct.variants?.length) {
      for (const variant of createdProduct.variants) {
        const updates: Record<string, unknown> = { id: variant.id };
        if (variant.inventory_management !== null) {
          updates.inventory_management = null;
        }
        // Apply size-specific pricing if available
        if (flatSizePricing) {
          const size = (variant.option2 || variant.option1 || "").trim();
          if (flatSizePricing[size]) {
            updates.price = flatSizePricing[size];
          }
        }
        if (Object.keys(updates).length > 1) {
          try {
            await fetch(
              `https://${domain}/admin/api/2024-01/variants/${variant.id}.json`,
              {
                method: "PUT",
                headers: { "X-Shopify-Access-Token": connection.access_token, "Content-Type": "application/json" },
                body: JSON.stringify({ variant: updates }),
              },
            );
          } catch (err) {
            console.error(`Failed to update variant ${variant.id}:`, err);
          }
        }
      }
      console.log(`Updated inventory tracking and pricing on ${createdProduct.variants.length} variants`);
    }

    // Update SEO metafields (title_tag, description_tag) via metafields API
    const shouldUpdateSeo = !updateFields || updateFields.includes("seo");
    if (createdProduct?.id && shouldUpdateSeo) {
      await updateSeoMetafields(
        domain,
        connection.access_token,
        createdProduct.id,
        shopifyListing?.seo_title || shopifyListing?.seoTitle,
        shopifyListing?.seo_description || shopifyListing?.seoDescription,
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
