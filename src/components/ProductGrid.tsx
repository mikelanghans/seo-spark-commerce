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
  ArrowUpDown, Archive, ArchiveRestore, RefreshCw, ChevronDown, ChevronRight, FolderOpen, Layers, Grid3X3,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import type { Product } from "@/types/dashboard";
import type { CollectionMembershipData } from "@/hooks/useCollectionMemberships";

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
  onArchiveProduct?: (productId: string, archive: boolean) => void;
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
  onArchiveProduct,
  collectionData,
  collectionLoading,
  onRefreshCollections,
  collectionLastFetched,
  children,
}: Props) => {
  const [sort, setSort] = useState<SortOption>("newest");
  const [showArchived, setShowArchived] = useState(false);
  const [collapsedCollections, setCollapsedCollections] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<"collections" | "product-types" | "designs">("collections");

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

  // Group active products by collection when data is available
  const collectionGroups = useMemo(() => {
    if (!collectionData || !collectionData.collections.length) return null;
    const groups: { collection: CollectionMembershipData["collections"][0]; products: Product[] }[] = [];
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

  // Group products by normalized title (strip product type suffixes)
  const designGroups = useMemo(() => {
    const TYPE_SUFFIXES = /\s*[-–|]\s*(T-Shirt|Long Sleeve|Sweatshirt|Hoodie|Mug|Tote Bag|Tote|Canvas Print|Canvas|Journal|Notebook|Print)\s*$/i;
    const CATEGORY_WORDS = /\b(T-Shirt|Tee|Long Sleeve|Sweatshirt|Hoodie|Mug|Tote|Canvas|Journal|Notebook)\b/gi;

    const normalize = (title: string) => {
      let n = title.replace(TYPE_SUFFIXES, "").trim();
      n = n.replace(CATEGORY_WORDS, "").trim();
      // collapse separators left behind
      n = n.replace(/\s*[-–|]\s*$/, "").trim();
      return n.toLowerCase() || title.toLowerCase();
    };

    const groups = new Map<string, { label: string; products: Product[] }>();
    for (const p of activeProducts) {
      const key = normalize(p.title);
      if (!groups.has(key)) {
        // Use the first product's cleaned title as the group label
        const label = p.title.replace(TYPE_SUFFIXES, "").replace(/\s*[-–|]\s*$/, "").trim() || p.title;
        groups.set(key, { label, products: [] });
      }
      groups.get(key)!.products.push(p);
    }
    return [...groups.values()];
  }, [activeProducts]);


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

          {/* View mode selector */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5 text-xs">
                {viewMode === "collections" && <FolderOpen className="h-3.5 w-3.5" />}
                {viewMode === "product-types" && <Grid3X3 className="h-3.5 w-3.5" />}
                {viewMode === "designs" && <Layers className="h-3.5 w-3.5" />}
                {viewMode === "collections" ? "Collections" : viewMode === "product-types" ? "Product Types" : "Designs"}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {collectionData && collectionData.collections.length > 0 && (
                <DropdownMenuItem onClick={() => { setViewMode("collections"); onFilterChange(null); }}>
                  <FolderOpen className="h-3.5 w-3.5 mr-2" />
                  Group by Collection
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => { setViewMode("product-types"); onFilterChange(null); }}>
                <Grid3X3 className="h-3.5 w-3.5 mr-2" />
                Filter by Product Type
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => { setViewMode("designs"); onFilterChange(null); }}>
                <Layers className="h-3.5 w-3.5 mr-2" />
                Group by Design
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Bulk actions from parent */}
          {children}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-1.5">
        {unsyncedCount > 0 && (
          <button
            type="button"
            onClick={() => onFilterChange(activeFilter === "__unsynced" ? null : "__unsynced")}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium transition-colors",
              activeFilter === "__unsynced"
                ? "bg-destructive text-destructive-foreground"
                : "bg-destructive/10 text-destructive hover:bg-destructive/20"
            )}
          >
            ⚡ Not on Shopify ({unsyncedCount})
          </button>
        )}
        {/* Collection filters (when in collections mode) */}
        {viewMode === "collections" && collectionData && collectionData.collections.map((col) => (
          <button
            key={`col:${col.id}`}
            type="button"
            onClick={() => onFilterChange(activeFilter === `collection:${col.id}` ? null : `collection:${col.id}`)}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium transition-colors",
              activeFilter === `collection:${col.id}`
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
            )}
          >
            {col.title}
          </button>
        ))}

        {/* Product type filters (only in product-types mode) */}
        {viewMode === "product-types" &&
          Object.values(PRODUCT_TYPES).map((pt) => pt.label).map(
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
          )
        }

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
      </div>

      {/* Collection refresh bar */}
      {collectionData && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <FolderOpen className="h-3.5 w-3.5" />
          <span>{collectionData.collections.length} collections</span>
          {collectionLastFetched && (
            <span>· synced {Math.round((Date.now() - collectionLastFetched) / 60000)}m ago</span>
          )}
          <button
            onClick={onRefreshCollections}
            disabled={collectionLoading}
            className="inline-flex items-center gap-1 text-primary hover:underline disabled:opacity-50"
          >
            <RefreshCw className={cn("h-3 w-3", collectionLoading && "animate-spin")} />
            Refresh
          </button>
        </div>
      )}

      {/* Results count */}
      <p className="text-xs text-muted-foreground">
        {activeProducts.length} active{archivedProducts.length > 0 && `, ${archivedProducts.length} archived`}
        {searchQuery && ` — matching "${searchQuery}"`}
      </p>

      {/* Collection-grouped view */}
      {viewMode === "collections" && collectionGroups && (!activeFilter || activeFilter.startsWith("collection:") || activeFilter === "__unsynced") ? (
        <div className="space-y-4">
          {collectionGroups.groups.map(({ collection, products: colProds }) => {
            const isCollapsed = collapsedCollections.has(String(collection.id));
            return (
              <Collapsible
                key={collection.id}
                open={!isCollapsed}
                onOpenChange={() => toggleCollection(String(collection.id))}
              >
                <CollapsibleTrigger className="flex items-center gap-2 w-full text-left py-2 px-1 rounded-lg hover:bg-accent/50 transition-colors">
                  {isCollapsed ? <ChevronRight className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                  <FolderOpen className="h-4 w-4 text-primary" />
                  <span className="text-sm font-semibold">{collection.title}</span>
                  <span className="text-xs text-muted-foreground">({colProds.length})</span>
                  <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] text-secondary-foreground">{collection.collection_type}</span>
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-2">
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {colProds.map((product) => (
                      <ProductCard
                        key={product.id}
                        product={product}
                        onView={onViewProduct}
                        onDelete={onDeleteProduct}
                        onAddTag={onAddTag}
                        onRemoveTag={onRemoveTag}
                        onUploadDesign={onUploadDesign}
                        onArchive={onArchiveProduct}
                      />
                    ))}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            );
          })}

          {collectionGroups.uncategorized.length > 0 && (
            <Collapsible
              open={!collapsedCollections.has("__uncategorized")}
              onOpenChange={() => toggleCollection("__uncategorized")}
            >
              <CollapsibleTrigger className="flex items-center gap-2 w-full text-left py-2 px-1 rounded-lg hover:bg-accent/50 transition-colors">
                {collapsedCollections.has("__uncategorized") ? <ChevronRight className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                <Package className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-semibold text-muted-foreground">Uncategorized</span>
                <span className="text-xs text-muted-foreground">({collectionGroups.uncategorized.length})</span>
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-2">
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {collectionGroups.uncategorized.map((product) => (
                    <ProductCard
                      key={product.id}
                      product={product}
                      onView={onViewProduct}
                      onDelete={onDeleteProduct}
                      onAddTag={onAddTag}
                      onRemoveTag={onRemoveTag}
                      onUploadDesign={onUploadDesign}
                      onArchive={onArchiveProduct}
                    />
                  ))}
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}
        </div>
      ) : viewMode === "designs" ? (
        /* Design-grouped view — products grouped by similar title */
        <div className="space-y-4">
          {designGroups.map(({ label, products: groupProds }) => {
            const groupKey = `design:${label}`;
            const isCollapsed = collapsedCollections.has(groupKey);
            return (
              <Collapsible
                key={groupKey}
                open={!isCollapsed}
                onOpenChange={() => toggleCollection(groupKey)}
              >
                <CollapsibleTrigger className="flex items-center gap-2 w-full text-left py-2 px-1 rounded-lg hover:bg-accent/50 transition-colors">
                  {isCollapsed ? <ChevronRight className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                  <Layers className="h-4 w-4 text-primary" />
                  <span className="text-sm font-semibold">{label}</span>
                  <span className="text-xs text-muted-foreground">({groupProds.length})</span>
                  <div className="flex gap-1 ml-1">
                    {[...new Set(groupProds.map((p) => p.category).filter(Boolean))].map((cat) => (
                      <span key={cat} className="rounded-full bg-primary/15 text-primary border border-primary/30 px-1.5 py-0 text-[9px] font-medium">
                        {cat}
                      </span>
                    ))}
                  </div>
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-2">
                  <div className="flex gap-4 overflow-x-auto pb-2 snap-x">
                    {groupProds.map((product) => (
                      <div key={product.id} className="w-[280px] min-w-[280px] snap-start">
                        <ProductCard
                          product={product}
                          onView={onViewProduct}
                          onDelete={onDeleteProduct}
                          onAddTag={onAddTag}
                          onRemoveTag={onRemoveTag}
                          onUploadDesign={onUploadDesign}
                          onArchive={onArchiveProduct}
                        />
                      </div>
                    ))}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            );
          })}
        </div>
      ) : (
        /* Flat grid view (product-types mode) */
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {activeProducts.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              onView={onViewProduct}
              onDelete={onDeleteProduct}
              onAddTag={onAddTag}
              onRemoveTag={onRemoveTag}
              onUploadDesign={onUploadDesign}
              onArchive={onArchiveProduct}
            />
          ))}
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
            Archived ({archivedProducts.length})
            <span className="text-xs">{showArchived ? "▾" : "▸"}</span>
          </button>

          {showArchived && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 opacity-60">
              {archivedProducts.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  onView={onViewProduct}
                  onDelete={onDeleteProduct}
                  onAddTag={onAddTag}
                  onRemoveTag={onRemoveTag}
                  onUploadDesign={onUploadDesign}
                  onArchive={onArchiveProduct}
                />
              ))}
            </div>
          )}
        </div>
      )}
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
  onArchive?: (id: string, archive: boolean) => void;
  compact?: boolean;
}

const ProductCard = ({
  product,
  onView,
  onDelete,
  onAddTag,
  onRemoveTag,
  onUploadDesign,
  onArchive,
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
          <div className="min-w-0">
            {product.category && (
              <span className="inline-block rounded-full bg-primary/15 text-primary border border-primary/30 px-2 py-0.5 text-[10px] font-medium mb-1">
                {product.category}
              </span>
            )}
            <h3 className={cn("font-semibold leading-tight", compact ? "text-xs" : "text-sm")}>
              {product.title}
            </h3>
          </div>
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
            {onArchive && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onArchive(product.id, !product.archived_at);
                }}
                className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                title={product.archived_at ? "Restore product" : "Archive product"}
              >
                {product.archived_at ? <ArchiveRestore className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
              </button>
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
