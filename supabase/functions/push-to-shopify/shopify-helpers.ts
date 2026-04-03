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
  isUpdate = false,
  updateFields?: string[],
): Record<string, unknown> {
  const actualColorVariants = colorVariants.filter((v) => v.colorName !== "Size Chart");
  const hasVariants = actualColorVariants.length > 0;

  // If updateFields is provided, only include those fields
  const include = (field: string) => !updateFields || updateFields.includes(field);

  const shopifyProduct: Record<string, unknown> = {};

  if (include("title")) {
    shopifyProduct.title = shopifyListing?.title || product.title;
  }
  if (include("description")) {
    shopifyProduct.body_html = bodyHtml || `<p>${product.description || ""}</p>`;
  }
  if (include("title") || !updateFields) {
    shopifyProduct.product_type = product.category;
    shopifyProduct.status = shopifyStatus === "draft" ? "draft" : "active";
  }
  if (include("tags")) {
    shopifyProduct.tags = (() => {
      let tagList: string[] = [];
      if (Array.isArray(shopifyListing?.tags)) tagList = shopifyListing.tags;
      else if (typeof shopifyListing?.tags === "string") tagList = shopifyListing.tags.split(",").map((t: string) => t.trim());
      if (!tagList.length && product.keywords) tagList = product.keywords.split(",").map((t: string) => t.trim());
      if (!tagList.includes("T-shirts")) tagList.push("T-shirts");
      return tagList.join(", ");
    })();
  }
  if (include("seo")) {
    shopifyProduct.handle = shopifyListing?.url_handle || undefined;
    shopifyProduct.metafields_global_title_tag = shopifyListing?.seo_title || undefined;
    shopifyProduct.metafields_global_description_tag = shopifyListing?.seo_description || undefined;
  }

  if (!isUpdate && hasVariants) {
    shopifyProduct.options = [{ name: "Color" }];
    shopifyProduct.variants = actualColorVariants.map((v) => ({
      option1: v.colorName,
      price,
      inventory_management: null,
      inventory_policy: "continue",
    }));
  } else if (!isUpdate) {
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

/** Delete all existing images from a Shopify product */
export async function deleteExistingImages(
  domain: string,
  accessToken: string,
  productId: number,
) {
  try {
    const res = await fetch(
      `https://${domain}/admin/api/2024-01/products/${productId}/images.json`,
      { headers: { "X-Shopify-Access-Token": accessToken } },
    );
    if (!res.ok) return;
    const data = await res.json();
    const images = data.images || [];
    console.log(`Deleting ${images.length} existing images from Shopify product ${productId}`);
    for (const img of images) {
      await fetch(
        `https://${domain}/admin/api/2024-01/products/${productId}/images/${img.id}.json`,
        { method: "DELETE", headers: { "X-Shopify-Access-Token": accessToken } },
      );
    }
  } catch (e) {
    console.error("Failed to delete existing images:", e);
  }
}

/** Delete stale variants that are not in the new color list */
export async function deleteStaleVariants(
  domain: string,
  accessToken: string,
  productId: number,
  existingVariants: { id: number; option1: string }[],
  newColorNames: string[],
) {
  const newColors = new Set(newColorNames.map((c) => c.toLowerCase()));
  const staleVariants = existingVariants.filter(
    (v) => v.option1 && !newColors.has(v.option1.toLowerCase()),
  );

  if (staleVariants.length === 0) return;

  // Shopify requires at least 1 variant — only delete if we'll have others remaining
  const remaining = existingVariants.length - staleVariants.length;
  if (remaining < 1) {
    console.log(`Skipping variant deletion — would leave 0 variants`);
    return;
  }

  console.log(`Deleting ${staleVariants.length} stale Shopify variants`);
  for (const v of staleVariants) {
    try {
      await fetch(
        `https://${domain}/admin/api/2024-01/products/${productId}/variants/${v.id}.json`,
        { method: "DELETE", headers: { "X-Shopify-Access-Token": accessToken } },
      );
    } catch (e) {
      console.error(`Failed to delete variant ${v.id}:`, e);
    }
  }
}

/** Upload images to Shopify and associate them with variants */
export async function uploadAndAssociateImages(
  domain: string,
  accessToken: string,
  productId: number,
  imageEntries: { url: string; alt: string; colorName?: string }[],
  variants: { id: number; option1?: string }[],
  actualColorVariants: { colorName: string; imageUrl: string }[],
  productTitle?: string,
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
              filename: `${(productTitle || "product").replace(/[^a-z0-9]+/gi, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").toLowerCase()}-${(entry.colorName || "mockup").replace(/[^a-z0-9]+/gi, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").toLowerCase()}.jpg`,
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

  // Associate images with variants by matching color name
  if (actualColorVariants.length > 0 && variants?.length && uploadedImages.some(Boolean)) {
    for (let i = 0; i < uploadedImages.length; i++) {
      const image = uploadedImages[i];
      if (!image || !image.colorName) continue;

      // Find ALL matching variants by color name (option1/option2/option3)
      // A Color×Size matrix has multiple variants per color (one per size)
      const matchingVariants = variants.filter(
        (v: any) =>
          (v.option1 && v.option1.toLowerCase() === image.colorName!.toLowerCase()) ||
          (v.option2 && v.option2.toLowerCase() === image.colorName!.toLowerCase()) ||
          (v.option3 && v.option3.toLowerCase() === image.colorName!.toLowerCase()),
      );

      for (const matchingVariant of matchingVariants) {
        try {
          await fetch(`https://${domain}/admin/api/2024-01/variants/${matchingVariant.id}.json`, {
            method: "PUT",
            headers: { "X-Shopify-Access-Token": accessToken, "Content-Type": "application/json" },
            body: JSON.stringify({ variant: { id: matchingVariant.id, image_id: image.id } }),
          });
          console.log(`Associated image with variant ${matchingVariant.id} (${image.colorName})`);
        } catch (e) {
          console.error(`Failed to associate image with variant ${matchingVariant.id}:`, e);
        }
      }
    }
  }

  return uploadedImages;
}
