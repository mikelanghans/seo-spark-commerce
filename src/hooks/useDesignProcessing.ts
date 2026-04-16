import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { createAndUploadDesignVariants } from "@/lib/designVariantUpload";

export function useDesignProcessing(userId: string | undefined) {
  const [isProcessingDesign, setIsProcessingDesign] = useState(false);
  const [designProcessingStep, setDesignProcessingStep] = useState("");
  const [pendingLightDesignUrl, setPendingLightDesignUrl] = useState<string | null>(null);
  const [pendingDarkDesignUrl, setPendingDarkDesignUrl] = useState<string | null>(null);

  const processDesignVariants = async (base64: string, options?: { forceShared?: boolean }) => {
    if (!userId) return;
    setIsProcessingDesign(true);
    try {
      setDesignProcessingStep(options?.forceShared ? "Uploading single shared file…" : "Uploading variants…");
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) await supabase.auth.refreshSession();
      const { lightUrl, darkUrl, hasDistinctDarkVariant } = await createAndUploadDesignVariants({
        sourceDataUrl: base64,
        userId,
        targetSize: 4500,
        forceShared: options?.forceShared,
      });

      setPendingLightDesignUrl(lightUrl);
      setPendingDarkDesignUrl(darkUrl);
      toast.success(
        options?.forceShared
          ? "Single shared design ready (no processing)."
          : hasDistinctDarkVariant ? "Light & dark design variants ready!" : "Design ready for all garments!",
      );
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
