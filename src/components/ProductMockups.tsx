import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ImageIcon, Plus, Trash2, Upload, Loader2, Edit2, Check, ZoomIn } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { GenerateColorVariants } from "./GenerateColorVariants";
import { MockupFeedback } from "./MockupFeedback";
import {
  ensureImageDataUrl,
  getImageDimensionsFromDataUrl,
  normalizeAndLockToTemplateBlob,
  compositeDesignOntoTemplate,
  compressForEdgeFunction,
} from "@/lib/mockupComposition";
import { removeBackground, recolorOpaquePixels, isMultiColorDesign, smartRemoveBackground } from "@/lib/removeBackground";
import { insertProductImageIfNotExists } from "@/lib/productImageUtils";
import { handleAiError } from "@/lib/aiErrors";
import { getProductType, isLightColor } from "@/lib/productTypes";

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

export const ProductMockups = ({ productId, userId, productTitle, organizationId, sourceImageUrl, designImageUrl, brandName, brandNiche, brandAudience, brandTone, productCategory, aiUsage }: Props) => {
  const [images, setImages] = useState<ProductImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editColor, setEditColor] = useState("");
  const [previewImage, setPreviewImage] = useState<ProductImage | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const typeConfig = getProductType(productCategory || "");

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

  /** Regenerate a single mockup color variant with feedback-informed instructions */
  const handleRegenerateSingle = async (colorName: string, feedback: string) => {
    const templateUrl = sourceImageUrl;
    if (!templateUrl) {
      toast.error("No template image available.");
      return;
    }

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

      // Fetch design
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
        } catch { return undefined; }
      };

      // Load design variants
      const { data: designImages } = await supabase
        .from("product_images")
        .select("image_url, color_name")
        .eq("product_id", productId)
        .eq("image_type", "design");

      const normalizeKey = (v?: string | null) =>
        (v || "").toLowerCase().trim().replace(/[_\s]+/g, "-");

      const lightDesignUrl = designImages?.find((d) => {
        const key = normalizeKey(d.color_name);
        return key === "light-on-dark" || key === "light";
      })?.image_url || designImageUrl;

      const darkDesignUrl = designImages?.find((d) => {
        const key = normalizeKey(d.color_name);
        return key === "dark-on-light" || key === "dark";
      })?.image_url;

      let lightDesignBase64 = lightDesignUrl ? await fetchAsBase64(lightDesignUrl) : undefined;
      let darkDesignBase64 = darkDesignUrl ? await fetchAsBase64(darkDesignUrl) : undefined;

      // Derive dark variant if missing
      if (!darkDesignBase64 && lightDesignBase64) {
        try {
          const multiColor = await isMultiColorDesign(lightDesignBase64);
          if (multiColor) {
            // Use removeBackground + recolor for simple derivation
            const bgRemoved = await removeBackground(lightDesignBase64, "black");
            darkDesignBase64 = ensureImageDataUrl(await recolorOpaquePixels(bgRemoved, { r: 24, g: 24, b: 24 }));
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

      // Send the PLAIN template to AI (no design baked in) to prevent duplication.
      // The design is composited AFTER AI recoloring in normalizeAndLockToTemplateBlob.
      let plainTemplate = templateBase64;
      try {
        plainTemplate = await compressForEdgeFunction(plainTemplate, 1024, 0.8);
      } catch { /* use uncompressed */ }

      let targetSize: { width: number; height: number } | null = null;
      try {
        targetSize = await getImageDimensionsFromDataUrl(templateBase64);
      } catch { /* null */ }

      // Build feedback-informed instructions
      const customInstructions = `IMPORTANT FEEDBACK FROM USER: ${feedback}. Please address these issues in the regenerated mockup.`;

      // Call edge function
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
      });

      // Upload
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
    }
  };

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
        </div>
      </div>

      {/* AI Color Variant Generator */}
      <GenerateColorVariants
        productId={productId}
        userId={userId}
        productTitle={productTitle}
        organizationId={organizationId}
        sourceImageUrl={sourceImageUrl || null}
        designImageUrl={designImageUrl}
        onComplete={loadImages}
        brandName={brandName}
        brandNiche={brandNiche}
        brandAudience={brandAudience}
        brandTone={brandTone}
        productCategory={productCategory}
        aiUsage={aiUsage}
      />

      <p className="rounded-md bg-muted/50 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
        <strong>Note:</strong> AI-generated mockups are approximations and may not perfectly reflect the final printed product. Colors, placement, and proportions can vary — always review before publishing.
      </p>

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
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {images.map((img) => (
            <div key={img.id} className="group relative rounded-lg border border-border bg-card overflow-hidden">
              <div className="relative h-36 overflow-hidden bg-secondary cursor-pointer" onClick={() => setPreviewImage(img)}>
                <img src={img.image_url} alt={img.color_name} loading="lazy" decoding="async" className="h-full w-full object-contain p-2" />
                <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/30 transition-colors">
                  <ZoomIn className="h-5 w-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
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
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 shrink-0 opacity-0 group-hover:opacity-100 hover:text-destructive"
                      onClick={() => handleDelete(img.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                    {organizationId && (
                      <MockupFeedback
                        productImageId={img.id}
                        productId={productId}
                        organizationId={organizationId}
                        userId={userId}
                        colorName={img.color_name}
                        imageUrl={img.image_url}
                        onRegenerate={handleRegenerateSingle}
                      />
                    )}
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
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
