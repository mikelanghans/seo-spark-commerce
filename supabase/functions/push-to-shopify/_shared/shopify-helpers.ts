export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

export interface ShopifyVariant {
  colorName: string;
  imageUrl: string;
}

export function buildHtmlDescription(rawDesc: string, bulletPoints: string[]): string {
  let paragraphs: string[];
  if (rawDesc.includes("\n\n")) {
    paragraphs = rawDesc.split(/\n\s*\n/).map((p) => p.trim()).filter((p) => p);
  } else {
    const sentences = rawDesc.match(/[^.!?]+[.!?]+/g) || [rawDesc];
    paragraphs = [];
    for (let i = 0; i < sentences.length; i += 3) {
      paragraphs.push(sentences.slice(i, i + 3).join("").trim());
    }
  }

  let bodyHtml = paragraphs
    .filter((p) => p.length > 0)
    .map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`)
    .join("\n");

  if (bulletPoints.length > 0) {
    bodyHtml += "\n<ul>\n" + bulletPoints.map((bp) => `  <li>${bp}</li>`).join("\n") + "\n</ul>";
  }

  return bodyHtml;
}

export function buildShopifyProduct(
  product: Record<string, any>,
  shopifyListing: Record<string, any> | undefined,
  bodyHtml: string,
  actualColorVariants: ShopifyVariant[],
  shopifyStatus?: string,
): Record<string, unknown> {
  const price = product.price?.replace(/[^0-9.]/g, "") || "0.00";
  const hasVariants = actualColorVariants.length > 0;

  const tagList = (() => {
    let tags: string[] = [];
    if (Array.isArray(shopifyListing?.tags)) tags = shopifyListing.tags;
    else if (typeof shopifyListing?.tags === "string")
      tags = shopifyListing.tags.split(",").map((t: string) => t.trim());
    if (!tags.length && product.keywords)
      tags = product.keywords.split(",").map((t: string) => t.trim());
    if (!tags.includes("T-shirts")) tags.push("T-shirts");
    return tags.join(", ");
  })();

  const shopifyProduct: Record<string, unknown> = {
    title: shopifyListing?.title || product.title,
    body_html: bodyHtml || `<p>${product.description || ""}</p>`,
    product_type: product.category,
    status: shopifyStatus === "draft" ? "draft" : "active",
    tags: tagList,
    handle: shopifyListing?.url_handle || undefined,
    metafields_global_title_tag: shopifyListing?.seo_title || undefined,
    metafields_global_description_tag: shopifyListing?.seo_description || undefined,
  };

  if (hasVariants) {
    shopifyProduct.options = [{ name: "Color" }];
    shopifyProduct.variants = actualColorVariants.map((v) => ({
      option1: v.colorName,
      price,
      inventory_management: null,
      inventory_policy: "continue",
    }));
  } else {
    shopifyProduct.variants = [{ price, inventory_management: null, inventory_policy: "continue" }];
  }

  return shopifyProduct;
}

export async function uploadImagesToShopify(
  domain: string,
  accessToken: string,
  productId: number,
  imageEntries: { url: string; alt: string; colorName?: string }[],
): Promise<Array<{ id: number; alt: string; colorName?: string } | null>> {
  const results: Array<{ id: number; alt: string; colorName?: string } | null> = [];

  for (let i = 0; i < imageEntries.length; i++) {
    const entry = imageEntries[i];
    try {
      const res = await fetch(
        `https://${domain}/admin/api/2024-01/products/${productId}/images.json`,
        {
          method: "POST",
          headers: { "X-Shopify-Access-Token": accessToken, "Content-Type": "application/json" },
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

      if (res.ok) {
        const data = await res.json();
        results[i] = { id: data.image.id, alt: entry.alt, colorName: entry.colorName };
        console.log(`Uploaded image ${i + 1}/${imageEntries.length}: ${entry.colorName || "fallback"}`);
      } else {
        const errText = await res.text();
        console.error(`Image upload ${i} failed (${res.status}): ${errText}`);
        results[i] = null;
      }
    } catch (err) {
      console.error(`Image ${i} error:`, err);
      results[i] = null;
    }
  }

  return results;
}

export async function associateImagesWithVariants(
  domain: string,
  accessToken: string,
  variants: Array<{ id: number }>,
  uploadedImages: Array<{ id: number } | null>,
): Promise<void> {
  for (let i = 0; i < variants.length; i++) {
    const variant = variants[i];
    const image = uploadedImages[i];
    if (variant && image) {
      try {
        await fetch(`https://${domain}/admin/api/2024-01/variants/${variant.id}.json`, {
          method: "PUT",
          headers: { "X-Shopify-Access-Token": accessToken, "Content-Type": "application/json" },
          body: JSON.stringify({ variant: { id: variant.id, image_id: image.id } }),
        });
      } catch (e) {
        console.error(`Failed to associate image with variant ${variant.id}:`, e);
      }
    }
  }
}
