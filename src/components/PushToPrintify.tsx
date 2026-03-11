import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Loader2, CheckCircle2, Printer, AlertTriangle } from "lucide-react";
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
}

interface Listing {
  marketplace: string;
  title: string;
  description: string;
  tags: string[];
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
  onProductUpdate?: (updates: Partial<Product>) => void;
  printifyShopId?: number | null;
}

const AVAILABLE_SIZES = ["S", "M", "L", "XL", "2XL", "3XL"];

// Comfort Colors 1717 light colors where white/light designs won't show well
const LIGHT_COLORS = new Set([
  "ivory", "butter", "banana", "blossom", "orchid", "chalky mint",
  "island reef", "chambray", "white", "flo blue", "watermelon",
  "neon pink", "neon green", "lagoon blue", "yam", "terracotta",
  "light green", "bay", "sage",
]);

export const PushToPrintify = ({ product, listings, userId, onProductUpdate, printifyShopId }: Props) => {
  const [open, setOpen] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [result, setResult] = useState<{ success: boolean } | null>(null);
  const [shops, setShops] = useState<{ id: number; title: string }[]>([]);
  const [selectedShop, setSelectedShop] = useState<number | null>(null);
  const [loadingShops, setLoadingShops] = useState(false);
  const [selectedSizes, setSelectedSizes] = useState<string[]>(["S", "M", "L", "XL"]);
  const [mockups, setMockups] = useState<MockupImage[]>([]);
  const [loadingMockups, setLoadingMockups] = useState(false);
  const [printProviderId, setPrintProviderId] = useState<number | null>(null);
  const [loadingColors, setLoadingColors] = useState(false);

  const loadShops = async () => {
    setLoadingShops(true);
    try {
      const { data, error } = await supabase.functions.invoke("printify-get-shops");
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
        body: { blueprintId: 706 },
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
    }
  }, [open]);

  const toggleSize = (size: string) => {
    setSelectedSizes((prev) =>
      prev.includes(size) ? prev.filter((s) => s !== size) : [...prev, size]
    );
  };

  // Use mockup color names directly as the Printify colors
  const uniqueMockupColors = [...new Set(mockups.map((m) => m.color_name))];

  const handlePush = async () => {
    if (!selectedShop) {
      toast.error("Please select a Printify shop");
      return;
    }
    if (!uniqueMockupColors.length || !selectedSizes.length) {
      toast.error("Need mockups and sizes to push");
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
      const lightColorsSelected = uniqueMockupColors.filter(
        (c) => LIGHT_COLORS.has(c.toLowerCase())
      );
      const hasLightColors = lightColorsSelected.length > 0;

      toast.info("Uploading design to Printify...");

      // Step 1: Upload original (white/light) design
      const { data: uploadData, error: uploadError } = await supabase.functions.invoke(
        "printify-upload-image",
        { body: { imageUrl: product.image_url, fileName: `${product.title}-design.png` } }
      );
      if (uploadError) throw uploadError;
      if (uploadData?.error) throw new Error(uploadData.error);

      const printifyImageId = uploadData.image?.id;
      if (!printifyImageId) throw new Error("Failed to get uploaded image ID");

      // Step 2: If light colors exist, generate & upload a dark variant
      let darkPrintifyImageId: string | null = null;
      if (hasLightColors) {
        toast.info(`Generating dark design for ${lightColorsSelected.length} light colors...`);

        const { data: darkData, error: darkError } = await supabase.functions.invoke(
          "generate-dark-design",
          { body: { designUrl: product.image_url } }
        );
        if (darkError) throw darkError;
        if (darkData?.error) throw new Error(darkData.error);

        if (darkData?.darkDesignUrl) {
          toast.info("Uploading dark design to Printify...");
          const { data: darkUpload, error: darkUploadError } = await supabase.functions.invoke(
            "printify-upload-image",
            { body: { imageUrl: darkData.darkDesignUrl, fileName: `${product.title}-dark-design.png` } }
          );
          if (darkUploadError) throw darkUploadError;
          if (darkUpload?.error) throw new Error(darkUpload.error);
          darkPrintifyImageId = darkUpload.image?.id || null;
        }
      }

      // Build mockup images using color names directly
      const mockupImages: { printifyColorName: string; imageUrl: string }[] = [];
      for (const colorName of uniqueMockupColors) {
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
          lightColors: lightColorsSelected,
          selectedColors: uniqueMockupColors,
          selectedSizes,
          price: product.price,
          mockupImages,
          productId: product.id,
          printifyProductId: product.printify_product_id,
          printProviderId,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setResult({ success: true });
      setOpen(false);
      if (data.printifyProductId) {
        onProductUpdate?.({ printify_product_id: data.printifyProductId });
      }
      toast.success(data.updated
        ? `Updated on Printify with ${data.variantCount} variants!${darkPrintifyImageId ? " Dark design applied to light colors." : ""}`
        : `Created on Printify with ${data.variantCount} variants!${darkPrintifyImageId ? " Dark design applied to light colors." : ""}`
      );
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
              Comfort Colors 1717. Colors are pulled from your generated mockups.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
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
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <AlertTriangle className="h-4 w-4" /> No mockups found. Generate mockups first.
                </div>
              )}
            </div>

            {/* Sizes */}
            <div className="space-y-2">
              <Label className="font-medium">Sizes</Label>
              <div className="flex flex-wrap gap-2">
                {AVAILABLE_SIZES.map((size) => (
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

            {/* Summary */}
            <div className="rounded-lg bg-muted/50 p-3 text-sm space-y-1">
              <p><strong>Product:</strong> {product.title}</p>
              <p><strong>Colors:</strong> {uniqueMockupColors.join(", ") || "None"}</p>
              <p><strong>Sizes:</strong> {selectedSizes.join(", ")}</p>
              <p><strong>Variants:</strong> ~{uniqueMockupColors.length * selectedSizes.length}</p>
              <p><strong>Price:</strong> {product.price || "$29.99"}</p>
              {product.printify_product_id && (
                <p className="text-primary text-xs">Will update existing Printify product</p>
              )}
            </div>

            <Button
              onClick={handlePush}
              disabled={pushing || !selectedShop || !uniqueMockupColors.length || !selectedSizes.length}
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
