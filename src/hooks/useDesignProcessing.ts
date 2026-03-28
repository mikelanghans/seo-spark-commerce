import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { smartRemoveBackground, isMultiColorDesign, recolorOpaquePixels, upscaleBase64Png } from "@/lib/removeBackground";

export function useDesignProcessing(userId: string | undefined) {
  const [isProcessingDesign, setIsProcessingDesign] = useState(false);
  const [designProcessingStep, setDesignProcessingStep] = useState("");
  const [pendingLightDesignUrl, setPendingLightDesignUrl] = useState<string | null>(null);
  const [pendingDarkDesignUrl, setPendingDarkDesignUrl] = useState<string | null>(null);

  const processDesignVariants = async (base64: string) => {
    if (!userId) return;
    setIsProcessingDesign(true);
    try {
      setDesignProcessingStep("Removing background…");
      const transparentBase64 = await smartRemoveBackground(base64);
      setDesignProcessingStep("Analyzing design colors…");
      const multiColor = await isMultiColorDesign(transparentBase64);
      let darkBase64: string;
      if (multiColor) {
        darkBase64 = transparentBase64;
      } else {
        setDesignProcessingStep("Creating dark variant…");
        darkBase64 = await recolorOpaquePixels(transparentBase64, { r: 24, g: 24, b: 24 }, { preserveAll: true });
      }
      setDesignProcessingStep("Upscaling to print quality…");
      const [lightUpscaled, darkUpscaled] = await Promise.all([
        upscaleBase64Png(transparentBase64, 4500),
        upscaleBase64Png(darkBase64, 4500),
      ]);
      setDesignProcessingStep("Uploading variants…");
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) await supabase.auth.refreshSession();
      const lightPath = `${userId}/design-variants/${crypto.randomUUID()}-light.png`;
      const darkPath = `${userId}/design-variants/${crypto.randomUUID()}-dark.png`;
      const lightBlob = await fetch(`data:image/png;base64,${lightUpscaled}`).then(r => r.blob());
      const darkBlob = await fetch(`data:image/png;base64,${darkUpscaled}`).then(r => r.blob());
      const [lightUpload, darkUpload] = await Promise.all([
        supabase.storage.from("product-images").upload(lightPath, lightBlob, { contentType: "image/png", upsert: true }),
        supabase.storage.from("product-images").upload(darkPath, darkBlob, { contentType: "image/png", upsert: true }),
      ]);
      if (lightUpload.error) throw lightUpload.error;
      if (darkUpload.error) throw darkUpload.error;
      const lightUrl = supabase.storage.from("product-images").getPublicUrl(lightPath).data.publicUrl;
      const darkUrl = supabase.storage.from("product-images").getPublicUrl(darkPath).data.publicUrl;
      setPendingLightDesignUrl(lightUrl);
      setPendingDarkDesignUrl(darkUrl);
      toast.success("Light & dark design variants ready!");
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
