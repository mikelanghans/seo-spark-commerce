import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
}

const AVAILABLE_SIZES = ["S", "M", "L", "XL", "2XL", "3XL"];

export const PushToPrintify = ({ product, listings, userId, onProductUpdate }: Props) => {
  const [open, setOpen] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [result, setResult] = useState<{ success: boolean } | null>(null);
  const [shops, setShops] = useState<{ id: number; title: string }[]>([]);
  const [selectedShop, setSelectedShop] = useState<number | null>(null);
  const [loadingShops, setLoadingShops] = useState(false);
  const [selectedSizes, setSelectedSizes] = useState<string[]>(["S", "M", "L", "XL"]);
  const [mockups, setMockups] = useState<MockupImage[]>([]);
  const [loadingMockups, setLoadingMockups] = useState(false);
  const [printifyColors, setPrintifyColors] = useState<string[]>([]);
  const [printProviderId, setPrintProviderId] = useState<number | null>(null);
  const [loadingColors, setLoadingColors] = useState(false);

  // Manual mapping: mockup color name → Printify color name
  const [colorMapping, setColorMapping] = useState<Record<string, string>>({});
  // Additional Printify colors (without mockups) the user wants to add
  const [extraColors, setExtraColors] = useState<string[]>([]);

  const loadShops = async () => {
    setLoadingShops(true);
    try {
      const { data, error } = await supabase.functions.invoke("printify-get-shops");
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setShops(data.shops || []);
      if (data.shops?.length >= 1) setSelectedShop(data.shops[0].id);
    } catch (err: any) {
      toast.error(err.message || "Failed to load Printify shops");
    } finally {
      setLoadingShops(false);
    }
  };

  const loadPrintifyColors = async () => {
    setLoadingColors(true);
    try {
      const { data, error } = await supabase.functions.invoke("printify-get-variants", {
        body: { blueprintId: 706 },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setPrintifyColors(data.colors || []);
      if (data.printProviderId) setPrintProviderId(data.printProviderId);
    } catch (err: any) {
      console.error("Failed to load Printify colors:", err);
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

  // Auto-map mockup colors when data loads (best-guess by name similarity)
  useEffect(() => {
    if (mockups.length > 0 && printifyColors.length > 0 && Object.keys(colorMapping).length === 0) {
      const mapping: Record<string, string> = {};
      const uniqueMockupColors = [...new Set(mockups.map((m) => m.color_name))];

      for (const mc of uniqueMockupColors) {
        const mcLower = mc.toLowerCase().trim();
        // Try exact match first
        const exact = printifyColors.find((pc) => pc.toLowerCase() === mcLower);
        if (exact) {
          mapping[mc] = exact;
          continue;
        }
        // Try partial word match
        const mcWords = mcLower.split(/\s+/);
        const partial = printifyColors.find((pc) => {
          const pcLower = pc.toLowerCase();
          return mcWords.some((w) => w.length >= 3 && pcLower.includes(w));
        });
        if (partial) {
          mapping[mc] = partial;
        }
        // Leave unmapped if no match found — user must manually select
      }
      setColorMapping(mapping);
    }
  }, [mockups, printifyColors]);

  useEffect(() => {
    if (open) {
      setColorMapping({});
      setExtraColors([]);
      loadShops();
      loadPrintifyColors();
      loadMockups();
    }
  }, [open]);

  const toggleSize = (size: string) => {
    setSelectedSizes((prev) =>
      prev.includes(size) ? prev.filter((s) => s !== size) : [...prev, size]
    );
  };

  const toggleExtraColor = (color: string) => {
    setExtraColors((prev) =>
      prev.includes(color) ? prev.filter((c) => c !== color) : [...prev, color]
    );
  };

  // All Printify colors that will be enabled
  const selectedPrintifyColors = useMemo(() => {
    const mapped = Object.values(colorMapping).filter(Boolean);
    return [...new Set([...mapped, ...extraColors])];
  }, [colorMapping, extraColors]);

  // Colors already used in mapping — shouldn't appear in extras
  const mappedPrintifyColors = new Set(Object.values(colorMapping).filter(Boolean));

  const uniqueMockupColors = [...new Set(mockups.map((m) => m.color_name))];

  const handlePush = async () => {
    if (!selectedShop) {
      toast.error("Please select a Printify shop");
      return;
    }
    if (!selectedPrintifyColors.length || !selectedSizes.length) {
      toast.error("Please map at least one color and select sizes");
      return;
    }
    if (!product.image_url) {
      toast.error("Product needs a design image");
      return;
    }

    setPushing(true);
    setResult(null);

    try {
      toast.info("Uploading design to Printify...");
      const { data: uploadData, error: uploadError } = await supabase.functions.invoke(
        "printify-upload-image",
        { body: { imageUrl: product.image_url, fileName: `${product.title}-design.png` } }
      );
      if (uploadError) throw uploadError;
      if (uploadData?.error) throw new Error(uploadData.error);

      const printifyImageId = uploadData.image?.id;
      if (!printifyImageId) throw new Error("Failed to get uploaded image ID");

      // Build mockup images with correct Printify color names
      const mockupImages: { printifyColorName: string; imageUrl: string }[] = [];
      for (const [mockupColor, printifyColor] of Object.entries(colorMapping)) {
        if (!printifyColor) continue;
        const mockup = mockups.find((m) => m.color_name === mockupColor);
        if (mockup) {
          mockupImages.push({
            printifyColorName: printifyColor,
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
          selectedColors: selectedPrintifyColors,
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
        ? `Updated on Printify with ${data.variantCount} variants!`
        : `Created on Printify with ${data.variantCount} variants!`
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
              Comfort Colors 1717. Map your mockup colors to Printify's exact color names.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            {/* Shop */}
            <div className="space-y-2">
              <Label className="font-medium">Printify Shop</Label>
              {loadingShops ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading...
                </div>
              ) : shops.length === 0 ? (
                <p className="text-sm text-muted-foreground">No shops found.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {shops.map((shop) => (
                    <Button
                      key={shop.id}
                      type="button"
                      variant={selectedShop === shop.id ? "default" : "outline"}
                      size="sm"
                      onClick={() => setSelectedShop(shop.id)}
                    >
                      {shop.title}
                    </Button>
                  ))}
                </div>
              )}
            </div>

            {/* Color mapping: mockup color → Printify color */}
            <div className="space-y-3">
              <Label className="font-medium">
                Color Mapping {loadingColors && <Loader2 className="inline h-3 w-3 animate-spin ml-1" />}
              </Label>
              <p className="text-xs text-muted-foreground">
                Match each mockup color to a Printify color. Printify uses specific names like "Moss", "True Navy", etc.
              </p>

              {uniqueMockupColors.length > 0 ? (
                <div className="space-y-2">
                  {uniqueMockupColors.map((mc) => {
                    const mockup = mockups.find((m) => m.color_name === mc);
                    const mapped = colorMapping[mc];
                    return (
                      <div key={mc} className="flex items-center gap-2 p-2 rounded-md border border-border bg-muted/30">
                        {mockup && (
                          <img
                            src={mockup.image_url}
                            alt={mc}
                            className="h-10 w-10 rounded object-cover border border-border shrink-0"
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{mc}</p>
                          <p className="text-xs text-muted-foreground">Mockup</p>
                        </div>
                        <span className="text-muted-foreground text-sm">→</span>
                        <Select
                          value={mapped || ""}
                          onValueChange={(val) =>
                            setColorMapping((prev) => ({ ...prev, [mc]: val }))
                          }
                        >
                          <SelectTrigger className="w-40">
                            <SelectValue placeholder="Select color" />
                          </SelectTrigger>
                          <SelectContent>
                            {printifyColors.map((pc) => (
                              <SelectItem key={pc} value={pc}>
                                {pc}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
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
                  <AlertTriangle className="h-4 w-4" /> No mockups found. You can still select colors below.
                </div>
              )}
            </div>

            {/* Extra colors without mockups */}
            <div className="space-y-2">
              <Label className="font-medium text-sm">Additional colors (no mockup)</Label>
              <div className="grid grid-cols-3 gap-1 max-h-28 overflow-y-auto">
                {printifyColors
                  .filter((pc) => !mappedPrintifyColors.has(pc))
                  .map((color) => (
                    <label key={color} className="flex items-center gap-1.5 text-xs cursor-pointer p-1 rounded hover:bg-muted/50">
                      <Checkbox
                        checked={extraColors.includes(color)}
                        onCheckedChange={() => toggleExtraColor(color)}
                      />
                      {color}
                    </label>
                  ))}
              </div>
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
              <p><strong>Printify Colors:</strong> {selectedPrintifyColors.join(", ") || "None"}</p>
              <p><strong>Sizes:</strong> {selectedSizes.join(", ")}</p>
              <p><strong>Variants:</strong> ~{selectedPrintifyColors.length * selectedSizes.length}</p>
              <p><strong>Mockups:</strong> {Object.values(colorMapping).filter(Boolean).length} mapped</p>
              <p><strong>Price:</strong> {product.price || "$29.99"}</p>
              {product.printify_product_id && (
                <p className="text-primary text-xs">Will update existing Printify product</p>
              )}
            </div>

            <Button
              onClick={handlePush}
              disabled={pushing || !selectedShop || !selectedPrintifyColors.length || !selectedSizes.length}
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
