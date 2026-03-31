import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Package, Search, Plus, Trash2, Upload, Download, X,
  ArrowUpDown, Archive, ArchiveRestore, RefreshCw, ChevronDown, ChevronRight, FolderOpen,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { PRODUCT_TYPES, type ProductTypeKey } from "@/lib/productTypes";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import type { Product } from "@/types/dashboard";
import type { CollectionMembershipData, ShopifyCollection } from "@/hooks/useCollectionMemberships";

type SortOption = "newest" | "oldest" | "alpha" | "alpha-desc";


interface Props {
  products: Product[];
  loading: boolean;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  activeFilter: string | null;
  onFilterChange: (f: string | null) => void;
  allTags: string[];
  onViewProduct: (product: Product) => void;
  onDeleteProduct: (id: string) => void;
  onAddTag: (productId: string, tag: string) => void;
  onRemoveTag: (productId: string, tag: string) => void;
  onUploadDesign: (productId: string, file: File) => void;
  onAddProduct: () => void;
  enabledProductTypes?: string[];
  onCreateProductFromDesign?: (designUrl: string, productTypeKey: ProductTypeKey) => void;
  onReassignDesign?: (productId: string, newDesignUrl: string) => void;
  onArchiveDesign?: (designUrl: string, archive: boolean) => void;
  collectionData?: CollectionMembershipData | null;
  collectionLoading?: boolean;
  onRefreshCollections?: () => void;
  collectionLastFetched?: number | null;
  children?: React.ReactNode;
}

export const ProductGrid = ({
  products,
  loading,
  searchQuery,
  onSearchChange,
  activeFilter,
  onFilterChange,
  allTags,
  onViewProduct,
  onDeleteProduct,
  onAddTag,
  onRemoveTag,
  onUploadDesign,
  onAddProduct,
  enabledProductTypes = [],
  onCreateProductFromDesign,
  onReassignDesign,
  onArchiveDesign,
  collectionData,
  collectionLoading,
  onRefreshCollections,
  collectionLastFetched,
  children,
}: Props) => {
  const [sort, setSort] = useState<SortOption>("newest");
  const [showArchived, setShowArchived] = useState(false);
  const [collapsedCollections, setCollapsedCollections] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    let list = products.filter((p) => {
      const matchesSearch =
        !searchQuery || p.title.toLowerCase().includes(searchQuery.toLowerCase());
      if (activeFilter === "__unsynced")
        return matchesSearch && !p.shopify_product_id;
      if (activeFilter?.startsWith("collection:")) {
        const colId = activeFilter.slice(11);
        const memberIds = collectionData?.memberships?.[colId] || [];
        return matchesSearch && !!p.shopify_product_id && memberIds.includes(p.shopify_product_id);
      }
      if (activeFilter?.startsWith("tag:"))
        return matchesSearch && (p.tags || []).includes(activeFilter.slice(4));
      const matchesFilter =
        !activeFilter ||
        p.title.toLowerCase().includes(activeFilter.toLowerCase()) ||
        p.category.toLowerCase().includes(activeFilter.toLowerCase());
      return matchesSearch && matchesFilter;
    });

    // Sort
    list = [...list].sort((a, b) => {
      switch (sort) {
        case "oldest":
          return 0;
        case "alpha":
          return a.title.localeCompare(b.title);
        case "alpha-desc":
          return b.title.localeCompare(a.title);
        default:
          return 0;
      }
    });
    if (sort === "oldest") list.reverse();

    return list;
  }, [products, searchQuery, activeFilter, sort, collectionData]);

  // Split active vs archived
  const activeProducts = useMemo(() => filtered.filter((p) => !p.archived_at), [filtered]);
  const archivedProducts = useMemo(() => filtered.filter((p) => !!p.archived_at), [filtered]);

  // Group products by design URL
  const groupByDesign = (list: Product[]) => {
    const groups = new Map<string, Product[]>();
    const noDesign: Product[] = [];
    for (const p of list) {
      if (!p.image_url) { noDesign.push(p); continue; }
      const key = p.image_url;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(p);
    }
    return { allDesigns: [...groups.entries()], noDesign };
  };

  // Build a reverse map: shopify_product_id → collection titles
  const productCollectionMap = useMemo(() => {
    if (!collectionData) return new Map<number, string[]>();
    const map = new Map<number, string[]>();
    for (const col of collectionData.collections) {
      const memberIds = collectionData.memberships[String(col.id)] || [];
      for (const pid of memberIds) {
        if (!map.has(pid)) map.set(pid, []);
        map.get(pid)!.push(col.title);
      }
    }
    return map;
  }, [collectionData]);

  // Group active products by collection when data is available
  const collectionGroups = useMemo(() => {
    if (!collectionData || !collectionData.collections.length) return null;
    const groups: { collection: ShopifyCollection; products: Product[] }[] = [];
    const assigned = new Set<string>();

    for (const col of collectionData.collections) {
      const memberIds = new Set(collectionData.memberships[String(col.id)] || []);
      const colProducts = activeProducts.filter(
        (p) => p.shopify_product_id && memberIds.has(p.shopify_product_id)
      );
      if (colProducts.length > 0) {
        groups.push({ collection: col, products: colProducts });
        colProducts.forEach((p) => assigned.add(p.id));
      }
    }

    const uncategorized = activeProducts.filter((p) => !assigned.has(p.id));
    return { groups, uncategorized };
  }, [collectionData, activeProducts]);

  const grouped = useMemo(() => groupByDesign(activeProducts), [activeProducts]);
  const archivedGrouped = useMemo(() => groupByDesign(archivedProducts), [archivedProducts]);

  const sortLabel: Record<SortOption, string> = {
    newest: "Newest",
    oldest: "Oldest",
    alpha: "A → Z",
    "alpha-desc": "Z → A",
  };

  const toggleCollection = (id: string) => {
    setCollapsedCollections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-20">
        <Package className="mb-3 h-10 w-10 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">No products yet</p>
        <Button variant="link" onClick={onAddProduct} className="mt-2">
          Add your first product
        </Button>
      </div>
    );
  }

  const sharedDesignCount = grouped.allDesigns.filter(([, v]) => v.length > 1).length;
  const unsyncedCount = products.filter((p) => !p.shopify_product_id).length;

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search products…"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-2">
          {/* Sort */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5 text-xs">
                <ArrowUpDown className="h-3.5 w-3.5" />
                {sortLabel[sort]}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {(Object.keys(sortLabel) as SortOption[]).map((s) => (
                <DropdownMenuItem key={s} onClick={() => setSort(s)}>
                  {sortLabel[s]}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Bulk actions from parent */}
          {children}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => onFilterChange(activeFilter === "__not_on_shopify" ? null : "__not_on_shopify")}
          className={cn(
            "rounded-full px-3 py-1 text-xs font-medium transition-colors",
            activeFilter === "__not_on_shopify"
              ? "bg-primary text-primary-foreground"
              : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
          )}
        >
          🔴 Not on Shopify
        </button>
        {["T-Shirt", "Long Sleeve", "Sweatshirt", "Mug", "Tote", "Canvas", "Journal", "Notebook"].map(
          (cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => onFilterChange(activeFilter === cat ? null : cat)}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                activeFilter === cat
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
              )}
            >
              {cat}
            </button>
          )
        )}
        {allTags.map((tag) => (
          <button
            key={`tag:${tag}`}
            type="button"
            onClick={() =>
              onFilterChange(activeFilter === `tag:${tag}` ? null : `tag:${tag}`)
            }
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium transition-colors",
              activeFilter === `tag:${tag}`
                ? "bg-accent text-accent-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            )}
          >
            🏷️ {tag}
          </button>
        ))}
        {sharedDesignCount > 0 && (
          <span className="rounded-full bg-amber-500/15 px-3 py-1 text-xs font-medium text-amber-600 dark:text-amber-400">
            ⚠️ {sharedDesignCount} shared design{sharedDesignCount > 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Results count */}
      <p className="text-xs text-muted-foreground">
        {activeProducts.length} active{archivedProducts.length > 0 && `, ${archivedProducts.length} archived`}
        {searchQuery && ` — matching "${searchQuery}"`}
      </p>

      {/* Active design cards */}
      {grouped.allDesigns.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {grouped.allDesigns.map(([designUrl, prods]) => (
            <DesignGroupCard
              key={designUrl}
              designUrl={designUrl}
              products={prods}
              allProducts={activeProducts}
              enabledProductTypes={enabledProductTypes}
              onCreateProduct={onCreateProductFromDesign}
              onViewProduct={onViewProduct}
              onDeleteProduct={onDeleteProduct}
              onReassignDesign={onReassignDesign}
              onArchive={onArchiveDesign ? () => onArchiveDesign(designUrl, true) : undefined}
            />
          ))}
        </div>
      )}

      {grouped.noDesign.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground">
            No Design ({grouped.noDesign.length})
          </h3>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {grouped.noDesign.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                onView={onViewProduct}
                onDelete={onDeleteProduct}
                onAddTag={onAddTag}
                onRemoveTag={onRemoveTag}
                onUploadDesign={onUploadDesign}
              />
            ))}
          </div>
        </div>
      )}

      {/* Archive section */}
      {archivedProducts.length > 0 && (
        <div className="space-y-3 pt-4 border-t border-border">
          <button
            onClick={() => setShowArchived(!showArchived)}
            className="flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors"
          >
            <Archive className="h-4 w-4" />
            Archived ({archivedProducts.length} products, {archivedGrouped.allDesigns.length} designs)
            <span className="text-xs">{showArchived ? "▾" : "▸"}</span>
          </button>

          {showArchived && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 opacity-60">
              {archivedGrouped.allDesigns.map(([designUrl, prods]) => (
                <DesignGroupCard
                  key={designUrl}
                  designUrl={designUrl}
                  products={prods}
                  allProducts={archivedProducts}
                  enabledProductTypes={enabledProductTypes}
                  onViewProduct={onViewProduct}
                  onDeleteProduct={onDeleteProduct}
                  onRestore={onArchiveDesign ? () => onArchiveDesign(designUrl, false) : undefined}
                  isArchived
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

/* ─── Design Group Card ─── */

interface DesignGroupCardProps {
  designUrl: string;
  products: Product[];
  allProducts: Product[];
  enabledProductTypes: string[];
  onCreateProduct?: (designUrl: string, typeKey: ProductTypeKey) => void;
  onViewProduct: (p: Product) => void;
  onDeleteProduct: (id: string) => void;
  onReassignDesign?: (productId: string, newDesignUrl: string) => void;
  onArchive?: () => void;
  onRestore?: () => void;
  isArchived?: boolean;
}

const DesignGroupCard = ({
  designUrl,
  products: prods,
  allProducts,
  enabledProductTypes,
  onCreateProduct,
  onViewProduct,
  onDeleteProduct,
  onReassignDesign,
  onArchive,
  onRestore,
  isArchived,
}: DesignGroupCardProps) => {
  const [showPicker, setShowPicker] = useState(false);
  const existingCategories = new Set(
    prods.map((p) => (p.category || "").toLowerCase())
  );

  const enabledTypes = enabledProductTypes
    .filter((k) => k in PRODUCT_TYPES)
    .map((k) => PRODUCT_TYPES[k as ProductTypeKey]);

  // Derive a design name from shared product titles
  const designName = prods[0]?.title
    ?.replace(/\s*(T-Shirt|Long Sleeve|Sweatshirt|Hoodie|Mug|Tote|Canvas|Journal|Notebook)\s*/gi, "")
    .trim() || "Untitled Design";

  const handleDownload = async () => {
    const slug = designName.replace(/[^a-z0-9]/gi, "_").toLowerCase();
    try {
      const res = await fetch(designUrl);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = `${slug}_design.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch {
      toast.error("Failed to download");
    }
  };

  return (
    <div className="group rounded-xl border border-border bg-card overflow-hidden transition-colors hover:border-primary/40">
      {/* Design preview — click opens first product */}
      <div
        className="h-48 overflow-hidden bg-secondary relative cursor-pointer"
        onClick={() => onViewProduct(prods[0])}
      >
        <img
          src={designUrl}
          alt={designName}
          className="h-full w-full object-contain p-3"
        />
        <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
          {onArchive && (
            <button
              onClick={onArchive}
              className="rounded-md p-1.5 bg-background/80 text-muted-foreground hover:text-foreground"
              title="Archive design"
            >
              <Archive className="h-3.5 w-3.5" />
            </button>
          )}
          {onRestore && (
            <button
              onClick={onRestore}
              className="rounded-md p-1.5 bg-background/80 text-muted-foreground hover:text-primary"
              title="Restore design"
            >
              <ArchiveRestore className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            onClick={handleDownload}
            className="rounded-md p-1.5 bg-background/80 text-muted-foreground hover:text-foreground"
            title="Download design"
          >
            <Download className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="p-4 space-y-3">
        {/* Design name */}
        <h3 className="font-semibold text-sm leading-tight">{designName}</h3>

        {/* Product type chips */}
        <div className="flex flex-wrap gap-1">
          {enabledTypes.map((typeConfig) => {
            const exists = existingCategories.has(typeConfig.category.toLowerCase());
            return (
              <button
                key={typeConfig.key}
                type="button"
                disabled={exists || !onCreateProduct}
                onClick={(e) => {
                  e.stopPropagation();
                  if (!exists && onCreateProduct) {
                    onCreateProduct(designUrl, typeConfig.key);
                  }
                }}
                className={cn(
                  "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors",
                  exists
                    ? "bg-primary/15 text-primary border border-primary/30"
                    : "border border-dashed border-border text-muted-foreground hover:border-primary hover:text-primary cursor-pointer"
                )}
                title={exists ? `Already on ${typeConfig.label}` : `Create ${typeConfig.label} with this design`}
              >
                {!exists && <Plus className="h-2.5 w-2.5 mr-0.5" />}
                {typeConfig.label}
              </button>
            );
          })}
        </div>

        {/* Compact product list */}
        <div className="space-y-1">
          {prods.map((product) => (
            <div
              key={product.id}
              className="flex items-center justify-between rounded-lg px-2 py-1.5 text-xs hover:bg-accent/50 cursor-pointer transition-colors group/item"
              onClick={() => onViewProduct(product)}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-secondary-foreground shrink-0">
                  {product.category || "—"}
                </span>
                <span className="truncate text-foreground">{product.title}</span>
              </div>
              <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover/item:opacity-100 transition-opacity">
                {product.price && (
                  <span className="text-[10px] text-muted-foreground mr-1">{product.price}</span>
                )}
                <button
                  onClick={(e) => { e.stopPropagation(); onDeleteProduct(product.id); }}
                  className="rounded p-0.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            </div>
          ))}

          {/* Add existing product button */}
          {onReassignDesign && (
            <div className="pt-1">
              {!showPicker ? (
                <button
                  onClick={() => setShowPicker(true)}
                  className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-muted-foreground hover:text-primary hover:bg-accent/50 transition-colors w-full"
                >
                  <Plus className="h-3 w-3" />
                  Add existing product
                </button>
              ) : (
                <div className="space-y-1">
                  <div className="flex items-center justify-between px-2">
                    <span className="text-[10px] font-medium text-muted-foreground">Select a product to move here:</span>
                    <button onClick={() => setShowPicker(false)} className="text-muted-foreground hover:text-foreground">
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                  <div className="max-h-32 overflow-y-auto rounded-lg border border-border bg-background">
                    {allProducts
                      .filter((p) => p.image_url !== designUrl && p.image_url)
                      .map((product) => (
                        <button
                          key={product.id}
                          onClick={() => {
                            onReassignDesign(product.id, designUrl);
                            setShowPicker(false);
                          }}
                          className="flex items-center gap-2 w-full px-2 py-1.5 text-xs text-left hover:bg-accent/50 transition-colors"
                        >
                          <img
                            src={product.image_url!}
                            alt=""
                            className="h-6 w-6 rounded border border-border object-contain bg-secondary shrink-0"
                          />
                          <span className="truncate">{product.title}</span>
                        </button>
                      ))}
                    {allProducts.filter((p) => p.image_url !== designUrl && p.image_url).length === 0 && (
                      <p className="px-2 py-2 text-[10px] text-muted-foreground">No other products to move</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

/* ─── Product Card ─── */

interface CardProps {
  product: Product;
  onView: (p: Product) => void;
  onDelete: (id: string) => void;
  onAddTag: (id: string, tag: string) => void;
  onRemoveTag: (id: string, tag: string) => void;
  onUploadDesign: (id: string, file: File) => void;
  compact?: boolean;
}

const ProductCard = ({
  product,
  onView,
  onDelete,
  onAddTag,
  onRemoveTag,
  onUploadDesign,
  compact,
}: CardProps) => {
  const handleDownload = async (variant: "light" | "dark" | "both") => {
    const slug = product.title.replace(/[^a-z0-9]/gi, "_").toLowerCase();

    const downloadBlob = async (url: string, filename: string) => {
      const res = await fetch(url);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    };

    try {
      if (variant === "light" || variant === "both") {
        if (!product.image_url) return;
        await downloadBlob(product.image_url, `${slug}_light.png`);
      }
      if (variant === "dark" || variant === "both") {
        const { data: imgs } = await supabase
          .from("product_images")
          .select("image_url")
          .eq("product_id", product.id)
          .eq("image_type", "design")
          .eq("color_name", "dark-on-light")
          .limit(1);
        const darkUrl = imgs?.[0]?.image_url;
        if (!darkUrl) {
          toast(variant === "both" ? "Only light variant available" : "No dark variant found");
          return;
        }
        if (variant === "both") await new Promise((r) => setTimeout(r, 300));
        await downloadBlob(darkUrl, `${slug}_dark.png`);
      }
    } catch {
      toast.error("Failed to download");
    }
  };

  return (
    <div
      className={cn(
        "group relative cursor-pointer rounded-xl border border-border bg-card overflow-hidden transition-colors hover:border-primary/40",
        compact && "rounded-lg"
      )}
      onClick={() => onView(product)}
    >
      {product.image_url ? (
        <div className={cn("overflow-hidden bg-secondary", compact ? "h-32" : "h-48")}>
          <img
            src={product.image_url}
            alt={product.title}
            className="h-full w-full object-contain p-2"
          />
        </div>
      ) : (
        <div
          className={cn(
            "relative flex items-center justify-center bg-secondary",
            compact ? "h-32" : "h-48"
          )}
        >
          <Package className="h-8 w-8 text-muted-foreground/40" />
          <label
            onClick={(e) => e.stopPropagation()}
            className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-secondary/80 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
          >
            <Upload className="h-6 w-6 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground">
              Upload Design
            </span>
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onUploadDesign(product.id, file);
              }}
            />
          </label>
        </div>
      )}

      <div className={cn("p-4", compact && "p-3")}>
        <div className="flex items-start justify-between">
          <h3 className={cn("font-semibold leading-tight", compact ? "text-xs" : "text-sm")}>
            {product.title}
          </h3>
          <div
            className="flex shrink-0 gap-0.5 ml-2 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={(e) => e.stopPropagation()}
          >
            {product.image_url && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground">
                    <Download className="h-3.5 w-3.5" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-40">
                  <DropdownMenuItem onClick={() => handleDownload("light")}>
                    Light variant
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleDownload("dark")}>
                    Dark variant
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleDownload("both")}>
                    Both variants
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete(product.id);
              }}
              className="rounded-md p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        {!compact && (
          <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
            {product.description}
          </p>
        )}
        {product.price && (
          <p className={cn("font-semibold text-primary", compact ? "mt-1 text-xs" : "mt-2 text-sm")}>
            {product.price}
          </p>
        )}
        <div
          className={cn("flex flex-wrap items-center gap-1", compact ? "mt-1" : "mt-2")}
          onClick={(e) => e.stopPropagation()}
        >
          {(product.tags || []).map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-0.5 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
            >
              {tag}
              <button
                onClick={() => onRemoveTag(product.id, tag)}
                className="ml-0.5 hover:text-destructive"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </span>
          ))}
          <button
            onClick={() => {
              const tag = prompt("Enter tag name:");
              if (tag?.trim()) onAddTag(product.id, tag.trim());
            }}
            className="inline-flex items-center rounded-full border border-dashed border-border px-2 py-0.5 text-[10px] text-muted-foreground hover:border-primary hover:text-primary transition-colors"
          >
            <Plus className="h-2.5 w-2.5 mr-0.5" /> Tag
          </button>
        </div>
      </div>
    </div>
  );
};
