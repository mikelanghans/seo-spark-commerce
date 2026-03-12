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

    const { product, listings, imageUrl, variants, shopifyStatus } = await req.json();

    const shopifyListing = listings?.find((l: { marketplace: string }) => l.marketplace === "shopify");

    const colorVariants: { colorName: string; imageUrl: string }[] = variants || [];
    const hasVariants = colorVariants.length > 0;

    const existingShopifyId = product.shopify_product_id;
    const isUpdate = !!existingShopifyId;

    // Build HTML description
    const rawDesc = shopifyListing?.description || product.description || "";
    const bulletPoints: string[] = shopifyListing?.bullet_points || shopifyListing?.bulletPoints || [];

    let paragraphs: string[];
    if (rawDesc.includes("\n\n")) {
      paragraphs = rawDesc.split(/\n\s*\n/).map((p: string) => p.trim()).filter((p: string) => p);
    } else {
      const sentences = rawDesc.match(/[^.!?]+[.!?]+/g) || [rawDesc];
      paragraphs = [];
      for (let i = 0; i < sentences.length; i += 3) {
        paragraphs.push(sentences.slice(i, i + 3).join("").trim());
      }
    }

    let bodyHtml = paragraphs
      .filter((p: string) => p.length > 0)
      .map((p: string) => `<p>${p.replace(/\n/g, "<br>")}</p>`)
      .join("\n");

    if (bulletPoints.length > 0) {
      bodyHtml += "\n<ul>\n" + bulletPoints.map((bp: string) => `  <li>${bp}</li>`).join("\n") + "\n</ul>";
    }

    const shopifyProduct: Record<string, unknown> = {
      title: shopifyListing?.title || product.title,
      body_html: bodyHtml || `<p>${rawDesc}</p>`,
      product_type: product.category,
      status: shopifyStatus === "draft" ? "draft" : "active",
      tags: (() => {
        let tagList: string[] = [];
        if (Array.isArray(shopifyListing?.tags)) tagList = shopifyListing.tags;
        else if (typeof shopifyListing?.tags === "string") tagList = shopifyListing.tags.split(",").map((t: string) => t.trim());
        if (!tagList.length && product.keywords) tagList = product.keywords.split(",").map((t: string) => t.trim());
        if (!tagList.includes("T-shirts")) tagList.push("T-shirts");
        return tagList.join(", ");
      })(),
      handle: shopifyListing?.url_handle || undefined,
      metafields_global_title_tag: shopifyListing?.seo_title || undefined,
      metafields_global_description_tag: shopifyListing?.seo_description || undefined,
    };

    // Collect image URLs (already optimized client-side to ≤2048px JPEG)
    const imageEntries: { url: string; alt: string; colorName?: string }[] = [];
    colorVariants.forEach((v) => {
      imageEntries.push({
        url: v.imageUrl,
        alt: `${product.title} - ${v.colorName}`,
        colorName: v.colorName,
      });
    });
    if (imageEntries.length === 0 && imageUrl) {
      imageEntries.push({
        url: imageUrl,
        alt: shopifyListing?.alt_text || product.title,
      });
    }
    console.log(`Images to upload: ${imageEntries.length}`);

    // Build variants
    const price = product.price?.replace(/[^0-9.]/g, "") || "0.00";
    if (hasVariants) {
      shopifyProduct.options = [{ name: "Color" }];
      shopifyProduct.variants = colorVariants.map((v) => ({
        option1: v.colorName,
        price,
        inventory_management: null,
        inventory_policy: "continue",
      }));
    } else {
      shopifyProduct.variants = [{
        price,
        inventory_management: null,
        inventory_policy: "continue",
      }];
    }

    const domain = connection.store_domain.replace(/^https?:\/\//, "").replace(/\/$/, "");

    let shopifyResponse: Response;
    if (isUpdate) {
      shopifyResponse = await fetch(`https://${domain}/admin/api/2024-01/products/${existingShopifyId}.json`, {
        method: "PUT",
        headers: { "X-Shopify-Access-Token": connection.access_token, "Content-Type": "application/json" },
        body: JSON.stringify({ product: shopifyProduct }),
      });
    } else {
      shopifyResponse = await fetch(`https://${domain}/admin/api/2024-01/products.json`, {
        method: "POST",
        headers: { "X-Shopify-Access-Token": connection.access_token, "Content-Type": "application/json" },
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
    console.log(`Shopify product id: ${createdProduct?.id}, variants: ${createdProduct?.variants?.length || 0}`);

    if (createdProduct?.id && product.id) {
      await adminClient
        .from("products")
        .update({ shopify_product_id: createdProduct.id })
        .eq("id", product.id);
    }

    // Upload images to Shopify (images are already optimized client-side)
    const uploadedImages: Array<{ id: number; alt: string; colorName?: string } | null> = [];
    if (createdProduct?.id && imageEntries.length > 0) {
      for (let i = 0; i < imageEntries.length; i++) {
        const entry = imageEntries[i];
        try {
          const uploadRes = await fetch(
            `https://${domain}/admin/api/2024-01/products/${createdProduct.id}/images.json`,
            {
              method: "POST",
              headers: { "X-Shopify-Access-Token": connection.access_token, "Content-Type": "application/json" },
              body: JSON.stringify({
                image: {
                  src: entry.url,
                  alt: entry.alt,
                  position: i + 1,
                  filename: `${(entry.colorName || "product").replace(/\s+/g, "-").toLowerCase()}.jpg`,
                },
              }),
            },
          );

          if (uploadRes.ok) {
            const uploadData = await uploadRes.json();
            uploadedImages[i] = { id: uploadData.image.id, alt: entry.alt, colorName: entry.colorName };
            console.log(`Uploaded image ${i + 1}/${imageEntries.length}: ${entry.colorName || "fallback"}`);
          } else {
            const errText = await uploadRes.text();
            console.error(`Image upload ${i} failed (${uploadRes.status}): ${errText}`);
            uploadedImages[i] = null;
          }
        } catch (imgErr) {
          console.error(`Image ${i} error:`, imgErr);
          uploadedImages[i] = null;
        }
      }

      const uploadedCount = uploadedImages.filter(Boolean).length;
      console.log(`Successfully uploaded ${uploadedCount}/${imageEntries.length} images`);
    }

    // Associate images with variants
    if (hasVariants && createdProduct?.variants?.length && uploadedImages.some(Boolean)) {
      for (let i = 0; i < colorVariants.length; i++) {
        const variant = createdProduct.variants[i];
        const image = uploadedImages[i];
        if (variant && image) {
          try {
            await fetch(`https://${domain}/admin/api/2024-01/variants/${variant.id}.json`, {
              method: "PUT",
              headers: { "X-Shopify-Access-Token": connection.access_token, "Content-Type": "application/json" },
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
