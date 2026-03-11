import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Store, Loader2, ImageIcon, Search, Tag } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

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
  bulletPoints?: string[];
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
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: Product;
  listings: Listing[];
  userId: string;
  onConfirm: (selectedMockups: MockupImage[]) => void;
  pushing: boolean;
}

export const ShopifyPushPreview = ({
  open,
  onOpenChange,
  product,
  listings,
  userId,
  onConfirm,
  pushing,
}: Props) => {
  const [mockups, setMockups] = useState<MockupImage[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loadingMockups, setLoadingMockups] = useState(false);

  const shopifyListing = listings?.find((l) => l.marketplace === "shopify");
  const listing = shopifyListing || listings?.[0];

  useEffect(() => {
    if (open) {
      loadMockups();
    }
  }, [open, product.id]);

  const loadMockups = async () => {
    setLoadingMockups(true);
    const { data } = await supabase
      .from("product_images")
      .select("id, image_url, color_name, position")
      .eq("product_id", product.id)
      .eq("user_id", userId)
      .eq("image_type", "mockup")
      .order("position");
    const items = (data as MockupImage[]) || [];
    setMockups(items);
    setSelectedIds(new Set(items.map((m) => m.id)));
    setLoadingMockups(false);
  };

  const toggleMockup = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => setSelectedIds(new Set(mockups.map((m) => m.id)));
  const selectNone = () => setSelectedIds(new Set());

  const selectedMockups = mockups.filter((m) => selectedIds.has(m.id));

  if (!listing) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Store className="h-5 w-5 text-primary" />
            Review Before Pushing to Shopify
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* Product Image + Title */}
          <div className="flex gap-4">
            {product.image_url && (
              <div className="h-24 w-24 shrink-0 overflow-hidden rounded-lg border border-border bg-secondary">
                <img
                  src={product.image_url}
                  alt={product.title}
                  className="h-full w-full object-contain p-1"
                />
              </div>
            )}
            <div className="flex-1 space-y-1">
              <h3 className="text-base font-semibold">{listing.title || product.title}</h3>
              <p className="text-xs text-muted-foreground">{product.category} · {product.price}</p>
            </div>
          </div>

          <Separator />

          {/* Description + Bullet Points */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Description
            </label>
            <p className="mt-1 text-sm leading-relaxed text-secondary-foreground whitespace-pre-line">
              {listing.description || product.description}
            </p>
            {listing.bulletPoints?.length > 0 && (
              <ul className="mt-3 space-y-1 list-disc list-inside text-sm text-secondary-foreground">
                {listing.bulletPoints.map((bp: string, idx: number) => (
                  <li key={idx}>{bp}</li>
                ))}
              </ul>
            )}
          </div>

          {/* Tags */}
          {listing.tags?.length > 0 && (
            <div>
              <div className="mb-1.5 flex items-center gap-1.5">
                <Tag className="h-3.5 w-3.5 text-muted-foreground" />
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Tags
                </label>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {listing.tags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="text-xs">
                    {tag}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* SEO */}
          {(listing.seo_title || listing.seo_description || listing.url_handle) && (
            <div className="rounded-lg border border-border bg-secondary/30 p-3 space-y-2">
              <div className="flex items-center gap-1.5">
                <Search className="h-3.5 w-3.5 text-primary" />
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  SEO
                </span>
              </div>
              {listing.seo_title && (
                <p className="text-sm font-medium">{listing.seo_title}</p>
              )}
              {listing.seo_description && (
                <p className="text-xs text-muted-foreground">{listing.seo_description}</p>
              )}
              {listing.url_handle && (
                <p className="text-xs font-mono text-muted-foreground">/{listing.url_handle}</p>
              )}
            </div>
          )}

          <Separator />

          {/* Mockup Image Selection */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <ImageIcon className="h-3.5 w-3.5 text-muted-foreground" />
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Color Variants to Push
                </label>
              </div>
              {mockups.length > 0 && (
                <div className="flex gap-2">
                  <button
                    onClick={selectAll}
                    className="text-xs text-primary hover:underline"
                  >
                    Select all
                  </button>
                  <button
                    onClick={selectNone}
                    className="text-xs text-muted-foreground hover:underline"
                  >
                    Clear
                  </button>
                </div>
              )}
            </div>

            {loadingMockups ? (
              <div className="flex justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : mockups.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border py-6 text-center">
                <ImageIcon className="mx-auto h-8 w-8 text-muted-foreground" />
                <p className="mt-2 text-xs text-muted-foreground">
                  No mockups available. Product will be pushed without color variants.
                </p>
              </div>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {mockups.map((mockup) => {
                  const selected = selectedIds.has(mockup.id);
                  return (
                    <button
                      key={mockup.id}
                      type="button"
                      onClick={() => toggleMockup(mockup.id)}
                      className={`group relative rounded-lg border-2 overflow-hidden transition-all ${
                        selected
                          ? "border-primary ring-1 ring-primary/20"
                          : "border-border hover:border-muted-foreground/30"
                      }`}
                    >
                      <div className="h-28 overflow-hidden bg-secondary">
                        <img
                          src={mockup.image_url}
                          alt={mockup.color_name}
                          className="h-full w-full object-contain p-1"
                        />
                      </div>
                      <div className="flex items-center gap-2 px-2 py-1.5">
                        <Checkbox
                          checked={selected}
                          className="pointer-events-none"
                        />
                        <span className="truncate text-xs font-medium">
                          {mockup.color_name || "Untitled"}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="mt-4 gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pushing}
          >
            Cancel
          </Button>
          <Button
            onClick={() => onConfirm(selectedMockups)}
            disabled={pushing}
            className="gap-2"
          >
            {pushing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Store className="h-4 w-4" />
            )}
            {pushing
              ? "Pushing…"
              : `Push to Shopify${selectedMockups.length > 0 ? ` (${selectedMockups.length} variant${selectedMockups.length !== 1 ? "s" : ""})` : ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
