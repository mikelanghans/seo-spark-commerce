import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, FolderOpen, RefreshCw, ExternalLink, Layers, Zap } from "lucide-react";
import { toast } from "sonner";
import type { Organization, Product } from "@/types/dashboard";

interface ShopifyCollection {
  id: number;
  title: string;
  handle: string;
  body_html: string | null;
  image: { src: string; alt: string } | null;
  products_count: number;
  published_at: string | null;
  sort_order: string;
  updated_at: string;
  collection_type: "custom" | "smart";
  rules?: Array<{ column: string; relation: string; condition: string }>;
  disjunctive?: boolean;
}

interface Props {
  organization: Organization;
  products: Product[];
}

export const ShopifyCollections = ({ organization, products }: Props) => {
  const [collections, setCollections] = useState<ShopifyCollection[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const fetchCollections = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("fetch-shopify-collections", {
        body: { organizationId: organization.id },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setCollections(data.collections || []);
      setLoaded(true);
    } catch (err: any) {
      toast.error(err.message || "Failed to fetch collections");
    } finally {
      setLoading(false);
    }
  };

  const shopifyProducts = products.filter((p) => p.shopify_product_id);

  if (!loaded) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4">
        <FolderOpen className="h-10 w-10 text-muted-foreground" />
        <div className="text-center space-y-1">
          <h3 className="font-semibold text-lg">Shopify Collections</h3>
          <p className="text-sm text-muted-foreground max-w-md">
            View your Shopify collections and see which of your products belong to each one.
          </p>
        </div>
        <Button onClick={fetchCollections} disabled={loading} className="gap-2">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderOpen className="h-4 w-4" />}
          Load Collections
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-lg flex items-center gap-2">
            <FolderOpen className="h-5 w-5 text-primary" />
            Collections
            <Badge variant="secondary" className="ml-1">{collections.length}</Badge>
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {shopifyProducts.length} of {products.length} products synced with Shopify
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchCollections} disabled={loading} className="gap-2">
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Refresh
        </Button>
      </div>

      {collections.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground">
          <p className="text-sm">No collections found in your Shopify store.</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {collections.map((collection) => (
            <CollectionCard key={collection.id} collection={collection} />
          ))}
        </div>
      )}
    </div>
  );
};

const CollectionCard = ({ collection }: { collection: ShopifyCollection }) => {
  const storeDomain = ""; // We don't expose the domain client-side

  return (
    <div className="group rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/30">
      <div className="flex gap-3">
        {collection.image ? (
          <img
            src={collection.image.src}
            alt={collection.image.alt || collection.title}
            className="h-16 w-16 rounded-lg object-cover flex-shrink-0"
          />
        ) : (
          <div className="h-16 w-16 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
            <FolderOpen className="h-6 w-6 text-muted-foreground" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <h4 className="font-medium text-sm truncate">{collection.title}</h4>
            <Badge
              variant="outline"
              className="flex-shrink-0 text-[10px] gap-1"
            >
              {collection.collection_type === "smart" ? (
                <><Zap className="h-2.5 w-2.5" /> Smart</>
              ) : (
                <><Layers className="h-2.5 w-2.5" /> Manual</>
              )}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {collection.products_count} product{collection.products_count !== 1 ? "s" : ""}
          </p>
          {collection.body_html && (
            <p
              className="text-xs text-muted-foreground mt-1 line-clamp-2"
              dangerouslySetInnerHTML={{
                __html: collection.body_html.replace(/<[^>]*>/g, "").slice(0, 120),
              }}
            />
          )}
          {collection.collection_type === "smart" && collection.rules && collection.rules.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {collection.rules.slice(0, 3).map((rule, i) => (
                <Badge key={i} variant="secondary" className="text-[10px]">
                  {rule.column}: {rule.condition}
                </Badge>
              ))}
              {collection.rules.length > 3 && (
                <Badge variant="secondary" className="text-[10px]">
                  +{collection.rules.length - 3} more
                </Badge>
              )}
            </div>
          )}
          {!collection.published_at && (
            <Badge variant="outline" className="mt-1.5 text-[10px] text-amber-500 border-amber-500/30">
              Unpublished
            </Badge>
          )}
        </div>
      </div>
    </div>
  );
};
