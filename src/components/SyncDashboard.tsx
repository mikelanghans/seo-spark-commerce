import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Store, ShoppingBag, Package, Facebook, CheckCircle2, XCircle, Search, ArrowUpDown, ExternalLink } from "lucide-react";

interface Product {
  id: string;
  title: string;
  image_url: string | null;
  shopify_product_id: number | null;
  etsy_listing_id?: string | null;
  ebay_listing_id?: string | null;
  meta_listing_id?: string | null;
  category: string;
  price: string;
}

type SortKey = "title" | "synced" | "price";
type SortDir = "asc" | "desc";

const MARKETPLACES = [
  { id: "shopify", label: "Shopify", icon: Store, color: "text-green-600 dark:text-green-400", bgColor: "bg-green-500/15" },
  { id: "etsy", label: "Etsy", icon: ShoppingBag, color: "text-orange-600 dark:text-orange-400", bgColor: "bg-orange-500/15" },
  { id: "ebay", label: "eBay", icon: Package, color: "text-blue-600 dark:text-blue-400", bgColor: "bg-blue-500/15" },
  { id: "meta", label: "Meta", icon: Facebook, color: "text-blue-700 dark:text-blue-300", bgColor: "bg-blue-600/15" },
] as const;

function getListingId(product: Product, marketplace: string): string | null {
  if (marketplace === "shopify") return product.shopify_product_id?.toString() || null;
  if (marketplace === "etsy") return (product as any).etsy_listing_id || null;
  if (marketplace === "ebay") return (product as any).ebay_listing_id || null;
  if (marketplace === "meta") return (product as any).meta_listing_id || null;
  return null;
}

function getSyncCount(product: Product): number {
  return MARKETPLACES.filter((m) => getListingId(product, m.id)).length;
}

export function SyncDashboard({
  products,
  onSelectProduct,
}: {
  products: Product[];
  onSelectProduct?: (productId: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("title");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [filterMarketplace, setFilterMarketplace] = useState<string | null>(null);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  };

  const filtered = useMemo(() => {
    let list = products;

    if (search) {
      const q = search.toLowerCase();
      list = list.filter((p) => p.title.toLowerCase().includes(q));
    }

    if (filterMarketplace) {
      if (filterMarketplace === "unsynced") {
        list = list.filter((p) => getSyncCount(p) === 0);
      } else {
        list = list.filter((p) => !!getListingId(p, filterMarketplace));
      }
    }

    list = [...list].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "title") cmp = a.title.localeCompare(b.title);
      else if (sortKey === "synced") cmp = getSyncCount(a) - getSyncCount(b);
      else if (sortKey === "price") cmp = parseFloat(a.price || "0") - parseFloat(b.price || "0");
      return sortDir === "desc" ? -cmp : cmp;
    });

    return list;
  }, [products, search, sortKey, sortDir, filterMarketplace]);

  // Stats
  const totalProducts = products.length;
  const syncedToAll = products.filter((p) => getSyncCount(p) === MARKETPLACES.length).length;
  const unsynced = products.filter((p) => getSyncCount(p) === 0).length;
  const partialSync = totalProducts - syncedToAll - unsynced;

  const marketplaceStats = MARKETPLACES.map((m) => ({
    ...m,
    count: products.filter((p) => !!getListingId(p, m.id)).length,
  }));

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-lg font-semibold">Multi-Store Sync</h3>
        <p className="text-sm text-muted-foreground">Track which products are listed across your connected marketplaces</p>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <button
          onClick={() => setFilterMarketplace(null)}
          className={`rounded-xl border p-3 text-left transition-colors ${!filterMarketplace ? "border-primary bg-primary/5" : "border-border bg-card hover:bg-accent/50"}`}
        >
          <p className="text-2xl font-bold">{totalProducts}</p>
          <p className="text-xs text-muted-foreground">Total Products</p>
        </button>
        <button
          onClick={() => setFilterMarketplace(filterMarketplace === "unsynced" ? null : "unsynced")}
          className={`rounded-xl border p-3 text-left transition-colors ${filterMarketplace === "unsynced" ? "border-destructive bg-destructive/5" : "border-border bg-card hover:bg-accent/50"}`}
        >
          <p className="text-2xl font-bold text-destructive">{unsynced}</p>
          <p className="text-xs text-muted-foreground">Not Listed</p>
        </button>
        <div className="rounded-xl border border-border bg-card p-3">
          <p className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">{partialSync}</p>
          <p className="text-xs text-muted-foreground">Partial Sync</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-3">
          <p className="text-2xl font-bold text-green-600 dark:text-green-400">{syncedToAll}</p>
          <p className="text-xs text-muted-foreground">Fully Synced</p>
        </div>
      </div>

      {/* Marketplace filter chips */}
      <div className="flex flex-wrap gap-2">
        {marketplaceStats.map((m) => {
          const Icon = m.icon;
          const active = filterMarketplace === m.id;
          return (
            <button
              key={m.id}
              onClick={() => setFilterMarketplace(active ? null : m.id)}
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                active ? `border-primary ${m.bgColor} ${m.color}` : "border-border bg-card text-muted-foreground hover:bg-accent/50"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              <span>{m.label}</span>
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 min-w-[20px] justify-center">
                {m.count}
              </Badge>
            </button>
          );
        })}
      </div>

      {/* Search & sort */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search products…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button variant="outline" size="sm" onClick={() => toggleSort("synced")} className="gap-1 text-xs">
          <ArrowUpDown className="h-3 w-3" /> Sync Status
        </Button>
      </div>

      {/* Product table */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center">
          <p className="text-muted-foreground">No products match your filters</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          {/* Header */}
          <div className="hidden sm:grid grid-cols-[1fr_repeat(4,80px)] gap-2 px-4 py-2 bg-muted/50 text-xs font-medium text-muted-foreground">
            <button onClick={() => toggleSort("title")} className="text-left flex items-center gap-1">
              Product <ArrowUpDown className="h-3 w-3" />
            </button>
            {MARKETPLACES.map((m) => {
              const Icon = m.icon;
              return (
                <div key={m.id} className="text-center flex items-center justify-center gap-1">
                  <Icon className={`h-3 w-3 ${m.color}`} />
                  <span>{m.label}</span>
                </div>
              );
            })}
          </div>

          {/* Rows */}
          <div className="divide-y divide-border">
            {filtered.map((product) => (
              <div
                key={product.id}
                className="grid grid-cols-[1fr] sm:grid-cols-[1fr_repeat(4,80px)] gap-2 px-4 py-3 hover:bg-accent/30 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  {product.image_url ? (
                    <img
                      src={product.image_url}
                      alt=""
                      className="h-10 w-10 rounded-md object-cover border border-border flex-shrink-0"
                    />
                  ) : (
                    <div className="h-10 w-10 rounded-md bg-muted flex items-center justify-center flex-shrink-0">
                      <Package className="h-4 w-4 text-muted-foreground" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <p
                      className="text-sm font-medium truncate cursor-pointer hover:text-primary transition-colors"
                      onClick={() => onSelectProduct?.(product.id)}
                    >
                      {product.title}
                    </p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      {product.category && <span>{product.category}</span>}
                      {product.price && <span>${product.price}</span>}
                    </div>
                  </div>
                </div>

                {/* Mobile: inline badges */}
                <div className="flex sm:hidden gap-1.5 ml-[52px]">
                  {MARKETPLACES.map((m) => {
                    const listed = !!getListingId(product, m.id);
                    const Icon = m.icon;
                    return (
                      <Badge
                        key={m.id}
                        variant="secondary"
                        className={`text-[10px] gap-1 ${listed ? `${m.bgColor} ${m.color}` : "bg-muted/50 text-muted-foreground/50"}`}
                      >
                        <Icon className="h-3 w-3" />
                        {listed ? "✓" : "–"}
                      </Badge>
                    );
                  })}
                </div>

                {/* Desktop: status cells */}
                {MARKETPLACES.map((m) => {
                  const listed = !!getListingId(product, m.id);
                  return (
                    <div key={m.id} className="hidden sm:flex items-center justify-center">
                      {listed ? (
                        <CheckCircle2 className={`h-5 w-5 ${m.color}`} />
                      ) : (
                        <XCircle className="h-5 w-5 text-muted-foreground/30" />
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Summary bar */}
      <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
        <span>Showing {filtered.length} of {totalProducts} products</span>
        <span>
          {marketplaceStats.map((m) => `${m.label}: ${m.count}`).join(" · ")}
        </span>
      </div>
    </div>
  );
}
