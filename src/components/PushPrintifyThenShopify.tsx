import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PRODUCT_TYPES as PRODUCT_TYPE_REGISTRY } from "@/lib/productTypes";
import { getProductType } from "@/lib/productTypes";
import { parsePrintPlacement } from "@/lib/printPlacement";
import { pushPrintifyThenShopify } from "@/lib/pushPrintifyThenShopify";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Loader2, CheckCircle2, Printer, Store, ArrowRight } from "lucide-react";
import { toast } from "sonner";

interface Product {
  id: string;
  title: string;
  description: string;
  category: string;
  price: string;
  keywords: string;
  image_url: string | null;
  printify_product_id?: string | null;
  shopify_product_id?: number | null;
}

interface Listing {
  marketplace: string;
  title: string;
  description: string;
  tags: string[];
  bullet_points?: string[];
  seo_title?: string;
  seo_description?: string;
  url_handle?: string;
  alt_text?: string;
}

interface MockupImage {
  id: string;
  image_url: string;
  color_name: string;
  position: number;
}

interface Props {
  product: Product;
  listings: Listing[];
  userId: string;
  organizationId?: string;
  onProductUpdate?: (updates: Partial<Product>) => void;
  printifyShopId?: number | null;
}

const PRODUCT_TYPES = [
  { label: "T-Shirt (Comfort Colors 1717)", blueprintId: 706, tag: "T-shirts", sizes: ["S", "M", "L", "XL", "2XL", "3XL"] },
];

const LIGHT_COLORS = new Set([
  "ivory", "butter", "banana", "blossom", "orchid", "chalky mint",
  "island reef", "chambray", "white", "flo blue", "watermelon",
  "neon pink", "neon green", "lagoon blue", "yam", "terracotta",
  "light green", "bay", "sage",
]);

export const PushPrintifyThenShopify = ({
  product,
  listings,
  userId,
  organizationId,
  onProductUpdate,
  printifyShopId,
}: Props) => {
  const [open, setOpen] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [step, setStep] = useState<"idle" | "printify" | "shopify" | "done">("idle");
  const [result, setResult] = useState<{ success: boolean } | null>(null);

  const [shops, setShops] = useState<{ id: number; title: string }[]>([]);
  const [selectedShop, setSelectedShop] = useState<number | null>(null);
  const [loadingShops, setLoadingShops] = useState(false);
  const [selectedProductType, setSelectedProductType] = useState(PRODUCT_TYPES[0]);
  const [selectedSizes, setSelectedSizes] = useState<string[]>([...PRODUCT_TYPES[0].sizes]);
  const [mockups, setMockups] = useState<MockupImage[]>([]);
  const [loadingMockups, setLoadingMockups] = useState(false);
  const [printProviderId, setPrintProviderId] = useState<number | null>(null);
  const [sizePricing, setSizePricing] = useState<Record<string, string>>({});
  const [publishOnPrintify, setPublishOnPrintify] = useState(true);

  const uniqueMockupColors = [...new Set(mockups.map((m) => m.color_name))];
  const hasMockups = uniqueMockupColors.length > 0;
  const colorsForPush = hasMockups ? uniqueMockupColors : ["Black"];

  const loadShops = async () => {
    setLoadingShops(true);
    try {
      const { data, error } = await supabase.functions.invoke("printify-get-shops", {
        body: { organizationId },
      });
      if (error) throw error;
      if (data?.error) { toast.error(data.error); setShops([]); return; }
      setShops(data.shops || []);
      if (printifyShopId && data.shops?.some((s: any) => s.id === printifyShopId)) {
        setSelectedShop(printifyShopId);
      } else if (data.shops?.length >= 1) {
        setSelectedShop(data.shops[0].id);
      }
    } catch (err: any) {
      toast.error("Failed to connect to Printify. Check your API token in Settings → Marketplace.");
      setShops([]);
    } finally {
      setLoadingShops(false);
    }
  };

  const loadPrintifyInfo = async () => {
    if (!selectedShop) return;
    try {
      const { data, error } = await supabase.functions.invoke("printify-get-variants", {
        body: {
          blueprintId: selectedProductType.blueprintId,
          organizationId,
          shopId: selectedShop,
          printifyProductId: product.printify_product_id,
        },
      });
      if (error) throw error;
      if (data?.printProviderId) setPrintProviderId(data.printProviderId);
      if (product.printify_product_id && data?.blueprintId) {
        const matchedType = PRODUCT_TYPES.find((pt) => pt.blueprintId === data.blueprintId);
        if (matchedType) {
          setSelectedProductType(matchedType);
          setSelectedSizes(data.enabledSizes?.length ? data.enabledSizes : matchedType.sizes);
        }
      }
    } catch {}
  };

  const loadMockups = async () => {
    setLoadingMockups(true);
    try {
      const { data } = await supabase
        .from("product_images")
        .select("*")
        .eq("product_id", product.id)
        .eq("image_type", "mockup")
        .order("position");
      setMockups((data as MockupImage[]) || []);
    } catch {} finally { setLoadingMockups(false); }
  };

  const loadSizePricing = async () => {
    const pt = PRODUCT_TYPE_REGISTRY["t-shirt"];
    const defaults: Record<string, string> = { ...pt.defaultSizePricing };
    if (organizationId) {
      const { data: org } = await supabase.from("organizations").select("default_size_pricing").eq("id", organizationId).single();
      const orgPricing = (org as any)?.default_size_pricing?.["t-shirt"] as Record<string, string> | undefined;
      if (orgPricing) for (const [size, price] of Object.entries(orgPricing)) { if (price) defaults[size] = price; }
    }
    if (product.id) {
      const { data: prod } = await supabase.from("products").select("size_pricing").eq("id", product.id).single();
      const prodPricing = (prod as any)?.size_pricing as Record<string, string> | undefined;
      if (prodPricing) for (const [size, price] of Object.entries(prodPricing)) { if (price) defaults[size] = price; }
    }
    setSizePricing(defaults);
  };

  useEffect(() => {
    if (open) {
      loadShops();
      loadMockups();
      loadSizePricing();
      setStep("idle");
      setResult(null);
    }
  }, [open]);

  useEffect(() => {
    if (open && selectedShop) {
      setPrintProviderId(null);
      loadPrintifyInfo();
    }
  }, [selectedProductType, selectedShop, open]);

  const toggleSize = (size: string) => {
    setSelectedSizes((prev) =>
      prev.includes(size) ? prev.filter((s) => s !== size) : [...prev, size]
    );
  };

  const loadSavedPlacement = async () => {
    const { data } = await supabase
      .from("products")
      .select("print_placement")
      .eq("id", product.id)
      .maybeSingle();

    return parsePrintPlacement(
      (data as { print_placement?: unknown } | null)?.print_placement,
    );
  };

  const handlePushBoth = async () => {
    if (!selectedShop) { toast.error("Please select a Printify shop"); return; }
    if (!selectedSizes.length) { toast.error("Please select at least one size"); return; }
    if (!product.image_url) { toast.error("Product needs a design image"); return; }

    setPushing(true);
    setResult(null);

    try {
      setStep("printify");

      const result = await pushPrintifyThenShopify({
        organizationId: organizationId || "",
        userId,
        product,
        listings,
        printifyShopId: selectedShop,
        blueprintId: selectedProductType.blueprintId,
        printProviderId,
        selectedSizes,
        selectedColors: colorsForPush,
        sizePricing,
        mockupImages: mockups.map((m) => ({
          color_name: m.color_name,
          image_url: m.image_url,
          position: m.position,
        })),
        placement: await loadSavedPlacement(),
        publishOnPrintify,
        appendSizeChart: !!getProductType(product.category || "").sizeChartUrl,
        retry: false,
        onProductUpdate: (updates) => onProductUpdate?.(updates as any),
        onProgress: (stage, message) => {
          if (stage === "printify-update") {
            toast.info("Step 1/2: Updating existing Printify product...");
          } else if (stage === "printify-design") {
            toast.info("Step 1/2: Removing background & uploading to Printify...");
          } else if (stage === "printify-dark") {
            toast.info("Creating dark ink variant for light colors...");
          } else if (stage === "printify-create") {
            // toast.info already shown by printify-design — keep quiet
          } else if (stage === "shopify-gallery" || stage === "shopify-push") {
            if (stage === "shopify-gallery") {
              setStep("shopify");
              toast.info("Step 2/2: Pushing mockups & SEO to Shopify...");
            }
          } else if (stage === "skipped") {
            toast.warning("No Shopify product is linked yet — Printify sync may still be in progress. Try pushing to Shopify separately in a moment.");
          }
          console.log(`[Printify→Shopify] ${stage}: ${message}`);
        },
      });

      if (result.printifyStaleCleared) {
        toast.warning("The linked Printify product no longer exists. The link has been cleared — please retry to create a new product.");
        setStep("idle");
        return;
      }

      if (result.shopifyStaleCleared) {
        toast.warning("The linked Shopify product no longer exists. The stale link was cleared — wait for Printify sync, then retry.");
        setStep("idle");
        return;
      }

      if (result.shopifySkipped) {
        setStep("done");
        setResult({ success: true });
        setOpen(false);
        return;
      }

      // Success messaging
      if (product.printify_product_id) {
        toast.success("✓ Printify: Existing product updated");
      } else {
        toast.success(`✓ Printify: Created${result.variantCount ? ` with ${result.variantCount} variants` : ""}`);
      }
      toast.success("✓ Shopify: Custom mockups & SEO applied!");

      setStep("done");
      setResult({ success: true });
      setOpen(false);
    } catch (err: any) {
      console.error("PushPrintifyThenShopify error:", err);
      const msg = err.message || "Failed during push";
      toast.error(`Failed at ${step === "shopify" ? "Shopify" : "Printify"} step: ${msg}`);
      setResult(null);
    } finally {
      setPushing(false);
    }
  };

  const stepLabel = step === "printify" ? "Pushing to Printify..." : step === "shopify" ? "Pushing to Shopify..." : "Push to Printify → Shopify";

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="gap-2"
      >
        {result?.success ? (
          <CheckCircle2 className="h-4 w-4 text-primary" />
        ) : (
          <>
            <Printer className="h-4 w-4" />
            <ArrowRight className="h-3 w-3" />
            <Store className="h-4 w-4" />
          </>
        )}
        {result?.success ? "Both Pushed!" : "Printify → Shopify"}
      </Button>

      <Dialog open={open} onOpenChange={(v) => { if (!pushing) setOpen(v); }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Printer className="h-5 w-5" />
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
              <Store className="h-5 w-5" />
              Printify → Shopify
            </DialogTitle>
            <DialogDescription>
              Creates on Printify (syncs title, description, tags & pricing), then adds custom mockups & SEO to Shopify.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            {/* Shop */}
            {loadingShops ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading shop...
              </div>
            ) : shops.length === 0 ? (
              <p className="text-sm text-destructive">No Printify shop found. Connect one in settings.</p>
            ) : (
              <p className="text-sm text-muted-foreground">
                Printify shop: <span className="font-medium text-foreground">{shops.find(s => s.id === selectedShop)?.title || shops[0]?.title}</span>
              </p>
            )}

            {/* Product type */}
            <div className="space-y-2">
              <Label className="font-medium">Product Type</Label>
              <div className="flex flex-wrap gap-2">
                {PRODUCT_TYPES.map((pt) => (
                  <Button
                    key={pt.blueprintId}
                    type="button"
                    variant={selectedProductType.blueprintId === pt.blueprintId ? "default" : "outline"}
                    size="sm"
                    onClick={() => { setSelectedProductType(pt); if (!product.printify_product_id) setSelectedSizes([...pt.sizes]); }}
                  >
                    {pt.label}
                  </Button>
                ))}
              </div>
            </div>

            {/* Colors from mockups */}
            <div className="space-y-2">
              <Label className="font-medium">
                Colors {loadingMockups && <Loader2 className="inline h-3 w-3 animate-spin ml-1" />}
              </Label>
              {uniqueMockupColors.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {uniqueMockupColors.map((c) => {
                    const mockup = mockups.find((m) => m.color_name === c);
                    return (
                      <div key={c} className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-2 py-1.5">
                        {mockup && <img src={mockup.image_url} alt={c} className="h-8 w-8 rounded object-cover border border-border" />}
                        <span className="text-xs font-medium">{c}</span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">No mockups — will use Black only.</p>
              )}
            </div>

            {/* Sizes */}
            <div className="space-y-2">
              <Label className="font-medium">Sizes</Label>
              <div className="flex flex-wrap gap-2">
                {selectedProductType.sizes.map((size) => (
                  <Button
                    key={size}
                    type="button"
                    variant={selectedSizes.includes(size) ? "default" : "outline"}
                    size="sm"
                    onClick={() => toggleSize(size)}
                    className="min-w-[3rem]"
                  >
                    {size}
                  </Button>
                ))}
              </div>
            </div>

            {/* Publish toggle */}
            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <div>
                <p className="text-sm font-medium">Publish on Printify</p>
                <p className="text-xs text-muted-foreground">Make product live on Printify marketplace</p>
              </div>
              <Switch checked={publishOnPrintify} onCheckedChange={setPublishOnPrintify} />
            </div>

            {/* Summary */}
            <div className="rounded-lg bg-muted/50 p-3 text-sm space-y-1">
              <p><strong>Product:</strong> {product.title}</p>
              <p><strong>Colors:</strong> {colorsForPush.join(", ")}</p>
              <p><strong>Sizes:</strong> {selectedSizes.join(", ")}</p>
              <p><strong>Variants:</strong> ~{colorsForPush.length * selectedSizes.length}</p>
              <div className="mt-2 rounded border border-primary/20 bg-primary/5 p-2 text-xs text-primary">
                <strong>Printify syncs:</strong> Title, description, tags, pricing, variants<br />
                <strong>Then Shopify gets:</strong> Custom mockup images + SEO metadata
              </div>
            </div>

            {/* Progress indicator during push */}
            {pushing && (
              <div className="rounded-lg border border-border p-3 space-y-2">
                <div className="flex items-center gap-2">
                  {step === "printify" ? (
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  ) : step === "shopify" || step === "done" ? (
                    <CheckCircle2 className="h-4 w-4 text-primary" />
                  ) : null}
                  <span className={`text-sm ${step === "printify" ? "font-medium" : "text-muted-foreground"}`}>
                    1. Create on Printify
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {step === "shopify" ? (
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  ) : step === "done" ? (
                    <CheckCircle2 className="h-4 w-4 text-primary" />
                  ) : (
                    <div className="h-4 w-4 rounded-full border border-border" />
                  )}
                  <span className={`text-sm ${step === "shopify" ? "font-medium" : "text-muted-foreground"}`}>
                    2. Push to Shopify
                  </span>
                </div>
              </div>
            )}

            <Button
              onClick={handlePushBoth}
              disabled={pushing || !selectedShop || !selectedSizes.length}
              className="w-full gap-2"
            >
              {pushing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {stepLabel}
                </>
              ) : (
                <>
                  <Printer className="h-4 w-4" />
                  <ArrowRight className="h-3 w-3" />
                  <Store className="h-4 w-4" />
                  Push to Both
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
