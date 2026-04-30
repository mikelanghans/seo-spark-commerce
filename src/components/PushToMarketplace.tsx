import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { ShoppingBag, Package, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { UpdateFieldSelector } from "@/components/UpdateFieldSelector";

interface Product {
  id: string;
  title: string;
  description: string;
  category: string;
  price: string;
  image_url: string | null;
  etsy_listing_id?: string | null;
  ebay_listing_id?: string | null;
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

const isPublishedEbayListingId = (value?: string | null) => !!value && !/^BA-[a-z0-9-]+$/i.test(value);

const ETSY_UPDATE_FIELDS = [
  { key: "title", label: "Title" },
  { key: "description", label: "Description" },
  { key: "tags", label: "Tags" },
  { key: "pricing", label: "Pricing" },
];

const EBAY_UPDATE_FIELDS = [
  { key: "title", label: "Title" },
  { key: "description", label: "Description" },
  { key: "images", label: "Images" },
];

export const PushToMarketplace = ({ product, listings, images, userId, enabledChannels }: Props) => {
  const showEtsy = !enabledChannels || enabledChannels.includes("etsy");
  const showEbay = !enabledChannels || enabledChannels.includes("ebay");
  const [pushingEtsy, setPushingEtsy] = useState(false);
  const [pushingEbay, setPushingEbay] = useState(false);
  const [etsyResult, setEtsyResult] = useState<PushResult | null>(null);
  const [ebayResult, setEbayResult] = useState<PushResult | null>(null);

  // Update dialog state
  const [updateDialog, setUpdateDialog] = useState<"etsy" | "ebay" | null>(null);
  const [selectedEtsyFields, setSelectedEtsyFields] = useState<string[]>(ETSY_UPDATE_FIELDS.map(f => f.key));
  const [selectedEbayFields, setSelectedEbayFields] = useState<string[]>(EBAY_UPDATE_FIELDS.map(f => f.key));
  const [updatingEtsy, setUpdatingEtsy] = useState(false);
  const [updatingEbay, setUpdatingEbay] = useState(false);

  const toggleField = (fields: string[], setFields: (f: string[]) => void, key: string) => {
    setFields(fields.includes(key) ? fields.filter(f => f !== key) : [...fields, key]);
  };

  const getListing = (marketplace: string) => {
    return listings.find((l) => l.marketplace === marketplace) ||
           listings.find((l) => l.marketplace === "etsy") ||
           listings.find((l) => l.marketplace === "shopify") ||
           listings[0];
  };

  const pushToEtsy = async (updateFields?: string[]) => {
    const isUpdate = !!updateFields;
    if (isUpdate) setUpdatingEtsy(true); else setPushingEtsy(true);
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
          ...(updateFields ? { updateFields } : {}),
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setEtsyResult({ success: true, action: data.action });
      toast.success(`Etsy listing ${data.action || "pushed"}!`);
      if (isUpdate) setUpdateDialog(null);
    } catch (e: any) {
      setEtsyResult({ success: false, error: e.message });
      toast.error(e.message || "Failed to push to Etsy");
    } finally {
      if (isUpdate) setUpdatingEtsy(false); else setPushingEtsy(false);
    }
  };

  const pushToEbay = async (updateFields?: string[]) => {
    const isUpdate = !!updateFields;
    if (isUpdate) setUpdatingEbay(true); else setPushingEbay(true);
    setEbayResult(null);
    try {
      const listing = getListing("ebay");
      if (!listing) { toast.error("No listing found. Generate one first."); return; }

      // Fetch bullet_points from DB (not present on the trimmed Listing prop)
      const { data: listingRow } = await supabase
        .from("listings")
        .select("bullet_points")
        .eq("product_id", product.id)
        .eq("marketplace", listing.marketplace)
        .maybeSingle();
      const bulletPoints: string[] = Array.isArray(listingRow?.bullet_points)
        ? (listingRow!.bullet_points as any[]).map((b) => String(b)).filter(Boolean)
        : [];

      // Fetch all product images so eBay receives mockups only (never the raw design)
      const { data: imgs } = await supabase
        .from("product_images")
        .select("image_url, position, image_type")
        .eq("product_id", product.id)
        .order("position", { ascending: true });
      const mockupsOnly = (imgs || [])
        .filter((img: any) => img.image_type === "mockup")
        .sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0));
      const ebayImages = mockupsOnly.length > 0
        ? mockupsOnly.map((img: any) => ({ image_url: img.image_url }))
        : images
            .filter((img: any) => (img as any).image_type !== "design")
            .map((img) => ({ image_url: img.image_url }));

      if (ebayImages.length === 0) {
        toast.error("No mockup images found. Generate mockups before pushing to eBay.");
        return;
      }

      const { data, error } = await supabase.functions.invoke("push-to-ebay", {
        body: {
          userId,
          productId: product.id,
          listing: { ...listing, price: product.price },
          images: ebayImages,
          ...(updateFields ? { updateFields } : {}),
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setEbayResult({ success: true, action: data.action });
      toast.success(`eBay listing ${data.action || "pushed"}!`);
      if (isUpdate) setUpdateDialog(null);
    } catch (e: any) {
      setEbayResult({ success: false, error: e.message });
      toast.error(e.message || "Failed to push to eBay");
    } finally {
      if (isUpdate) setUpdatingEbay(false); else setPushingEbay(false);
    }
  };

  const etsyIsExisting = !!product.etsy_listing_id;
  const ebayIsExisting = isPublishedEbayListingId(product.ebay_listing_id);

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {showEtsy && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => etsyIsExisting ? setUpdateDialog("etsy") : pushToEtsy()}
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
            onClick={() => ebayIsExisting ? setUpdateDialog("ebay") : pushToEbay()}
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

      {/* Etsy Update Dialog */}
      <Dialog open={updateDialog === "etsy"} onOpenChange={(open) => !open && setUpdateDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShoppingBag className="h-5 w-5 text-orange-500" />
              Update on Etsy
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <UpdateFieldSelector
              fields={ETSY_UPDATE_FIELDS}
              selectedFields={selectedEtsyFields}
              onToggleField={(key) => toggleField(selectedEtsyFields, setSelectedEtsyFields, key)}
              onSelectAll={() => setSelectedEtsyFields(ETSY_UPDATE_FIELDS.map(f => f.key))}
              onDeselectAll={() => setSelectedEtsyFields([])}
              onUpdate={() => pushToEtsy(selectedEtsyFields)}
              updating={updatingEtsy}
              platformName="Etsy"
            />
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">or</span>
              </div>
            </div>
            <Button
              onClick={() => { setUpdateDialog(null); pushToEtsy(); }}
              disabled={pushingEtsy}
              variant="outline"
              className="w-full gap-2"
            >
              <ShoppingBag className="h-4 w-4" />
              Full Push to Etsy
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* eBay Update Dialog */}
      <Dialog open={updateDialog === "ebay"} onOpenChange={(open) => !open && setUpdateDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="h-5 w-5 text-blue-500" />
              Update on eBay
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <UpdateFieldSelector
              fields={EBAY_UPDATE_FIELDS}
              selectedFields={selectedEbayFields}
              onToggleField={(key) => toggleField(selectedEbayFields, setSelectedEbayFields, key)}
              onSelectAll={() => setSelectedEbayFields(EBAY_UPDATE_FIELDS.map(f => f.key))}
              onDeselectAll={() => setSelectedEbayFields([])}
              onUpdate={() => pushToEbay(selectedEbayFields)}
              updating={updatingEbay}
              platformName="eBay"
            />
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">or</span>
              </div>
            </div>
            <Button
              onClick={() => { setUpdateDialog(null); pushToEbay(); }}
              disabled={pushingEbay}
              variant="outline"
              className="w-full gap-2"
            >
              <Package className="h-4 w-4" />
              Full Push to eBay
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
