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
}

interface Listing {
  marketplace: string;
  title: string;
  description: string;
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

export const PushToShopify = ({ product, listings, userId }: Props) => {
  const [previewOpen, setPreviewOpen] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [result, setResult] = useState<{ success: boolean } | null>(null);

  const handleConfirm = async (selectedMockups: MockupImage[]) => {
    setPushing(true);
    setResult(null);
    try {
      const variants = selectedMockups.map((m) => ({
        colorName: m.color_name,
        imageUrl: m.image_url,
      }));

      const { data, error } = await supabase.functions.invoke("push-to-shopify", {
        body: {
          product: {
            title: product.title,
            description: product.description,
            category: product.category,
            price: product.price,
            keywords: product.keywords,
          },
          listings,
          imageUrl: product.image_url,
          variants,
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
          <CheckCircle2 className="h-4 w-4 text-green-500" />
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
