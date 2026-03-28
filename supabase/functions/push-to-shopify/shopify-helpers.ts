/** Build HTML description from listing data */
export function buildBodyHtml(rawDesc: string, bulletPoints: string[]): string {
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

  return bodyHtml;
}

/** Build the Shopify product payload */
export function buildShopifyProduct(
  product: Record<string, any>,
  shopifyListing: Record<string, any> | undefined,
  bodyHtml: string,
  shopifyStatus: string | undefined,
  colorVariants: { colorName: string; imageUrl: string }[],
  price: string,
): Record<string, unknown> {
  const actualColorVariants = colorVariants.filter((v) => v.colorName !== "Size Chart");
  const hasVariants = actualColorVariants.length > 0;

  const shopifyProduct: Record<string, unknown> = {
    title: shopifyListing?.title || product.title,
    body_html: bodyHtml || `<p>${product.description || ""}</p>`,
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

  if (hasVariants) {
    shopifyProduct.options = [{ name: "Color" }];
    shopifyProduct.variants = actualColorVariants.map((v) => ({
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

  return shopifyProduct;
}

/** Categorize variant images into variant images and extras (e.g. size chart) */
export function categorizeImages(
  colorVariants: { colorName: string; imageUrl: string }[],
  product: Record<string, any>,
  shopifyListing: Record<string, any> | undefined,
  fallbackImageUrl: string | null,
) {
  const variantImages: { url: string; alt: string; colorName: string }[] = [];
  const extraImages: { url: string; alt: string }[] = [];

  colorVariants.forEach((v) => {
    if (v.colorName === "Size Chart") {
      extraImages.push({ url: v.imageUrl, alt: "Size Chart" });
    } else {
      variantImages.push({
        url: v.imageUrl,
        alt: `${product.title} - ${v.colorName}`,
        colorName: v.colorName,
      });
    }
  });

  const imageEntries: { url: string; alt: string; colorName?: string }[] = [
    ...variantImages,
    ...extraImages,
  ];

  if (imageEntries.length === 0 && fallbackImageUrl) {
    imageEntries.push({
      url: fallbackImageUrl,
      alt: shopifyListing?.alt_text || product.title,
    });
  }

  return { variantImages, imageEntries };
}

/** Upload images to Shopify and associate them with variants */
export async function uploadAndAssociateImages(
  domain: string,
  accessToken: string,
  productId: number,
  imageEntries: { url: string; alt: string; colorName?: string }[],
  variants: { id: number }[],
  actualColorVariants: { colorName: string; imageUrl: string }[],
) {
  const uploadedImages: Array<{ id: number; alt: string; colorName?: string } | null> = [];

  for (let i = 0; i < imageEntries.length; i++) {
    const entry = imageEntries[i];
    try {
      const uploadRes = await fetch(
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

  // Associate images with variants
  const hasVariants = actualColorVariants.length > 0;
  if (hasVariants && variants?.length && uploadedImages.some(Boolean)) {
    for (let i = 0; i < actualColorVariants.length; i++) {
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

  return uploadedImages;
}
