import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Store, Loader2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { ShopifyPushPreview } from "./ShopifyPushPreview";
import { optimizeVariantsForShopify } from "@/lib/shopifyImageOptimizer";
import { getProductType } from "@/lib/productTypes";

interface Product {
  id: string;
  title: string;
  description: string;
  category: string;
  price: string;
  keywords: string;
  image_url: string | null;
  printify_product_id?: string | null;
  shopify_product_id: number | null;
  size_pricing?: any;
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
  onProductUpdate?: (updates: Partial<Product>) => void;
}

export const PushToShopify = ({ product, listings, userId, organizationId, onProductUpdate }: Props) => {
  const [previewOpen, setPreviewOpen] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [result, setResult] = useState<{ success: boolean } | null>(null);

  const handleConfirm = async (selectedMockups: MockupImage[], updateFields?: string[]) => {
    setPushing(true);
    setResult(null);
    try {
      let linkedShopifyId = product.shopify_product_id ?? null;
      let linkedPrintifyId = product.printify_product_id ?? null;

      if ((!linkedShopifyId || !linkedPrintifyId) && product.id) {
        const { data: latestProductLink } = await supabase
          .from("products")
          .select("shopify_product_id, printify_product_id")
          .eq("id", product.id)
          .maybeSingle();

        linkedShopifyId = latestProductLink?.shopify_product_id ?? linkedShopifyId;
        linkedPrintifyId = latestProductLink?.printify_product_id ?? linkedPrintifyId;

        if (linkedShopifyId && linkedShopifyId !== product.shopify_product_id) {
          onProductUpdate?.({ shopify_product_id: linkedShopifyId });
        }
      }

      if (!linkedShopifyId && !linkedPrintifyId) {
        toast.warning("No linked Shopify product found. Use 'Printify → Shopify' first so it stays connected.");
        return;
      }

      const rawVariants = selectedMockups.map((m) => ({
        colorName: m.color_name,
        imageUrl: m.image_url,
      }));

      const optimizedVariants = await optimizeVariantsForShopify(rawVariants, userId, product.id);

      const typeConfig = getProductType(product.category || "");
      if (typeConfig.sizeChartUrl) {
        optimizedVariants.push({ colorName: "Size Chart", imageUrl: typeConfig.sizeChartUrl });
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
            printify_product_id: linkedPrintifyId,
            shopify_product_id: linkedShopifyId,
            size_pricing: product.size_pricing || undefined,
          },
          listings,
          imageUrl: product.image_url,
          variants: optimizedVariants,
          forceVariants: false,
          // Mirror local mockups exactly: removed mockups should disappear from Shopify too
          replaceAllImages: true,
          ...(updateFields ? { updateFields } : {}),
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      if (data?.staleShopifyIdCleared) {
        onProductUpdate?.({ shopify_product_id: null });
        toast.warning("The linked Shopify product no longer exists. Use 'Printify → Shopify' to recreate it so both stay connected.");
        setResult(null);
        return;
      }

      setResult({ success: true });
      setPreviewOpen(false);
      toast.success("Product pushed to Shopify!");

      // Update local state with the new Shopify product ID
      if (data?.shopifyProduct?.id) {
        onProductUpdate?.({ shopify_product_id: data.shopifyProduct.id });
      }
    } catch (err: any) {
      const msg = err.message || "Failed to push to Shopify";
      if (msg.includes("No Shopify connection") || msg.includes("credentials")) {
        toast.error("No Shopify connection found. Connect your store in Settings → Marketplace.");
      } else {
        toast.error(msg);
      }
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
