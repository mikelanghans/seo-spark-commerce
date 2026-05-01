import { supabase } from "@/integrations/supabase/client";
import { optimizeVariantsForShopify } from "@/lib/shopifyImageOptimizer";
import { CC1717_SIZE_CHART_URL } from "@/lib/sizeChart";

export interface ShopifyGalleryVariant {
  colorName: string;
  imageUrl: string;
}

export interface BuildShopifyGalleryOptions {
  productId: string;
  userId: string;
  /** Append the Comfort Colors 1717 size chart as the final gallery image. Defaults to true. */
  appendSizeChart?: boolean;
  /** Optional pre-fetched mockup rows to skip the DB query. */
  mockups?: { image_url: string; color_name: string; position?: number }[];
}

/**
 * Build the Shopify image gallery for a product:
 *   1. Fetch mockup rows from product_images (image_type = 'mockup'), ordered by position
 *      (or accept pre-fetched rows for callers that already have them).
 *   2. Optimize each image (resize → JPEG → re-upload) via optimizeVariantsForShopify.
 *   3. Append the CC1717 size chart as the last image (opt-out via appendSizeChart=false).
 *
 * Returns the variant array ready to pass into the `variants` field of `push-to-shopify`.
 */
export async function buildShopifyGallery({
  productId,
  userId,
  appendSizeChart = true,
  mockups,
}: BuildShopifyGalleryOptions): Promise<ShopifyGalleryVariant[]> {
  let rows = mockups;
  if (!rows) {
    const { data } = await supabase
      .from("product_images")
      .select("image_url, color_name, position")
      .eq("product_id", productId)
      .eq("image_type", "mockup")
      .order("position");
    rows = data || [];
  }

  const rawVariants: ShopifyGalleryVariant[] = (rows || []).map((m) => ({
    colorName: m.color_name,
    imageUrl: m.image_url,
  }));

  const optimized = await optimizeVariantsForShopify(rawVariants, userId, productId);

  if (appendSizeChart) {
    optimized.push({ colorName: "Size Chart", imageUrl: CC1717_SIZE_CHART_URL });
  }

  return optimized;
}
