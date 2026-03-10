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

    const { product, listings, imageUrl, variants } = await req.json();

    const shopifyListing = listings?.find((l: { marketplace: string }) => l.marketplace === "shopify");

    // Build variant data from mockup color images
    const colorVariants: { colorName: string; imageUrl: string }[] = variants || [];
    const hasVariants = colorVariants.length > 0;

    // Check if product already exists on Shopify
    const existingShopifyId = product.shopify_product_id;
    const isUpdate = !!existingShopifyId;

    // Build Shopify product payload
    // Convert plain text to HTML paragraphs
    const rawDesc = shopifyListing?.description || product.description || "";
    // Split on double newlines if present, otherwise split long text into ~3-4 sentence paragraphs
    let paragraphs: string[];
    if (rawDesc.includes("\n\n")) {
      paragraphs = rawDesc.split(/\n\s*\n/).map((p: string) => p.trim()).filter((p: string) => p);
    } else {
      // Split by sentences and group into paragraphs of ~3 sentences
      const sentences = rawDesc.match(/[^.!?]+[.!?]+/g) || [rawDesc];
      paragraphs = [];
      for (let i = 0; i < sentences.length; i += 3) {
        paragraphs.push(sentences.slice(i, i + 3).join("").trim());
      }
    }
    const bodyHtml = paragraphs
      .filter((p: string) => p.length > 0)
      .map((p: string) => `<p>${p.replace(/\n/g, "<br>")}</p>`)
      .join("\n");

    const shopifyProduct: Record<string, unknown> = {
      title: shopifyListing?.title || product.title,
      body_html: bodyHtml || `<p>${rawDesc}</p>`,
      product_type: product.category,
      tags: shopifyListing?.tags?.length
        ? shopifyListing.tags.join(", ")
        : product.keywords,
      handle: shopifyListing?.url_handle || undefined,
      metafields_global_title_tag: shopifyListing?.seo_title || undefined,
      metafields_global_description_tag: shopifyListing?.seo_description || undefined,
    };

    // Build images array — design image first, then each mockup
    const images: { src: string; alt?: string; position?: number }[] = [];
    if (imageUrl) {
      images.push({
        src: imageUrl,
        alt: shopifyListing?.alt_text || product.title,
        position: 1,
      });
    }
    colorVariants.forEach((v, idx) => {
      images.push({
        src: v.imageUrl,
        alt: `${product.title} - ${v.colorName}`,
        position: idx + 2,
      });
    });
    if (images.length > 0) {
      shopifyProduct.images = images;
    }

    // Build variants with inventory tracking
    const price = product.price?.replace(/[^0-9.]/g, "") || "0.00";
    if (hasVariants) {
      shopifyProduct.options = [{ name: "Color" }];
      shopifyProduct.variants = colorVariants.map((v) => ({
        option1: v.colorName,
        price,
        inventory_management: "shopify",
        inventory_policy: "deny",
      }));
    } else {
      shopifyProduct.variants = [{ 
        price,
        inventory_management: "shopify",
        inventory_policy: "deny",
      }];
    }

    const domain = connection.store_domain.replace(/^https?:\/\//, "").replace(/\/$/, "");

    let shopifyResponse: Response;
    
    if (isUpdate) {
      // Update existing product
      shopifyResponse = await fetch(`https://${domain}/admin/api/2024-01/products/${existingShopifyId}.json`, {
        method: "PUT",
        headers: {
          "X-Shopify-Access-Token": connection.access_token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ product: shopifyProduct }),
      });
    } else {
      // Create new product
      shopifyResponse = await fetch(`https://${domain}/admin/api/2024-01/products.json`, {
        method: "POST",
        headers: {
          "X-Shopify-Access-Token": connection.access_token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ product: shopifyProduct }),
      });
    }

    if (!shopifyResponse.ok) {
      const errorText = await shopifyResponse.text();
      console.error("Shopify API error:", shopifyResponse.status, errorText);
      throw new Error(`Shopify API error (${shopifyResponse.status}): ${errorText}`);
    }

    const shopifyData = await shopifyResponse.json();
    const createdProduct = shopifyData.product;

    // Save the Shopify product ID back to our database
    if (createdProduct?.id && product.id) {
      await adminClient
        .from("products")
        .update({ shopify_product_id: createdProduct.id })
        .eq("id", product.id);
    }

    // Associate mockup images with their corresponding variants
    if (hasVariants && createdProduct?.variants?.length && createdProduct?.images?.length) {
      for (let i = 0; i < colorVariants.length; i++) {
        const variant = createdProduct.variants[i];
        // Find the matching image (offset by 1 because design image is first)
        const image = createdProduct.images[i + 1];
        if (variant && image) {
          try {
            await fetch(`https://${domain}/admin/api/2024-01/variants/${variant.id}.json`, {
              method: "PUT",
              headers: {
                "X-Shopify-Access-Token": connection.access_token,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ variant: { id: variant.id, image_id: image.id } }),
            });
          } catch (e) {
            console.error(`Failed to associate image with variant ${variant.id}:`, e);
          }
        }
      }
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
