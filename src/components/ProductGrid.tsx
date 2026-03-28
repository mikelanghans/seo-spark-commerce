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
  ArrowUpDown,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { PRODUCT_TYPES, type ProductTypeKey } from "@/lib/productTypes";
import type { Product } from "@/types/dashboard";

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
  children,
}: Props) => {
  const [sort, setSort] = useState<SortOption>("newest");

  const filtered = useMemo(() => {
    let list = products.filter((p) => {
      const matchesSearch =
        !searchQuery || p.title.toLowerCase().includes(searchQuery.toLowerCase());
      if (activeFilter === "__not_on_shopify")
        return matchesSearch && !p.shopify_product_id;
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
          return 0; // already ascending from DB, but we reversed so reverse again
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
  }, [products, searchQuery, activeFilter, sort]);

  // Group products by design URL
  const grouped = useMemo(() => {
    const groups = new Map<string, Product[]>();
    const noDesign: Product[] = [];

    for (const p of filtered) {
      if (!p.image_url) {
        noDesign.push(p);
        continue;
      }
      const key = p.image_url;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(p);
    }

    const allDesigns = [...groups.entries()];

    return { allDesigns, noDesign };
  }, [filtered]);

  const sortLabel: Record<SortOption, string> = {
    newest: "Newest",
    oldest: "Oldest",
    alpha: "A → Z",
    "alpha-desc": "Z → A",
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
        {filtered.length} of {products.length} products
        {searchQuery && ` matching "${searchQuery}"`}
      </p>

      {/* Design cards */}
      {grouped.allDesigns.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {grouped.allDesigns.map(([designUrl, prods]) => (
            <DesignGroupCard
              key={designUrl}
              designUrl={designUrl}
              products={prods}
              allProducts={filtered}
              enabledProductTypes={enabledProductTypes}
              onCreateProduct={onCreateProductFromDesign}
              onViewProduct={onViewProduct}
              onDeleteProduct={onDeleteProduct}
              onReassignDesign={onReassignDesign}
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
        <button
          onClick={handleDownload}
          className="absolute top-2 right-2 rounded-md p-1.5 bg-background/80 text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
          title="Download design"
        >
          <Download className="h-3.5 w-3.5" />
        </button>
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
