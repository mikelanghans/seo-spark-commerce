import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { smartRemoveBackground, isMultiColorDesign, hasMeaningfulAccentColors, recolorOpaquePixels, upscaleBase64Png, hasPredominantlyDarkInk, lightenDarkPixels } from "@/lib/removeBackground";

export function useDesignProcessing(userId: string | undefined) {
  const [isProcessingDesign, setIsProcessingDesign] = useState(false);
  const [designProcessingStep, setDesignProcessingStep] = useState("");
  const [pendingLightDesignUrl, setPendingLightDesignUrl] = useState<string | null>(null);
  const [pendingDarkDesignUrl, setPendingDarkDesignUrl] = useState<string | null>(null);

  const processDesignVariants = async (base64: string) => {
    if (!userId) return;
    setIsProcessingDesign(true);
    try {
      setDesignProcessingStep("Analyzing design colors…");
      const multiColor = await isMultiColorDesign(base64);
      const hasAccents = !multiColor && await hasMeaningfulAccentColors(base64);
      const usesSharedDesign = multiColor || hasAccents;
      const transparentBase64 = usesSharedDesign ? base64 : await smartRemoveBackground(base64);
      let darkUpscaled: string | null = null;

      if (!usesSharedDesign) {
        setDesignProcessingStep("Creating dark variant…");
        const darkBase64 = await recolorOpaquePixels(transparentBase64, { r: 24, g: 24, b: 24 }, { preserveAll: true });
        setDesignProcessingStep("Upscaling to print quality…");
        darkUpscaled = await upscaleBase64Png(darkBase64, 4500);
      } else {
        // Shared/accent design: if its non-accent ink is mostly dark, also create a
        // light-ink variant so it stays visible on dark garments (Black, Navy, etc.)
        try {
          const inkIsDark = await hasPredominantlyDarkInk(transparentBase64);
          if (inkIsDark) {
            setDesignProcessingStep("Creating light variant for dark garments…");
            const lightInkBase64 = await lightenDarkPixels(transparentBase64);
            setDesignProcessingStep("Upscaling to print quality…");
            darkUpscaled = await upscaleBase64Png(lightInkBase64, 4500);
          }
        } catch (e) {
          console.warn("Light-ink variant generation skipped:", e);
        }
      }

      setDesignProcessingStep("Upscaling to print quality…");
      const lightUpscaled = await upscaleBase64Png(transparentBase64, 4500);
      setDesignProcessingStep("Uploading variants…");
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) await supabase.auth.refreshSession();
      const lightPath = `${userId}/design-variants/${crypto.randomUUID()}-light.png`;
      const darkPath = darkUpscaled ? `${userId}/design-variants/${crypto.randomUUID()}-dark.png` : null;
      const lightBlob = await fetch(`data:image/png;base64,${lightUpscaled}`).then(r => r.blob());
      const darkBlob = darkUpscaled
        ? await fetch(`data:image/png;base64,${darkUpscaled}`).then(r => r.blob())
        : null;
      const uploads = await Promise.all([
        supabase.storage.from("product-images").upload(lightPath, lightBlob, { contentType: "image/png", upsert: true }),
        darkPath && darkBlob
          ? supabase.storage.from("product-images").upload(darkPath, darkBlob, { contentType: "image/png", upsert: true })
          : Promise.resolve({ data: null, error: null }),
      ]);
      const [lightUpload, darkUpload] = uploads;
      if (lightUpload.error) throw lightUpload.error;
      if (darkUpload.error) throw darkUpload.error;
      const lightUrl = supabase.storage.from("product-images").getPublicUrl(lightPath).data.publicUrl;
      const darkUrl = darkPath
        ? supabase.storage.from("product-images").getPublicUrl(darkPath).data.publicUrl
        : null;
      setPendingLightDesignUrl(lightUrl);
      setPendingDarkDesignUrl(darkUrl);
      toast.success(darkUrl ? "Light & dark design variants ready!" : "Design ready for all garments!");
    } catch (err: any) {
      console.error("Design processing error:", err);
      toast.error("Design variant processing failed: " + (err.message || "Unknown error"));
    } finally {
      setIsProcessingDesign(false);
      setDesignProcessingStep("");
    }
  };

  const reset = () => {
    setPendingLightDesignUrl(null);
    setPendingDarkDesignUrl(null);
  };

  return {
    isProcessingDesign, designProcessingStep,
    pendingLightDesignUrl, setPendingLightDesignUrl,
    pendingDarkDesignUrl, setPendingDarkDesignUrl,
    processDesignVariants, reset,
  };
}
