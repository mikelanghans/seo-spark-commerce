import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Store, Loader2, CheckCircle2, ExternalLink } from "lucide-react";
import { toast } from "sonner";

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

interface Props {
  product: Product;
  listings: Listing[];
  userId: string;
}

export const PushToShopify = ({ product, listings, userId }: Props) => {
  const [pushing, setPushing] = useState(false);
  const [result, setResult] = useState<{ success: boolean; url?: string } | null>(null);

  const handlePush = async () => {
    setPushing(true);
    setResult(null);
    try {
      // Fetch mockup images for variants
      const { data: mockups } = await supabase
        .from("product_images")
        .select("image_url, color_name")
        .eq("product_id", product.id)
        .eq("user_id", userId)
        .eq("image_type", "mockup")
        .order("position");

      const variants = (mockups || []).map((m) => ({
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

      const shopifyProduct = data?.shopifyProduct;
      const handle = shopifyProduct?.handle;
      const domain = shopifyProduct ? undefined : undefined; // domain not returned

      setResult({ success: true });
      toast.success("Product pushed to Shopify!");
    } catch (err: any) {
      toast.error(err.message || "Failed to push to Shopify");
      setResult(null);
    } finally {
      setPushing(false);
    }
  };

  return (
    <div className="flex items-center gap-3">
      <Button
        variant="outline"
        size="sm"
        onClick={handlePush}
        disabled={pushing}
        className="gap-2"
      >
        {pushing ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : result?.success ? (
          <CheckCircle2 className="h-4 w-4 text-green-500" />
        ) : (
          <Store className="h-4 w-4" />
        )}
        {pushing ? "Pushing…" : result?.success ? "Pushed!" : "Push to Shopify"}
      </Button>
    </div>
  );
};
