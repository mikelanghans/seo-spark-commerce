import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Loader2, CheckCircle2, Printer } from "lucide-react";
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

// Maps our mockup color names → Printify's exact variant color names
const MOCKUP_TO_PRINTIFY: Record<string, string> = {
  "black": "Black",
  "red": "Red",
  "navy": "Navy",
  "navy blue": "Navy",
  "forest green": "Moss",
  "royal blue": "Flo Blue",
  "dark green": "Blue Spruce",
  "olive": "Moss",
  "charcoal": "Pepper",
  "dark grey": "Graphite Heather",
  "burgundy": "Berry",
  "maroon": "Crimson",
  "white": "White",
  "cream": "Ivory",
  "light blue": "Chalky Mint",
  "pink": "Blossom",
  "orange": "Yam",
  "yellow": "Butter",
  "purple": "Violet",
  "teal": "Seafoam",
  "moss": "Moss",
  "true navy": "True Navy",
  "blue spruce": "Blue Spruce",
  "flo blue": "Flo Blue",
  "royal caribe": "Royal Caribe",
  "graphite": "Graphite Heather",
  "pepper": "Pepper",
  "berry": "Berry",
  "crimson": "Crimson",
  "ivory": "Ivory",
  "chalky mint": "Chalky Mint",
  "butter": "Butter",
  "seafoam": "Seafoam",
  "blossom": "Blossom",
  "violet": "Violet",
  "yam": "Yam",
  "watermelon": "Watermelon",
  "lagoon blue": "Lagoon Blue",
  "orchid": "Orchid",
  "terracotta": "Terracotta",
  "bright salmon": "Bright Salmon",
};

function mapMockupToPrintifyColor(mockupColorName: string): string | null {
  const key = mockupColorName.toLowerCase().trim();
  return MOCKUP_TO_PRINTIFY[key] || null;
}

export const PushToPrintify = ({ product, listings, userId, onProductUpdate }: Props) => {
  const [open, setOpen] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [result, setResult] = useState<{ success: boolean } | null>(null);
  const [shops, setShops] = useState<{ id: number; title: string }[]>([]);
  const [selectedShop, setSelectedShop] = useState<number | null>(null);
  const [loadingShops, setLoadingShops] = useState(false);
  const [selectedColors, setSelectedColors] = useState<string[]>([]);
  const [selectedSizes, setSelectedSizes] = useState<string[]>(["S", "M", "L", "XL"]);
  const [mockups, setMockups] = useState<MockupImage[]>([]);
  const [loadingMockups, setLoadingMockups] = useState(false);
  const [printifyColors, setPrintifyColors] = useState<string[]>([]);
  const [printProviderId, setPrintProviderId] = useState<number | null>(null);
  const [loadingColors, setLoadingColors] = useState(false);

  // Mapping: Printify color → mockup(s) for that color
  const colorMockupMap = useMemo(() => {
    const map: Record<string, MockupImage[]> = {};
    for (const m of mockups) {
      const printifyColor = mapMockupToPrintifyColor(m.color_name);
      if (printifyColor) {
        if (!map[printifyColor]) map[printifyColor] = [];
        map[printifyColor].push(m);
      }
    }
    return map;
  }, [mockups]);

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

  // Auto-select colors once both mockups and printify colors are loaded
  useEffect(() => {
    if (mockups.length > 0 && printifyColors.length > 0) {
      const autoSelected: string[] = [];
      for (const m of mockups) {
        const printifyColor = mapMockupToPrintifyColor(m.color_name);
        if (printifyColor && printifyColors.includes(printifyColor) && !autoSelected.includes(printifyColor)) {
          autoSelected.push(printifyColor);
        }
      }
      if (autoSelected.length > 0) {
        setSelectedColors(autoSelected);
      }
    }
  }, [mockups, printifyColors]);

  useEffect(() => {
    if (open) {
      loadShops();
      loadPrintifyColors();
      loadMockups();
    }
  }, [open]);

  const toggleColor = (color: string) => {
    setSelectedColors((prev) =>
      prev.includes(color) ? prev.filter((c) => c !== color) : [...prev, color]
    );
  };

  const toggleSize = (size: string) => {
    setSelectedSizes((prev) =>
      prev.includes(size) ? prev.filter((s) => s !== size) : [...prev, size]
    );
  };

  // Colors that have mockups — show first
  const colorsWithMockups = printifyColors.filter((c) => colorMockupMap[c]?.length > 0);
  const colorsWithoutMockups = printifyColors.filter((c) => !colorMockupMap[c]?.length);

  const handlePush = async () => {
    if (!selectedShop) {
      toast.error("Please select a Printify shop");
      return;
    }
    if (!selectedColors.length || !selectedSizes.length) {
      toast.error("Please select at least one color and size");
      return;
    }
    if (!product.image_url) {
      toast.error("Product needs a design image to push to Printify");
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
      if (!printifyImageId) throw new Error("Failed to get uploaded image ID from Printify");

      // Build mockup images — use Printify color names
      const mockupImages: { printifyColorName: string; imageUrl: string }[] = [];
      for (const color of selectedColors) {
        const matchedMockups = colorMockupMap[color];
        if (matchedMockups?.length > 0) {
          mockupImages.push({
            printifyColorName: color,
            imageUrl: matchedMockups[0].image_url,
          });
        }
      }

      const isUpdate = !!product.printify_product_id;
      toast.info(isUpdate ? "Updating product on Printify..." : "Creating product on Printify...");
      const shopifyListing = listings.find((l) => l.marketplace === "shopify");
      const { data, error } = await supabase.functions.invoke("printify-create-product", {
        body: {
          shopId: selectedShop,
          title: shopifyListing?.title || product.title,
          description: shopifyListing?.description || product.description,
          tags: shopifyListing?.tags || product.keywords?.split(",").map((k: string) => k.trim()),
          printifyImageId,
          selectedColors, // These are now Printify's exact color names
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
        ? `Product updated on Printify with ${data.variantCount} variants!`
        : `Product created on Printify with ${data.variantCount} variants!`
      );
    } catch (err: any) {
      toast.error(err.message || "Failed to push to Printify");
      setResult(null);
    } finally {
      setPushing(false);
    }
  };

  const unmappedMockups = mockups.filter((m) => !mapMockupToPrintifyColor(m.color_name));

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
              Comfort Colors 1717 garment-dyed t-shirt. Colors shown are Printify's exact variant names.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            {/* Shop selection */}
            <div className="space-y-2">
              <Label className="font-medium">Printify Shop</Label>
              {loadingShops ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading shops...
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

            {/* Color selection — Printify's actual colors */}
            <div className="space-y-2">
              <Label className="font-medium">
                Colors {loadingColors && <Loader2 className="inline h-3 w-3 animate-spin ml-1" />}
              </Label>

              {/* Colors with mockups first */}
              {colorsWithMockups.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground font-medium">With mockups:</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {colorsWithMockups.map((color) => (
                      <label key={color} className="flex items-center gap-2 text-sm cursor-pointer p-1 rounded hover:bg-muted/50">
                        <Checkbox
                          checked={selectedColors.includes(color)}
                          onCheckedChange={() => toggleColor(color)}
                        />
                        <span className="flex items-center gap-1.5">
                          {color}
                          {colorMockupMap[color] && (
                            <img
                              src={colorMockupMap[color][0].image_url}
                              alt={color}
                              className="h-5 w-5 rounded-sm object-cover border border-border"
                            />
                          )}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* Other available colors */}
              {colorsWithoutMockups.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground font-medium">Other available colors:</p>
                  <div className="grid grid-cols-3 gap-1 max-h-32 overflow-y-auto">
                    {colorsWithoutMockups.map((color) => (
                      <label key={color} className="flex items-center gap-1.5 text-xs cursor-pointer p-1 rounded hover:bg-muted/50">
                        <Checkbox
                          checked={selectedColors.includes(color)}
                          onCheckedChange={() => toggleColor(color)}
                        />
                        {color}
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* Unmapped mockup warnings */}
              {unmappedMockups.length > 0 && (
                <p className="text-xs text-destructive">
                  ⚠ {unmappedMockups.length} mockup color(s) couldn't be mapped to Printify: {unmappedMockups.map(m => m.color_name).join(", ")}
                </p>
              )}
            </div>

            {/* Size selection */}
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
              <p><strong>Blueprint:</strong> Comfort Colors 1717</p>
              <p><strong>Colors:</strong> {selectedColors.join(", ") || "None"}</p>
              <p><strong>Sizes:</strong> {selectedSizes.join(", ") || "None"}</p>
              <p><strong>Variants:</strong> ~{selectedColors.length * selectedSizes.length}</p>
              <p><strong>Mockups to upload:</strong> {Object.keys(colorMockupMap).filter(c => selectedColors.includes(c)).length}</p>
              <p><strong>Price:</strong> {product.price || "$29.99"}</p>
            </div>

            <Button
              onClick={handlePush}
              disabled={pushing || !selectedShop || !selectedColors.length || !selectedSizes.length}
              className="w-full gap-2"
            >
              {pushing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {product.printify_product_id ? "Updating product..." : "Creating product..."}
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
