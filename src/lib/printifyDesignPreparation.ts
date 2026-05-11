import { ensureImageDataUrl, getPreparedDesignDataUrl } from "@/lib/mockupComposition";
import { hasMeaningfulAccentColors, isMultiColorDesign, smartRemoveBackground, upscaleBase64Png } from "@/lib/removeBackground";
import { supabase } from "@/integrations/supabase/client";

const DATA_URL_BASE64_PREFIX = /^data:image\/[a-zA-Z0-9.+-]+;base64,/;

const stripDataUrlPrefix = (value: string) => value.replace(DATA_URL_BASE64_PREFIX, "");

async function toBase64Png(value: string): Promise<string> {
  if (DATA_URL_BASE64_PREFIX.test(value)) {
    return stripDataUrlPrefix(value);
  }

  const blob = await fetch(value).then((res) => {
    if (!res.ok) throw new Error(`Failed to fetch design asset (${res.status})`);
    return res.blob();
  });

  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      if (!DATA_URL_BASE64_PREFIX.test(result)) {
        reject(new Error("Failed to convert design asset to data URL"));
        return;
      }
      resolve(stripDataUrlPrefix(result));
    };
    reader.onerror = () => reject(new Error("Failed to read design asset"));
    reader.readAsDataURL(blob);
  });
}

/**
 * Fetch already-prepared design variants from product_images (uploaded by the
 * design pipeline). These are transparent + upscaled to 4500px and safe to send
 * straight to Printify with no further processing.
 */
export async function fetchStoredPrintifyDesignVariants(productId: string): Promise<{ lightUrl: string | null; darkUrl: string | null }> {
  const { data } = await supabase
    .from("product_images")
    .select("image_url, color_name")
    .eq("product_id", productId)
    .eq("image_type", "design");
  const lightUrl = data?.find((r: any) => r.color_name === "light-on-dark")?.image_url ?? null;
  const darkUrl = data?.find((r: any) => r.color_name === "dark-on-light")?.image_url ?? null;
  return { lightUrl, darkUrl };
}

export async function preparePrintifyDesignBase64(
  designUrl: string,
  targetSize = 4500,
  options?: { productId?: string; variant?: "light" | "dark" },
): Promise<string> {
  // Reuse existing pre-processed variant when available — avoids re-running
  // background removal / upscaling on every push.
  if (options?.productId) {
    const { lightUrl, darkUrl } = await fetchStoredPrintifyDesignVariants(options.productId);
    const reuseUrl = options.variant === "dark" ? darkUrl : lightUrl;
    if (reuseUrl) {
      return await toBase64Png(reuseUrl);
    }
  }

  let preparedDesignUrl: string;

  const usesSharedDesign = await isMultiColorDesign(designUrl) || await hasMeaningfulAccentColors(designUrl);

  if (usesSharedDesign) {
    const sharedBase64 = await toBase64Png(designUrl);
    return upscaleBase64Png(sharedBase64, targetSize);
  }

  try {
    const transparentBase64 = await smartRemoveBackground(designUrl);
    preparedDesignUrl = await getPreparedDesignDataUrl(ensureImageDataUrl(transparentBase64));
  } catch {
    preparedDesignUrl = await getPreparedDesignDataUrl(designUrl);
  }

  const preparedBase64 = stripDataUrlPrefix(preparedDesignUrl);
  return upscaleBase64Png(preparedBase64, targetSize);
}
