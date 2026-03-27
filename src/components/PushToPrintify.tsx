import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PRODUCT_TYPES as PRODUCT_TYPE_REGISTRY, type ProductTypeKey } from "@/lib/productTypes";
import { recolorOpaquePixels, removeBackground, upscaleBase64Png } from "@/lib/removeBackground";
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
import { Loader2, CheckCircle2, Printer, AlertTriangle, Store } from "lucide-react";
import { optimizeVariantsForShopify } from "@/lib/shopifyImageOptimizer";
import { getProductType } from "@/lib/productTypes";
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

const AVAILABLE_SIZES = ["S", "M", "L", "XL", "2XL", "3XL"];

// Product types mapped to Printify blueprint IDs
const PRODUCT_TYPES = [
  { label: "T-Shirt (Comfort Colors 1717)", blueprintId: 706, tag: "T-shirts", sizes: ["S", "M", "L", "XL", "2XL", "3XL"] },
  // Future product types:
  // { label: "Hoodie (Gildan 18500)", blueprintId: 77, tag: "Hoodies", sizes: ["S", "M", "L", "XL", "2XL"] },
  // { label: "Mug (11oz)", blueprintId: 68, tag: "Mugs", sizes: [] },
];

// Comfort Colors 1717 light colors where white/light designs won't show well
const LIGHT_COLORS = new Set([
  "ivory", "butter", "banana", "blossom", "orchid", "chalky mint",
  "island reef", "chambray", "white", "flo blue", "watermelon",
  "neon pink", "neon green", "lagoon blue", "yam", "terracotta",
  "light green", "bay", "sage",
]);

export const PushToPrintify = ({ product, listings, userId, organizationId, onProductUpdate, printifyShopId }: Props) => {
  const [open, setOpen] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [result, setResult] = useState<{ success: boolean } | null>(null);
  const [shops, setShops] = useState<{ id: number; title: string }[]>([]);
  const [selectedShop, setSelectedShop] = useState<number | null>(null);
  const [loadingShops, setLoadingShops] = useState(false);
  const [selectedProductType, setSelectedProductType] = useState(PRODUCT_TYPES[0]);
  const [selectedSizes, setSelectedSizes] = useState<string[]>(PRODUCT_TYPES[0].sizes.slice(0, 4));
  const [mockups, setMockups] = useState<MockupImage[]>([]);
  const [loadingMockups, setLoadingMockups] = useState(false);
  const [printProviderId, setPrintProviderId] = useState<number | null>(null);
  const [loadingColors, setLoadingColors] = useState(false);
  const [sizePricing, setSizePricing] = useState<Record<string, string>>({});
  const [alsoUpdateShopify, setAlsoUpdateShopify] = useState(!!product.shopify_product_id);

  const loadShops = async () => {
    setLoadingShops(true);
    try {
      const { data, error } = await supabase.functions.invoke("printify-get-shops", {
        body: { organizationId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setShops(data.shops || []);
      // Prefer brand-level shop mapping, fallback to first
      if (printifyShopId && data.shops?.some((s: any) => s.id === printifyShopId)) {
        setSelectedShop(printifyShopId);
      } else if (data.shops?.length >= 1) {
        setSelectedShop(data.shops[0].id);
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to load Printify shops");
    } finally {
      setLoadingShops(false);
    }
  };

  const loadPrintifyInfo = async () => {
    setLoadingColors(true);
    try {
      const { data, error } = await supabase.functions.invoke("printify-get-variants", {
        body: { blueprintId: selectedProductType.blueprintId, organizationId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (data.printProviderId) setPrintProviderId(data.printProviderId);
    } catch (err: any) {
      console.error("Failed to load Printify info:", err);
    } finally {
      setLoadingColors(false);
    }
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
    } catch {
      // silent
    } finally {
      setLoadingMockups(false);
    }
  };

  useEffect(() => {
    if (open) {
      loadShops();
      loadPrintifyInfo();
      loadMockups();
      loadSizePricing();
    }
  }, [open]);

  const loadSizePricing = async () => {
    // Load org-level default size pricing, then overlay product-level overrides
    const pt = PRODUCT_TYPE_REGISTRY["t-shirt"];
    const defaults: Record<string, string> = { ...pt.defaultSizePricing };

    if (organizationId) {
      const { data: org } = await supabase
        .from("organizations")
        .select("default_size_pricing")
        .eq("id", organizationId)
        .single();
      const orgPricing = (org as any)?.default_size_pricing?.["t-shirt"] as Record<string, string> | undefined;
      if (orgPricing) {
        for (const [size, price] of Object.entries(orgPricing)) {
          if (price) defaults[size] = price;
        }
      }
    }

    // Product-level overrides
    if (product.id) {
      const { data: prod } = await supabase
        .from("products")
        .select("size_pricing")
        .eq("id", product.id)
        .single();
      const prodPricing = (prod as any)?.size_pricing as Record<string, string> | undefined;
      if (prodPricing) {
        for (const [size, price] of Object.entries(prodPricing)) {
          if (price) defaults[size] = price;
        }
      }
    }

    setSizePricing(defaults);
  };

  // Re-fetch print provider info when product type changes
  useEffect(() => {
    if (open) {
      setPrintProviderId(null);
      loadPrintifyInfo();
    }
  }, [selectedProductType]);

  const toggleSize = (size: string) => {
    setSelectedSizes((prev) =>
      prev.includes(size) ? prev.filter((s) => s !== size) : [...prev, size]
    );
  };

  // Use mockup color names directly as the Printify colors; default to Black when no mockups
  const uniqueMockupColors = [...new Set(mockups.map((m) => m.color_name))];
  const hasMockups = uniqueMockupColors.length > 0;
  const DEFAULT_NO_MOCKUP_COLORS = ["Black"];
  const colorsForPush = hasMockups ? uniqueMockupColors : DEFAULT_NO_MOCKUP_COLORS;

  const handlePush = async () => {
    if (!selectedShop) {
      toast.error("Please select a Printify shop");
      return;
    }
    if (!selectedSizes.length) {
      toast.error("Please select at least one size");
      return;
    }
    if (!product.image_url) {
      toast.error("Product needs a design image");
      return;
    }

    setPushing(true);
    setResult(null);

    try {
      // Detect which selected colors are "light"
      const colorsToUse = colorsForPush;
      const lightColorsSelected = colorsToUse.filter(
        (c) => LIGHT_COLORS.has(c.toLowerCase())
      );
      const hasLightColors = lightColorsSelected.length > 0;

      toast.info("Removing background & uploading design to Printify...");

      // Step 1: Remove black background client-side, upscale for high DPI, then upload as base64
      let base64Contents = await removeBackground(product.image_url!, "black");
      base64Contents = await upscaleBase64Png(base64Contents, 4500);
      const { data: uploadData, error: uploadError } = await supabase.functions.invoke(
        "printify-upload-image",
        { body: { base64Contents, fileName: `${product.title}-design.png`, organizationId } }
      );
      if (uploadError) throw uploadError;
      if (uploadData?.error) throw new Error(uploadData.error);

      const printifyImageId = uploadData.image?.id;
      if (!printifyImageId) throw new Error("Failed to get uploaded image ID");

      // Step 2: If light colors exist, derive a dark-ink variant from the same transparent design
      // (avoids AI resizing/background artifacts and keeps perfect alignment)
      let darkPrintifyImageId: string | null = null;
      if (hasLightColors) {
        toast.info(`Creating dark ink variant for ${lightColorsSelected.length} light colors...`);

        const darkBase64Contents = await recolorOpaquePixels(base64Contents, {
          r: 24,
          g: 24,
          b: 24,
        });

        const { data: darkUpload, error: darkUploadError } = await supabase.functions.invoke(
          "printify-upload-image",
          { body: { base64Contents: darkBase64Contents, fileName: `${product.title}-dark-design.png`, organizationId } }
        );

        if (darkUploadError) throw darkUploadError;
        if (darkUpload?.error) throw new Error(darkUpload.error);

        darkPrintifyImageId = darkUpload.image?.id || null;
      }

      // Build mockup images using color names directly (empty if no mockups)
      const mockupImages: { printifyColorName: string; imageUrl: string }[] = [];
      for (const colorName of colorsToUse) {
        const mockup = mockups.find((m) => m.color_name === colorName);
        if (mockup) {
          mockupImages.push({
            printifyColorName: colorName,
            imageUrl: mockup.image_url,
          });
        }
      }

      const isUpdate = !!product.printify_product_id;
      toast.info(isUpdate ? "Updating on Printify..." : "Creating on Printify...");
      const shopifyListing = listings.find((l) => l.marketplace === "shopify");

      const { data, error } = await supabase.functions.invoke("printify-create-product", {
        body: {
          shopId: selectedShop,
          title: shopifyListing?.title || product.title,
          description: shopifyListing?.description || product.description,
          tags: shopifyListing?.tags || product.keywords?.split(",").map((k: string) => k.trim()),
          printifyImageId,
          darkPrintifyImageId,
          lightColors: hasLightColors ? [...LIGHT_COLORS] : [],
          selectedColors: colorsToUse,
          selectedSizes,
          price: product.price,
          sizePricing,
          mockupImages,
          productId: product.id,
          printifyProductId: product.printify_product_id,
          printProviderId,
          blueprintId: selectedProductType.blueprintId,
          organizationId,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      if (data.printifyProductId) {
        onProductUpdate?.({ printify_product_id: data.printifyProductId });
      }

      const printifyMsg = data.updated
        ? `Updated on Printify with ${data.variantCount} variants!${darkPrintifyImageId ? " Dark design applied to light colors." : ""}`
        : `Created on Printify with ${data.variantCount} variants!${darkPrintifyImageId ? " Dark design applied to light colors." : ""}`;

      // Also push mockups to Shopify if toggled on
      if (alsoUpdateShopify && mockups.length > 0) {
        try {
          toast.info("Pushing mockup images to Shopify...");
          const rawVariants = mockups.map((m) => ({
            colorName: m.color_name,
            imageUrl: m.image_url,
          }));
          const optimizedVariants = await optimizeVariantsForShopify(rawVariants, userId, product.id);

          const typeConfig = getProductType(product.category || "");
          if (typeConfig.sizeChartUrl) {
            optimizedVariants.push({ colorName: "Size Chart", imageUrl: typeConfig.sizeChartUrl });
          }

          const shopifyListing = listings.find((l) => l.marketplace === "shopify");
          const { data: shopifyData, error: shopifyError } = await supabase.functions.invoke("push-to-shopify", {
            body: {
              organizationId,
              product: {
                id: product.id,
                title: product.title,
                description: product.description,
                category: product.category,
                price: product.price,
                keywords: product.keywords,
                shopify_product_id: product.shopify_product_id,
              },
              listings: shopifyListing ? [shopifyListing] : listings,
              imageUrl: product.image_url,
              variants: optimizedVariants,
            },
          });

          if (shopifyError || shopifyData?.error) {
            toast.error("Printify updated but Shopify mockup push failed: " + (shopifyData?.error || shopifyError?.message));
          } else {
            toast.success(printifyMsg + " Mockups also updated on Shopify!");
          }
        } catch (shopifyErr: any) {
          toast.error("Printify updated but Shopify push failed: " + (shopifyErr.message || "Unknown error"));
        }
      } else {
        toast.success(printifyMsg);
      }

      setResult({ success: true });
      setOpen(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to push to Printify");
      setResult(null);
    } finally {
      setPushing(false);
    }
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => { setResult(null); setOpen(true); }}
        className="gap-2"
      >
        {result?.success ? (
          <CheckCircle2 className="h-4 w-4 text-primary" />
        ) : (
          <Printer className="h-4 w-4" />
        )}
        {result?.success ? "Pushed!" : product.printify_product_id ? "Update on Printify" : "Push to Printify"}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Printer className="h-5 w-5" />
              Push to Printify
            </DialogTitle>
            <DialogDescription>
              {hasMockups ? "Colors are pulled from your generated mockups." : "No mockups found — defaulting to Black only."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            {/* Product type selector */}
            <div className="space-y-2">
              <Label className="font-medium">Product Type</Label>
              <div className="flex flex-wrap gap-2">
                {PRODUCT_TYPES.map((pt) => (
                  <Button
                    key={pt.blueprintId}
                    type="button"
                    variant={selectedProductType.blueprintId === pt.blueprintId ? "default" : "outline"}
                    size="sm"
                    onClick={() => {
                      setSelectedProductType(pt);
                      setSelectedSizes(pt.sizes.slice(0, 4));
                    }}
                  >
                    {pt.label}
                  </Button>
                ))}
              </div>
            </div>

            {/* Shop - just show the name, no picker */}
            {loadingShops ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading shop...
              </div>
            ) : shops.length === 0 ? (
              <p className="text-sm text-destructive">No Printify shop found. Connect one in settings.</p>
            ) : (
              <p className="text-sm text-muted-foreground">
                Pushing to <span className="font-medium text-foreground">{shops.find(s => s.id === selectedShop)?.title || shops[0]?.title}</span>
              </p>
            )}

            {/* Mockup colors */}
            <div className="space-y-3">
              <Label className="font-medium">
                Colors from mockups {loadingMockups && <Loader2 className="inline h-3 w-3 animate-spin ml-1" />}
              </Label>

              {uniqueMockupColors.length > 0 ? (
              <div className="space-y-2">
                  {uniqueMockupColors.map((colorName) => {
                    const mockup = mockups.find((m) => m.color_name === colorName);
                    const isLight = LIGHT_COLORS.has(colorName.toLowerCase());
                    return (
                      <div key={colorName} className="flex items-center gap-3 p-2 rounded-md border border-border bg-muted/30">
                        {mockup && (
                          <img
                            src={mockup.image_url}
                            alt={colorName}
                            className="h-10 w-10 rounded object-cover border border-border shrink-0"
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">{colorName}</p>
                          {isLight && (
                            <p className="text-xs text-muted-foreground">Dark design will be applied</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : loadingMockups ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading mockups...
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-border p-3 text-center">
                  <p className="text-sm text-muted-foreground">
                    No mockups generated — will push with Black only.
                  </p>
                </div>
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

            {/* Also update Shopify toggle */}
            {hasMockups && (
              <div className="flex items-center justify-between rounded-lg border border-border p-3">
                <div className="flex items-center gap-2">
                  <Store className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Also update Shopify mockups</p>
                    <p className="text-xs text-muted-foreground">Push AI mockup images to your Shopify listing</p>
                  </div>
                </div>
                <Switch checked={alsoUpdateShopify} onCheckedChange={setAlsoUpdateShopify} />
              </div>
            )}

            {/* Summary */}
            <div className="rounded-lg bg-muted/50 p-3 text-sm space-y-1">
              <p><strong>Product:</strong> {product.title}</p>
              <p><strong>Colors:</strong> {colorsForPush.join(", ")}</p>
              <p><strong>Sizes:</strong> {selectedSizes.join(", ")}</p>
              <p><strong>Variants:</strong> ~{colorsForPush.length * selectedSizes.length}</p>
              <div>
                <strong>Pricing:</strong>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                  {selectedSizes.map((s) => (
                    <span key={s} className="text-xs">
                      {s}: ${sizePricing[s] || product.price?.replace(/[^0-9.]/g, "") || "29.99"}
                    </span>
                  ))}
                </div>
              </div>
              {product.printify_product_id && (
                <p className="text-primary text-xs">Will update existing Printify product</p>
              )}
            </div>

            <Button
              onClick={handlePush}
              disabled={pushing || !selectedShop || !selectedSizes.length}
              className="w-full gap-2"
            >
              {pushing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Pushing to Printify...
                </>
              ) : (
                <>
                  <Printer className="h-4 w-4" />
                  {product.printify_product_id ? "Update on Printify" : "Create on Printify"}
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
