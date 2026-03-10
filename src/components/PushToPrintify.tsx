import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
}

const AVAILABLE_COLORS = [
  "Black", "White", "Navy", "Red", "Royal Blue", "Sport Grey",
  "Dark Heather", "Charcoal", "Forest Green", "Maroon",
];

const AVAILABLE_SIZES = ["S", "M", "L", "XL", "2XL", "3XL"];

export const PushToPrintify = ({ product, listings, userId }: Props) => {
  const [open, setOpen] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [result, setResult] = useState<{ success: boolean } | null>(null);
  const [shops, setShops] = useState<{ id: number; title: string }[]>([]);
  const [selectedShop, setSelectedShop] = useState<number | null>(null);
  const [loadingShops, setLoadingShops] = useState(false);
  const [selectedColors, setSelectedColors] = useState<string[]>(["Black", "White"]);
  const [selectedSizes, setSelectedSizes] = useState<string[]>(["S", "M", "L", "XL"]);
  const [mockups, setMockups] = useState<MockupImage[]>([]);
  const [loadingMockups, setLoadingMockups] = useState(false);

  const loadShops = async () => {
    setLoadingShops(true);
    try {
      const { data, error } = await supabase.functions.invoke("printify-get-shops");
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setShops(data.shops || []);
      if (data.shops?.length >= 1) {
        setSelectedShop(data.shops[0].id);
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to load Printify shops");
    } finally {
      setLoadingShops(false);
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
      const loaded = (data as MockupImage[]) || [];
      setMockups(loaded);
      
      // Auto-select colors that have mockups
      if (loaded.length > 0) {
        const mockupColorNames = loaded.map((m) => m.color_name);
        // Include existing mockup colors + keep any already-selected colors
        setSelectedColors((prev) => {
          const merged = new Set([...prev, ...mockupColorNames]);
          // Also add matching AVAILABLE_COLORS by case-insensitive match
          const result: string[] = [];
          for (const ac of AVAILABLE_COLORS) {
            if (merged.has(ac) || mockupColorNames.some((mc) => mc.toLowerCase() === ac.toLowerCase())) {
              result.push(ac);
            }
          }
          // Add any mockup colors not in AVAILABLE_COLORS
          for (const mc of mockupColorNames) {
            if (!result.some((r) => r.toLowerCase() === mc.toLowerCase())) {
              result.push(mc);
            }
          }
          return result;
        });
      }
    } catch {
      // silent
    } finally {
      setLoadingMockups(false);
    }
  };

  useEffect(() => {
    if (open) {
      loadShops();
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
      // Step 1: Upload design image to Printify
      toast.info("Uploading design to Printify...");
      const { data: uploadData, error: uploadError } = await supabase.functions.invoke(
        "printify-upload-image",
        { body: { imageUrl: product.image_url, fileName: `${product.title}-design.png` } }
      );
      if (uploadError) throw uploadError;
      if (uploadData?.error) throw new Error(uploadData.error);

      const printifyImageId = uploadData.image?.id;
      if (!printifyImageId) throw new Error("Failed to get uploaded image ID from Printify");

      // Step 2: Build mockup images from product_images
      const mockupImages = mockups
        .filter((m) =>
          selectedColors.some(
            (c) => c.toLowerCase() === m.color_name.toLowerCase()
          )
        )
        .map((m) => ({ colorName: m.color_name, imageUrl: m.image_url }));

      // Step 3: Create product on Printify
      toast.info("Creating product on Printify...");
      const shopifyListing = listings.find((l) => l.marketplace === "shopify");
      const { data, error } = await supabase.functions.invoke("printify-create-product", {
        body: {
          shopId: selectedShop,
          title: shopifyListing?.title || product.title,
          description: shopifyListing?.description || product.description,
          tags: shopifyListing?.tags || product.keywords?.split(",").map((k: string) => k.trim()),
          printifyImageId,
          selectedColors,
          selectedSizes,
          price: product.price,
          mockupImages,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setResult({ success: true });
      setOpen(false);
      toast.success(`Product created on Printify with ${data.variantCount} variants!`);
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
        {result?.success ? "Pushed!" : "Push to Printify"}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Printer className="h-5 w-5" />
              Push to Printify
            </DialogTitle>
            <DialogDescription>
              Create a Comfort Colors 1717 garment-dyed t-shirt on Printify with your design auto-centered on the front.
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
                <p className="text-sm text-muted-foreground">
                  No shops found. Make sure you have a shop connected in your Printify account.
                </p>
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

            {/* Color selection */}
            <div className="space-y-2">
              <Label className="font-medium">Colors</Label>
              <div className="grid grid-cols-2 gap-2">
                {AVAILABLE_COLORS.map((color) => (
                  <label
                    key={color}
                    className="flex items-center gap-2 text-sm cursor-pointer"
                  >
                    <Checkbox
                      checked={selectedColors.includes(color)}
                      onCheckedChange={() => toggleColor(color)}
                    />
                    {color}
                  </label>
                ))}
              </div>
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

            {/* Mockup preview */}
            {mockups.length > 0 && (
              <div className="space-y-2">
                <Label className="font-medium">
                  AI Mockups ({mockups.length} total)
                </Label>
                <div className="flex gap-2 overflow-x-auto pb-2">
                  {mockups.map((m) => {
                    const isMatched = selectedColors.some(
                      (c) => c.toLowerCase() === m.color_name.toLowerCase()
                    );
                    return (
                      <div key={m.id} className="shrink-0">
                        <img
                          src={m.image_url}
                          alt={m.color_name}
                          className={`h-20 w-20 rounded-md object-cover border ${isMatched ? "border-primary ring-2 ring-primary/30" : "border-border opacity-50"}`}
                        />
                        <p className={`text-xs text-center mt-1 ${isMatched ? "text-foreground font-medium" : "text-muted-foreground"}`}>
                          {m.color_name}
                        </p>
                      </div>
                    );
                  })}
                </div>
                <p className="text-xs text-muted-foreground">
                  Highlighted mockups match selected colors and will be included.
                </p>
              </div>
            )}

            {/* Summary */}
            <div className="rounded-lg bg-muted/50 p-3 text-sm space-y-1">
              <p><strong>Product:</strong> {product.title}</p>
              <p><strong>Blueprint:</strong> Comfort Colors 1717</p>
              <p><strong>Colors:</strong> {selectedColors.join(", ") || "None"}</p>
              <p><strong>Sizes:</strong> {selectedSizes.join(", ") || "None"}</p>
              <p><strong>Variants:</strong> ~{selectedColors.length * selectedSizes.length}</p>
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
                  Creating product...
                </>
              ) : (
                <>
                  <Printer className="h-4 w-4" />
                  Create on Printify
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
