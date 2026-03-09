import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  ArrowLeft, Store, Loader2, CheckCircle2, XCircle, AlertTriangle,
  RefreshCw, ChevronDown, ChevronUp, Sparkles, Search,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface Organization {
  id: string;
  name: string;
  niche: string;
  tone: string;
  audience: string;
}

interface Props {
  organization: Organization;
  userId: string;
  onComplete: () => void;
  onBack: () => void;
}

interface ShopifyProduct {
  id: number;
  title: string;
  body_html: string;
  product_type: string;
  tags: string;
  handle: string;
  images: { id: number; src: string; alt: string | null }[];
  variants: { id: number; price: string; title: string }[];
  status: string;
}

interface EnrichItem {
  shopifyProduct: ShopifyProduct;
  status: "pending" | "enriching" | "pushing" | "done" | "error";
  error?: string;
  newTitle?: string;
  newDescription?: string;
  newTags?: string;
  newSeoTitle?: string;
  newSeoDescription?: string;
}

export const ShopifyEnrich = ({ organization, userId, onComplete, onBack }: Props) => {
  const [items, setItems] = useState<EnrichItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [expandedItem, setExpandedItem] = useState<number | null>(null);

  const totalDone = items.filter((i) => i.status === "done").length;
  const totalErrors = items.filter((i) => i.status === "error").length;
  const progress = items.length > 0 ? ((totalDone + totalErrors) / items.length) * 100 : 0;
  const isDone = !running && !loading && items.length > 0 && totalDone + totalErrors === items.length;

  const updateItem = (index: number, updates: Partial<EnrichItem>) => {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...updates } : item)));
  };

  const fetchProducts = async () => {
    setLoading(true);
    setItems([]);
    try {
      const allProducts: ShopifyProduct[] = [];
      let pageInfo: string | null = null;

      // Paginate through all products
      do {
        const { data, error } = await supabase.functions.invoke("fetch-shopify-products", {
          body: { limit: 50, pageInfo },
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);

        allProducts.push(...(data.products || []));
        pageInfo = data.nextPageInfo || null;
      } while (pageInfo);

      if (allProducts.length === 0) {
        toast.error("No products found in your Shopify store.");
        setLoading(false);
        return;
      }

      setItems(allProducts.map((p) => ({ shopifyProduct: p, status: "pending" })));
      toast.success(`Fetched ${allProducts.length} products from Shopify`);
    } catch (err: any) {
      toast.error(err.message || "Failed to fetch products from Shopify");
    } finally {
      setLoading(false);
    }
  };

  const enrichAndPush = async () => {
    setRunning(true);

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      try {
        // Step 1: Generate SEO-optimized content via AI
        updateItem(i, { status: "enriching" });

        const product = item.shopifyProduct;
        const productData = {
          title: product.title,
          description: product.body_html?.replace(/<[^>]*>/g, "") || "",
          keywords: product.tags || "",
          category: product.product_type || "",
          price: product.variants?.[0]?.price || "",
          features: "",
        };

        const { data: listings, error: listError } = await supabase.functions.invoke("generate-listings", {
          body: {
            business: {
              name: organization.name,
              niche: organization.niche,
              tone: organization.tone,
              audience: organization.audience,
            },
            product: productData,
          },
        });
        if (listError) throw new Error(`AI enrichment failed: ${listError.message}`);
        if (listings?.error) throw new Error(`AI enrichment failed: ${listings.error}`);

        const shopifyListing = listings?.shopify;
        if (!shopifyListing) throw new Error("No Shopify listing generated");

        updateItem(i, {
          newTitle: shopifyListing.title,
          newDescription: shopifyListing.description,
          newTags: shopifyListing.tags?.join(", "),
          newSeoTitle: shopifyListing.seoTitle,
          newSeoDescription: shopifyListing.seoDescription,
        });

        // Step 2: Push updates back to Shopify
        updateItem(i, { status: "pushing" });

        const { data: pushResult, error: pushError } = await supabase.functions.invoke("update-shopify-product", {
          body: {
            shopifyProductId: product.id,
            updates: {
              title: shopifyListing.title,
              body_html: `<p>${shopifyListing.description}</p>`,
              tags: shopifyListing.tags?.join(", "),
              handle: shopifyListing.urlHandle,
              metafields_global_title_tag: shopifyListing.seoTitle,
              metafields_global_description_tag: shopifyListing.seoDescription,
              product_type: productData.category || product.product_type,
            },
          },
        });
        if (pushError) throw new Error(`Shopify update failed: ${pushError.message}`);
        if (pushResult?.error) throw new Error(`Shopify update failed: ${pushResult.error}`);

        updateItem(i, { status: "done" });
      } catch (err: any) {
        console.error(`Enrich error for ${item.shopifyProduct.title}:`, err);
        updateItem(i, { status: "error", error: err.message });
      }

      // Small delay to avoid rate limits
      if (i < items.length - 1) {
        await new Promise((r) => setTimeout(r, 1500));
      }
    }

    setRunning(false);
    toast.success(`Enrichment complete! ${items.length} products processed.`);
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <Button type="button" variant="ghost" size="icon" onClick={onBack} disabled={running}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Store className="h-6 w-6 text-primary" />
            Shopify Enrich & Sync
          </h2>
          <p className="text-sm text-muted-foreground">
            Pull your existing Shopify products → AI rewrites titles, descriptions & SEO → push updates back
          </p>
        </div>
      </div>

      {/* Initial state */}
      {items.length === 0 && !loading && (
        <div className="space-y-6">
          <div className="rounded-xl border border-border bg-card p-6 space-y-4">
            <h3 className="font-semibold flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              What this does
            </h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex items-start gap-2">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                Fetches all products from your connected Shopify store
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                AI generates SEO-optimized titles, descriptions, tags, meta titles & meta descriptions
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                Pushes the updated content back to your Shopify store
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                Uses your brand context ({organization.name}, {organization.tone} tone) for consistent voice
              </li>
            </ul>
          </div>

          <Button onClick={fetchProducts} disabled={loading} className="gap-2 w-full py-6 text-base" size="lg">
            {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Store className="h-5 w-5" />}
            Fetch Products from Shopify
          </Button>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary mb-3" />
          <p className="text-sm text-muted-foreground">Fetching products from Shopify…</p>
        </div>
      )}

      {/* Products fetched, ready to enrich */}
      {items.length > 0 && (
        <div className="space-y-4">
          {!running && !isDone && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {items.length} products ready to enrich with AI-optimized SEO content
              </p>
              <Button onClick={enrichAndPush} className="gap-2">
                <Sparkles className="h-4 w-4" /> Enrich & Push All
              </Button>
            </div>
          )}

          {/* Progress */}
          {(running || isDone) && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  {running ? `Processing… ${totalDone} done` : "Complete"}
                </span>
                <span className="font-medium">{totalDone + totalErrors} / {items.length}</span>
              </div>
              <Progress value={progress} className="h-2" />
            </div>
          )}

          {isDone && (
            <div className="flex items-center gap-4 rounded-lg bg-secondary/50 p-4">
              {totalErrors === 0 ? (
                <CheckCircle2 className="h-5 w-5 shrink-0 text-green-500" />
              ) : (
                <AlertTriangle className="h-5 w-5 shrink-0 text-yellow-500" />
              )}
              <p className="text-sm">
                <span className="font-medium">{totalDone} products</span> enriched & synced
                {totalErrors > 0 && <span className="text-muted-foreground"> • {totalErrors} failed</span>}
              </p>
            </div>
          )}

          {/* Item list */}
          <div className="max-h-96 space-y-2 overflow-y-auto">
            {items.map((item, i) => (
              <div key={i} className="rounded-lg border border-border bg-card overflow-hidden">
                <button
                  type="button"
                  className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm"
                  onClick={() => setExpandedItem(expandedItem === i ? null : i)}
                >
                  {item.status === "pending" && <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/30" />}
                  {item.status === "enriching" && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
                  {item.status === "pushing" && <Loader2 className="h-4 w-4 animate-spin text-blue-500" />}
                  {item.status === "done" && <CheckCircle2 className="h-4 w-4 text-green-500" />}
                  {item.status === "error" && <XCircle className="h-4 w-4 text-destructive" />}

                  <div className="flex-1 min-w-0">
                    <span className="font-medium truncate block">{item.shopifyProduct.title}</span>
                    {item.status === "enriching" && <span className="text-xs text-muted-foreground">Generating SEO content…</span>}
                    {item.status === "pushing" && <span className="text-xs text-muted-foreground">Updating Shopify…</span>}
                    {item.status === "error" && <span className="text-xs text-destructive">{item.error}</span>}
                  </div>

                  {item.status === "done" && (
                    expandedItem === i ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  )}
                </button>

                {expandedItem === i && item.status === "done" && (
                  <div className="border-t border-border px-4 py-3 space-y-2 text-xs">
                    <div>
                      <span className="font-semibold text-muted-foreground">New Title:</span>
                      <p className="text-foreground">{item.newTitle}</p>
                    </div>
                    {item.newSeoTitle && (
                      <div>
                        <span className="font-semibold text-muted-foreground">SEO Title:</span>
                        <p className="text-foreground">{item.newSeoTitle}</p>
                      </div>
                    )}
                    {item.newSeoDescription && (
                      <div>
                        <span className="font-semibold text-muted-foreground">Meta Description:</span>
                        <p className="text-foreground">{item.newSeoDescription}</p>
                      </div>
                    )}
                    {item.newTags && (
                      <div>
                        <span className="font-semibold text-muted-foreground">Tags:</span>
                        <p className="text-foreground">{item.newTags}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {isDone && (
            <div className="flex justify-end">
              <Button onClick={onComplete} className="gap-2">
                <CheckCircle2 className="h-4 w-4" /> Done
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
