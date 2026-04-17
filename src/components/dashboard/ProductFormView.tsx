import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { insertProductImagesDeduped } from "@/lib/productImageUtils";
import { toast } from "sonner";
import type { Organization, Product, ProductFormState } from "@/types/dashboard";
import { EMPTY_PRODUCT_FORM } from "@/types/dashboard";
import { PRODUCT_TYPES, type ProductTypeKey } from "@/lib/productTypes";
import { ArrowLeft, Sparkles, Loader2, ImageIcon } from "lucide-react";

interface Props {
  organization: Organization;
  userId: string;
  aiUsage: any;
  pendingLightDesignUrl: string | null;
  pendingDarkDesignUrl: string | null;
  isProcessingDesign: boolean;
  designProcessingStep: string;
  onDesignReset: () => void;
  processDesignVariants: (base64: string, options?: { forceShared?: boolean }) => Promise<void>;
  uploadImageToStorage: (file: File) => Promise<string | null>;
  onProductCreated: (product: Product) => void;
  onBack: () => void;
}

export const ProductFormView = ({
  organization, userId, aiUsage,
  pendingLightDesignUrl, pendingDarkDesignUrl,
  isProcessingDesign, designProcessingStep,
  onDesignReset, processDesignVariants, uploadImageToStorage,
  onProductCreated, onBack,
}: Props) => {
  const [productForm, setProductForm] = useState<ProductFormState>({ ...EMPTY_PRODUCT_FORM });
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiAutoFill, setAiAutoFill] = useState(true);
  const [forceSharedDesign, setForceSharedDesign] = useState(false);
  const [pendingDesignUrl, setPendingDesignUrl] = useState<string | null>(null);

  // Category options come from the org's enabled product types so they always
  // mirror what the user configured in Settings.
  const categoryOptions = useMemo(() => {
    const enabled = (organization.enabled_product_types || []) as ProductTypeKey[];
    const list = enabled
      .map((key) => PRODUCT_TYPES[key])
      .filter(Boolean)
      .map((cfg) => cfg.category);
    // Always include "Other" as a fallback
    if (!list.includes("Other")) list.push("Other");
    return Array.from(new Set(list));
  }, [organization.enabled_product_types]);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith("image/")) return;
    setImageFile(file);
    onDesignReset();
    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64 = event.target?.result as string;
      setImagePreview(base64);
      if (!aiAutoFill) { processDesignVariants(base64, { forceShared: forceSharedDesign }); return; }
      setIsAnalyzing(true);
      try {
        if (aiUsage) {
          const allowed = await aiUsage.checkAndLog("analyze-product", userId);
          if (!allowed) { setIsAnalyzing(false); return; }
        }
        const { data, error } = await supabase.functions.invoke("analyze-product", { body: { imageBase64: base64 } });
        if (error) throw error;
        if (data.error) throw new Error(data.error);
        // Coerce AI's free-text category to one of the org's enabled options
        // (case-insensitive substring match), falling back to the first option / "Other".
        const aiCat: string = data.category || "";
        const matched = categoryOptions.find(
          (opt) => opt.toLowerCase() === aiCat.toLowerCase() || aiCat.toLowerCase().includes(opt.toLowerCase()),
        );
        setProductForm({
          title: data.title || "", description: data.description || "",
          features: (data.features || []).join("\n"),
          category: matched || categoryOptions[0] || "Other",
          keywords: (data.keywords || []).join(", "), price: data.suggestedPrice || "",
        });
        if (aiUsage) await aiUsage.logUsage("analyze-product", userId);
        toast.success("Product analyzed!");
      } catch (err: any) {
        toast.error(err.message || "Failed to analyze image");
      } finally {
        setIsAnalyzing(false);
      }
      processDesignVariants(base64, { forceShared: forceSharedDesign });
    };
    reader.readAsDataURL(file);
  };

  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    let imageUrl: string | null = pendingDesignUrl || pendingLightDesignUrl || null;
    if (imageFile && !pendingLightDesignUrl) imageUrl = await uploadImageToStorage(imageFile);
    const { data: product, error } = await supabase.from("products").insert({ ...productForm, organization_id: organization.id, user_id: userId, image_url: imageUrl }).select().single();
    if (error) { toast.error(error.message); return; }

    if (pendingLightDesignUrl || pendingDarkDesignUrl) {
      const variantRows = [];
      if (pendingLightDesignUrl) variantRows.push({ product_id: product.id, user_id: userId, image_url: pendingLightDesignUrl, image_type: "design", color_name: "light-on-dark", position: 0 });
      if (pendingDarkDesignUrl) variantRows.push({ product_id: product.id, user_id: userId, image_url: pendingDarkDesignUrl, image_type: "design", color_name: "dark-on-light", position: 1 });
      await insertProductImagesDeduped(variantRows);
    }

    toast.success("Product saved! Generating listings…");
    onProductCreated(product as Product);
  };

  return (
    <form onSubmit={handleCreateProduct} className="space-y-8">
      <div className="flex items-center gap-3">
        <Button type="button" variant="ghost" size="icon" onClick={onBack}><ArrowLeft className="h-4 w-4" /></Button>
        <div><h2 className="text-2xl font-bold">Add New Product</h2><p className="text-sm text-muted-foreground">Upload a product image for AI analysis, or fill in details manually</p></div>
      </div>

      <div className="space-y-3 rounded-lg border border-border bg-card p-4">
        <div className="flex items-center gap-3">
          <input type="checkbox" id="ai-auto-fill" checked={aiAutoFill} onChange={(e) => setAiAutoFill(e.target.checked)} className="h-4 w-4 rounded border-border text-primary" />
          <Sparkles className="h-4 w-4 text-primary" />
          <label htmlFor="ai-auto-fill" className="text-sm">AI auto-fill — analyze uploaded image and fill in product details automatically</label>
        </div>
        <div className="flex items-start gap-3 border-t border-border pt-3">
          <input type="checkbox" id="force-shared" checked={forceSharedDesign} onChange={(e) => setForceSharedDesign(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-border text-primary" />
          <label htmlFor="force-shared" className="text-sm">
            <span className="font-medium">Use as single shared file</span>
            <span className="block text-xs text-muted-foreground">Skip background removal & light/dark variants. Best for multicolor illustrations (e.g. detailed art, photos) where automatic processing causes artifacts.</span>
          </label>
        </div>
      </div>

      <div>
        <Label className="mb-2 block">Product Image</Label>
        <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" id="product-image" />
        {imagePreview ? (
          <div className="space-y-3">
            <div className="relative overflow-hidden rounded-xl border border-border bg-card">
              <img src={imagePreview} alt="Preview" className="mx-auto max-h-64 object-contain p-4" />
              {isAnalyzing && <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm"><Loader2 className="mb-3 h-8 w-8 animate-spin text-primary" /><p className="text-sm font-medium">Analyzing product…</p></div>}
              {isProcessingDesign && !isAnalyzing && <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm"><Loader2 className="mb-3 h-8 w-8 animate-spin text-primary" /><p className="text-sm font-medium">{designProcessingStep}</p><p className="text-xs text-muted-foreground">Creating print-ready variants</p></div>}
              <label htmlFor="product-image" className="mt-2 block cursor-pointer text-center text-xs text-muted-foreground underline hover:text-foreground">Change image</label>
            </div>
            {(pendingLightDesignUrl || pendingDarkDesignUrl) && (
              <div className="rounded-lg border border-border bg-card/50 p-4">
                <p className="mb-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Design Variants (4500px print-ready)</p>
                <div className="grid grid-cols-2 gap-3">
                  {pendingLightDesignUrl && <div className="space-y-1"><div className="overflow-hidden rounded-lg border border-border bg-[hsl(var(--foreground))]"><img src={pendingLightDesignUrl} alt="Light variant" className="mx-auto h-32 object-contain p-2" /></div><p className="text-center text-xs text-muted-foreground">Light (for dark garments)</p></div>}
                  {pendingDarkDesignUrl && <div className="space-y-1"><div className="overflow-hidden rounded-lg border border-border bg-background"><img src={pendingDarkDesignUrl} alt="Dark variant" className="mx-auto h-32 object-contain p-2" /></div><p className="text-center text-xs text-muted-foreground">Dark (for light garments)</p></div>}
                </div>
              </div>
            )}
          </div>
        ) : (
          <label htmlFor="product-image" className="flex w-full cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-border bg-card/50 py-12 transition-colors hover:border-primary/50">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary"><ImageIcon className="h-6 w-6 text-muted-foreground" /></div>
            <p className="text-sm font-medium">Upload product image</p>
            <p className="text-xs text-muted-foreground">{aiAutoFill ? "AI will auto-fill all fields + generate light/dark variants" : "Image only — generates light/dark design variants"}</p>
          </label>
        )}
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <div className="space-y-2"><Label>Product Title</Label><Input value={productForm.title} onChange={(e) => setProductForm({ ...productForm, title: e.target.value })} required disabled={isAnalyzing} placeholder="e.g. Lavender Soy Candle" /></div>
        <div className="space-y-2">
          <Label>Category</Label>
          <Select
            value={productForm.category}
            onValueChange={(value) => setProductForm({ ...productForm, category: value })}
            disabled={isAnalyzing}
          >
            <SelectTrigger><SelectValue placeholder="Choose a category" /></SelectTrigger>
            <SelectContent>
              {categoryOptions.map((cat) => (
                <SelectItem key={cat} value={cat}>{cat}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-[10px] text-muted-foreground">From your enabled product types in Settings</p>
        </div>
        <div className="space-y-2 sm:col-span-2"><Label>Description</Label><Textarea value={productForm.description} onChange={(e) => setProductForm({ ...productForm, description: e.target.value })} rows={4} required disabled={isAnalyzing} placeholder="Describe your product…" /></div>
        <div className="space-y-2 sm:col-span-2"><Label>Key Features (one per line)</Label><Textarea value={productForm.features} onChange={(e) => setProductForm({ ...productForm, features: e.target.value })} rows={3} disabled={isAnalyzing} placeholder="Hand-poured with 100% soy wax" /></div>
        <div className="space-y-2"><Label>Keywords (comma separated)</Label><Input value={productForm.keywords} onChange={(e) => setProductForm({ ...productForm, keywords: e.target.value })} disabled={isAnalyzing} placeholder="soy candle, lavender" /></div>
        <div className="space-y-2"><Label>Price</Label><Input value={productForm.price} onChange={(e) => setProductForm({ ...productForm, price: e.target.value })} disabled={isAnalyzing} placeholder="$24.99" /></div>
      </div>

      <div className="flex justify-between">
        <Button type="button" variant="outline" onClick={onBack} className="gap-2"><ArrowLeft className="h-4 w-4" /> Back</Button>
        <Button type="submit" className="gap-2" disabled={isAnalyzing || isProcessingDesign}><Sparkles className="h-4 w-4" /> Save & Generate Listings</Button>
      </div>
    </form>
  );
};
