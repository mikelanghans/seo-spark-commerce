import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Store, Loader2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { ShopifyPushPreview } from "./ShopifyPushPreview";

interface Product {
  id: string;
  title: string;
  description: string;
  category: string;
  price: string;
  keywords: string;
  image_url: string | null;
  shopify_product_id: number | null;
}

interface Listing {
  marketplace: string;
  title: string;
  description: string;
  bullet_points?: string[];
  tags: string[];
  seo_title: string;
  seo_description: string;
  url_handle: string;
  alt_text: string;
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

/**
 * Resize an image URL to max 2048px wide JPEG, upload to storage,
 * and return the public URL. This keeps images under Shopify's 20MB limit.
 */
const optimizeImageForShopify = async (
  imageUrl: string,
  userId: string,
  productId: string,
  colorName: string,
): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = async () => {
      try {
        const maxWidth = 2048;
        const scale = img.width > maxWidth ? maxWidth / img.width : 1;
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);

        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0, w, h);

        const blob = await new Promise<Blob>((res, rej) => {
          canvas.toBlob(
            (b) => (b ? res(b) : rej(new Error("Canvas toBlob failed"))),
            "image/jpeg",
            0.85,
          );
        });

        const safeName = colorName.replace(/\s+/g, "-").toLowerCase();
        const path = `${userId}/shopify-optimized/${productId}/${safeName}-${Date.now()}.jpg`;

        const { error: upErr } = await supabase.storage
          .from("product-images")
          .upload(path, blob, { contentType: "image/jpeg", cacheControl: "3600", upsert: true });

        if (upErr) throw upErr;

        const { data: urlData } = supabase.storage
          .from("product-images")
          .getPublicUrl(path);

        resolve(urlData.publicUrl);
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = () => reject(new Error(`Failed to load image: ${imageUrl}`));
    img.src = imageUrl;
  });
};

export const PushToShopify = ({ product, listings, userId }: Props) => {
  const [previewOpen, setPreviewOpen] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [result, setResult] = useState<{ success: boolean } | null>(null);

  const handleConfirm = async (selectedMockups: MockupImage[]) => {
    setPushing(true);
    setResult(null);
    try {
      // Optimize images client-side (resize to 2048px JPEG) before pushing
      const optimizedVariants = await Promise.all(
        selectedMockups.map(async (m) => {
          try {
            const optimizedUrl = await optimizeImageForShopify(
              m.image_url,
              userId,
              product.id,
              m.color_name,
            );
            return { colorName: m.color_name, imageUrl: optimizedUrl };
          } catch (err) {
            console.warn(`Failed to optimize ${m.color_name}, using original`, err);
            return { colorName: m.color_name, imageUrl: m.image_url };
          }
        }),
      );

      const { data, error } = await supabase.functions.invoke("push-to-shopify", {
        body: {
          product: {
            id: product.id,
            title: product.title,
            description: product.description,
            category: product.category,
            price: product.price,
            keywords: product.keywords,
            shopify_product_id: product.shopify_product_id,
          },
          listings,
          imageUrl: product.image_url,
          variants: optimizedVariants,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setResult({ success: true });
      setPreviewOpen(false);
      toast.success("Product pushed to Shopify!");
    } catch (err: any) {
      toast.error(err.message || "Failed to push to Shopify");
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
        onClick={() => { setResult(null); setPreviewOpen(true); }}
        className="gap-2"
      >
        {result?.success ? (
          <CheckCircle2 className="h-4 w-4 text-primary" />
        ) : (
          <Store className="h-4 w-4" />
        )}
        {result?.success ? "Pushed!" : "Push to Shopify"}
      </Button>

      <ShopifyPushPreview
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        product={product}
        listings={listings}
        userId={userId}
        onConfirm={handleConfirm}
        pushing={pushing}
      />
    </>
  );
};
