import { supabase } from "@/integrations/supabase/client";
import {
  darkenBrightPixels,
  hasMeaningfulAccentColors,
  hasPredominantlyDarkInk,
  isMultiColorDesign,
  lightenDarkPixels,
  recolorOpaquePixels,
  smartRemoveBackground,
  upscaleBase64Png,
} from "@/lib/removeBackground";

const DARK_INK_RGB = { r: 24, g: 24, b: 24 };
const DATA_URL_BASE64_PREFIX = /^data:image\/[a-zA-Z0-9.+-]+;base64,/;

async function uploadVariantBase64(userId: string, base64: string, suffix: "light" | "dark") {
  const blob = await fetch(`data:image/png;base64,${base64}`).then((res) => res.blob());
  const path = `${userId}/design-variants/${crypto.randomUUID()}-${suffix}.png`;
  const { error } = await supabase.storage.from("product-images").upload(path, blob, {
    contentType: "image/png",
    upsert: true,
  });

  if (error) throw error;

  return supabase.storage.from("product-images").getPublicUrl(path).data.publicUrl;
}

export async function createAndUploadDesignVariants({
  sourceDataUrl,
  userId,
  targetSize = 4500,
  forceShared = false,
}: {
  sourceDataUrl: string;
  userId: string;
  targetSize?: number;
  forceShared?: boolean;
}) {
  const sourceBase64 = sourceDataUrl.replace(DATA_URL_BASE64_PREFIX, "");

  // When the user explicitly wants a single shared file, skip ALL processing
  // (no bg removal, no recoloring, no light/dark split). Just upscale once.
  if (forceShared) {
    const sharedBase64 = await upscaleBase64Png(sourceBase64, targetSize);
    const sharedUrl = await uploadVariantBase64(userId, sharedBase64, "light");
    return { lightUrl: sharedUrl, darkUrl: sharedUrl, hasDistinctDarkVariant: false };
  }

  const multiColor = await isMultiColorDesign(sourceBase64);
  const hasAccents = !multiColor && await hasMeaningfulAccentColors(sourceBase64);
  const usesSharedDesign = multiColor || hasAccents;
  const transparentBase64 = usesSharedDesign ? sourceBase64 : await smartRemoveBackground(sourceDataUrl);

  let lightBase64: string | null = null;
  let darkBase64: string | null = null;

  if (!usesSharedDesign) {
    const inkIsDark = await hasPredominantlyDarkInk(transparentBase64).catch(() => false);

    if (inkIsDark) {
      lightBase64 = await upscaleBase64Png(await lightenDarkPixels(transparentBase64), targetSize);
      darkBase64 = await upscaleBase64Png(transparentBase64, targetSize);
    } else {
      lightBase64 = await upscaleBase64Png(transparentBase64, targetSize);
      darkBase64 = await upscaleBase64Png(
        await recolorOpaquePixels(transparentBase64, DARK_INK_RGB, { preserveAll: true }),
        targetSize,
      );
    }
  } else {
    lightBase64 = await upscaleBase64Png(transparentBase64, targetSize);
    darkBase64 = await upscaleBase64Png(await darkenBrightPixels(transparentBase64), targetSize);

    try {
      const inkIsDark = await hasPredominantlyDarkInk(transparentBase64);
      if (inkIsDark) {
        lightBase64 = await upscaleBase64Png(await lightenDarkPixels(transparentBase64), targetSize);
        darkBase64 = await upscaleBase64Png(transparentBase64, targetSize);
      }
    } catch (error) {
      console.warn("Light-ink variant generation skipped:", error);
    }
  }

  if (!lightBase64) {
    lightBase64 = await upscaleBase64Png(transparentBase64, targetSize);
  }

  const lightUrl = await uploadVariantBase64(userId, lightBase64, "light");
  const hasDistinctDarkVariant = !!darkBase64 && darkBase64 !== lightBase64;
  const darkUrl = darkBase64
    ? (hasDistinctDarkVariant ? await uploadVariantBase64(userId, darkBase64, "dark") : lightUrl)
    : null;

  return {
    lightUrl,
    darkUrl,
    hasDistinctDarkVariant,
  };
}