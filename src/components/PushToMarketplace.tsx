import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ShoppingBag, Package, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { toast } from "sonner";

interface Product {
  id: string;
  title: string;
  description: string;
  category: string;
  price: string;
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
  images: MockupImage[];
  userId: string;
  enabledChannels?: string[];
}

type PushResult = {
  success: boolean;
  action?: string;
  error?: string;
};

export const PushToMarketplace = ({ product, listings, images, userId, enabledChannels }: Props) => {
  const showEtsy = !enabledChannels || enabledChannels.includes("etsy");
  const showEbay = !enabledChannels || enabledChannels.includes("ebay");
  const [pushingEtsy, setPushingEtsy] = useState(false);
  const [pushingEbay, setPushingEbay] = useState(false);
  const [etsyResult, setEtsyResult] = useState<PushResult | null>(null);
  const [ebayResult, setEbayResult] = useState<PushResult | null>(null);

  const getListing = (marketplace: string) => {
    // Try marketplace-specific listing first, fall back to any available
    return listings.find((l) => l.marketplace === marketplace) ||
           listings.find((l) => l.marketplace === "etsy") ||
           listings.find((l) => l.marketplace === "shopify") ||
           listings[0];
  };

  const pushToEtsy = async () => {
    setPushingEtsy(true);
    setEtsyResult(null);
    try {
      const listing = getListing("etsy");
      if (!listing) { toast.error("No listing found. Generate one first."); return; }

      const { data, error } = await supabase.functions.invoke("push-to-etsy", {
        body: {
          userId,
          productId: product.id,
          listing: { ...listing, price: product.price },
          images: images.map((img) => ({ image_url: img.image_url })),
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setEtsyResult({ success: true, action: data.action });
      toast.success(`Etsy listing ${data.action || "pushed"}!`);
    } catch (e: any) {
      setEtsyResult({ success: false, error: e.message });
      toast.error(e.message || "Failed to push to Etsy");
    } finally {
      setPushingEtsy(false);
    }
  };

  const pushToEbay = async () => {
    setPushingEbay(true);
    setEbayResult(null);
    try {
      const listing = getListing("ebay");
      if (!listing) { toast.error("No listing found. Generate one first."); return; }

      const { data, error } = await supabase.functions.invoke("push-to-ebay", {
        body: {
          userId,
          productId: product.id,
          listing: { ...listing, price: product.price },
          images: images.map((img) => ({ image_url: img.image_url })),
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setEbayResult({ success: true, action: data.action });
      toast.success(`eBay listing ${data.action || "pushed"}!`);
    } catch (e: any) {
      setEbayResult({ success: false, error: e.message });
      toast.error(e.message || "Failed to push to eBay");
    } finally {
      setPushingEbay(false);
    }
  };




  return (
    <div className="flex flex-wrap gap-2">
      {showEtsy && (
        <Button
          variant="outline"
          size="sm"
          onClick={pushToEtsy}
          disabled={pushingEtsy || listings.length === 0}
          className="gap-2"
        >
          {pushingEtsy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : etsyResult?.success ? (
            <CheckCircle2 className="h-4 w-4 text-green-500" />
          ) : etsyResult && !etsyResult.success ? (
            <AlertCircle className="h-4 w-4 text-destructive" />
          ) : (
            <ShoppingBag className="h-4 w-4 text-orange-500" />
          )}
          {etsyResult?.success ? `Etsy ${etsyResult.action}` : "Push to Etsy"}
        </Button>
      )}

      {showEbay && (
        <Button
          variant="outline"
          size="sm"
          onClick={pushToEbay}
          disabled={pushingEbay || listings.length === 0}
          className="gap-2"
        >
          {pushingEbay ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : ebayResult?.success ? (
            <CheckCircle2 className="h-4 w-4 text-green-500" />
          ) : ebayResult && !ebayResult.success ? (
            <AlertCircle className="h-4 w-4 text-destructive" />
          ) : (
            <Package className="h-4 w-4 text-blue-500" />
          )}
          {ebayResult?.success ? `eBay ${ebayResult.action}` : "Push to eBay"}
        </Button>
      )}

    </div>
  );
};
