import { supabase } from "@/integrations/supabase/client";

/**
 * Resize an image to max 2048px wide JPEG and upload to Supabase storage.
 * Returns the public URL of the optimized image.
 * This keeps images under Shopify's 20MB limit.
 */
export const optimizeImageForShopify = (
  imageUrl: string,
  userId: string,
  productId: string,
  colorName: string,
): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = async () => {
      try {
        const maxWidth = 2048;
        const scale = img.width > maxWidth ? maxWidth / img.width : 1;
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);

        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0, w, h);

        const blob = await new Promise<Blob>((res, rej) => {
          canvas.toBlob(
            (b) => (b ? res(b) : rej(new Error("Canvas toBlob failed"))),
            "image/jpeg",
            0.85,
          );
        });

        const safeName = colorName.replace(/\s+/g, "-").toLowerCase();
        const path = `${userId}/shopify-optimized/${productId}/${safeName}-${Date.now()}.jpg`;

        const { error: upErr } = await supabase.storage
          .from("product-images")
          .upload(path, blob, { contentType: "image/jpeg", cacheControl: "3600", upsert: true });

        if (upErr) throw upErr;

        const { data: urlData } = supabase.storage
          .from("product-images")
          .getPublicUrl(path);

        resolve(urlData.publicUrl);
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = () => reject(new Error(`Failed to load image: ${imageUrl}`));
    img.src = imageUrl;
  });
};

/**
 * Optimize an array of variant images for Shopify.
 * Falls back to original URL if optimization fails.
 */
export const optimizeVariantsForShopify = async (
  variants: { colorName: string; imageUrl: string }[],
  userId: string,
  productId: string,
): Promise<{ colorName: string; imageUrl: string }[]> => {
  return Promise.all(
    variants.map(async (v) => {
      try {
        const optimizedUrl = await optimizeImageForShopify(v.imageUrl, userId, productId, v.colorName);
        return { colorName: v.colorName, imageUrl: optimizedUrl };
      } catch (err) {
        console.warn(`Failed to optimize ${v.colorName}, using original`, err);
        return v;
      }
    }),
  );
};
