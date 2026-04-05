import { ensureImageDataUrl, getPreparedDesignDataUrl } from "@/lib/mockupComposition";
import { hasMeaningfulAccentColors, isMultiColorDesign, smartRemoveBackground, upscaleBase64Png } from "@/lib/removeBackground";

const DATA_URL_BASE64_PREFIX = /^data:image\/[a-zA-Z0-9.+-]+;base64,/;

const stripDataUrlPrefix = (value: string) => value.replace(DATA_URL_BASE64_PREFIX, "");

export async function preparePrintifyDesignBase64(designUrl: string, targetSize = 4500): Promise<string> {
  let preparedDesignUrl: string;

  const usesSharedDesign = await isMultiColorDesign(designUrl) || await hasMeaningfulAccentColors(designUrl);

  if (usesSharedDesign) {
    const sharedBase64 = stripDataUrlPrefix(ensureImageDataUrl(designUrl));
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
