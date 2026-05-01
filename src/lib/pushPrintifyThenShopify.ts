import { supabase } from "@/integrations/supabase/client";
import { preparePrintifyDesignBase64 } from "@/lib/printifyDesignPreparation";
import { recolorOpaquePixels } from "@/lib/removeBackground";
import { withRetry } from "@/lib/pipelineUtils";
import { buildShopifyGallery, type ShopifyGalleryVariant } from "@/lib/shopifyGallery";

/**
 * Comfort Colors 1717 light-color names. The dark-ink design variant is uploaded
 * for these so the artwork stays legible on light garments.
 */
export const CC1717_LIGHT_COLORS = new Set([
  "ivory", "butter", "banana", "blossom", "orchid", "chalky mint",
  "island reef", "chambray", "white", "flo blue", "watermelon",
  "neon pink", "neon green", "lagoon blue", "yam", "terracotta",
  "light green", "bay", "sage",
]);

export interface PushChainProduct {
  id: string;
  title: string;
  description: string;
  category?: string;
  price: string;
  keywords?: string;
  image_url: string | null;
  printify_product_id?: string | null;
  shopify_product_id?: number | null;
}

export interface PushChainListing {
  marketplace: string;
  title?: string;
  description?: string;
  tags?: string[];
  bullet_points?: string[];
  seo_title?: string;
  seo_description?: string;
  url_handle?: string;
  alt_text?: string;
}

export interface PushChainOptions {
  organizationId: string;
  userId: string;
  product: PushChainProduct;
  /** All marketplace listings for the product (Shopify will be used for the Shopify push). */
  listings: PushChainListing[];
  /** Printify shop ID to publish to. */
  printifyShopId: number;
  /** Printify blueprint id (e.g. 706 for Comfort Colors 1717). */
  blueprintId: number;
  /** Print provider id (resolve via printify-get-variants if not passed). */
  printProviderId?: number | null;
  /** Sizes to enable on the Printify product. */
  selectedSizes: string[];
  /** Colors to enable on the Printify product (defaults to ["Black"] when no mockups exist). */
  selectedColors?: string[];
  /** Per-size pricing overrides. */
  sizePricing?: Record<string, string>;
  /** Pre-fetched mockup rows (skips DB query in buildShopifyGallery). */
  mockupImages?: { color_name: string; image_url: string; position?: number }[];
  /** Saved print placement (scale/offset). */
  placement?: unknown;
  /** Whether to publish on Printify (auto-syncs to Shopify). Defaults to true. */
  publishOnPrintify?: boolean;
  /** Append the CC1717 size chart image to the Shopify gallery. Defaults to true. */
  appendSizeChart?: boolean;
  /** Optional Shopify status passed to push-to-shopify (e.g. "active" | "draft"). */
  shopifyStatus?: "active" | "draft";
  /** Extra tags to merge into the Shopify listing tags (de-duped). */
  extraShopifyTags?: string[];
  /** Optional progress callback for UIs that want fine-grained step messages. */
  onProgress?: (stage: ChainStage, message: string) => void;
  /** Optional callback used by UIs to update local product state after each persist. */
  onProductUpdate?: (updates: Partial<PushChainProduct>) => void;
  /** Use withRetry around all edge function invocations. Defaults to true. */
  retry?: boolean;
  /** Tag prefix for retry labels (helps logs distinguish parallel calls). */
  retryLabel?: string;
}

export type ChainStage =
  | "printify-design"
  | "printify-dark"
  | "printify-create"
  | "printify-update"
  | "shopify-gallery"
  | "shopify-push"
  | "skipped";

export interface PushChainResult {
  printifyProductId: string | null;
  shopifyProductId: number | null;
  shopifySkipped: boolean;
  variantCount?: number;
  /** True when the linked Printify product was missing on Printify and the stale id was cleared. */
  printifyStaleCleared?: boolean;
  /** True when the linked Shopify product was missing and the stale id was cleared. */
  shopifyStaleCleared?: boolean;
}

const invoke = async <T = any>(
  name: string,
  body: Record<string, unknown>,
  retry: boolean,
  label: string,
): Promise<{ data: T | null; error: { message: string } | null }> => {
  if (retry) {
    return (await withRetry(
      () => supabase.functions.invoke(name, { body }),
      { label },
    )) as any;
  }
  return (await supabase.functions.invoke(name, { body })) as any;
};

/**
 * End-to-end Printify → Shopify chain.
 *   • If the product already has a `printify_product_id` → updates Printify (title/desc/tags/pricing).
 *   • Otherwise → uploads design (and dark variant for light garments), creates the Printify
 *     product with `publish: true` so Printify auto-syncs to Shopify, then captures the
 *     `shopify_product_id` returned by the edge function.
 *   • Then pushes custom mockup gallery + SEO to the linked Shopify product
 *     via `push-to-shopify` (update-only — no create).
 *   • Skips the Shopify step gracefully (with a console warning) if no link exists.
 *
 * Persists `printify_product_id` and `shopify_product_id` on the products row as soon as they're known.
 */
export async function pushPrintifyThenShopify(opts: PushChainOptions): Promise<PushChainResult> {
  const {
    organizationId,
    userId,
    product,
    listings,
    printifyShopId,
    blueprintId,
    selectedSizes,
    selectedColors,
    sizePricing,
    mockupImages = [],
    placement,
    publishOnPrintify = true,
    appendSizeChart = true,
    shopifyStatus,
    extraShopifyTags = [],
    onProgress = () => {},
    onProductUpdate = () => {},
    retry = true,
    retryLabel = "chain",
  } = opts;

  if (!product.image_url) throw new Error("Product needs a design image (image_url) before pushing to Printify");

  const shopifyListing = listings.find((l) => l.marketplace === "shopify");

  const baseTags = shopifyListing?.tags
    || (product.keywords || "").split(",").map((k: string) => k.trim()).filter(Boolean);
  const mergedTags = extraShopifyTags.length > 0
    ? Array.from(new Set([...(baseTags || []), ...extraShopifyTags]))
    : baseTags;

  const printifyPayloadBase = {
    shopId: printifyShopId,
    title: shopifyListing?.title || product.title,
    description: shopifyListing?.description || product.description,
    tags: mergedTags,
    price: product.price,
    sizePricing,
    productId: product.id,
    organizationId,
  };

  let printifyProductId: string | null = product.printify_product_id ?? null;
  let currentShopifyId: number | null = product.shopify_product_id ?? null;
  let variantCount: number | undefined;
  let printifyStaleCleared = false;

  // ---------- STEP 1: Printify (update or create) ----------
  if (printifyProductId) {
    onProgress("printify-update", "Updating existing Printify product");
    const { data: pData, error: pErr } = await invoke(
      "printify-create-product",
      {
        action: "update",
        printifyProductId,
        updateFields: ["title", "description", "tags", "pricing"],
        ...printifyPayloadBase,
      },
      retry,
      `printify-update-${retryLabel}`,
    );
    if (pErr) throw new Error(`Printify update failed: ${pErr.message}`);
    if (pData?.error) throw new Error(`Printify update failed: ${pData.error}`);

    if (pData?.staleIdCleared) {
      printifyStaleCleared = true;
      printifyProductId = null;
      onProductUpdate({ printify_product_id: null });
      return {
        printifyProductId: null,
        shopifyProductId: currentShopifyId,
        shopifySkipped: true,
        printifyStaleCleared: true,
      };
    }

    if (pData?.shopifyProductId) {
      currentShopifyId = pData.shopifyProductId;
      onProductUpdate({ shopify_product_id: currentShopifyId });
    }
  } else {
    // ----- Create new Printify product -----
    const colorsToUse = selectedColors && selectedColors.length > 0
      ? selectedColors
      : (mockupImages.length > 0
        ? Array.from(new Set(mockupImages.map((m) => m.color_name)))
        : ["Black"]);
    const lightColorsSelected = colorsToUse.filter((c) => CC1717_LIGHT_COLORS.has(c.toLowerCase()));
    const hasLightColors = lightColorsSelected.length > 0;

    onProgress("printify-design", "Preparing & uploading design to Printify");
    const base64Contents = await preparePrintifyDesignBase64(product.image_url, 4500);
    const { data: uploadData, error: uploadErr } = await invoke(
      "printify-upload-image",
      {
        base64Contents,
        fileName: `${product.title}-design.png`,
        organizationId,
      },
      retry,
      `printify-upload-${retryLabel}`,
    );
    if (uploadErr) throw new Error(`Printify upload failed: ${uploadErr.message}`);
    if (uploadData?.error) throw new Error(`Printify upload failed: ${uploadData.error}`);
    const printifyImageId = uploadData?.image?.id;
    if (!printifyImageId) throw new Error("Printify did not return an image id");

    let darkPrintifyImageId: string | null = null;
    if (hasLightColors) {
      onProgress("printify-dark", "Creating dark-ink variant for light garments");
      const darkBase64 = await recolorOpaquePixels(base64Contents, { r: 24, g: 24, b: 24 });
      const { data: dUp, error: dErr } = await invoke(
        "printify-upload-image",
        {
          base64Contents: darkBase64,
          fileName: `${product.title}-dark-design.png`,
          organizationId,
        },
        retry,
        `printify-dark-upload-${retryLabel}`,
      );
      if (dErr) throw new Error(`Printify dark upload failed: ${dErr.message}`);
      if (dUp?.error) throw new Error(`Printify dark upload failed: ${dUp.error}`);
      darkPrintifyImageId = dUp?.image?.id || null;
    }

    let resolvedPrintProviderId = opts.printProviderId ?? null;
    if (!resolvedPrintProviderId) {
      const { data: variantsInfo } = await supabase.functions.invoke("printify-get-variants", {
        body: { blueprintId, organizationId, shopId: printifyShopId },
      });
      resolvedPrintProviderId = variantsInfo?.printProviderId ?? null;
    }
    if (!resolvedPrintProviderId) {
      throw new Error(`Could not resolve Printify print provider for blueprint ${blueprintId}`);
    }

    const mockupImagesForPrintify = mockupImages
      .filter((m) => colorsToUse.includes(m.color_name))
      .map((m) => ({ printifyColorName: m.color_name, imageUrl: m.image_url }));

    onProgress("printify-create", "Creating Printify product (auto-syncs to Shopify)");
    const { data: pData, error: pErr } = await invoke(
      "printify-create-product",
      {
        ...printifyPayloadBase,
        printifyImageId,
        darkPrintifyImageId,
        lightColors: hasLightColors ? [...CC1717_LIGHT_COLORS] : [],
        selectedColors: colorsToUse,
        selectedSizes,
        mockupImages: mockupImagesForPrintify,
        placement,
        printProviderId: resolvedPrintProviderId,
        blueprintId,
        publish: publishOnPrintify,
      },
      retry,
      `printify-create-${retryLabel}`,
    );
    if (pErr) throw new Error(`Printify create failed: ${pErr.message}`);
    if (pData?.error) throw new Error(`Printify create failed: ${pData.error}`);

    printifyProductId = pData?.printifyProductId ?? null;
    variantCount = pData?.variantCount;
    if (printifyProductId) {
      await supabase.from("products").update({ printify_product_id: printifyProductId }).eq("id", product.id);
      onProductUpdate({ printify_product_id: printifyProductId });
    }
    if (pData?.shopifyProductId) {
      currentShopifyId = pData.shopifyProductId;
      await supabase.from("products").update({ shopify_product_id: currentShopifyId }).eq("id", product.id);
      onProductUpdate({ shopify_product_id: currentShopifyId });
    }
  }

  // ---------- STEP 2: Shopify (update with mockups + SEO) ----------
  if (!currentShopifyId) {
    onProgress("skipped", "No linked Shopify product yet — skipping SEO push (Printify sync may still be in progress)");
    return {
      printifyProductId,
      shopifyProductId: null,
      shopifySkipped: true,
      variantCount,
      printifyStaleCleared,
    };
  }

  onProgress("shopify-gallery", "Building Shopify image gallery");
  const variants: ShopifyGalleryVariant[] = await buildShopifyGallery({
    productId: product.id,
    userId,
    appendSizeChart,
    mockups: mockupImages,
  });

  const listingsMapped = listings.map((l) => ({
    marketplace: l.marketplace,
    title: l.title,
    description: l.description,
    bullet_points: l.bullet_points,
    tags: l.tags,
    seo_title: l.seo_title,
    seo_description: l.seo_description,
    url_handle: l.url_handle,
    alt_text: l.alt_text,
  }));

  onProgress("shopify-push", "Pushing mockups & SEO to Shopify");
  const { data: shopifyData, error: shopifyError } = await invoke(
    "push-to-shopify",
    {
      organizationId,
      product: {
        id: product.id,
        title: product.title,
        description: product.description,
        category: product.category,
        price: product.price,
        keywords: product.keywords,
        shopify_product_id: currentShopifyId,
      },
      listings: listingsMapped,
      imageUrl: product.image_url,
      variants,
      forceVariants: false,
      allowCreateOnMissingProduct: false,
      replaceAllImages: true,
      ...(shopifyStatus ? { shopifyStatus } : {}),
    },
    retry,
    `shopify-${retryLabel}`,
  );
  if (shopifyError) throw new Error(`Shopify push failed: ${shopifyError.message}`);
  if (shopifyData?.error) throw new Error(`Shopify push failed: ${shopifyData.error}`);

  if (shopifyData?.staleShopifyIdCleared) {
    onProductUpdate({ shopify_product_id: null });
    return {
      printifyProductId,
      shopifyProductId: null,
      shopifySkipped: true,
      shopifyStaleCleared: true,
      variantCount,
    };
  }

  if (shopifyData?.shopifyProduct?.id) {
    currentShopifyId = shopifyData.shopifyProduct.id;
    onProductUpdate({ shopify_product_id: currentShopifyId });
  }

  return {
    printifyProductId,
    shopifyProductId: currentShopifyId,
    shopifySkipped: false,
    variantCount,
  };
}
