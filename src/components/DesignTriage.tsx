import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Check, X, Loader2, Store, ChevronDown, ChevronUp, Eye, CheckSquare, Square } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Organization {
  id: string;
  name: string;
  niche: string;
  tone: string;
  audience: string;
}

interface UnpushedProduct {
  id: string;
  title: string;
  description: string;
  image_url: string | null;
  category: string;
  price: string;
  shopify_product_id: number | null;
}

interface Props {
  organization: Organization;
  userId: string;
  products: UnpushedProduct[];
  onViewProduct?: (product: UnpushedProduct) => void;
  onProductsPushed?: () => void;
}

export const DesignTriage = ({ organization, userId, products, onViewProduct, onProductsPushed }: Props) => {
  const [expanded, setExpanded] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pushing, setPushing] = useState(false);
  const [dismissed, setDismissed] = useState<Set<string>>(() => {
    try {
      const stored = sessionStorage.getItem(`triage_dismissed_${organization.id}`);
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch { return new Set(); }
  });

  const unpushed = products.filter(
    (p) => p.shopify_product_id === null && !dismissed.has(p.id)
  );

  useEffect(() => {
    // Clean selection when products change
    setSelected((prev) => {
      const validIds = new Set(unpushed.map((p) => p.id));
      const next = new Set([...prev].filter((id) => validIds.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [products]);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === unpushed.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(unpushed.map((p) => p.id)));
    }
  };

  const handleDismiss = (id: string) => {
    setDismissed((prev) => {
      const next = new Set(prev).add(id);
      sessionStorage.setItem(`triage_dismissed_${organization.id}`, JSON.stringify([...next]));
      return next;
    });
    setSelected((prev) => { const n = new Set(prev); n.delete(id); return n; });
  };

  const handlePushSelected = async () => {
    if (selected.size === 0) {
      toast.error("Select at least one product to push");
      return;
    }
    setPushing(true);
    let success = 0;
    let failed = 0;

    for (const productId of selected) {
      const product = unpushed.find((p) => p.id === productId);
      if (!product) continue;

      try {
        // Fetch listing data if available
        const { data: listings } = await supabase
          .from("listings")
          .select("*")
          .eq("product_id", productId)
          .eq("marketplace", "shopify")
          .limit(1);

        const listing = listings?.[0];

        // Fetch product images
        const { data: images } = await supabase
          .from("product_images")
          .select("image_url, color_name, position")
          .eq("product_id", productId)
          .order("position", { ascending: true });

        const imageUrls = (images || []).map((img: any) => img.image_url).filter(Boolean);
        if (product.image_url && !imageUrls.includes(product.image_url)) {
          imageUrls.unshift(product.image_url);
        }

        const tags = listing?.tags
          ? [...(listing.tags as string[]), "T-shirts"]
          : product.description
            .split(/[,\s]+/)
            .filter((w: string) => w.length > 2)
            .slice(0, 5)
            .concat("T-shirts");
        const uniqueTags = [...new Set(tags.map((t: string) => t.trim()).filter(Boolean))];

        const { data, error } = await supabase.functions.invoke("push-to-shopify", {
          body: {
            title: listing?.title || product.title,
            descriptionHtml: `<p>${listing?.description || product.description}</p>`,
            tags: uniqueTags,
            seoTitle: listing?.seo_title || product.title,
            seoDescription: listing?.seo_description || product.description.slice(0, 160),
            handle: listing?.url_handle || product.title.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
            imageUrls,
            altText: listing?.alt_text || product.title,
            status: "draft",
          },
        });

        if (error || data?.error) throw new Error(data?.error || error?.message);

        const shopifyId = data?.productId;
        if (shopifyId) {
          await supabase
            .from("products")
            .update({ shopify_product_id: shopifyId })
            .eq("id", productId);
        }
        success++;
      } catch (err: any) {
        console.error(`Failed to push ${product.title}:`, err);
        failed++;
      }
    }

    setPushing(false);
    setSelected(new Set());

    if (success > 0) {
      toast.success(`Pushed ${success} product${success > 1 ? "s" : ""} to Shopify as drafts`);
      onProductsPushed?.();
    }
    if (failed > 0) {
      toast.error(`${failed} product${failed > 1 ? "s" : ""} failed to push`);
    }
  };

  if (unpushed.length === 0) return null;

  const allSelected = selected.size === unpushed.length && unpushed.length > 0;

  return (
    <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-3">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between"
      >
        <div className="flex items-center gap-2">
          <Store className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Unprocessed Designs</h3>
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
            {unpushed.length}
          </span>
        </div>
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
      </button>

      {expanded && (
        <>
          <p className="text-xs text-muted-foreground">
            Products not yet on Shopify — select and push as drafts, or dismiss to hide.
          </p>

          {/* Toolbar */}
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 h-7 text-xs"
              onClick={toggleAll}
            >
              {allSelected ? <CheckSquare className="h-3.5 w-3.5" /> : <Square className="h-3.5 w-3.5" />}
              {allSelected ? "Deselect all" : "Select all"}
            </Button>
            {selected.size > 0 && (
              <Button
                size="sm"
                className="gap-1.5 h-7 text-xs"
                disabled={pushing}
                onClick={handlePushSelected}
              >
                {pushing ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Store className="h-3 w-3" />
                )}
                Push {selected.size} to Shopify
              </Button>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {unpushed.map((product) => {
              const isSelected = selected.has(product.id);
              return (
                <div
                  key={product.id}
                  className={cn(
                    "group relative rounded-lg border bg-card overflow-hidden transition-all cursor-pointer",
                    isSelected
                      ? "border-primary ring-1 ring-primary/30"
                      : "border-border hover:border-primary/40"
                  )}
                  onClick={() => toggleSelect(product.id)}
                >
                  <div className="h-36 overflow-hidden bg-secondary relative">
                    {product.image_url ? (
                      <img
                        src={product.image_url}
                        alt={product.title}
                        className="h-full w-full object-contain p-2"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center">
                        <Store className="h-8 w-8 text-muted-foreground/30" />
                      </div>
                    )}
                    {/* Selection indicator */}
                    <div className={cn(
                      "absolute top-2 left-2 rounded-md border p-0.5 transition-colors",
                      isSelected
                        ? "bg-primary border-primary text-primary-foreground"
                        : "bg-card/80 border-border text-muted-foreground"
                    )}>
                      {isSelected ? <Check className="h-3.5 w-3.5" /> : <Square className="h-3.5 w-3.5" />}
                    </div>
                  </div>
                  <div className="p-3 space-y-2">
                    <p className="text-xs font-medium leading-snug line-clamp-2">
                      {product.title}
                    </p>
                    <div className="flex items-center gap-1.5">
                      {product.price && (
                        <span className="text-xs text-muted-foreground">{product.price}</span>
                      )}
                      <span className="text-xs text-muted-foreground">•</span>
                      <span className="text-xs text-muted-foreground">{product.category || "Uncategorized"}</span>
                      <div className="flex-1" />
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 w-6 p-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          onViewProduct?.(product);
                        }}
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDismiss(product.id);
                        }}
                        title="Dismiss from triage"
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};
