import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Palette, Plus, Loader2, X, Sparkles, CheckCircle2, Wand2, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { handleAiError } from "@/lib/aiErrors";
import { supabase } from "@/integrations/supabase/client";
import { insertProductImageIfNotExists } from "@/lib/productImageUtils";
import {
  ensureImageDataUrl,
  getImageDimensionsFromDataUrl,
  normalizeAndLockToTemplateBlob,
  compositeDesignOntoTemplate,
  compressForEdgeFunction,
} from "@/lib/mockupComposition";
import type { DesignPlacement } from "@/lib/mockupComposition";
import { removeBackground, recolorOpaquePixels, isMultiColorDesign, smartRemoveBackground } from "@/lib/removeBackground";
import { getProductType, getSuggestedColors, getColorHexMap, isLightColor, type ProductTypeConfig } from "@/lib/productTypes";
import { MockupReviewDialog } from "./MockupReviewDialog";
import { DesignPlacementPreview, type PlacementParams } from "./DesignPlacementPreview";

interface AiUsage {
  checkAndLog: (fn: string, userId: string) => Promise<boolean>;
  logUsage: (fn: string, userId: string) => Promise<void>;
}

interface Props {
  productId: string;
  userId: string;
  productTitle: string;
  organizationId?: string;
  sourceImageUrl: string | null;
  designImageUrl?: string | null;
  onComplete: () => void;
  brandName?: string;
  brandNiche?: string;
  brandAudience?: string;
  brandTone?: string;
  productCategory?: string;
  aiUsage?: AiUsage;
  onRegenerateSingle?: (colorName: string, feedback: string) => Promise<void>;
}

interface ColorRecommendation {
  color: string;
  reason: string;
}

export const GenerateColorVariants = ({ productId, userId, productTitle, organizationId, sourceImageUrl, designImageUrl, onComplete, brandName, brandNiche, brandAudience, brandTone, productCategory, aiUsage, onRegenerateSingle }: Props) => {
  const typeConfig = getProductType(productCategory || "");
  const SUGGESTED_COLORS = getSuggestedColors(typeConfig);
  const COLOR_HEX = getColorHexMap(typeConfig);
  const [open, setOpen] = useState(false);
  const [colors, setColors] = useState<string[]>([]);
  const [existingColorSet, setExistingColorSet] = useState<Set<string>>(new Set());
  const [customColor, setCustomColor] = useState("");
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, current: "" });
  const [activeColors, setActiveColors] = useState<string[]>([]);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [avgTime, setAvgTime] = useState<number | null>(null);
  const [recommendations, setRecommendations] = useState<ColorRecommendation[]>([]);
  const [loadingRecs, setLoadingRecs] = useState(false);
  const [customInstructions, setCustomInstructions] = useState("");
  const [reviewMockups, setReviewMockups] = useState<{ id: string; image_url: string; color_name: string }[]>([]);
  const [showReview, setShowReview] = useState(false);
  const [showPlacementPreview, setShowPlacementPreview] = useState(false);
  const [placementParams, setPlacementParams] = useState<PlacementParams | undefined>(undefined);
  const [previewTemplateBase64, setPreviewTemplateBase64] = useState<string>("");
  const [previewDesignBase64, setPreviewDesignBase64] = useState<string>("");

  const loadExistingColors = async () => {
    const { data } = await supabase
      .from("product_images")
      .select("color_name")
      .eq("product_id", productId)
      .eq("image_type", "mockup");
    const existing = (data || []).map((img) => img.color_name);
    const existingLower = new Set(existing.map((c) => c.toLowerCase()));
    setExistingColorSet(existingLower);
    const matched = SUGGESTED_COLORS.filter((c) => existingLower.has(c.toLowerCase()));
    const custom = existing.filter((c) => !SUGGESTED_COLORS.some((s) => s.toLowerCase() === c.toLowerCase()));
    setColors([...matched, ...custom]);
  };

  const loadRecommendations = async () => {
    if (aiUsage) {
      const allowed = await aiUsage.checkAndLog("recommend-colors", userId);
      if (!allowed) return;
    }
    setLoadingRecs(true);
    try {
      const existingList = Array.from(existingColorSet).map((c) =>
        SUGGESTED_COLORS.find((s) => s.toLowerCase() === c) || c
      );

      // Fetch design image to send to AI for context-aware recommendations
      let designImageBase64: string | undefined;
      const designUrl = designImageUrl;
      if (designUrl) {
        try {
          const resp = await fetch(designUrl);
          const ct = resp.headers.get("content-type") || "";
          if (ct.startsWith("image/")) {
            const blob = await resp.blob();
            designImageBase64 = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result as string);
              reader.onerror = reject;
              reader.readAsDataURL(blob);
            });
          }
        } catch {
          // Non-critical — continue without design image
        }
      }

      const { data, error } = await supabase.functions.invoke("recommend-colors", {
        body: {
          productTitle,
          productCategory: productCategory || typeConfig.category,
          brandName,
          brandNiche,
          brandAudience,
          brandTone,
          existingColors: existingList,
          designImageBase64,
          availablePalette: SUGGESTED_COLORS.join(", "),
          productTypeLabel: typeConfig.label,
        },
      });
      if (error || data?.error) {
        handleAiError(error, data, "Failed to get recommendations");
        return;
      }
      const recs: ColorRecommendation[] = data.recommendations || [];
      setRecommendations(recs);
      const newColors = recs
        .map((r) => r.color)
        .filter((c) => !existingColorSet.has(c.toLowerCase()));
      setColors((prev) => {
        const all = new Set([...prev, ...newColors]);
        return Array.from(all);
      });
      if (aiUsage) await aiUsage.logUsage("recommend-colors", userId);
      toast.success(`AI recommended ${recs.length} colors!`);
    } catch (err: any) {
      handleAiError(err, null, "Failed to get recommendations");
    } finally {
      setLoadingRecs(false);
    }
  };

  const addColor = (color: string) => {
    if (!colors.includes(color)) setColors([...colors, color]);
  };

  const removeColor = (color: string) => {
    setColors(colors.filter((c) => c !== color));
  };

  const addCustom = () => {
    const c = customColor.trim();
    if (c && !colors.includes(c)) {
      setColors([...colors, c]);
      setCustomColor("");
    }
  };

  const LIGHT_COLORS = typeConfig.lightColors;

  const CONCURRENCY = typeConfig.concurrency;

  const dataUrlToBlob = async (dataUrl: string): Promise<Blob> => {
    const resp = await fetch(dataUrl);
    return await resp.blob();
  };

  const generateSingleColor = async (
    colorName: string,
    preCompositedBase64: string,
    targetSize: { width: number; height: number } | null,
    designBase64?: string,
    isDarkGarment?: boolean,
    effectiveInstructions?: string,
  ): Promise<boolean> => {
    const { data, error } = await supabase.functions.invoke("generate-color-variants", {
      body: {
        imageBase64: preCompositedBase64,
        colorName,
        productTitle,
        sourceWidth: targetSize?.width || null,
        sourceHeight: targetSize?.height || null,
        customInstructions: effectiveInstructions || customInstructions.trim() || undefined,
        swatchHints: typeConfig.swatchHints,
      },
    });
    if (error || data?.error) {
      handleAiError(error, data, `Failed: ${colorName}`);
      const errorMsg = data?.error || error?.message || "";
      if (errorMsg.includes("credits") || errorMsg.includes("402")) throw new Error("CREDITS_EXHAUSTED");
      return false;
    }

    const generatedBase64 = data.imageBase64;
    if (!generatedBase64) throw new Error("No image returned");

    const generatedDataUrl = ensureImageDataUrl(generatedBase64);
    const templateDataUrl = preCompositedBase64;

    console.log(`[ColorVariant] ${colorName}: designBase64=${designBase64 ? 'present' : 'MISSING'}, isDark=${isDarkGarment}`);

    // Re-composite the ORIGINAL crisp design on top of AI-recolored garment.
    // This guarantees text/graphics are pixel-perfect regardless of AI drift.
    const blob = await normalizeAndLockToTemplateBlob({
      templateDataUrl,
      generatedDataUrl,
      targetWidth: targetSize?.width || 1024,
      targetHeight: targetSize?.height || 1024,
      designDataUrl: designBase64,
      isDarkGarment,
      placement: effectivePlacement,
    });

    // Refresh session before upload to prevent RLS failures during long runs
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) {
      const { error: refreshError } = await supabase.auth.refreshSession();
      if (refreshError) throw new Error("Session expired. Please sign in again.");
    }

    const path = `${userId}/${crypto.randomUUID()}.jpg`;
    const { error: uploadError } = await supabase.storage.from("product-images").upload(path, blob, { contentType: "image/jpeg" });
    if (uploadError) throw uploadError;

    const { data: urlData } = supabase.storage.from("product-images").getPublicUrl(path);

    await insertProductImageIfNotExists({
      product_id: productId,
      user_id: userId,
      image_url: urlData.publicUrl,
      image_type: "mockup",
      color_name: colorName,
      position: 0,
    });

    return true;
  };

  const handlePreviewPlacement = async () => {
    if (!sourceImageUrl) {
      toast.error("No source image available. Upload a product image first.");
      return;
    }
    if (colors.length === 0) {
      toast.error("Add at least one color to generate.");
      return;
    }
    try {
      const resp = await fetch(sourceImageUrl);
      const blob = await resp.blob();
      const templateB64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      setPreviewTemplateBase64(templateB64);

      const designUrl = designImageUrl || sourceImageUrl;
      if (designUrl && designUrl !== sourceImageUrl) {
        const dResp = await fetch(designUrl);
        const dBlob = await dResp.blob();
        const designB64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(dBlob);
        });
        setPreviewDesignBase64(designB64);
      } else {
        setPreviewDesignBase64(templateB64);
      }
      setShowPlacementPreview(true);
    } catch {
      toast.error("Failed to load images for preview");
    }
  };

  const handlePlacementConfirm = (params: PlacementParams) => {
    setPlacementParams(params);
    setShowPlacementPreview(false);
    // Pass params directly to avoid stale closure issue
    setTimeout(() => handleGenerateWithPlacement(params), 100);
  };

  const handleGenerateWithPlacement = (params: PlacementParams) => {
    // Use a ref-like approach: store params then call generate
    placementParamsRef.current = params;
    handleGenerate();
  };

  const placementParamsRef = { current: placementParams };

  const handleGenerate = async () => {
    const effectivePlacement = placementParamsRef.current ?? placementParams;
    if (!sourceImageUrl) {
      toast.error("No source image available. Upload a product image first.");
      return;
    }
    if (colors.length === 0) {
      toast.error("Add at least one color to generate.");
      return;
    }

    setGenerating(true);
    setStartTime(Date.now());
    setAvgTime(null);
    setProgress({ done: 0, total: colors.length, current: colors[0] });
    setActiveColors([]);

    // Build AI hints from past mockup feedback for this org
    let feedbackHints = "";
    if (organizationId) {
      try {
        const { data: fbRows } = await supabase
          .from("mockup_feedback" as any)
          .select("size_feedback, color_accuracy, notes, rating")
          .eq("organization_id", organizationId)
          .order("created_at", { ascending: false })
          .limit(20);

        if (fbRows && fbRows.length > 0) {
          const sizeCounts = { "too-large": 0, "too-small": 0, "just-right": 0 };
          const colorIssues: string[] = [];
          const notesList: string[] = [];

          for (const fb of fbRows as any[]) {
            if (fb.size_feedback && fb.size_feedback in sizeCounts) {
              sizeCounts[fb.size_feedback as keyof typeof sizeCounts]++;
            }
            if (fb.color_accuracy === "inaccurate") colorIssues.push(fb.color_name || "unknown");
            if (fb.notes?.trim()) notesList.push(fb.notes.trim());
          }

          const hints: string[] = [];
          if (sizeCounts["too-large"] > sizeCounts["just-right"] + sizeCounts["too-small"]) {
            hints.push("IMPORTANT: Previous feedback indicates the design/print on the shirt tends to appear TOO LARGE. Make the design noticeably smaller on the garment.");
          } else if (sizeCounts["too-small"] > sizeCounts["just-right"] + sizeCounts["too-large"]) {
            hints.push("IMPORTANT: Previous feedback indicates the design/print appears TOO SMALL. Make the design slightly larger on the garment.");
          }
          if (colorIssues.length >= 2) {
            hints.push(`Color accuracy has been flagged as an issue. Pay extra attention to matching the target color precisely.`);
          }
          if (notesList.length > 0) {
            hints.push(`User notes from past mockups: ${notesList.slice(0, 3).join("; ")}`);
          }
          feedbackHints = hints.join("\n");
        }
      } catch {
        // silently skip
      }
    }

    const { data: existingImages } = await supabase
      .from("product_images")
      .select("color_name")
      .eq("product_id", productId)
      .eq("image_type", "mockup");
    const existingColors = new Set((existingImages || []).map((img) => img.color_name.toLowerCase()));
    const newColors = colors.filter((c) => !existingColors.has(c.toLowerCase()));
    // Ensure Black is always first (hero mockup position 0)
    newColors.sort((a, b) => {
      const aBlack = a.toLowerCase() === "black" ? 0 : 1;
      const bBlack = b.toLowerCase() === "black" ? 0 : 1;
      return aBlack - bBlack;
    });

    if (newColors.length === 0) {
      toast.info("All selected colors already exist as variants.");
      setGenerating(false);
      return;
    }

    setProgress({ done: 0, total: newColors.length, current: "" });

    let imageBase64: string;
    try {
      const resp = await fetch(sourceImageUrl);
      const contentType = resp.headers.get("content-type") || "";
      if (!contentType.startsWith("image/")) {
        toast.error("Source image URL is broken or expired. Please re-upload the product image.");
        setGenerating(false);
        return;
      }
      const blob = await resp.blob();
      imageBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch {
      toast.error("Failed to load source image.");
      setGenerating(false);
      return;
    }

    // Load design variants and pre-composite onto template
    const { data: designImages } = await supabase
      .from("product_images")
      .select("image_url, color_name")
      .eq("product_id", productId)
      .eq("image_type", "design");

    console.log(`[ColorVariant] Design images found: ${designImages?.length || 0}`, designImages?.map(d => `${d.color_name}: ${d.image_url?.substring(0, 60)}`));
    console.log(`[ColorVariant] designImageUrl prop: ${designImageUrl?.substring(0, 60) || 'NONE'}`);

    const normalizeVariantKey = (value?: string | null) =>
      (value || "").toLowerCase().trim().replace(/[_\s]+/g, "-");

    const lightDesignUrl = designImages?.find((d) => {
      const key = normalizeVariantKey(d.color_name);
      return key === "light-on-dark" || key === "light";
    })?.image_url || designImageUrl;

    const darkDesignUrl = designImages?.find((d) => {
      const key = normalizeVariantKey(d.color_name);
      return key === "dark-on-light" || key === "dark";
    })?.image_url;

    console.log(`[ColorVariant] lightDesignUrl: ${lightDesignUrl?.substring(0, 60) || 'NONE'}`);
    console.log(`[ColorVariant] darkDesignUrl: ${darkDesignUrl?.substring(0, 60) || 'NONE'}`);

    const fetchAsBase64 = async (url: string): Promise<string | undefined> => {
      try {
        const resp = await fetch(url);
        const ct = resp.headers.get("content-type") || "";
        if (!ct.startsWith("image/")) return undefined;
        const blob = await resp.blob();
        return new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
      } catch {
        return undefined;
      }
    };

    const deriveDarkInkVariantForLightGarments = async (sourceDataUrl: string): Promise<string> => {
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error("Failed to load design for dark-ink fallback"));
        img.src = sourceDataUrl;
      });

      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth || image.width;
      canvas.height = image.naturalHeight || image.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas context unavailable");

      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const pixels = imgData.data;

      for (let i = 0; i < pixels.length; i += 4) {
        const alpha = pixels[i + 3];
        if (alpha < 14) continue;

        const r = pixels[i];
        const g = pixels[i + 1];
        const b = pixels[i + 2];

        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const luma = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
        const saturation = max === 0 ? 0 : (max - min) / max;

        // Darken near-neutral bright ink (typically white/light text) while preserving colorful artwork.
        // Two tiers: very light neutrals get full inversion, moderately light get partial darkening.
        const isVeryLightNeutral = luma > 0.82 && saturation < 0.18;
        const isLightInk = luma > 0.55 && (saturation < 0.25 || (r > 160 && g > 160 && b > 160));
        if (!isLightInk) continue;

        const target = 24;
        let strength: number;
        if (isVeryLightNeutral) {
          // Near-white pixels (text) → fully darken
          strength = 1;
        } else {
          // Gradual darkening for lighter mid-tones
          strength = Math.min(1, (luma - 0.55) / 0.35);
        }

        pixels[i] = Math.round(r * (1 - strength) + target * strength);
        pixels[i + 1] = Math.round(g * (1 - strength) + target * strength);
        pixels[i + 2] = Math.round(b * (1 - strength) + target * strength);
        pixels[i + 3] = Math.max(alpha, 210);
      }

      ctx.putImageData(imgData, 0, 0);
      return canvas.toDataURL("image/png");
    };

    let lightDesignBase64: string | undefined;
    let darkDesignBase64: string | undefined;
    if (lightDesignUrl) lightDesignBase64 = await fetchAsBase64(lightDesignUrl);
    if (darkDesignUrl) darkDesignBase64 = await fetchAsBase64(darkDesignUrl);

    // Reliability fallback: if dark-on-light design is missing/unreadable,
    // derive one deterministically from the light design.
    if (!darkDesignBase64 && lightDesignBase64) {
      try {
        const multiColor = await isMultiColorDesign(lightDesignBase64);
        if (multiColor) {
          console.log("[ColorVariant] Multi-color design — deriving contrast-safe dark variant");
          darkDesignBase64 = await deriveDarkInkVariantForLightGarments(lightDesignBase64);
        } else {
          // Monochrome/AI design: recolor to dark ink for light garments
          const bgRemovedBase64 = await removeBackground(lightDesignBase64, "black");
          const rawDark = await recolorOpaquePixels(bgRemovedBase64, { r: 24, g: 24, b: 24 });
          darkDesignBase64 = ensureImageDataUrl(rawDark);
        }
      } catch (err) {
        console.warn("Failed to derive dark design fallback:", err);
      }
    }

    if (!lightDesignBase64 && !darkDesignBase64 && designImageUrl) {
      try {
        // Critical fallback when product_images has no design rows:
        // force transparent PNG from the source design URL to avoid rectangular halos.
        const cleanedBase64 = await smartRemoveBackground(designImageUrl);
        lightDesignBase64 = ensureImageDataUrl(cleanedBase64);
      } catch (err) {
        console.warn("smartRemoveBackground fallback failed, using raw design URL:", err);
        lightDesignBase64 = await fetchAsBase64(designImageUrl);
      }

      if (!darkDesignBase64 && lightDesignBase64) {
        try {
          const multiColor = await isMultiColorDesign(lightDesignBase64);
          if (multiColor) {
            darkDesignBase64 = await deriveDarkInkVariantForLightGarments(lightDesignBase64);
          } else {
            const bgRemovedBase64 = await removeBackground(lightDesignBase64, "black");
            const rawDark = await recolorOpaquePixels(bgRemovedBase64, { r: 24, g: 24, b: 24 });
            darkDesignBase64 = ensureImageDataUrl(rawDark);
          }
        } catch (err) {
          console.warn("Failed to derive dark design from fallback design:", err);
        }
      }
    }

    // DO NOT pre-composite design onto template before sending to AI.
    // The AI only needs the plain garment photo to recolor the fabric.
    // The design is composited AFTER AI recoloring in normalizeAndLockToTemplateBlob,
    // which prevents the AI from duplicating/shifting the design.
    const lightDesign = lightDesignBase64; // white/bright ink for dark shirts
    const darkDesign = darkDesignBase64;   // dark ink for light shirts

    let plainTemplate = imageBase64;

    // Compress plain template to avoid edge function memory limits
    try {
      plainTemplate = await compressForEdgeFunction(plainTemplate, 1024, 0.8);
    } catch (err) {
      console.warn("Failed to compress template, using original", err);
    }

    // Process with concurrency of 2
    let successCount = 0;
    let doneCount = 0;
    let creditsExhausted = false;
    const genStart = Date.now();
    let nextIndex = 0;

    let targetSize: { width: number; height: number } | null = null;
    try {
      targetSize = await getImageDimensionsFromDataUrl(imageBase64);
    } catch {
      targetSize = null;
    }

    const worker = async () => {
      while (nextIndex < newColors.length && !creditsExhausted) {
        const i = nextIndex++;
        const colorName = newColors[i];
        setActiveColors((prev) => [...prev, colorName]);

        try {
          const isLight = LIGHT_COLORS.has(colorName.toLowerCase().trim());
          // Send the PLAIN template to AI (no design baked in) to prevent duplication
          // The design is composited AFTER AI recoloring in normalizeAndLockToTemplateBlob
          const designForRecomposite = isLight ? (darkDesign || lightDesign) : lightDesign;
          const combinedInstructions = [customInstructions.trim(), feedbackHints].filter(Boolean).join("\n") || undefined;
          const ok = await generateSingleColor(colorName, plainTemplate, targetSize, designForRecomposite, !isLight, combinedInstructions);
          if (ok) successCount++;
        } catch (err: any) {
          if (err?.message === "CREDITS_EXHAUSTED") {
            creditsExhausted = true;
            return;
          }
          console.error(`Failed to generate ${colorName}:`, err);
          handleAiError(err, null, `Failed: ${colorName}`);
        } finally {
          doneCount++;
          const elapsed = Date.now() - genStart;
          const perItem = elapsed / doneCount;
          setAvgTime(perItem);
          setActiveColors((prev) => prev.filter((c) => c !== colorName));
          setProgress({ done: doneCount, total: newColors.length, current: "" });
        }
      }
    };

    const workers = Array.from(
      { length: Math.min(CONCURRENCY, newColors.length) },
      () => worker()
    );
    await Promise.all(workers);

    setProgress({ done: newColors.length, total: newColors.length, current: "" });
    setGenerating(false);
    setStartTime(null);
    setAvgTime(null);
    setActiveColors([]);
    if (colors.length > newColors.length) {
      toast.success(`Generated ${successCount}/${newColors.length} new variants (${colors.length - newColors.length} already existed)`);
    } else {
      toast.success(`Generated ${successCount}/${newColors.length} color variants!`);
    }
    setColors([]);
    setRecommendations([]);
    setOpen(false);
    onComplete();

    // Show review dialog if we have an organizationId and generated some mockups
    if (organizationId && successCount > 0) {
      try {
        const { data: newImages } = await supabase
          .from("product_images")
          .select("id, image_url, color_name")
          .eq("product_id", productId)
          .eq("image_type", "mockup")
          .order("created_at", { ascending: false })
          .limit(successCount);
        if (newImages && newImages.length > 0) {
          setReviewMockups(newImages);
          setShowReview(true);
        }
      } catch {
        // silently skip review
      }
    }
  };

  if (!open) {
    return (
      <>
        <Button variant="outline" size="sm" onClick={() => { setOpen(true); loadExistingColors(); }} className="gap-2">
          <Palette className="h-3.5 w-3.5" /> Color Variants
        </Button>
        {organizationId && (
          <MockupReviewDialog
            open={showReview}
            onClose={() => { setShowReview(false); setReviewMockups([]); onComplete(); }}
            mockups={reviewMockups}
            productId={productId}
            organizationId={organizationId}
            userId={userId}
            onRegenerateSingle={onRegenerateSingle}
          />
        )}
      </>
    );
  }

  const newCount = colors.filter((c) => !existingColorSet.has(c.toLowerCase())).length;
  const existingCount = colors.length - newCount;
  const recommendedColorNames = new Set(recommendations.map((r) => r.color.toLowerCase()));

  return (
    <>
    <div className="rounded-lg border border-border bg-card p-4 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Palette className="h-4 w-4 text-primary" />
          <h4 className="text-sm font-semibold">Generate Color Variants</h4>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setOpen(false); setRecommendations([]); }}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Step 1: Pick colors */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">1 · Choose colors</p>
          <Button
            onClick={loadRecommendations}
            disabled={loadingRecs || generating}
            variant="outline"
            size="sm"
            className="h-7 gap-1.5 text-xs"
          >
            {loadingRecs ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wand2 className="h-3 w-3" />}
            {loadingRecs ? "Analyzing…" : "AI Recommend"}
          </Button>
        </div>

        {/* AI Recommendation results (inline, compact) */}
        {recommendations.length > 0 && (
          <div className="rounded-md border border-primary/20 bg-primary/5 p-2.5 space-y-1.5">
            <p className="text-[10px] font-semibold text-primary uppercase tracking-wider flex items-center gap-1">
              <Sparkles className="h-3 w-3" /> AI Picks
            </p>
            <div className="flex flex-wrap gap-1">
              {recommendations.map((rec) => {
                const isSelected = colors.includes(rec.color);
                return (
                  <button
                    key={rec.color}
                    type="button"
                    onClick={() => isSelected ? removeColor(rec.color) : addColor(rec.color)}
                    disabled={generating}
                    title={rec.reason}
                    className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors flex items-center gap-1.5 ${
                      isSelected
                        ? "bg-primary text-primary-foreground"
                        : "bg-card border border-primary/30 text-foreground hover:bg-primary/10"
                    }`}
                  >
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full border border-white/20 shrink-0"
                      style={{ backgroundColor: COLOR_HEX[rec.color.toLowerCase()] || "#ccc" }}
                    />
                    {rec.color}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Color palette grid */}
        <div className="flex flex-wrap gap-1.5">
          {SUGGESTED_COLORS.map((color) => {
            const isExisting = existingColorSet.has(color.toLowerCase());
            const isSelected = colors.includes(color);
            const isRecommended = recommendedColorNames.has(color.toLowerCase());
            return (
              <button
                key={color}
                type="button"
                onClick={() => isSelected ? removeColor(color) : addColor(color)}
                disabled={generating}
                className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors flex items-center gap-1.5 ${
                  isSelected
                    ? "bg-primary text-primary-foreground"
                    : isRecommended
                      ? "bg-primary/15 text-primary border border-primary/25 hover:bg-primary/25"
                      : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                }`}
              >
                {isExisting && <CheckCircle2 className="h-2.5 w-2.5" />}
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full border border-white/20 shrink-0"
                  style={{ backgroundColor: COLOR_HEX[color.toLowerCase()] || "#ccc" }}
                />
                {color}
              </button>
            );
          })}
        </div>

        {/* Custom color inline */}
        <div className="flex gap-2">
          <Input
            placeholder="Custom color (e.g. Burnt Orange)"
            value={customColor}
            onChange={(e) => setCustomColor(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addCustom())}
            disabled={generating}
            className="h-7 text-xs"
          />
          <Button variant="outline" size="sm" onClick={addCustom} disabled={generating || !customColor.trim()} className="h-7 gap-1 text-xs">
            <Plus className="h-3 w-3" /> Add
          </Button>
        </div>
      </div>

      {/* Selected colors summary */}
      {colors.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Selected · {colors.length} color{colors.length !== 1 ? "s" : ""}
            {existingCount > 0 && <span className="normal-case tracking-normal font-normal"> ({existingCount} already exist)</span>}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {colors.map((c) => (
              <span key={c} className="flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full border border-primary/30 shrink-0"
                  style={{ backgroundColor: COLOR_HEX[c.toLowerCase()] || "#ccc" }}
                />
                {c}
                {!generating && (
                  <button onClick={() => removeColor(c)} className="ml-0.5 hover:text-destructive">
                    <X className="h-2.5 w-2.5" />
                  </button>
                )}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Step 2: Customize & generate */}
      <div className="space-y-3 border-t border-border pt-4">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">2 · Customize & generate</p>
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Settings2 className="h-3 w-3" />
            Custom instructions <span className="font-normal">(optional)</span>
          </div>
          <Textarea
            placeholder='e.g. "Use a lifestyle background with plants" or "Show the shirt on a wooden table"'
            value={customInstructions}
            onChange={(e) => setCustomInstructions(e.target.value)}
            disabled={generating}
            rows={2}
            className="text-xs resize-none"
          />
        </div>

        {generating && (
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span>
                Generating {progress.done}/{progress.total}
                {activeColors.length > 0 && ` — ${activeColors.join(", ")}`}
              </span>
            </div>
            {avgTime && progress.done < progress.total && (
              <p className="text-[10px] text-muted-foreground pl-6">
                ~{Math.ceil(((progress.total - progress.done) * avgTime) / 1000 / 60)} min remaining
                {" "}(~{Math.round(avgTime / 1000)}s per color, 2 at a time)
              </p>
            )}
          </div>
        )}

        <Button
          onClick={handlePreviewPlacement}
          disabled={generating || colors.length === 0 || newCount === 0}
          className="gap-2 w-full"
          size="sm"
        >
          {generating ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          {generating
            ? `Generating ${progress.done}/${progress.total}…`
            : newCount === 0
              ? "All selected colors already exist"
              : `Preview & Generate ${newCount} Variant${newCount !== 1 ? "s" : ""}`}
        </Button>
      </div>
    </div>

    <DesignPlacementPreview
      open={showPlacementPreview}
      onConfirm={handlePlacementConfirm}
      onCancel={() => setShowPlacementPreview(false)}
      templateDataUrl={previewTemplateBase64}
      designDataUrl={previewDesignBase64}
      designStyle={undefined}
    />

    {organizationId && (
      <MockupReviewDialog
        open={showReview}
        onClose={() => { setShowReview(false); setReviewMockups([]); }}
        mockups={reviewMockups}
        productId={productId}
        organizationId={organizationId}
        userId={userId}
      />
    )}
    </>
  );
};
