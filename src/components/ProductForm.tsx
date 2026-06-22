import { useState, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Sparkles, Upload, ImageIcon, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PRODUCT_TYPES, type ProductTypeKey } from "@/lib/productTypes";

export interface ProductInfo {
  title: string;
  description: string;
  keywords: string;
  category: string;
  price: string;
  features: string;
}

interface Props {
  onSubmit: (data: ProductInfo) => void;
  onBack: () => void;
  initial: ProductInfo | null;
  enabledProductTypes?: ProductTypeKey[];
}

export const ProductForm = ({ onSubmit, onBack, initial, enabledProductTypes }: Props) => {
  const availableTypes = enabledProductTypes?.length
    ? Object.values(PRODUCT_TYPES).filter((pt) => enabledProductTypes.includes(pt.key))
    : Object.values(PRODUCT_TYPES);
  const [productType, setProductType] = useState<ProductTypeKey>(
    initial?.category ? (
      initial.category.toLowerCase().includes("hoodie") || initial.category.toLowerCase().includes("sweatshirt") ? "hoodie" :
      initial.category.toLowerCase().includes("mug") || initial.category.toLowerCase().includes("drinkware") ? "mug" :
      "t-shirt"
    ) : "t-shirt"
  );
  const [form, setForm] = useState<ProductInfo>(
    initial ?? { title: "", description: "", keywords: "", category: PRODUCT_TYPES["t-shirt"].category, price: PRODUCT_TYPES["t-shirt"].defaultPrice, features: "" }
  );
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleProductTypeChange = (type: ProductTypeKey) => {
    setProductType(type);
    const config = PRODUCT_TYPES[type];
    setForm((prev) => ({
      ...prev,
      category: config.category,
      price: prev.price || config.defaultPrice,
    }));
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Please upload an image file");
      return;
    }

    // Convert to base64
    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64 = event.target?.result as string;
      setImagePreview(base64);
      
      // Analyze with AI
      setIsAnalyzing(true);
      try {
        const { data, error } = await supabase.functions.invoke("analyze-product", {
          body: { imageBase64: base64 },
        });

        if (error) throw error;
        if (data.error) throw new Error(data.error);

        setForm({
          title: data.title || "",
          description: data.description || "",
          features: (data.features || []).join("\n"),
          category: data.category || "",
          keywords: (data.keywords || []).join(", "),
          price: data.suggestedPrice || "",
        });
        toast.success("Product analyzed! Review and edit the details below.");
      } catch (err: any) {
        console.error("Analysis error:", err);
        toast.error(err.message || "Failed to analyze image. Please fill in details manually.");
      } finally {
        setIsAnalyzing(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(form);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold">Product Information</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Upload a product image and let AI fill in the details, or enter manually.
        </p>
      </div>

      {/* Image Upload */}
      <div>
        <Label className="mb-2 block">Product Image</Label>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          onChange={handleImageUpload}
          className="hidden"
        />
        {imagePreview ? (
          <div className="relative">
            <div className="relative overflow-hidden rounded-xl border border-border bg-card">
              <img
                src={imagePreview}
                alt="Product preview"
                className="mx-auto max-h-64 object-contain p-4"
              />
              {isAnalyzing && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm">
                  <Loader2 className="mb-3 h-8 w-8 animate-spin text-primary" />
                  <p className="text-sm font-medium text-foreground">Analyzing product…</p>
                  <p className="text-xs text-muted-foreground">AI is extracting details</p>
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="mt-2 text-xs text-muted-foreground underline hover:text-foreground"
            >
              Change image
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex w-full flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-border bg-card/50 py-12 transition-colors hover:border-primary/50 hover:bg-card"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary">
              <ImageIcon className="h-6 w-6 text-muted-foreground" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-foreground">
                Upload product image
              </p>
              <p className="text-xs text-muted-foreground">
                AI will auto-fill all fields from the image
              </p>
            </div>
          </button>
        )}
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="title">Product Title</Label>
          <Input
            id="title"
            placeholder="e.g. Lavender Soy Candle 8oz"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            required
            disabled={isAnalyzing}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="productType">Product Type</Label>
          <Select value={productType} onValueChange={(v) => handleProductTypeChange(v as ProductTypeKey)} disabled={isAnalyzing}>
            <SelectTrigger>
              <SelectValue placeholder="Select product type" />
            </SelectTrigger>
            <SelectContent>
              {availableTypes.map((pt) => (
                <SelectItem key={pt.key} value={pt.key}>{pt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="category">Category</Label>
          <Input
            id="category"
            placeholder="e.g. T-Shirt, Hoodie, Mug"
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
            required
            disabled={isAnalyzing}
          />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="description">Product Description</Label>
          <Textarea
            id="description"
            placeholder="Describe your product in detail — materials, size, use cases…"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            rows={4}
            required
            disabled={isAnalyzing}
          />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="features">Key Features (one per line)</Label>
          <Textarea
            id="features"
            placeholder={"Hand-poured with 100% soy wax\n8oz jar, 50+ hour burn time\nNatural lavender essential oil"}
            value={form.features}
            onChange={(e) => setForm({ ...form, features: e.target.value })}
            rows={3}
            disabled={isAnalyzing}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="keywords">Keywords (comma separated)</Label>
          <Input
            id="keywords"
            placeholder="e.g. soy candle, lavender, handmade, gift"
            value={form.keywords}
            onChange={(e) => setForm({ ...form, keywords: e.target.value })}
            disabled={isAnalyzing}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="price">Price</Label>
          <Input
            id="price"
            placeholder="e.g. $24.99"
            value={form.price}
            onChange={(e) => setForm({ ...form, price: e.target.value })}
            disabled={isAnalyzing}
          />
        </div>
      </div>

      <div className="flex justify-between">
        <Button type="button" variant="outline" onClick={onBack} className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
        <Button type="submit" className="gap-2" disabled={isAnalyzing}>
          <Sparkles className="h-4 w-4" />
          Generate Listings
        </Button>
      </div>
    </form>
  );
};
