import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Palette, Plus, Loader2, X, Sparkles, CheckCircle2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { handleAiError } from "@/lib/aiErrors";
import { supabase } from "@/integrations/supabase/client";
import {
  ensureImageDataUrl,
  getImageDimensionsFromDataUrl,
  normalizeAndLockToTemplateBlob,
} from "@/lib/mockupComposition";

interface Props {
  productId: string;
  userId: string;
  productTitle: string;
  sourceImageUrl: string | null;
  designImageUrl?: string | null;
  onComplete: () => void;
  brandName?: string;
  brandNiche?: string;
  brandAudience?: string;
  brandTone?: string;
  productCategory?: string;
}

const SUGGESTED_COLORS = [
  "Black", "White", "True Navy", "Red", "Moss",
  "Grey", "Blue Jean", "Pepper", "Island Green", "Ivory",
  "Crimson", "Espresso", "Midnight", "Sage", "Chambray",
];

interface ColorRecommendation {
  color: string;
  reason: string;
}

export const GenerateColorVariants = ({ productId, userId, productTitle, sourceImageUrl, designImageUrl, onComplete, brandName, brandNiche, brandAudience, brandTone, productCategory }: Props) => {
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
          productCategory: productCategory || "T-Shirt",
          brandName,
          brandNiche,
          brandAudience,
          brandTone,
          existingColors: existingList,
          designImageBase64,
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

  const LIGHT_COLORS = new Set([
    "ivory", "butter", "banana", "blossom", "orchid", "chalky mint",
    "island reef", "chambray", "white", "flo blue", "watermelon",
    "neon pink", "neon green", "lagoon blue", "yam", "terracotta",
    "light green", "bay", "sage",
  ]);

  const CONCURRENCY = 2;

  const dataUrlToBlob = async (dataUrl: string): Promise<Blob> => {
    const resp = await fetch(dataUrl);
    return await resp.blob();
  };

  const generateSingleColor = async (
    colorName: string,
    imageBase64: string,
    lightDesignBase64: string | undefined,
    darkDesignBase64: string | undefined,
    targetSize: { width: number; height: number } | null,
  ): Promise<boolean> => {
    // Pick the correct design variant for this color
    const isLight = LIGHT_COLORS.has(colorName.toLowerCase().trim());
    const designBase64 = isLight ? (darkDesignBase64 || lightDesignBase64) : (lightDesignBase64 || darkDesignBase64);

    const { data, error } = await supabase.functions.invoke("generate-color-variants", {
      body: {
        imageBase64,
        colorName,
        productTitle,
        designImageBase64: designBase64,
        sourceWidth: targetSize?.width || null,
        sourceHeight: targetSize?.height || null,
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
    const blob = targetSize
      ? await normalizeAndLockToTemplateBlob({
          templateDataUrl: imageBase64,
          generatedDataUrl,
          targetWidth: targetSize.width,
          targetHeight: targetSize.height,
        })
      : await dataUrlToBlob(generatedDataUrl);

    const path = `${userId}/${crypto.randomUUID()}.png`;
    const { error: uploadError } = await supabase.storage.from("product-images").upload(path, blob);
    if (uploadError) throw uploadError;

    const { data: urlData } = supabase.storage.from("product-images").getPublicUrl(path);

    await supabase.from("product_images").insert({
      product_id: productId,
      user_id: userId,
      image_url: urlData.publicUrl,
      image_type: "mockup",
      color_name: colorName,
      position: 0,
    });

    return true;
  };

  const handleGenerate = async () => {
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

    // Load both design variants from product_images
    let lightDesignBase64: string | undefined;
    let darkDesignBase64: string | undefined;

    const { data: designImages } = await supabase
      .from("product_images")
      .select("image_url, color_name")
      .eq("product_id", productId)
      .eq("image_type", "design");

    const lightDesignUrl = designImages?.find(d => d.color_name === "light-on-dark")?.image_url || designImageUrl;
    const darkDesignUrl = designImages?.find(d => d.color_name === "dark-on-light")?.image_url;

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

    if (lightDesignUrl) lightDesignBase64 = await fetchAsBase64(lightDesignUrl);
    if (darkDesignUrl) darkDesignBase64 = await fetchAsBase64(darkDesignUrl);

    if (!lightDesignBase64 && !darkDesignBase64 && designImageUrl) {
      lightDesignBase64 = await fetchAsBase64(designImageUrl);
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
      // Non-fatal: if dimensions can't be read, skip composition lock
      targetSize = null;
    }

    const worker = async () => {
      while (nextIndex < newColors.length && !creditsExhausted) {
        const i = nextIndex++;
        const colorName = newColors[i];
        setActiveColors((prev) => [...prev, colorName]);

        try {
          const ok = await generateSingleColor(colorName, imageBase64, lightDesignBase64, darkDesignBase64, targetSize);
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
  };

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => { setOpen(true); loadExistingColors(); }} className="gap-2">
        <Palette className="h-3.5 w-3.5" /> AI Color Variants
      </Button>
    );
  }

  const recommendedColorNames = new Set(recommendations.map((r) => r.color.toLowerCase()));

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Palette className="h-4 w-4 text-primary" />
          <h4 className="text-sm font-semibold">Generate AI Color Variants</h4>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setOpen(false); setRecommendations([]); }}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* AI Recommendations */}
      {recommendations.length === 0 ? (
        <div className="rounded-lg border border-dashed border-primary/30 bg-primary/5 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Wand2 className="h-4 w-4 text-primary" />
            <p className="text-sm font-medium">Get AI Color Recommendations</p>
          </div>
          <p className="text-xs text-muted-foreground">
            AI will analyze your product, brand, and audience to suggest the best-selling colors.
          </p>
          <Button
            onClick={loadRecommendations}
            disabled={loadingRecs}
            size="sm"
            className="gap-2"
          >
            {loadingRecs ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            {loadingRecs ? "Analyzing…" : "Recommend Colors"}
          </Button>
        </div>
      ) : (
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-2">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            <p className="text-xs font-semibold text-primary">AI Recommendations</p>
          </div>
          <div className="space-y-1">
            {recommendations.map((rec) => {
              const isExisting = existingColorSet.has(rec.color.toLowerCase());
              const isSelected = colors.includes(rec.color);
              return (
                <button
                  key={rec.color}
                  type="button"
                  onClick={() => isSelected ? removeColor(rec.color) : addColor(rec.color)}
                  disabled={generating}
                  className={`w-full flex items-center gap-2 rounded-md px-3 py-2 text-left transition-colors ${
                    isSelected
                      ? "bg-primary/15 border border-primary/30"
                      : "bg-card border border-border hover:border-primary/30"
                  }`}
                >
                  <div className={`h-4 w-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                    isSelected ? "border-primary bg-primary" : "border-muted-foreground"
                  }`}>
                    {isSelected && <CheckCircle2 className="h-3 w-3 text-primary-foreground" />}
                  </div>
                  <span className="text-xs font-medium flex-1">
                    {isExisting && <CheckCircle2 className="inline h-3 w-3 mr-1 text-muted-foreground" />}
                    {rec.color}
                  </span>
                  <span className="text-[10px] text-muted-foreground">{rec.reason}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Or pick manually from the palette below:
      </p>

      {/* Quick-pick colors */}
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
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                isSelected
                  ? isExisting
                    ? "bg-primary/70 text-primary-foreground"
                    : "bg-primary text-primary-foreground"
                  : isRecommended
                    ? "bg-primary/20 text-primary border border-primary/30 hover:bg-primary/30"
                    : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
              }`}
            >
              {isExisting && <CheckCircle2 className="inline h-3 w-3 mr-1" />}
              {color}
            </button>
          );
        })}
      </div>

      {/* Custom color */}
      <div className="flex gap-2">
        <Input
          placeholder="Custom color (e.g. Burnt Orange)"
          value={customColor}
          onChange={(e) => setCustomColor(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addCustom())}
          disabled={generating}
          className="h-8 text-xs"
        />
        <Button variant="outline" size="sm" onClick={addCustom} disabled={generating || !customColor.trim()} className="h-8 gap-1">
          <Plus className="h-3 w-3" /> Add
        </Button>
      </div>

      {/* Selected colors */}
      {colors.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {colors.map((c) => (
            <span key={c} className="flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
              {c}
              {!generating && (
                <button onClick={() => removeColor(c)} className="ml-0.5 hover:text-destructive">
                  <X className="h-3 w-3" />
                </button>
              )}
            </span>
          ))}
        </div>
      )}

      {/* Progress */}
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
        onClick={handleGenerate}
        disabled={generating || colors.length === 0}
        className="gap-2 w-full"
        size="sm"
      >
        {generating ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Sparkles className="h-4 w-4" />
        )}
        {generating ? `Generating ${progress.done}/${progress.total}…` : `Generate ${colors.length} Color Variant${colors.length !== 1 ? "s" : ""}`}
      </Button>
    </div>
  );
};
