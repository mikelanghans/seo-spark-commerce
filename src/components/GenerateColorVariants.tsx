import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Palette, Plus, Loader2, X, Sparkles, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { handleAiError } from "@/lib/aiErrors";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  productId: string;
  userId: string;
  productTitle: string;
  sourceImageUrl: string | null;
  designImageUrl?: string | null;
  onComplete: () => void;
}

const SUGGESTED_COLORS = [
  "Black", "White", "Navy Blue", "Red", "Forest Green",
  "Heather Gray", "Royal Blue", "Maroon", "Pink", "Sand",
];

export const GenerateColorVariants = ({ productId, userId, productTitle, sourceImageUrl, designImageUrl, onComplete }: Props) => {
  const [open, setOpen] = useState(false);
  const [colors, setColors] = useState<string[]>([]);
  const [existingColorSet, setExistingColorSet] = useState<Set<string>>(new Set());
  const [customColor, setCustomColor] = useState("");
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, current: "" });

  // Load existing colors when panel opens
  const loadExistingColors = async () => {
    const { data } = await supabase
      .from("product_images")
      .select("color_name")
      .eq("product_id", productId)
      .eq("image_type", "mockup");
    const existing = (data || []).map((img) => img.color_name);
    const existingLower = new Set(existing.map((c) => c.toLowerCase()));
    setExistingColorSet(existingLower);
    // Pre-select colors that already exist
    const matched = SUGGESTED_COLORS.filter((c) => existingLower.has(c.toLowerCase()));
    const custom = existing.filter((c) => !SUGGESTED_COLORS.some((s) => s.toLowerCase() === c.toLowerCase()));
    setColors([...matched, ...custom]);
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
    setProgress({ done: 0, total: colors.length, current: colors[0] });

    // Check which colors already exist in DB to skip duplicates
    const { data: existingImages } = await supabase
      .from("product_images")
      .select("color_name")
      .eq("product_id", productId)
      .eq("image_type", "mockup");
    const existingColors = new Set((existingImages || []).map((img) => img.color_name.toLowerCase()));
    const newColors = colors.filter((c) => !existingColors.has(c.toLowerCase()));

    if (newColors.length === 0) {
      toast.info("All selected colors already exist as variants.");
      setGenerating(false);
      return;
    }

    setProgress({ done: 0, total: newColors.length, current: newColors[0] });

    // Fetch the source image as base64
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

    // Optionally fetch the design image as base64
    let designBase64: string | undefined;
    if (designImageUrl) {
      try {
        const resp = await fetch(designImageUrl);
        const contentType = resp.headers.get("content-type") || "";
        if (contentType.startsWith("image/")) {
          const blob = await resp.blob();
          designBase64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
        } else {
          console.warn("Design image URL returned non-image content, skipping");
        }
      } catch {
        console.warn("Could not load design image, proceeding without it");
      }
    }
    let successCount = 0;
    for (let i = 0; i < newColors.length; i++) {
      const colorName = newColors[i];
      setProgress({ done: i, total: newColors.length, current: colorName });

      try {
        const { data, error } = await supabase.functions.invoke("generate-color-variants", {
          body: { imageBase64, colorName, productTitle, designImageBase64: designBase64 },
        });
        if (error || data?.error) {
          handleAiError(error, data, `Failed: ${colorName}`);
          const errorMsg = data?.error || error?.message || "";
          if (errorMsg.includes("credits") || errorMsg.includes("402")) break;
          continue;
        }

        const generatedBase64 = data.imageBase64;
        if (!generatedBase64) throw new Error("No image returned");

        // Convert base64 to blob and upload to storage
        const base64Data = generatedBase64.split(",")[1] || generatedBase64;
        const byteChars = atob(base64Data);
        const byteArray = new Uint8Array(byteChars.length);
        for (let j = 0; j < byteChars.length; j++) byteArray[j] = byteChars.charCodeAt(j);
        const blob = new Blob([byteArray], { type: "image/png" });

        const path = `${userId}/${crypto.randomUUID()}.png`;
        const { error: uploadError } = await supabase.storage.from("product-images").upload(path, blob);
        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage.from("product-images").getPublicUrl(path);

        // Save to product_images table
        await supabase.from("product_images").insert({
          product_id: productId,
          user_id: userId,
          image_url: urlData.publicUrl,
          image_type: "mockup",
          color_name: colorName,
          position: i,
        });

        successCount++;
      } catch (err: any) {
        console.error(`Failed to generate ${colorName}:`, err);
        handleAiError(err, null, `Failed: ${colorName}`);
      }
    }

    setProgress({ done: newColors.length, total: newColors.length, current: "" });
    setGenerating(false);
    if (colors.length > newColors.length) {
      toast.success(`Generated ${successCount}/${newColors.length} new variants (${colors.length - newColors.length} already existed)`);
    } else {
      toast.success(`Generated ${successCount}/${newColors.length} color variants!`);
    }
    setColors([]);
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

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Palette className="h-4 w-4 text-primary" />
          <h4 className="text-sm font-semibold">Generate AI Color Variants</h4>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setOpen(false)}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        Select colors below — AI will re-render your product image in each color and save them as mockup variants.
      </p>

      {/* Quick-pick colors */}
      <div className="flex flex-wrap gap-1.5">
        {SUGGESTED_COLORS.map((color) => {
          const isExisting = existingColorSet.has(color.toLowerCase());
          const isSelected = colors.includes(color);
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
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Generating {progress.current}… ({progress.done}/{progress.total})
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
