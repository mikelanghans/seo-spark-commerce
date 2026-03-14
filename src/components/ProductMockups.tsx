import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ImageIcon, Plus, Trash2, Upload, Loader2, Edit2, Check, ZoomIn } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { GenerateColorVariants } from "./GenerateColorVariants";

interface ProductImage {
  id: string;
  product_id: string;
  image_url: string;
  image_type: string;
  color_name: string;
  position: number;
}

interface AiUsage {
  checkAndLog: (fn: string, userId: string) => Promise<boolean>;
  logUsage: (fn: string, userId: string) => Promise<void>;
}

interface Props {
  productId: string;
  userId: string;
  productTitle: string;
  sourceImageUrl?: string | null;
  designImageUrl?: string | null;
  brandName?: string;
  brandNiche?: string;
  brandAudience?: string;
  brandTone?: string;
  productCategory?: string;
  aiUsage?: AiUsage;
}

export const ProductMockups = ({ productId, userId, productTitle, sourceImageUrl, designImageUrl, brandName, brandNiche, brandAudience, brandTone, productCategory, aiUsage }: Props) => {
  const [images, setImages] = useState<ProductImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editColor, setEditColor] = useState("");
  const [previewImage, setPreviewImage] = useState<ProductImage | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadImages();
  }, [productId]);

  const loadImages = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("product_images")
      .select("*")
      .eq("product_id", productId)
      .eq("image_type", "mockup")
      .order("position", { ascending: true });
    setImages((data as ProductImage[]) || []);
    setLoading(false);
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).filter((f) => f.type.startsWith("image/"));
    if (files.length === 0) return;

    setUploading(true);
    try {
      for (const file of files) {
        const ext = file.name.split(".").pop() || "jpg";
        const path = `${userId}/${crypto.randomUUID()}.${ext}`;
        const { error: uploadError } = await supabase.storage.from("product-images").upload(path, file);
        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage.from("product-images").getPublicUrl(path);
        const colorName = file.name
          .replace(/\.[^.]+$/, "")
          .replace(/[-_]/g, " ")
          .replace(/\b\w/g, (c) => c.toUpperCase());

        const { error: insertError } = await supabase.from("product_images").insert({
          product_id: productId,
          user_id: userId,
          image_url: urlData.publicUrl,
          image_type: "mockup",
          color_name: colorName,
          position: images.length + files.indexOf(file),
        });
        if (insertError) throw insertError;
      }
      toast.success(`${files.length} mockup${files.length > 1 ? "s" : ""} uploaded`);
      await loadImages();
    } catch (err: any) {
      toast.error("Upload failed: " + err.message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleDelete = async (id: string) => {
    await supabase.from("product_images").delete().eq("id", id);
    setImages((prev) => prev.filter((img) => img.id !== id));
    toast.success("Mockup removed");
  };

  const handleSaveColor = async (id: string) => {
    await supabase.from("product_images").update({ color_name: editColor }).eq("id", id);
    setImages((prev) => prev.map((img) => (img.id === id ? { ...img, color_name: editColor } : img)));
    setEditingId(null);
    toast.success("Color name updated");
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Color Variant Mockups</h3>
          <p className="text-xs text-muted-foreground">
            Each mockup becomes a Shopify color variant · Upload manually or generate with AI
          </p>
        </div>
        <div className="flex gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleUpload}
            className="hidden"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="gap-2"
          >
            {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            Upload
          </Button>
        </div>
      </div>

      {/* AI Color Variant Generator */}
      <GenerateColorVariants
        productId={productId}
        userId={userId}
        productTitle={productTitle}
        sourceImageUrl={sourceImageUrl || null}
        designImageUrl={designImageUrl}
        onComplete={loadImages}
        brandName={brandName}
        brandNiche={brandNiche}
        brandAudience={brandAudience}
        brandTone={brandTone}
        productCategory={productCategory}
        aiUsage={aiUsage}
      />

      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : images.length === 0 ? (
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="flex w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border bg-card/50 py-10 transition-colors hover:border-primary/50"
        >
          <ImageIcon className="h-8 w-8 text-muted-foreground" />
          <p className="text-xs text-muted-foreground">
            Upload mockup images (filename = color name)
          </p>
        </button>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {images.map((img) => (
            <div key={img.id} className="group relative rounded-lg border border-border bg-card overflow-hidden">
              <div className="h-36 overflow-hidden bg-secondary">
                <img src={img.image_url} alt={img.color_name} className="h-full w-full object-contain p-2" />
              </div>
              <div className="flex items-center gap-2 px-3 py-2">
                {editingId === img.id ? (
                  <>
                    <Input
                      value={editColor}
                      onChange={(e) => setEditColor(e.target.value)}
                      className="h-7 text-xs"
                      autoFocus
                      onKeyDown={(e) => e.key === "Enter" && handleSaveColor(img.id)}
                    />
                    <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={() => handleSaveColor(img.id)}>
                      <Check className="h-3.5 w-3.5" />
                    </Button>
                  </>
                ) : (
                  <>
                    <span className="flex-1 truncate text-xs font-medium">{img.color_name || "Untitled"}</span>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 shrink-0 opacity-0 group-hover:opacity-100"
                      onClick={() => { setEditingId(img.id); setEditColor(img.color_name); }}
                    >
                      <Edit2 className="h-3 w-3" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 shrink-0 opacity-0 group-hover:opacity-100 hover:text-destructive"
                      onClick={() => handleDelete(img.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
