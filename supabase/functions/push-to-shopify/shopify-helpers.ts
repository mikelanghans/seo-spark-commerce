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
  forceVariants = false,
  sizePricing?: Record<string, string> | null,
  sizes?: string[],
): Record<string, unknown> {
  const actualColorVariants = colorVariants.filter((v) => v.colorName !== "Size Chart");
  const hasVariants = actualColorVariants.length > 0;
  const hasSizes = sizes && sizes.length > 0;
  const effectiveUpdateFields = isUpdate ? updateFields : undefined;
  const include = (field: string) => !effectiveUpdateFields || effectiveUpdateFields.includes(field);

  const shopifyProduct: Record<string, unknown> = {};

  if (isUpdate && product.shopify_product_id) {
    shopifyProduct.id = product.shopify_product_id;
  }

  // Title is always required by Shopify API — include it regardless of updateFields
  shopifyProduct.title = shopifyListing?.title || product.title || "Untitled Product";

  if (include("title")) {
    // title already set above
  }
  if (include("description")) {
    shopifyProduct.body_html = bodyHtml || `<p>${product.description || ""}</p>`;
  }
  if (include("title") || !effectiveUpdateFields) {
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
    // Only set handle on creation — resending it on updates causes Shopify
    // to append "-1", "-2", etc. when the slug already exists.
    if (!isUpdate) {
      shopifyProduct.handle = shopifyListing?.url_handle || undefined;
    }
  }

  // Only send variants when creating new products or explicitly forcing variant sync.
  // Sending variants on update replaces the existing set, which disassociates images.
  const shouldSendVariants = !isUpdate || forceVariants;
  if (shouldSendVariants && hasVariants) {
    if (hasSizes) {
      // Build Color × Size matrix
      shopifyProduct.options = [{ name: "Color" }, { name: "Size" }];
      const variantList: Record<string, unknown>[] = [];
      for (const cv of actualColorVariants) {
        for (const size of sizes!) {
          const variantPrice = sizePricing?.[size] || price;
          variantList.push({
            option1: cv.colorName,
            option2: size,
            price: variantPrice,
            inventory_management: null,
            inventory_policy: "continue",
            requires_shipping: true,
          });
        }
      }
      shopifyProduct.variants = variantList;
    } else {
      shopifyProduct.options = [{ name: "Color" }];
      shopifyProduct.variants = actualColorVariants.map((v) => ({
        option1: v.colorName,
        price,
        inventory_management: null,
        inventory_policy: "continue",
        requires_shipping: true,
      }));
    }
  } else if (shouldSendVariants) {
    if (hasSizes) {
      shopifyProduct.options = [{ name: "Size" }];
      shopifyProduct.variants = sizes!.map((size) => ({
        option1: size,
        price: sizePricing?.[size] || price,
        inventory_management: null,
        inventory_policy: "continue",
        requires_shipping: true,
      }));
    } else {
      shopifyProduct.variants = [{
        price,
        inventory_management: null,
        inventory_policy: "continue",
        requires_shipping: true,
      }];
    }
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
  /** If provided, only delete images whose alt text matches one of these color names */
  onlyColors?: string[],
) {
  try {
    const res = await fetch(
      `https://${domain}/admin/api/2024-01/products/${productId}/images.json`,
      { headers: { "X-Shopify-Access-Token": accessToken } },
    );
    if (!res.ok) return;
    const data = await res.json();
    const allImages = data.images || [];

    let imagesToDelete = allImages;
    if (onlyColors && onlyColors.length > 0) {
      const colorSet = new Set(onlyColors.map((c: string) => c.toLowerCase()));
      imagesToDelete = allImages.filter((img: any) => {
        const alt = (img.alt || "").toLowerCase();
        // Match if alt text contains the color name, or if it's an extra like "size chart"
        return colorSet.has(alt) || [...colorSet].some((c) => alt.includes(` - ${c}`)) || alt.includes(alt);
      });
      // If we can't reliably match by alt text, fall back to deleting all
      if (imagesToDelete.length === 0) {
        imagesToDelete = allImages;
      }
    }

    console.log(`Deleting ${imagesToDelete.length}/${allImages.length} images from Shopify product ${productId}`);
    for (const img of imagesToDelete) {
      await fetch(
        `https://${domain}/admin/api/2024-01/products/${productId}/images/${img.id}.json`,
        { method: "DELETE", headers: { "X-Shopify-Access-Token": accessToken } },
      );
    }
  } catch (e) {
    console.error("Failed to delete existing images:", e);
  }
}

/** Add missing color variants to an existing Shopify product.
 *  Reads the existing sizes from current variants and creates Color×Size entries
 *  for any pushed colors that don't already exist on the product. */
export async function addMissingColorVariants(
  domain: string,
  accessToken: string,
  productId: number,
  existingVariants: { id: number; option1?: string; option2?: string }[],
  pushedColors: string[],
  price: string,
): Promise<{ id: number; option1?: string; option2?: string }[]> {
  const existingColors = new Set(
    existingVariants.map((v) => (v.option1 || "").toLowerCase()),
  );
  const missingColors = pushedColors.filter(
    (c) => !existingColors.has(c.toLowerCase()),
  );
  if (missingColors.length === 0) return existingVariants;

  // Determine sizes from existing variants (option2)
  const sizes = Array.from(
    new Set(existingVariants.map((v) => v.option2).filter(Boolean)),
  ) as string[];

  const newVariants: { id: number; option1?: string; option2?: string }[] = [];

  for (const color of missingColors) {
    const toCreate = sizes.length > 0
      ? sizes.map((size) => ({ option1: color, option2: size, price, inventory_management: null, inventory_policy: "continue", requires_shipping: true }))
      : [{ option1: color, price, inventory_management: null, inventory_policy: "continue", requires_shipping: true }];

    for (const variant of toCreate) {
      try {
        const res = await fetch(
          `https://${domain}/admin/api/2024-01/products/${productId}/variants.json`,
          {
            method: "POST",
            headers: { "X-Shopify-Access-Token": accessToken, "Content-Type": "application/json" },
            body: JSON.stringify({ variant }),
          },
        );
        if (res.ok) {
          const data = await res.json();
          newVariants.push(data.variant);
          console.log(`Created variant: ${color}${sizes.length > 0 ? ` / ${(variant as { option2?: string }).option2 ?? ""}` : ""}`);
        } else {
          const errText = await res.text();
          console.error(`Failed to create variant ${color}: ${errText}`);
        }
      } catch (e) {
        console.error(`Error creating variant ${color}:`, e);
      }
    }
  }

  console.log(`Added ${newVariants.length} new color variants to Shopify product ${productId}`);
  return [...existingVariants, ...newVariants];
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

/** Update SEO metafields (title_tag, description_tag) on a Shopify product */
export async function updateSeoMetafields(
  domain: string,
  accessToken: string,
  productId: number,
  seoTitle?: string,
  seoDescription?: string,
) {
  const metafields: { namespace: string; key: string; value: string; type: string }[] = [];

  if (seoTitle) {
    metafields.push({ namespace: "global", key: "title_tag", value: seoTitle, type: "single_line_text_field" });
  }
  if (seoDescription) {
    metafields.push({ namespace: "global", key: "description_tag", value: seoDescription, type: "single_line_text_field" });
  }

  if (metafields.length === 0) return;

  for (const mf of metafields) {
    try {
      const res = await fetch(
        `https://${domain}/admin/api/2024-01/products/${productId}/metafields.json`,
        {
          method: "POST",
          headers: { "X-Shopify-Access-Token": accessToken, "Content-Type": "application/json" },
          body: JSON.stringify({ metafield: { ...mf, owner_resource: "product", owner_id: productId } }),
        },
      );
      if (!res.ok) {
        // If metafield already exists, try to find and update it
        const listRes = await fetch(
          `https://${domain}/admin/api/2024-01/products/${productId}/metafields.json?namespace=global&key=${mf.key}`,
          { headers: { "X-Shopify-Access-Token": accessToken } },
        );
        if (listRes.ok) {
          const listData = await listRes.json();
          const existing = listData.metafields?.[0];
          if (existing) {
            await fetch(
              `https://${domain}/admin/api/2024-01/metafields/${existing.id}.json`,
              {
                method: "PUT",
                headers: { "X-Shopify-Access-Token": accessToken, "Content-Type": "application/json" },
                body: JSON.stringify({ metafield: { id: existing.id, value: mf.value, type: mf.type } }),
              },
            );
          }
        }
      }
      console.log(`Set SEO metafield: ${mf.key}`);
    } catch (e) {
      console.error(`Failed to set SEO metafield ${mf.key}:`, e);
    }
  }
}
