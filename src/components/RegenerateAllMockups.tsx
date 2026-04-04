import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { RefreshCw, Loader2, AlertTriangle, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  ensureImageDataUrl,
  getImageDimensionsFromDataUrl,
  normalizeAndLockToTemplateBlob,
  compressForEdgeFunction,
} from "@/lib/mockupComposition";
import { removeBackground, recolorOpaquePixels, isMultiColorDesign, smartRemoveBackground } from "@/lib/removeBackground";
import { insertProductImageIfNotExists } from "@/lib/productImageUtils";
import { handleAiError } from "@/lib/aiErrors";

interface Props {
  organizationId: string;
  userId: string;
  templateImageUrl: string;
  /** Optional: only regenerate mockups for products of this category */
  productTypeFilter?: string;
  /** Optional: custom button label */
  buttonLabel?: string;
}

const LIGHT_COLORS = new Set([
  "ivory", "butter", "banana", "blossom", "orchid", "chalky mint",
  "island reef", "chambray", "white", "flo blue", "watermelon",
  "neon pink", "neon green", "lagoon blue", "yam", "terracotta",
  "light green", "bay", "sage",
]);

export const RegenerateAllMockups = ({ organizationId, userId, templateImageUrl, productTypeFilter, buttonLabel }: Props) => {
  const [showDialog, setShowDialog] = useState(false);
  const [mode, setMode] = useState<"replace" | "keep" | null>(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, current: "" });
  const [estimate, setEstimate] = useState<{ products: number; mockups: number } | null>(null);
  const [estimating, setEstimating] = useState(false);
  const [completedImages, setCompletedImages] = useState<{ url: string; label: string }[]>([]);
  const cancelRef = useRef(false);

  const loadEstimate = async () => {
    setEstimating(true);
    setEstimate(null);
    try {
      let query = supabase
        .from("products")
        .select("id, category")
        .eq("organization_id", organizationId);
      if (productTypeFilter) {
        query = query.ilike("category", `%${productTypeFilter}%`);
      }
      const { data: products } = await query;
      if (!products || products.length === 0) {
        setEstimate({ products: 0, mockups: 0 });
        return;
      }
      const productIds = products.map((p) => p.id);
      const { data: mockups } = await supabase
        .from("product_images")
        .select("product_id, color_name")
        .in("product_id", productIds)
        .eq("image_type", "mockup");
      const productsWithMockups = new Set((mockups || []).map((m) => m.product_id));
      setEstimate({ products: productsWithMockups.size, mockups: (mockups || []).length });
    } catch {
      setEstimate({ products: 0, mockups: 0 });
    } finally {
      setEstimating(false);
    }
  };

  const handleOpenDialog = () => {
    setShowDialog(true);
    loadEstimate();
  };

  const handleRegenerate = async (replaceExisting: boolean) => {
    setMode(replaceExisting ? "replace" : "keep");
    setRunning(true);
    setCompletedImages([]);
    cancelRef.current = false;

    try {
      // 1. Get all products in this org (optionally filtered by product type)
      let query = supabase
        .from("products")
        .select("id, title, image_url, category")
        .eq("organization_id", organizationId);
      if (productTypeFilter) {
        query = query.ilike("category", `%${productTypeFilter}%`);
      }
      const { data: products } = await query;

      if (!products || products.length === 0) {
        toast.info(productTypeFilter ? `No ${productTypeFilter} products found.` : "No products found in this brand.");
        setRunning(false);
        setShowDialog(false);
        return;
      }

      // 2. Get all existing mockups for these products
      const productIds = products.map((p) => p.id);
      const { data: existingMockups } = await supabase
        .from("product_images")
        .select("id, product_id, color_name, image_type")
        .in("product_id", productIds)
        .eq("image_type", "mockup");

      // Build a map of product -> color names that have mockups
      const mockupMap = new Map<string, { colors: string[]; ids: string[] }>();
      for (const m of existingMockups || []) {
        if (!mockupMap.has(m.product_id)) {
          mockupMap.set(m.product_id, { colors: [], ids: [] });
        }
        const entry = mockupMap.get(m.product_id)!;
        entry.colors.push(m.color_name);
        entry.ids.push(m.id);
      }

      // Only process products that have existing mockups
      const productsWithMockups = products.filter((p) => mockupMap.has(p.id));
      if (productsWithMockups.length === 0) {
        toast.info("No products have mockups to regenerate.");
        setRunning(false);
        setShowDialog(false);
        return;
      }

      // Count total colors to regenerate
      let totalColors = 0;
      for (const p of productsWithMockups) {
        totalColors += mockupMap.get(p.id)!.colors.length;
      }
      setProgress({ done: 0, total: totalColors, current: "" });

      // Fetch template as base64
      const templateResp = await fetch(templateImageUrl);
      const templateBlob = await templateResp.blob();
      const templateBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(templateBlob);
      });

      let doneCount = 0;

      for (const product of productsWithMockups) {
        const entry = mockupMap.get(product.id)!;

        // If replacing, delete old mockups first
        if (replaceExisting) {
          await supabase
            .from("product_images")
            .delete()
            .in("id", entry.ids);
        }

        // Load design variants for this product
        const { data: designImages } = await supabase
          .from("product_images")
          .select("image_url, color_name")
          .eq("product_id", product.id)
          .eq("image_type", "design");

        const normalizeKey = (v?: string | null) =>
          (v || "").toLowerCase().trim().replace(/[_\s]+/g, "-");

        const lightDesignUrl = designImages?.find((d) => {
          const key = normalizeKey(d.color_name);
          return key === "light-on-dark" || key === "light";
        })?.image_url || product.image_url;

        const darkDesignUrl = designImages?.find((d) => {
          const key = normalizeKey(d.color_name);
          return key === "dark-on-light" || key === "dark";
        })?.image_url;

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

        let lightDesignBase64 = lightDesignUrl ? await fetchAsBase64(lightDesignUrl) : undefined;
        let darkDesignBase64 = darkDesignUrl ? await fetchAsBase64(darkDesignUrl) : undefined;

        // Derive dark variant if missing
        if (!darkDesignBase64 && lightDesignBase64) {
          try {
            const multiColor = await isMultiColorDesign(lightDesignBase64);
            if (multiColor) {
              darkDesignBase64 = await deriveDarkInk(lightDesignBase64);
            } else {
              const bgRemoved = await removeBackground(lightDesignBase64, "black");
              const rawDark = await recolorOpaquePixels(bgRemoved, { r: 24, g: 24, b: 24 });
              darkDesignBase64 = ensureImageDataUrl(rawDark);
            }
          } catch {
            // continue without
          }
        }

        if (!lightDesignBase64 && !darkDesignBase64 && product.image_url) {
          try {
            const cleaned = await smartRemoveBackground(product.image_url);
            lightDesignBase64 = ensureImageDataUrl(cleaned);
          } catch {
            lightDesignBase64 = await fetchAsBase64(product.image_url);
          }
          if (!darkDesignBase64 && lightDesignBase64) {
            try {
              const multiColor = await isMultiColorDesign(lightDesignBase64);
              if (multiColor) {
                darkDesignBase64 = await deriveDarkInk(lightDesignBase64);
              } else {
                const bgRemoved = await removeBackground(lightDesignBase64, "black");
                const rawDark = await recolorOpaquePixels(bgRemoved, { r: 24, g: 24, b: 24 });
                darkDesignBase64 = ensureImageDataUrl(rawDark);
              }
            } catch {
              // continue
            }
          }
        }

        let compressedTemplateBase64 = templateBase64;
        try {
          compressedTemplateBase64 = await compressForEdgeFunction(templateBase64, 1024, 0.8);
        } catch { /* use uncompressed */ }

        let targetSize: { width: number; height: number } | null = null;
        try {
          targetSize = await getImageDimensionsFromDataUrl(templateBase64);
        } catch { /* null */ }

        // Generate each color
        for (const colorName of entry.colors) {
          if (cancelRef.current) break;
          setProgress({ done: doneCount, total: totalColors, current: `${product.title} — ${colorName}` });

          try {
            const isLight = LIGHT_COLORS.has(colorName.toLowerCase().trim());
            const designForRecomposite = isLight ? (darkDesignBase64 || lightDesignBase64) : lightDesignBase64;

            const { data, error } = await supabase.functions.invoke("generate-color-variants", {
              body: {
                imageBase64: compressedTemplateBase64,
                colorName,
                productTitle: product.title,
                sourceWidth: targetSize?.width || null,
                sourceHeight: targetSize?.height || null,
              },
            });

            if (cancelRef.current) break;

            if (error || data?.error) {
              const errorMsg = data?.error || error?.message || "";
              if (errorMsg.includes("credits") || errorMsg.includes("402")) {
                toast.error("AI credits exhausted. Stopping regeneration.");
                setRunning(false);
                return;
              }
              console.error(`Failed: ${product.title} - ${colorName}:`, errorMsg);
              doneCount++;
              continue;
            }

            const generatedBase64 = data.imageBase64;
            if (!generatedBase64) {
              doneCount++;
              continue;
            }

            const generatedDataUrl = ensureImageDataUrl(generatedBase64);
            const blob = await normalizeAndLockToTemplateBlob({
              templateDataUrl: templateBase64,
              generatedDataUrl,
              targetWidth: targetSize?.width || 1024,
              targetHeight: targetSize?.height || 1024,
              designDataUrl: designForRecomposite,
              isDarkGarment: !isLight,
            });

            // Refresh session
            const { data: session } = await supabase.auth.getSession();
            if (!session.session) {
              const { error: refreshErr } = await supabase.auth.refreshSession();
              if (refreshErr) throw new Error("Session expired");
            }

            const path = `${userId}/${crypto.randomUUID()}.jpg`;
            const { error: uploadErr } = await supabase.storage
              .from("product-images")
              .upload(path, blob, { contentType: "image/jpeg" });
            if (uploadErr) throw uploadErr;

            const { data: urlData } = supabase.storage.from("product-images").getPublicUrl(path);

            await insertProductImageIfNotExists({
              product_id: product.id,
              user_id: userId,
              image_url: urlData.publicUrl,
              image_type: "mockup",
              color_name: colorName,
              position: 0,
            });

            // Track completed image for live preview
            setCompletedImages((prev) => [...prev, { url: urlData.publicUrl, label: `${product.title} — ${colorName}` }]);
          } catch (err) {
            console.error(`Error regenerating ${product.title} - ${colorName}:`, err);
          }

          doneCount++;
          setProgress({ done: doneCount, total: totalColors, current: "" });
        }
        if (cancelRef.current) break;
      }

      if (cancelRef.current) {
        toast.info(`Cancelled after ${doneCount} mockup${doneCount !== 1 ? "s" : ""}`);
      } else {
        toast.success(`Regenerated mockups for ${productsWithMockups.length} product${productsWithMockups.length !== 1 ? "s" : ""}!`);
      }
    } catch (err: any) {
      console.error("Regenerate all error:", err);
      toast.error(err.message || "Failed to regenerate mockups");
    } finally {
      setRunning(false);
      setMode(null);
    }
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={handleOpenDialog}
        className="gap-2"
      >
        <RefreshCw className="h-3.5 w-3.5" />
        {buttonLabel || "Regenerate All Mockups"}
      </Button>

      <Dialog open={showDialog} onOpenChange={(open) => !running && setShowDialog(open)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Regenerate All Mockups</DialogTitle>
          </DialogHeader>

          {running ? (
            <div className="space-y-3 py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>
                    {progress.done}/{progress.total} mockups
                    {progress.current && ` — ${progress.current}`}
                  </span>
                </div>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => { cancelRef.current = true; }}
                  className="gap-1.5"
                >
                  <X className="h-3.5 w-3.5" />
                  Cancel
                </Button>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full bg-primary transition-all"
                  style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }}
                />
              </div>

              {/* Live preview of completed mockups */}
              {completedImages.length > 0 && (
                <ScrollArea className="h-48">
                  <div className="grid grid-cols-4 gap-2">
                    {completedImages.map((img, i) => (
                      <div key={i} className="group relative">
                        <img
                          src={img.url}
                          alt={img.label}
                          className="w-full aspect-square object-cover rounded-md border border-border"
                        />
                        <div className="absolute inset-x-0 bottom-0 bg-background/80 px-1 py-0.5 rounded-b-md">
                          <p className="text-[9px] text-foreground truncate">{img.label.split(" — ")[1] || img.label}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}

              <p className="text-xs text-muted-foreground">
                {completedImages.length > 0 ? `${completedImages.length} completed so far` : "This may take a while. Please don't close the page."}
              </p>
            </div>
          ) : estimating ? (
            <div className="flex items-center gap-2 py-6 justify-center text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Counting mockups…
            </div>
          ) : estimate && estimate.mockups === 0 ? (
            <div className="py-4">
              <p className="text-sm text-muted-foreground">No products with existing mockups found{productTypeFilter ? ` for ${productTypeFilter}` : ""}. Nothing to regenerate.</p>
            </div>
          ) : (
            <div className="space-y-4 py-2">
              {/* Credit estimate */}
              {estimate && (
                <div className="rounded-lg border border-border bg-muted/50 p-3 space-y-1">
                  <p className="text-sm font-medium">Estimated usage</p>
                  <p className="text-xs text-muted-foreground">
                    <strong>{estimate.products}</strong> product{estimate.products !== 1 ? "s" : ""} × <strong>{estimate.mockups}</strong> mockup{estimate.mockups !== 1 ? "s" : ""} = <strong className="text-primary">{estimate.mockups} AI credit{estimate.mockups !== 1 ? "s" : ""}</strong>
                  </p>
                </div>
              )}

              <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                <div className="text-xs text-destructive space-y-1">
                  <p>This will regenerate mockups for <strong>{estimate?.products ?? "all"} product{(estimate?.products ?? 0) !== 1 ? "s" : ""}</strong> using the new template image.</p>
                  <p>AI-generated mockups may not be perfectly accurate — colors, placement, and details can vary. Review results after regeneration.</p>
                </div>
              </div>

              <p className="text-sm text-muted-foreground">
                What should happen to existing mockups?
              </p>

              <div className="grid gap-2">
                <Button
                  onClick={() => handleRegenerate(true)}
                  className="justify-start gap-2"
                  variant="default"
                >
                  <RefreshCw className="h-4 w-4" />
                  Replace existing mockups
                </Button>
                <Button
                  onClick={() => handleRegenerate(false)}
                  className="justify-start gap-2"
                  variant="outline"
                >
                  <RefreshCw className="h-4 w-4" />
                  Keep existing & add new
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

/** Derive dark-ink design from light-ink for light garments */
async function deriveDarkInk(sourceDataUrl: string): Promise<string> {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load design"));
    img.src = sourceDataUrl;
  });

  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth || image.width;
  canvas.height = image.naturalHeight || image.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");

  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const pixels = imgData.data;

  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] < 14) continue;
    const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const luma = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    const sat = max === 0 ? 0 : (max - min) / max;
    const isVeryLightNeutral = luma > 0.82 && sat < 0.18;
    const isLightInk = luma > 0.55 && (sat < 0.25 || (r > 160 && g > 160 && b > 160));
    if (!isLightInk) continue;
    const target = 24;
    const strength = isVeryLightNeutral ? 1 : Math.min(1, (luma - 0.55) / 0.35);
    pixels[i] = Math.round(r * (1 - strength) + target * strength);
    pixels[i + 1] = Math.round(g * (1 - strength) + target * strength);
    pixels[i + 2] = Math.round(b * (1 - strength) + target * strength);
    pixels[i + 3] = Math.max(pixels[i + 3], 210);
  }

  ctx.putImageData(imgData, 0, 0);
  return canvas.toDataURL("image/png");
}
