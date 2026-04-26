import { useState, useEffect, useMemo } from "react";
import JSZip from "jszip";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { ListingOutput } from "@/components/ListingOutput";
import { ProductMockups } from "@/components/ProductMockups";
import { PushToShopify } from "@/components/PushToShopify";
import { PushToPrintify } from "@/components/PushToPrintify";
import { PushToMarketplace } from "@/components/PushToMarketplace";
import { PushPrintifyThenShopify } from "@/components/PushPrintifyThenShopify";
import { SmartPricing } from "@/components/SmartPricing";
import { SizePricingEditor } from "@/components/SizePricingEditor";
import type { ProductTypeKey } from "@/lib/productTypes";
import { insertProductImagesDeduped, normalizeDesignColorName } from "@/lib/productImageUtils";
import { createAndUploadDesignVariants } from "@/lib/designVariantUpload";
import { UpgradePrompt } from "@/components/UpgradePrompt";
import { canAccess } from "@/lib/featureGates";
import { getProductType, PRODUCT_TYPES } from "@/lib/productTypes";
import { toast } from "sonner";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import type { Organization, Product, Listing, View } from "@/types/dashboard";
import { ALL_MARKETPLACES, ALL_PUSH_CHANNELS } from "@/types/dashboard";
import {
  ArrowLeft, Eye, Upload, Download, ImageIcon, Package, Store, Lock, Loader2, RefreshCw, AlertTriangle, DollarSign, X,
} from "lucide-react";

interface Props {
  product: Product;
  products: Product[];
  listings: Listing[];
  organization: Organization | null;
  userId: string;
  effectiveTier: "free" | "pro" | "starter";
  aiUsage: any;
  selectedMarketplaces: string[];
  setSelectedMarketplaces: (m: string[]) => void;
  toggleMarketplace: (m: string) => void;
  generating: boolean;
  onGenerateListings: (product: Product, marketplaces?: string[]) => Promise<void>;
  onBack: () => void;
  setView: (v: View) => void;
  setSelectedProduct: (p: Product | null) => void;
  loadListings: (productId: string) => void;
  loadProducts: (orgId: string) => void;
  uploadImageToStorage: (file: File) => Promise<string | null>;
}

export const ProductDetailView = ({
  product, products, listings, organization, userId, effectiveTier, aiUsage,
  selectedMarketplaces, setSelectedMarketplaces, toggleMarketplace,
  generating, onGenerateListings,
  onBack, setView, setSelectedProduct, loadListings, loadProducts,
  uploadImageToStorage,
}: Props) => {
  const [designPreviewOpen, setDesignPreviewOpen] = useState(false);
  const [lightDesignUrl, setLightDesignUrl] = useState<string | null>(product.image_url ?? null);
  const [darkDesignUrl, setDarkDesignUrl] = useState<string | null>(null);
  const [isPreparingDesignFiles, setIsPreparingDesignFiles] = useState(false);
  const [activeDesignDownload, setActiveDesignDownload] = useState<"light" | "dark" | "both" | null>(null);
  const [thumbVariant, setThumbVariant] = useState<"light" | "dark">("light");
  const [printifyConnected, setPrintifyConnected] = useState<boolean | null>(null);
  const [shopifyConnected, setShopifyConnected] = useState<boolean | null>(null);
  const [savingCategory, setSavingCategory] = useState(false);

  const categoryOptions = useMemo(() => {
    const enabled = (organization?.enabled_product_types || []) as ProductTypeKey[];
    const list = enabled
      .map((key) => PRODUCT_TYPES[key])
      .filter(Boolean)
      .map((cfg) => cfg.category);
    if (!list.includes("Other")) list.push("Other");
    if (product.category && !list.includes(product.category)) list.unshift(product.category);
    return Array.from(new Set(list));
  }, [organization?.enabled_product_types, product.category]);

  const handleCategoryChange = async (next: string) => {
    if (!next || next === product.category) return;
    setSavingCategory(true);
    try {
      const { error } = await supabase.from("products").update({ category: next }).eq("id", product.id);
      if (error) throw error;
      setSelectedProduct({ ...product, category: next });
      if (organization?.id) await loadProducts(organization.id);
      toast.success("Category updated");
    } catch (err: any) {
      toast.error(err.message || "Failed to update category");
    } finally {
      setSavingCategory(false);
    }
  };

  const selectedOrg = organization;
  const detectedProductType = getProductType(product.category || "");
  const mockupTemplates = (selectedOrg?.mockup_templates || {}) as Partial<Record<ProductTypeKey, string>>;
  const enabledProductTypeKeys = (selectedOrg?.enabled_product_types || []) as ProductTypeKey[];
  const fallbackProductTypeKey = mockupTemplates[detectedProductType.key]
    ? detectedProductType.key
    : enabledProductTypeKeys.find((key) => !!mockupTemplates[key])
      || (mockupTemplates["t-shirt"] ? "t-shirt" : undefined)
      || (Object.keys(mockupTemplates)[0] as ProductTypeKey | undefined)
      || detectedProductType.key;
  const mockupProductType = PRODUCT_TYPES[fallbackProductTypeKey] || detectedProductType;
  const sourceTemplateUrl = mockupTemplates[mockupProductType.key] || null;

  // Check connection status for Printify & Shopify via row existence (sensitive columns are not readable)
  useEffect(() => {
    if (!selectedOrg?.id) return;
    // Shopify – a row existing for this org means connected
    supabase
      .from("shopify_connections")
      .select("id")
      .eq("organization_id", selectedOrg.id)
      .maybeSingle()
      .then(({ data }) => setShopifyConnected(!!data));
    // Printify – a row existing for this org means connected
    supabase
      .from("organization_secrets")
      .select("id")
      .eq("organization_id", selectedOrg.id)
      .maybeSingle()
      .then(({ data }) => setPrintifyConnected(!!data));
  }, [selectedOrg?.id]);

  const isProductStorageUrl = (url: string | null | undefined) => {
    if (!url) return false;
    return url.includes("/storage/v1/object/public/product-images/");
  };

  const urlToDataUrl = async (url: string) => {
    const res = await fetch(url, { mode: "cors", credentials: "omit" });
    if (!res.ok) throw new Error("Failed to load design file");
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("Failed to read design file"));
      reader.readAsDataURL(blob);
    });
  };

  useEffect(() => {
    let isActive = true;

    const ensureDesignFiles = async () => {
      if (!userId || !product.image_url) {
        setLightDesignUrl(product.image_url ?? null);
        setDarkDesignUrl(null);
        return;
      }

      setIsPreparingDesignFiles(true);

      try {
        const { data: rows, error } = await supabase
          .from("product_images")
          .select("image_url, color_name")
          .eq("product_id", product.id)
          .eq("image_type", "design");

        if (error) throw error;

        const lightRow = rows?.find((row) => normalizeDesignColorName(row.color_name || "") === "light-on-dark");
        const darkRow = rows?.find((row) => normalizeDesignColorName(row.color_name || "") === "dark-on-light");

        let nextLightUrl = lightRow?.image_url ?? null;
        let nextDarkUrl = darkRow?.image_url ?? null;

        const needsLightUpload = !nextLightUrl || !isProductStorageUrl(nextLightUrl);
        const needsDarkUpload = !nextDarkUrl || !isProductStorageUrl(nextDarkUrl);
        const sourceUrl = nextLightUrl ?? nextDarkUrl ?? product.image_url;

        if ((needsLightUpload || needsDarkUpload) && sourceUrl) {
          const sourceDataUrl = await urlToDataUrl(sourceUrl);
          const { lightUrl, darkUrl } = await createAndUploadDesignVariants({
            sourceDataUrl,
            userId,
            targetSize: 4500,
          });
          nextLightUrl = lightUrl;
          nextDarkUrl = darkUrl;
        }

        const rowsToSave = [
          nextLightUrl ? { product_id: product.id, user_id: userId, image_url: nextLightUrl, image_type: "design", color_name: "light-on-dark", position: 0 } : null,
          nextDarkUrl ? { product_id: product.id, user_id: userId, image_url: nextDarkUrl, image_type: "design", color_name: "dark-on-light", position: 1 } : null,
        ].filter(Boolean) as Array<{ product_id: string; user_id: string; image_url: string; image_type: string; color_name: string; position: number }>;

        if (rowsToSave.length > 0) {
          await insertProductImagesDeduped(rowsToSave);
        }

        if (nextLightUrl && product.image_url !== nextLightUrl) {
          const { error: updateError } = await supabase.from("products").update({ image_url: nextLightUrl }).eq("id", product.id);
          if (!updateError && isActive) {
            setSelectedProduct({ ...product, image_url: nextLightUrl });
          }
        }

        if (!isActive) return;
        setLightDesignUrl(nextLightUrl);
        setDarkDesignUrl(nextDarkUrl);
      } catch (error) {
        console.error("Failed to ensure design files", error);
        if (!isActive) return;
        setLightDesignUrl(product.image_url ?? null);
        setDarkDesignUrl(null);
      } finally {
        if (isActive) setIsPreparingDesignFiles(false);
      }
    };

    ensureDesignFiles();

    return () => {
      isActive = false;
    };
  }, [product.id, product.image_url, setSelectedProduct, userId]);

  const orgMarketplaces = ((selectedOrg?.enabled_marketplaces?.length ? selectedOrg.enabled_marketplaces : [...ALL_MARKETPLACES]) as string[]).filter(m => m.toLowerCase() !== "printify");

  const sanitizeFilename = (value: string, suffix: "light" | "dark") => `${value.replace(/[^a-z0-9]/gi, "_").toLowerCase()}_${suffix}.png`;
  const zipFilename = `${product.title.replace(/[^a-z0-9]/gi, "_").toLowerCase()}_designs.zip`;

  const isEmbeddedPreview = window.self !== window.top;

  const downloadBlobFallback = (blob: Blob, filename: string) => {
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = filename;
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
  };

  type SaveTarget =
    | { kind: "picker"; handle: { createWritable: () => Promise<{ write: (data: Blob) => Promise<void>; close: () => Promise<void> }> } }
    | { kind: "download" };

  const requestSaveTarget = async (filename: string, mimeType: string): Promise<SaveTarget> => {
    const picker = (window as Window & {
      showSaveFilePicker?: (options?: {
        suggestedName?: string;
        startIn?: string;
        types?: Array<{
          description?: string;
          accept: Record<string, string[]>;
        }>;
      }) => Promise<{
        createWritable: () => Promise<{
          write: (data: Blob) => Promise<void>;
          close: () => Promise<void>;
        }>;
      }>;
    }).showSaveFilePicker;

    if (!picker) {
      return { kind: "download" };
    }

    const extension = filename.toLowerCase().endsWith(".zip") ? ".zip" : ".png";
    const description = extension === ".zip" ? "ZIP archive" : "PNG image";
    const handle = await picker({
      suggestedName: filename,
      startIn: "downloads",
      types: [{
        description,
        accept: {
          [mimeType]: [extension],
        },
      }],
    });

    return { kind: "picker", handle };
  };

  const saveBlobToDisk = async (target: SaveTarget, blob: Blob, filename: string) => {
    if (target.kind === "download") {
      if (isEmbeddedPreview) {
        throw new Error("PREVIEW_DOWNLOAD_BLOCKED");
      }
      downloadBlobFallback(blob, filename);
      return;
    }

    const writable = await target.handle.createWritable();
    await writable.write(blob);
    await writable.close();
  };

  const fetchDownloadBlob = async (sourceUrl: string) => {
    const response = await fetch(sourceUrl, { mode: "cors", credentials: "omit" });
    if (!response.ok) {
      throw new Error("Failed to load design file");
    }
    return response.blob();
  };

  const handleSingleDesignDownload = async (variant: "light" | "dark") => {
    const sourceUrl = variant === "light" ? lightDesignUrl : darkDesignUrl;
    if (!sourceUrl) {
      toast.error("Design file is not ready yet");
      return;
    }

    setActiveDesignDownload(variant);

    try {
      const filename = sanitizeFilename(product.title, variant);
      const target = await requestSaveTarget(filename, "image/png");
      const blob = await fetchDownloadBlob(sourceUrl);
      await saveBlobToDisk(target, blob, filename);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      if (error instanceof Error && error.message === "PREVIEW_DOWNLOAD_BLOCKED") {
        toast.error("This browser blocks Downloads from the embedded preview. Use the published app or a browser with a save dialog.");
        return;
      }
      console.error(`Failed to download ${variant} design`, error);
      toast.error("Failed to download design file");
    } finally {
      setActiveDesignDownload(null);
    }
  };

  const handleBothDesignsDownload = async () => {
    if (!lightDesignUrl || !darkDesignUrl) {
      toast.error("Both design files are not ready yet");
      return;
    }

    setActiveDesignDownload("both");

    try {
      const target = await requestSaveTarget(zipFilename, "application/zip");
      const [lightBlob, darkBlob] = await Promise.all([
        fetchDownloadBlob(lightDesignUrl),
        fetchDownloadBlob(darkDesignUrl),
      ]);

      const zip = new JSZip();
      zip.file(sanitizeFilename(product.title, "light"), lightBlob);
      zip.file(sanitizeFilename(product.title, "dark"), darkBlob);

      const zipBlob = await zip.generateAsync({ type: "blob" });
      await saveBlobToDisk(target, zipBlob, zipFilename);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      if (error instanceof Error && error.message === "PREVIEW_DOWNLOAD_BLOCKED") {
        toast.error("This browser blocks Downloads from the embedded preview. Use the published app or a browser with a save dialog.");
        return;
      }
      console.error("Failed to download both designs", error);
      toast.error("Failed to download design files");
    } finally {
      setActiveDesignDownload(null);
    }
  };

  const handleReplaceDesign = async (variant: "light" | "dark", file: File) => {
    if (!file.type.startsWith("image/")) return;
    const newUrl = await uploadImageToStorage(file);
    if (!newUrl) return;

    const colorName = variant === "light" ? "light-on-dark" : "dark-on-light";
    const position = variant === "light" ? 0 : 1;

    if (variant === "light") {
      const { error } = await supabase.from("products").update({ image_url: newUrl }).eq("id", product.id);
      if (error) { toast.error("Failed to update design file"); return; }
    }

    await insertProductImagesDeduped([{
      product_id: product.id,
      user_id: userId,
      image_url: newUrl,
      image_type: "design",
      color_name: colorName,
      position,
    }]);

    if (variant === "light") {
      setLightDesignUrl(newUrl);
      setSelectedProduct({ ...product, image_url: newUrl });
      toast.success("Light design replaced!");
    } else {
      setDarkDesignUrl(newUrl);
      toast.success("Dark design replaced!");
    }
  };

  const handleClearDesigns = async () => {
    const { error: productError } = await supabase.from("products").update({ image_url: null }).eq("id", product.id);
    if (productError) { toast.error("Failed to clear design file"); return; }

    const { error: imagesError } = await supabase
      .from("product_images")
      .delete()
      .eq("product_id", product.id)
      .eq("image_type", "design");

    if (imagesError) { toast.error("Failed to clear design variants"); return; }

    // Also clear the design URLs on the originating message so it doesn't get re-derived
    const { error: messageError } = await supabase
      .from("generated_messages")
      .update({ design_url: null, dark_design_url: null })
      .eq("product_id", product.id);
    if (messageError) {
      console.error("Failed to clear message design refs", messageError);
    }

    setLightDesignUrl(null);
    setDarkDesignUrl(null);
    setSelectedProduct({ ...product, image_url: null });
    // Refresh the parent product list so navigating away/back doesn't restore stale image_url
    if (organization?.id) {
      loadProducts(organization.id);
    }
    toast.success("Design cleared");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <Button variant="ghost" size="icon" className="mt-1" onClick={onBack}><ArrowLeft className="h-4 w-4" /></Button>
        <div className="flex-1 min-w-0">
          <h2 className="text-xl sm:text-2xl font-bold truncate">{product.title}</h2>
          <div className="flex items-center gap-2 mt-1">
            <Select value={product.category || ""} onValueChange={handleCategoryChange} disabled={savingCategory}>
              <SelectTrigger className="h-7 w-auto min-w-[180px] gap-2 rounded-md bg-primary/15 px-2.5 py-1 text-xs font-semibold text-primary ring-1 ring-inset ring-primary/25 border-0 hover:bg-primary/20">
                <SelectValue placeholder="Choose a category" />
                {savingCategory && <Loader2 className="h-3 w-3 animate-spin" />}
              </SelectTrigger>
              <SelectContent>
                {categoryOptions.map((cat) => (
                  <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {product.price && <span className="text-xs text-muted-foreground">{product.price}</span>}
          </div>
        </div>
      </div>

      {(() => {
        const hasAnyDesign = !!(product.image_url || lightDesignUrl || darkDesignUrl);
        const thumbSrc = (thumbVariant === "dark" ? (darkDesignUrl ?? lightDesignUrl) : (lightDesignUrl ?? darkDesignUrl)) ?? product.image_url;
        return (
        <div className="rounded-xl border border-border bg-card p-3 sm:p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className={`relative h-12 w-12 sm:h-16 sm:w-16 rounded-lg border border-border overflow-hidden flex items-center justify-center shrink-0 ${thumbVariant === "light" ? "bg-neutral-900" : "bg-neutral-100"}`}>
              {thumbSrc ? (
                <img
                  src={thumbSrc}
                  alt="Design file"
                  className="h-full w-full object-contain"
                />
              ) : (
                <ImageIcon className="h-5 w-5 text-muted-foreground" />
              )}
            </div>
            <div>
              <p className="text-sm font-medium">Design File</p>
              <p className="text-xs text-muted-foreground">Transparent PNG — print-ready</p>
              <div className="mt-1.5 inline-flex rounded-md border border-border bg-muted/40 p-0.5 text-[10px]">
                <button
                  type="button"
                  onClick={() => setThumbVariant("light")}
                  className={`px-2 py-0.5 rounded ${thumbVariant === "light" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                >
                  On dark
                </button>
                <button
                  type="button"
                  onClick={() => setThumbVariant("dark")}
                  className={`px-2 py-0.5 rounded ${thumbVariant === "dark" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                >
                  On light
                </button>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto flex-wrap">
            <Button variant="outline" size="sm" className="gap-2" onClick={() => setDesignPreviewOpen(true)} disabled={!hasAnyDesign}><Eye className="h-4 w-4" /> Preview</Button>
            <input type="file" accept="image/*" className="hidden" id="replace-light-design-input" onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              await handleReplaceDesign("light", file);
              e.target.value = "";
            }} />
            <input type="file" accept="image/*" className="hidden" id="replace-dark-design-input" onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              await handleReplaceDesign("dark", file);
              e.target.value = "";
            }} />
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild><Button variant="outline" size="sm" className="gap-2"><Upload className="h-4 w-4" /> Replace</Button></DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => document.getElementById("replace-light-design-input")?.click()}>Light variant</DropdownMenuItem>
                <DropdownMenuItem onClick={() => document.getElementById("replace-dark-design-input")?.click()}>Dark variant</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => void handleClearDesigns()}><X className="mr-2 h-4 w-4" /> Clear design</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            {isPreparingDesignFiles ? (
              <Button variant="outline" size="sm" className="gap-2" disabled>
                <Loader2 className="h-4 w-4 animate-spin" /> Preparing…
              </Button>
            ) : (
              <div className="flex items-center gap-1.5">
                {lightDesignUrl && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => void handleSingleDesignDownload("light")}
                    disabled={activeDesignDownload !== null}
                  >
                    {activeDesignDownload === "light" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />} Light
                  </Button>
                )}
                {darkDesignUrl && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => void handleSingleDesignDownload("dark")}
                    disabled={activeDesignDownload !== null}
                  >
                    {activeDesignDownload === "dark" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />} Dark
                  </Button>
                )}
                {lightDesignUrl && darkDesignUrl && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => void handleBothDesignsDownload()}
                    disabled={activeDesignDownload !== null}
                  >
                    {activeDesignDownload === "both" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />} Both
                  </Button>
                )}
                {!lightDesignUrl && !darkDesignUrl && (
                  <span className="text-xs text-muted-foreground">No design files available</span>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Design Group — sibling products sharing this design */}
      {product.image_url && (() => {
        const siblings = products.filter(
          (p) => p.image_url === product.image_url && p.id !== product.id
        );
        if (siblings.length === 0) return null;
        return (
          <div className="rounded-xl border border-border bg-card p-3 sm:p-4">
            <p className="text-sm font-medium mb-2">Also using this design</p>
            <div className="space-y-1">
              {siblings.map((sib) => (
                <button
                  key={sib.id}
                  onClick={() => { setSelectedProduct(sib); loadListings(sib.id); }}
                  className="flex items-center gap-2 w-full rounded-lg px-2 py-1.5 text-xs text-left hover:bg-accent/50 transition-colors"
                >
                  <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-secondary-foreground shrink-0">
                    {sib.category || "—"}
                  </span>
                  <span className="truncate text-foreground">{sib.title}</span>
                  {sib.price && <span className="ml-auto text-[10px] text-muted-foreground shrink-0">{sib.price}</span>}
                </button>
              ))}
            </div>
          </div>
        );
      })()}

      {product.image_url && (
        <Dialog open={designPreviewOpen} onOpenChange={setDesignPreviewOpen}>
          <DialogContent className="max-w-2xl"><DialogHeader><DialogTitle>Design Preview</DialogTitle></DialogHeader>
            <div className="flex items-center justify-center bg-muted/30 rounded-lg p-4"><img src={product.image_url} alt={product.title} className="max-h-[70vh] object-contain" /></div>
          </DialogContent>
        </Dialog>
      )}

      <Tabs defaultValue="mockups" className="space-y-4">
        <TabsList className="w-full justify-start gap-1 bg-secondary/50 p-1">
          <TabsTrigger value="mockups" className="gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"><ImageIcon className="h-3.5 w-3.5" /> Mockups</TabsTrigger>
          <TabsTrigger value="listings" className="gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"><Package className="h-3.5 w-3.5" /> Listings{!canAccess(effectiveTier, "ai-listings") && <Lock className="h-3 w-3 text-muted-foreground" />}</TabsTrigger>
          <TabsTrigger value="pricing" className="gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"><DollarSign className="h-3.5 w-3.5" /> Pricing</TabsTrigger>
          <TabsTrigger value="push" className="gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"><Store className="h-3.5 w-3.5" /> Push{!canAccess(effectiveTier, "marketplace-push") && <Lock className="h-3 w-3 text-muted-foreground" />}</TabsTrigger>
        </TabsList>

        <TabsContent value="mockups">
          <div className="rounded-xl border border-border bg-card p-5">
            <ProductMockups productId={product.id} userId={userId} productTitle={product.title} organizationId={selectedOrg?.id} sourceImageUrl={sourceTemplateUrl} designImageUrl={product.image_url || null} brandName={selectedOrg?.name} brandNiche={selectedOrg?.niche} brandAudience={selectedOrg?.audience} brandTone={selectedOrg?.tone} productCategory={mockupProductType.category} aiUsage={aiUsage} />
          </div>
        </TabsContent>

        <TabsContent value="pricing">
          <div className="space-y-6">
            {/* Size Pricing Editor */}
            <div className="rounded-xl border border-border bg-card p-5">
              <h4 className="text-sm font-semibold mb-1">Size Pricing</h4>
              <p className="text-xs text-muted-foreground mb-3">
                Adjust prices per size. Leave blank to use brand defaults.
              </p>
              <SizePricingEditor
                enabledTypes={(selectedOrg?.enabled_product_types || ["t-shirt", "hoodie", "mug"]) as ProductTypeKey[]}
                value={(() => {
                  const productPricing = (product.size_pricing as unknown as Record<string, Record<string, string>>) || {};
                  const brandDefaults = (selectedOrg?.default_size_pricing as unknown as Record<string, Record<string, string>>) || {};
                  // Merge: brand defaults as base, product overrides on top
                  const merged: Record<string, Record<string, string>> = {};
                  for (const key of Object.keys({ ...brandDefaults, ...productPricing })) {
                    merged[key] = { ...(brandDefaults[key] || {}), ...(productPricing[key] || {}) };
                  }
                  return merged;
                })()}
                onChange={async (updated) => {
                  const { error } = await supabase.from("products").update({ size_pricing: updated as any }).eq("id", product.id);
                  if (error) { toast.error(error.message); return; }
                  setSelectedProduct({ ...product, size_pricing: updated as any });
                  toast.success("Size pricing saved");
                  if (selectedOrg) loadProducts(selectedOrg.id);
                  // Sync to marketplaces
                  if (product.shopify_product_id) {
                    try { await supabase.functions.invoke("update-shopify-product", { body: { shopifyProductId: product.shopify_product_id, organizationId: selectedOrg?.id, updates: { price: product.price, size_pricing: updated } } }); } catch (err) { console.error("Shopify size pricing sync failed:", err); }
                  }
                  if (product.printify_product_id && selectedOrg) {
                    try { await supabase.functions.invoke("printify-create-product", { body: { action: "update-price", printifyProductId: product.printify_product_id, organizationId: selectedOrg.id, price: product.price, sizePricing: updated } }); } catch (err) { console.error("Printify size pricing sync failed:", err); }
                  }
                }}
                isProductLevel
              />
            </div>

            {/* Smart Pricing (AI) */}
            <div className="rounded-xl border border-border bg-card p-5">
              <SmartPricing
                product={{ title: product.title, description: product.description, category: product.category, keywords: product.keywords, price: product.price, features: product.features || "" }}
                business={{ name: selectedOrg?.name || "", niche: selectedOrg?.niche || "", audience: selectedOrg?.audience || "", tone: selectedOrg?.tone || "" }}
                onApplyPrice={async (price) => {
                  await supabase.from("products").update({ price }).eq("id", product.id);
                  setSelectedProduct({ ...product, price });
                  if (selectedOrg) loadProducts(selectedOrg.id);
                  if (product.shopify_product_id) {
                    try { await supabase.functions.invoke("update-shopify-product", { body: { shopifyProductId: product.shopify_product_id, organizationId: selectedOrg?.id, updates: { price, size_pricing: product.size_pricing || undefined } } }); toast.success("Price synced to Shopify"); } catch (err) { console.error("Shopify price sync failed:", err); toast.error("Price saved locally but Shopify sync failed"); }
                  }
                  if (product.printify_product_id && selectedOrg) {
                    try { await supabase.functions.invoke("printify-create-product", { body: { action: "update-price", printifyProductId: product.printify_product_id, organizationId: selectedOrg.id, price, sizePricing: product.size_pricing || undefined } }); toast.success("Price synced to Printify"); } catch (err) { console.error("Printify price sync failed:", err); toast.error("Price saved locally but Printify sync failed"); }
                  }
                }}
              />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="listings" className="space-y-4">
          {!canAccess(effectiveTier, "ai-listings") ? (
            <UpgradePrompt feature="ai-listings" onUpgrade={() => setView("settings")} />
          ) : (
            <>
              <div className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-center justify-between mb-3">
                  <Label className="text-sm font-medium">Generate listings for:</Label>
                  <div className="flex items-center gap-3">
                    <button type="button" onClick={() => setSelectedMarketplaces(selectedMarketplaces.length === orgMarketplaces.length ? [] : [...orgMarketplaces])} className="text-xs text-primary hover:underline">{selectedMarketplaces.length === orgMarketplaces.length ? "Deselect all" : "Select all"}</button>
                    <Button variant="outline" size="sm" onClick={() => onGenerateListings(product)} disabled={generating} className="gap-2">{generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}{listings.length > 0 ? "Regenerate" : "Generate"}</Button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {orgMarketplaces.map((m) => <button key={m} type="button" onClick={() => toggleMarketplace(m)} className={`rounded-full px-4 py-1.5 text-xs font-medium capitalize transition-colors ${selectedMarketplaces.includes(m) ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-secondary/80"}`}>{m}</button>)}
                </div>
                {orgMarketplaces.length === 0 && <p className="text-xs text-muted-foreground mt-2">No marketplaces enabled. Edit your brand to enable marketplaces.</p>}
              </div>
              {generating ? (
                <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-card py-20"><div className="mb-4 h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" /><p className="text-sm text-muted-foreground">AI is crafting your optimized listings…</p></div>
              ) : listings.length > 0 ? (
                <Tabs defaultValue={orgMarketplaces[0] || "shopify"}>
                  <TabsList className="w-full justify-start gap-1 bg-secondary/50 p-1">{orgMarketplaces.map((m) => <TabsTrigger key={m} value={m} className="capitalize data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">{m}</TabsTrigger>)}</TabsList>
                  {orgMarketplaces.map((m) => { const listing = listings.find((l) => l.marketplace === m); if (!listing) return null; return <TabsContent key={m} value={m}><ListingOutput marketplace={m} listing={{ title: listing.title, description: listing.description, bulletPoints: listing.bullet_points as string[], tags: listing.tags as string[], seoTitle: listing.seo_title, seoDescription: listing.seo_description, urlHandle: listing.url_handle, altText: listing.alt_text }} onSave={async (updated) => {
                    const { error } = await supabase.from("listings").update({
                      title: updated.title,
                      description: updated.description,
                      bullet_points: updated.bulletPoints as any,
                      tags: updated.tags as any,
                      seo_title: updated.seoTitle || "",
                      seo_description: updated.seoDescription || "",
                      url_handle: updated.urlHandle || "",
                      alt_text: updated.altText || "",
                    }).eq("id", listing.id);
                    if (error) { toast.error("Failed to save listing"); return; }
                    toast.success(`${m} listing updated`);
                    loadListings(product.id);
                  }} /></TabsContent>; })}
                </Tabs>
              ) : (
                <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-20"><p className="text-sm text-muted-foreground">No listings generated yet</p><Button variant="link" onClick={() => onGenerateListings(product)} className="mt-2">Generate now</Button></div>
              )}
            </>
          )}
        </TabsContent>

        <TabsContent value="push" className="space-y-3">
          {!canAccess(effectiveTier, "marketplace-push") ? (
            <UpgradePrompt feature="marketplace-push" onUpgrade={() => setView("settings")} />
          ) : listings.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-20"><p className="text-sm text-muted-foreground">Generate listings first before pushing to marketplaces</p></div>
          ) : (() => {
            const channels = selectedOrg?.enabled_marketplaces?.length ? selectedOrg.enabled_marketplaces : [...ALL_PUSH_CHANNELS];
            const listingsMapped = listings.map((l) => ({ marketplace: l.marketplace, title: l.title, description: l.description, bullet_points: l.bullet_points as string[], tags: l.tags as string[], seo_title: l.seo_title, seo_description: l.seo_description, url_handle: l.url_handle, alt_text: l.alt_text }));

            const showShopify = channels.includes("shopify");
            const showPrintify = channels.includes("printify");
            const showOther = channels.includes("etsy") || channels.includes("ebay");

            const noConnections = (showShopify && shopifyConnected === false) && (showPrintify && printifyConnected === false);

            return (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  {showShopify && (shopifyConnected === false ? (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant="outline" size="sm" className="gap-2 opacity-50 cursor-not-allowed" disabled>
                            <AlertTriangle className="h-4 w-4 text-amber-500" /> Push to Shopify
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent><p>Connect your Shopify store in Settings → Marketplace first</p></TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  ) : (
                    <PushToShopify product={product} listings={listingsMapped} userId={userId} organizationId={selectedOrg?.id} onProductUpdate={(updates) => { setSelectedProduct({ ...product, ...updates }); }} />
                  ))}

                  {showPrintify && (printifyConnected === false ? (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant="outline" size="sm" className="gap-2 opacity-50 cursor-not-allowed" disabled>
                            <AlertTriangle className="h-4 w-4 text-amber-500" /> Push to Printify
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent><p>Add your Printify API token in Settings → Marketplace first</p></TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  ) : (
                    <PushToPrintify product={product} listings={listingsMapped} userId={userId} organizationId={selectedOrg?.id} onProductUpdate={(updates) => { setSelectedProduct({ ...product, ...updates }); }} printifyShopId={selectedOrg?.printify_shop_id} />
                  ))}

                  {showPrintify && showShopify && printifyConnected !== false && shopifyConnected !== false && (
                    <PushPrintifyThenShopify product={product} listings={listingsMapped} userId={userId} organizationId={selectedOrg?.id} onProductUpdate={(updates) => { setSelectedProduct({ ...product, ...updates }); }} printifyShopId={selectedOrg?.printify_shop_id} />
                  )}
                  {showOther && <PushToMarketplace product={product} listings={listingsMapped} images={product.image_url ? [{ id: "main", image_url: product.image_url, color_name: "", position: 0 }] : []} userId={userId} enabledChannels={channels} />}
                </div>

                {(showShopify && shopifyConnected === false || showPrintify && printifyConnected === false) && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                    Some integrations need setup.{" "}
                    <button type="button" onClick={() => setView("settings")} className="text-primary hover:underline">Go to Settings</button>
                  </p>
                )}
              </div>
            );
          })()}
        </TabsContent>
      </Tabs>
    </div>
  );
};
