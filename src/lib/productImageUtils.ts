import { supabase } from "@/integrations/supabase/client";

/**
 * Insert a product image only if no matching row already exists
 * for the same product_id + image_type + color_name combo.
 */
export async function insertProductImageIfNotExists(row: {
  product_id: string;
  user_id: string;
  image_url: string;
  image_type: string;
  color_name: string;
  position: number;
}) {
  // Check for existing
  const { data: existing } = await supabase
    .from("product_images")
    .select("id")
    .eq("product_id", row.product_id)
    .eq("image_type", row.image_type)
    .eq("color_name", row.color_name)
    .limit(1);

  if (existing && existing.length > 0) {
    // Update URL if it changed
    await supabase
      .from("product_images")
      .update({ image_url: row.image_url, position: row.position })
      .eq("id", existing[0].id);
    return;
  }

  await supabase.from("product_images").insert(row);
}

/**
 * Batch insert product images with deduplication.
 * For each entry, upserts based on product_id + image_type + color_name.
 */
export async function insertProductImagesDeduped(
  rows: {
    product_id: string;
    user_id: string;
    image_url: string;
    image_type: string;
    color_name: string;
    position: number;
  }[]
) {
  for (const row of rows) {
    await insertProductImageIfNotExists(row);
  }
}

/**
 * Normalize design variant color_name for consistency.
 * "light-on-dark" / "light" → "light-on-dark"
 * "dark-on-light" / "dark" → "dark-on-light"
 */
export function normalizeDesignColorName(name: string): string {
  const key = name.toLowerCase().trim().replace(/[_\s]+/g, "-");
  if (key === "light" || key === "light-on-dark") return "light-on-dark";
  if (key === "dark" || key === "dark-on-light") return "dark-on-light";
  return name;
}

export function resolveSingleDesignVariant<T extends { image_url: string; color_name?: string | null }>(
  designImages: T[] | null | undefined,
  fallbackUrl?: string | null,
) {
  const normalized = (designImages || []).map((image) => ({
    ...image,
    normalizedColorName: normalizeDesignColorName(image.color_name || ""),
  }));

  const light = normalized.find((image) => image.normalizedColorName === "light-on-dark")?.image_url || fallbackUrl || null;
  const dark = normalized.find((image) => image.normalizedColorName === "dark-on-light")?.image_url || null;

  if (light && !dark) {
    return { lightUrl: light, darkUrl: light, hasSingleSharedFile: true };
  }

  if (!light && dark) {
    return { lightUrl: dark, darkUrl: dark, hasSingleSharedFile: true };
  }

  return { lightUrl: light, darkUrl: dark, hasSingleSharedFile: false };
}
