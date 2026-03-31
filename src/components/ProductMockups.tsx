import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ImageIcon, Plus, Trash2, Upload, Loader2, Edit2, Check, ZoomIn, Sparkles, ThumbsDown, ChevronLeft, RotateCw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { DesignPlacement } from "@/lib/mockupComposition";
import {
  ensureImageDataUrl,
  getImageDimensionsFromDataUrl,
  normalizeAndLockToTemplateBlob,
  compositeDesignOntoTemplate,
  compressForEdgeFunction,
  getUnifiedDesignSize,
} from "@/lib/mockupComposition";
import { removeBackground, recolorOpaquePixels, isMultiColorDesign, smartRemoveBackground, darkenBrightPixels } from "@/lib/removeBackground";
import { insertProductImageIfNotExists } from "@/lib/productImageUtils";
import { handleAiError } from "@/lib/aiErrors";
import { getProductType, isLightColor } from "@/lib/productTypes";
import { DesignPlacementEditor } from "@/components/DesignPlacementEditor";

interface ProductImage {
  id: string;
  product_id: string;
  image_url: string;
  image_type: string;
  color_name: string;
  position: number;
}

interface AiUsage {
  checkAndLog: (fn: string, userId: string) => Promise<boolean>;
  logUsage: (fn: string, userId: string) => Promise<void>;
}

interface Props {
  productId: string;
  userId: string;
  productTitle: string;
  organizationId?: string;
  sourceImageUrl?: string | null;
  designImageUrl?: string | null;
  brandName?: string;
  brandNiche?: string;
  brandAudience?: string;
  brandTone?: string;
  productCategory?: string;
  aiUsage?: AiUsage;
}

interface ColorRecommendation {
  color: string;
  reason: string;
}

type GenerationStep = "choose-colors" | "generating" | "size-check" | "review";

const FEEDBACK_OPTIONS = [
  "Color is wrong",
  "Placement is off",
  "Design distorted",
  "Background issue",
  "Other",
];

export const ProductMockups = ({ productId, userId, productTitle, organizationId, sourceImageUrl, designImageUrl, brandName, brandNiche, brandAudience, brandTone, productCategory, aiUsage }: Props) => {
  const [images, setImages] = useState<ProductImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editColor, setEditColor] = useState("");
  const [previewImage, setPreviewImage] = useState<ProductImage | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // AI generation state
  const [genStep, setGenStep] = useState<GenerationStep | null>(null);
  const [selectedColors, setSelectedColors] = useState<string[]>([]);
  const [aiRecommendations, setAiRecommendations] = useState<ColorRecommendation[]>([]);
  const [loadingRecs, setLoadingRecs] = useState(false);
  const [generatingColors, setGeneratingColors] = useState<Map<string, "pending" | "done" | "error">>(new Map());
  const [generationProgress, setGenerationProgress] = useState({ done: 0, total: 0, current: "" });

  // Feedback state
  const [feedbackMockupId, setFeedbackMockupId] = useState<string | null>(null);
  const [feedbackReason, setFeedbackReason] = useState("");
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);
  const [customInstructions, setCustomInstructions] = useState("");
  const [feedbackDetails, setFeedbackDetails] = useState("");

  const typeConfig = getProductType(productCategory || "");
  const availableColors = typeConfig.colors;
  const availablePalette = availableColors.map(c => c.name).join(", ");

  useEffect(() => {
    loadImages();
  }, [productId]);

  const loadImages = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("product_images")
      .select("*")
      .eq("product_id", productId)
      .eq("image_type", "mockup")
      .order("position", { ascending: true });
    setImages((data as ProductImage[]) || []);
    setLoading(false);
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).filter((f) => f.type.startsWith("image/"));
    if (files.length === 0) return;

    setUploading(true);
    try {
      for (const file of files) {
        const ext = file.name.split(".").pop() || "jpg";
        const path = `${userId}/${crypto.randomUUID()}.${ext}`;
        const { error: uploadError } = await supabase.storage.from("product-images").upload(path, file);
        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage.from("product-images").getPublicUrl(path);
        const colorName = file.name
          .replace(/\.[^.]+$/, "")
          .replace(/[-_]/g, " ")
          .replace(/\b\w/g, (c) => c.toUpperCase());

        const { error: insertError } = await supabase.from("product_images").insert({
          product_id: productId,
          user_id: userId,
          image_url: urlData.publicUrl,
          image_type: "mockup",
          color_name: colorName,
          position: images.length + files.indexOf(file),
        });
        if (insertError) throw insertError;
      }
      toast.success(`${files.length} mockup${files.length > 1 ? "s" : ""} uploaded`);
      await loadImages();
    } catch (err: any) {
      toast.error("Upload failed: " + err.message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleDelete = async (id: string) => {
    await supabase.from("product_images").delete().eq("id", id);
    setImages((prev) => prev.filter((img) => img.id !== id));
    toast.success("Mockup removed");
  };

  const handleSaveColor = async (id: string) => {
    await supabase.from("product_images").update({ color_name: editColor }).eq("id", id);
    setImages((prev) => prev.map((img) => (img.id === id ? { ...img, color_name: editColor } : img)));
    setEditingId(null);
    toast.success("Color name updated");
  };

  // ─── AI Color Recommendations ──────────────────────────────────
  const fetchAiRecommendations = async () => {
    setLoadingRecs(true);
    try {
      const existingColors = images.map(img => img.color_name);

      // Get design image for visual analysis — compress to small JPEG to avoid huge payloads
      let designBase64: string | undefined;
      if (designImageUrl) {
        try {
          const resp = await fetch(designImageUrl);
          const blob = await resp.blob();
          const img = await new Promise<HTMLImageElement>((resolve, reject) => {
            const i = new Image();
            i.onload = () => resolve(i);
            i.onerror = reject;
            i.src = URL.createObjectURL(blob);
          });
          const MAX = 512;
          const scale = Math.min(MAX / img.naturalWidth, MAX / img.naturalHeight, 1);
          const w = Math.round(img.naturalWidth * scale);
          const h = Math.round(img.naturalHeight * scale);
          const canvas = document.createElement("canvas");
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d")!;
          ctx.drawImage(img, 0, 0, w, h);
          URL.revokeObjectURL(img.src);
          designBase64 = canvas.toDataURL("image/jpeg", 0.7);
        } catch { /* continue without design */ }
      }

      const { data, error } = await supabase.functions.invoke("recommend-colors", {
        body: {
          productTitle,
          productCategory: productCategory || typeConfig.label,
          brandName,
          brandNiche,
          brandAudience,
          brandTone,
          existingColors,
          designImageBase64: designBase64,
          availablePalette,
          productTypeLabel: typeConfig.label,
        },
      });

      if (error || data?.error) {
        handleAiError(error, data, "Failed to get color recommendations");
        return;
      }

      const recs = data.recommendations || [];
      setAiRecommendations(recs);
      // Auto-select recommended colors that aren't already generated
      const existingSet = new Set(existingColors.map(c => c.toLowerCase()));
      const newColors = recs
        .map((r: ColorRecommendation) => r.color)
        .filter((c: string) => !existingSet.has(c.toLowerCase()));
      setSelectedColors(newColors);
    } catch (err: any) {
      toast.error("Failed to get recommendations: " + (err.message || "Unknown error"));
    } finally {
      setLoadingRecs(false);
    }
  };

  const toggleColor = (colorName: string) => {
    setSelectedColors(prev =>
      prev.includes(colorName) ? prev.filter(c => c !== colorName) : [...prev, colorName]
    );
  };

  // ─── Generate Mockups ──────────────────────────────────────────
  const generateMockups = async () => {
    if (selectedColors.length === 0) {
      toast.error("Select at least one color to generate");
      return;
    }

    const templateUrl = sourceImageUrl;
    if (!templateUrl) {
      toast.error("No template image available. Upload a design first.");
      return;
    }

    setGenStep("generating");
    const statusMap = new Map<string, "pending" | "done" | "error">();
    selectedColors.forEach(c => statusMap.set(c, "pending"));
    setGeneratingColors(new Map(statusMap));
    setGenerationProgress({ done: 0, total: selectedColors.length, current: "" });

    try {
      // Fetch template
      const templateResp = await fetch(templateUrl);
      const templateBlob = await templateResp.blob();
      const templateBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(templateBlob);
      });

      // Fetch design variants
      const fetchAsBase64 = async (url: string): Promise<string | undefined> => {
        try {
          const resp = await fetch(url);
          const blob = await resp.blob();
          return new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
        } catch { return undefined; }
      };

      const { data: designImages } = await supabase
        .from("product_images")
        .select("image_url, color_name")
        .eq("product_id", productId)
        .eq("image_type", "design");

      const normalizeKey = (v?: string | null) =>
        (v || "").toLowerCase().trim().replace(/[_\s]+/g, "-");

      const lightDesignUrl = designImages?.find(d => {
        const key = normalizeKey(d.color_name);
        return key === "light-on-dark" || key === "light";
      })?.image_url || designImageUrl;

      const darkDesignUrl = designImages?.find(d => {
        const key = normalizeKey(d.color_name);
        return key === "dark-on-light" || key === "dark";
      })?.image_url;

      let lightDesignBase64 = lightDesignUrl ? await fetchAsBase64(lightDesignUrl) : undefined;
      let darkDesignBase64 = darkDesignUrl ? await fetchAsBase64(darkDesignUrl) : undefined;

      if (!darkDesignBase64 && lightDesignBase64) {
        try {
          const multiColor = await isMultiColorDesign(lightDesignBase64);
          if (!multiColor) {
            const bgRemoved = await removeBackground(lightDesignBase64, "black");
            darkDesignBase64 = ensureImageDataUrl(await recolorOpaquePixels(bgRemoved, { r: 24, g: 24, b: 24 }));
          } else {
            // Multi-color: selectively darken bright/near-white pixels for contrast on light garments
            const darkened = await darkenBrightPixels(lightDesignBase64);
            darkDesignBase64 = ensureImageDataUrl(darkened);
          }
        } catch { /* continue */ }
      }

      if (!lightDesignBase64 && !darkDesignBase64 && designImageUrl) {
        try {
          const cleaned = await smartRemoveBackground(designImageUrl);
          lightDesignBase64 = ensureImageDataUrl(cleaned);
        } catch {
          lightDesignBase64 = await fetchAsBase64(designImageUrl);
        }
      }

      let plainTemplate = templateBase64;
      try {
        plainTemplate = await compressForEdgeFunction(plainTemplate, 1024, 0.8);
      } catch { /* use uncompressed */ }

      let targetSize: { width: number; height: number } | null = null;
      try {
        targetSize = await getImageDimensionsFromDataUrl(templateBase64);
      } catch { /* null */ }

      // Compute unified design dimensions so all color variants use the same design scale
      let referenceDesignSize: { width: number; height: number } | undefined;
      try {
        referenceDesignSize = await getUnifiedDesignSize(lightDesignBase64, darkDesignBase64);
      } catch { /* continue without reference */ }

      // Generate sequentially (respect rate limits)
      let doneCount = 0;
      for (const colorName of selectedColors) {
        setGenerationProgress({ done: doneCount, total: selectedColors.length, current: colorName });

        try {
          const isLight = isLightColor(typeConfig, colorName);
          const designForComposite = isLight ? (darkDesignBase64 || lightDesignBase64) : lightDesignBase64;

          const { data, error } = await supabase.functions.invoke("generate-color-variants", {
            body: {
              imageBase64: plainTemplate,
              colorName,
              productTitle,
              sourceWidth: targetSize?.width || null,
              sourceHeight: targetSize?.height || null,
              customInstructions: customInstructions || undefined,
              swatchHints: typeConfig.swatchHints,
            },
          });

          if (error || data?.error) {
            statusMap.set(colorName, "error");
            setGeneratingColors(new Map(statusMap));
            continue;
          }

          const generatedBase64 = data.imageBase64;
          if (!generatedBase64) throw new Error("No image returned");

          const generatedDataUrl = ensureImageDataUrl(generatedBase64);
          const blob = await normalizeAndLockToTemplateBlob({
            templateDataUrl: plainTemplate,
            generatedDataUrl,
            targetWidth: targetSize?.width || 1024,
            targetHeight: targetSize?.height || 1024,
            designDataUrl: designForComposite,
            isDarkGarment: !isLight,
            referenceDesignSize,
          });

          const path = `${userId}/${crypto.randomUUID()}.jpg`;
          const { error: uploadErr } = await supabase.storage
            .from("product-images")
            .upload(path, blob, { contentType: "image/jpeg" });
          if (uploadErr) throw uploadErr;

          const { data: urlData } = supabase.storage.from("product-images").getPublicUrl(path);

          await insertProductImageIfNotExists({
            product_id: productId,
            user_id: userId,
            image_url: urlData.publicUrl,
            image_type: "mockup",
            color_name: colorName,
            position: doneCount,
          });

          statusMap.set(colorName, "done");
        } catch (err) {
          console.error(`Error generating ${colorName}:`, err);
          statusMap.set(colorName, "error");
        }

        setGeneratingColors(new Map(statusMap));
        doneCount++;
        setGenerationProgress({ done: doneCount, total: selectedColors.length, current: "" });
      }

      await loadImages();
      setGenStep("review");
      toast.success(`Generated ${doneCount} mockups!`);
    } catch (err: any) {
      console.error("Generation error:", err);
      toast.error(err.message || "Failed to generate mockups");
      setGenStep("choose-colors");
    }
  };

  // ─── Regenerate Single (Feedback-informed) ─────────────────────
  const handleRegenerateSingle = async (colorName: string, feedback: string) => {
    const templateUrl = sourceImageUrl;
    if (!templateUrl) {
      toast.error("No template image available.");
      return;
    }

    setRegeneratingId(colorName);
    try {
      const templateResp = await fetch(templateUrl);
      const templateBlob = await templateResp.blob();
      const templateBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(templateBlob);
      });

      const fetchAsBase64 = async (url: string): Promise<string | undefined> => {
        try {
          const resp = await fetch(url);
          const blob = await resp.blob();
          return new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
        } catch { return undefined; }
      };

      const { data: designImages } = await supabase
        .from("product_images")
        .select("image_url, color_name")
        .eq("product_id", productId)
        .eq("image_type", "design");

      const normalizeKey = (v?: string | null) =>
        (v || "").toLowerCase().trim().replace(/[_\s]+/g, "-");

      const lightDesignUrl = designImages?.find(d => {
        const key = normalizeKey(d.color_name);
        return key === "light-on-dark" || key === "light";
      })?.image_url || designImageUrl;

      const darkDesignUrl = designImages?.find(d => {
        const key = normalizeKey(d.color_name);
        return key === "dark-on-light" || key === "dark";
      })?.image_url;

      let lightDesignBase64 = lightDesignUrl ? await fetchAsBase64(lightDesignUrl) : undefined;
      let darkDesignBase64 = darkDesignUrl ? await fetchAsBase64(darkDesignUrl) : undefined;

      if (!darkDesignBase64 && lightDesignBase64) {
        try {
          const multiColor = await isMultiColorDesign(lightDesignBase64);
          if (multiColor) {
            const darkened = await darkenBrightPixels(lightDesignBase64);
            darkDesignBase64 = ensureImageDataUrl(darkened);
          } else {
            const bgRemoved = await removeBackground(lightDesignBase64, "black");
            darkDesignBase64 = ensureImageDataUrl(await recolorOpaquePixels(bgRemoved, { r: 24, g: 24, b: 24 }));
          }
        } catch { /* continue */ }
      }

      if (!lightDesignBase64 && !darkDesignBase64 && designImageUrl) {
        try {
          const cleaned = await smartRemoveBackground(designImageUrl);
          lightDesignBase64 = ensureImageDataUrl(cleaned);
        } catch {
          lightDesignBase64 = await fetchAsBase64(designImageUrl);
        }
      }

      const isLight = isLightColor(typeConfig, colorName);
      const designForComposite = isLight ? (darkDesignBase64 || lightDesignBase64) : lightDesignBase64;

      let plainTemplate = templateBase64;
      try {
        plainTemplate = await compressForEdgeFunction(plainTemplate, 1024, 0.8);
      } catch { /* use uncompressed */ }

      let targetSize: { width: number; height: number } | null = null;
      try {
        targetSize = await getImageDimensionsFromDataUrl(templateBase64);
      } catch { /* null */ }

      // Compute unified design dimensions for consistent sizing
      let referenceDesignSize: { width: number; height: number } | undefined;
      try {
        referenceDesignSize = await getUnifiedDesignSize(lightDesignBase64, darkDesignBase64);
      } catch { /* continue without reference */ }

      const customInstructions = `IMPORTANT FEEDBACK FROM USER: ${feedback}. Please address these issues in the regenerated mockup.`;

      const { data, error } = await supabase.functions.invoke("generate-color-variants", {
        body: {
          imageBase64: plainTemplate,
          colorName,
          productTitle,
          sourceWidth: targetSize?.width || null,
          sourceHeight: targetSize?.height || null,
          customInstructions,
          swatchHints: typeConfig.swatchHints,
        },
      });

      if (error || data?.error) {
        handleAiError(error, data, `Failed to regenerate ${colorName}`);
        return;
      }

      const generatedBase64 = data.imageBase64;
      if (!generatedBase64) throw new Error("No image returned");

      const generatedDataUrl = ensureImageDataUrl(generatedBase64);
      const blob = await normalizeAndLockToTemplateBlob({
        templateDataUrl: plainTemplate,
        generatedDataUrl,
        targetWidth: targetSize?.width || 1024,
        targetHeight: targetSize?.height || 1024,
        designDataUrl: designForComposite,
        isDarkGarment: !isLight,
        referenceDesignSize,
      });

      const path = `${userId}/${crypto.randomUUID()}.jpg`;
      const { error: uploadErr } = await supabase.storage
        .from("product-images")
        .upload(path, blob, { contentType: "image/jpeg" });
      if (uploadErr) throw uploadErr;

      const { data: urlData } = supabase.storage.from("product-images").getPublicUrl(path);

      await insertProductImageIfNotExists({
        product_id: productId,
        user_id: userId,
        image_url: urlData.publicUrl,
        image_type: "mockup",
        color_name: colorName,
        position: 0,
      });

      await loadImages();
      toast.success(`${colorName} mockup regenerated!`);
    } catch (err: any) {
      console.error("Regenerate single error:", err);
      toast.error(err.message || "Failed to regenerate mockup");
    } finally {
      setRegeneratingId(null);
      setFeedbackMockupId(null);
      setFeedbackReason("");
    }
  };

  // ─── Render: Color Picker Panel ────────────────────────────────
  const renderColorPicker = () => {
    const existingColorNames = new Set(images.map(img => img.color_name.toLowerCase()));

    return (
      <div className="space-y-4 rounded-xl border border-border bg-card p-4">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-sm font-semibold">Choose Colors</h4>
            <p className="text-xs text-muted-foreground">Select colors to generate mockups for</p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={fetchAiRecommendations}
              disabled={loadingRecs}
              className="gap-2"
            >
              {loadingRecs ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              AI Recommend
            </Button>
            <Button size="sm" onClick={() => setGenStep(null)} variant="ghost">Cancel</Button>
          </div>
        </div>

        {/* AI Recommendation Chips */}
        {aiRecommendations.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">AI Recommendations:</p>
            <div className="flex flex-wrap gap-2">
              {aiRecommendations.map((rec) => {
                const isSelected = selectedColors.includes(rec.color);
                const alreadyExists = existingColorNames.has(rec.color.toLowerCase());
                return (
                  <button
                    key={rec.color}
                    type="button"
                    disabled={alreadyExists}
                    onClick={() => toggleColor(rec.color)}
                    className={`group relative rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                      alreadyExists
                        ? "bg-muted text-muted-foreground/50 cursor-not-allowed line-through"
                        : isSelected
                          ? "bg-primary text-primary-foreground"
                          : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                    }`}
                    title={alreadyExists ? "Already generated" : rec.reason}
                  >
                    {rec.color}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Full Palette Grid */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Available palette:</p>
          <div className="flex flex-wrap gap-2">
            {availableColors.map((color) => {
              const isSelected = selectedColors.includes(color.name);
              const alreadyExists = existingColorNames.has(color.name.toLowerCase());
              return (
                <button
                  key={color.name}
                  type="button"
                  disabled={alreadyExists}
                  onClick={() => toggleColor(color.name)}
                  className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                    alreadyExists
                      ? "bg-muted text-muted-foreground/50 cursor-not-allowed"
                      : isSelected
                        ? "bg-primary text-primary-foreground"
                        : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                  }`}
                >
                  <span
                    className="inline-block h-3 w-3 rounded-full border border-border shrink-0"
                    style={{ backgroundColor: color.hex }}
                  />
                  {color.name}
                  {alreadyExists && <span className="text-[10px]">(done)</span>}
                </button>
              );
            })}
          </div>
        </div>

        {/* Custom Instructions */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Custom instructions (optional)</label>
          <Input
            value={customInstructions}
            onChange={(e) => setCustomInstructions(e.target.value)}
            placeholder="e.g. lifestyle background, folded shirt, wooden table…"
            className="h-8 text-xs"
          />
        </div>

        {selectedColors.length > 0 && (
          <div className="flex items-center justify-between pt-2 border-t border-border">
            <p className="text-xs text-muted-foreground">{selectedColors.length} color{selectedColors.length !== 1 ? "s" : ""} selected</p>
            <Button size="sm" onClick={generateMockups} className="gap-2">
              <Sparkles className="h-3.5 w-3.5" /> Generate Mockups
            </Button>
          </div>
        )}
      </div>
    );
  };

  // ─── Render: Generation Progress ───────────────────────────────
  const renderGenerationProgress = () => (
    <div className="rounded-xl border border-border bg-card p-6 space-y-4">
      <div className="text-center space-y-2">
        <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
        <h4 className="text-sm font-semibold">Generating Mockups</h4>
        <p className="text-xs text-muted-foreground">
          {generationProgress.current
            ? `Creating ${generationProgress.current}…`
            : `${generationProgress.done} of ${generationProgress.total} complete`}
        </p>
      </div>
      <div className="space-y-1.5">
        {Array.from(generatingColors.entries()).map(([color, status]) => (
          <div key={color} className="flex items-center justify-between text-xs px-2 py-1 rounded bg-muted/50">
            <span>{color}</span>
            <span className={
              status === "done" ? "text-green-600" :
              status === "error" ? "text-destructive" :
              "text-muted-foreground"
            }>
              {status === "done" ? "✓" : status === "error" ? "✗ Failed" : "⏳ Pending"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );

  // ─── Render: Mockup Grid with Feedback ─────────────────────────
  const renderMockupGrid = (showFeedback = false) => (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {images.map((img) => (
        <div key={img.id} className="group relative rounded-lg border border-border bg-card overflow-hidden">
          <div className="relative h-36 overflow-hidden bg-secondary cursor-pointer" onClick={() => setPreviewImage(img)}>
            <img src={img.image_url} alt={img.color_name} loading="lazy" decoding="async" className="h-full w-full object-contain p-2" />
            <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/30 transition-colors">
              <ZoomIn className="h-5 w-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
            {regeneratingId === img.color_name && (
              <div className="absolute inset-0 flex items-center justify-center bg-background/70">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 px-3 py-2">
            {editingId === img.id ? (
              <>
                <Input
                  value={editColor}
                  onChange={(e) => setEditColor(e.target.value)}
                  className="h-7 text-xs"
                  autoFocus
                  onKeyDown={(e) => e.key === "Enter" && handleSaveColor(img.id)}
                />
                <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={() => handleSaveColor(img.id)}>
                  <Check className="h-3.5 w-3.5" />
                </Button>
              </>
            ) : (
              <>
                <span className="flex-1 truncate text-xs font-medium">{img.color_name || "Untitled"}</span>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 shrink-0 opacity-0 group-hover:opacity-100"
                  onClick={() => { setEditingId(img.id); setEditColor(img.color_name); }}
                >
                  <Edit2 className="h-3 w-3" />
                </Button>
                {showFeedback && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 shrink-0 opacity-0 group-hover:opacity-100 hover:text-orange-500"
                    onClick={() => { setFeedbackMockupId(img.id); setFeedbackReason(""); }}
                    title="Report issue & regenerate"
                  >
                    <ThumbsDown className="h-3 w-3" />
                  </Button>
                )}
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 shrink-0 opacity-0 group-hover:opacity-100 hover:text-destructive"
                  onClick={() => handleDelete(img.id)}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </>
            )}
          </div>

          {/* Feedback popover inline */}
          {feedbackMockupId === img.id && (
            <div className="border-t border-border px-3 py-2 space-y-2 bg-muted/30">
              <p className="text-[11px] font-medium">What's wrong?</p>
              <div className="flex flex-wrap gap-1.5">
                {FEEDBACK_OPTIONS.map(opt => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => setFeedbackReason(opt)}
                    className={`rounded-full px-2.5 py-1 text-[10px] font-medium transition-colors ${
                      feedbackReason === opt
                        ? "bg-primary text-primary-foreground"
                        : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                    }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
              <textarea
                value={feedbackDetails}
                onChange={(e) => setFeedbackDetails(e.target.value)}
                placeholder="Add details… e.g. 'Design should be the same size as the black variant' or 'Move design up slightly'"
                className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-[11px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
                rows={2}
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={() => { setFeedbackMockupId(null); setFeedbackReason(""); setFeedbackDetails(""); }}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  className="h-7 text-xs gap-1.5"
                  disabled={!feedbackReason || regeneratingId === img.color_name}
                  onClick={() => {
                    const fullFeedback = feedbackDetails
                      ? `${feedbackReason}: ${feedbackDetails}`
                      : feedbackReason;
                    handleRegenerateSingle(img.color_name, fullFeedback);
                  }}
                >
                  <RotateCw className="h-3 w-3" /> Regenerate
                </Button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Color Variant Mockups</h3>
          <p className="text-xs text-muted-foreground">
            Each mockup becomes a Shopify color variant · Upload manually or generate with AI
          </p>
        </div>
        <div className="flex gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleUpload}
            className="hidden"
          />
          {genStep === "review" && (
            <Button variant="ghost" size="sm" onClick={() => setGenStep(null)} className="gap-2">
              <ChevronLeft className="h-3.5 w-3.5" /> Done
            </Button>
          )}
          {!genStep && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="gap-2"
              >
                {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                Upload
              </Button>
              <Button
                size="sm"
                onClick={() => { setGenStep("choose-colors"); setAiRecommendations([]); setSelectedColors([]); }}
                className="gap-2"
                disabled={!sourceImageUrl}
              >
                <Sparkles className="h-3.5 w-3.5" /> Generate
              </Button>
            </>
          )}
        </div>
      </div>

      {!sourceImageUrl ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-amber-500/40 bg-amber-500/5 py-8 px-4 text-center">
          <ImageIcon className="h-7 w-7 text-amber-500/70" />
          <p className="text-sm font-medium text-foreground">No mockup template configured</p>
          <p className="text-xs text-muted-foreground max-w-md">
            Upload a mockup template for <strong>{typeConfig.label}</strong> in your Brand Settings to enable AI mockup generation. The template should be a plain garment photo without any design.
          </p>
        </div>
      ) : (
        <p className="rounded-md bg-muted/50 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
          <strong>Note:</strong> AI-generated mockups are approximations and may not perfectly reflect the final printed product. Colors, placement, and proportions can vary — always review before publishing.
        </p>
      )}

      {/* Step: Choose Colors */}
      {genStep === "choose-colors" && renderColorPicker()}

      {/* Step: Generating */}
      {genStep === "generating" && renderGenerationProgress()}

      {/* Step: Review with Feedback */}
      {genStep === "review" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground">Review your mockups — click 👎 to report issues and regenerate</p>
            <Button size="sm" variant="outline" onClick={() => { setGenStep("choose-colors"); setAiRecommendations([]); setSelectedColors([]); }} className="gap-2">
              <Plus className="h-3.5 w-3.5" /> Add More Colors
            </Button>
          </div>
          {renderMockupGrid(true)}
        </div>
      )}

      {/* Default: Show existing mockups */}
      {!genStep && (
        <>
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : images.length === 0 ? (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border bg-card/50 py-10 transition-colors hover:border-primary/50"
            >
              <ImageIcon className="h-8 w-8 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">
                Upload mockup images (filename = color name)
              </p>
            </button>
          ) : (
            renderMockupGrid(true)
          )}
        </>
      )}

      {/* Fullscreen preview dialog */}
      <Dialog open={!!previewImage} onOpenChange={(open) => !open && setPreviewImage(null)}>
        <DialogContent className="max-w-3xl p-2">
          {previewImage && (
            <div className="space-y-2">
              <img loading="lazy" decoding="async"
                src={previewImage.image_url}
                alt={previewImage.color_name}
                className="w-full rounded-lg object-contain max-h-[80vh]"
              />
              <p className="text-center text-sm font-medium text-muted-foreground">
                {previewImage.color_name}
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
