import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Store, Loader2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { ShopifyPushPreview } from "./ShopifyPushPreview";
import { optimizeVariantsForShopify } from "@/lib/shopifyImageOptimizer";
import { CC1717_SIZE_CHART_URL } from "@/lib/sizeChart";

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
  organizationId?: string;
}

export const PushToShopify = ({ product, listings, userId, organizationId }: Props) => {
  const [previewOpen, setPreviewOpen] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [result, setResult] = useState<{ success: boolean } | null>(null);

  const handleConfirm = async (selectedMockups: MockupImage[]) => {
    setPushing(true);
    setResult(null);
    try {
      const rawVariants = selectedMockups.map((m) => ({
        colorName: m.color_name,
        imageUrl: m.image_url,
      }));

      const optimizedVariants = await optimizeVariantsForShopify(rawVariants, userId, product.id);

      // Append size chart as the last image for tee products
      const isTee = (product.category || "").toLowerCase().includes("t-shirt") || (product.category || "").toLowerCase().includes("tee");
      if (isTee) {
        optimizedVariants.push({ colorName: "Size Chart", imageUrl: CC1717_SIZE_CHART_URL });
      }

      const { data, error } = await supabase.functions.invoke("push-to-shopify", {
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
