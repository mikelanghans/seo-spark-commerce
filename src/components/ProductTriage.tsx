import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  Trash2, Search, Loader2, CheckCircle2, XCircle, Store, Package,
  ImageIcon, ArrowLeft, RefreshCw, Filter, AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";

interface Product {
  id: string;
  title: string;
  description: string;
  category: string;
  price: string;
  image_url: string | null;
  shopify_product_id: number | null;
  printify_product_id: string | null;
  tags: string[];
  mockup_count?: number;
  listing_count?: number;
}

interface Props {
  organizationId: string;
  userId: string;
  onBack: () => void;
  onViewProduct: (product: Product) => void;
}

const STANDARD_CATEGORIES = [
  "T-Shirt", "Long Sleeve", "Sweatshirt", "Hoodie", "Mug", "Tote", "Canvas", "Hats",
];

type StatusFilter = "all" | "no-shopify" | "no-printify" | "no-mockups" | "no-listings" | "on-both" | "orphaned";

const STATUS_FILTERS: { value: StatusFilter; label: string; icon: string }[] = [
  { value: "all", label: "All Products", icon: "" },
  { value: "no-shopify", label: "Not on Shopify", icon: "🔴" },
  { value: "no-printify", label: "Not on Printify", icon: "🟠" },
  { value: "no-mockups", label: "No Mockups", icon: "🖼️" },
  { value: "no-listings", label: "No Listings", icon: "📝" },
  { value: "on-both", label: "On Both Platforms", icon: "✅" },
  { value: "orphaned", label: "No Image", icon: "⚠️" },
];

export const ProductTriage = ({ organizationId, userId, onBack, onViewProduct }: Props) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [bulkAction, setBulkAction] = useState<string | null>(null);
  const [recategorizeTarget, setRecategorizeTarget] = useState<string>("");
  const [showRecategorize, setShowRecategorize] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    loadProducts();
  }, [organizationId]);

  const loadProducts = async () => {
    setLoading(true);
    // Fetch products
    const { data: prods } = await supabase
      .from("products")
      .select("id, title, description, category, price, image_url, shopify_product_id, printify_product_id, tags")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false });

    if (!prods) { setLoading(false); return; }

    // Fetch mockup counts
    const { data: mockupCounts } = await supabase
      .from("product_images")
      .select("product_id")
      .in("product_id", prods.map(p => p.id))
      .eq("image_type", "mockup");

    // Fetch listing counts
    const { data: listingCounts } = await supabase
      .from("listings")
      .select("product_id")
      .in("product_id", prods.map(p => p.id));

    const mockupMap = new Map<string, number>();
    (mockupCounts || []).forEach(m => {
      mockupMap.set(m.product_id, (mockupMap.get(m.product_id) || 0) + 1);
    });

    const listingMap = new Map<string, number>();
    (listingCounts || []).forEach(l => {
      listingMap.set(l.product_id, (listingMap.get(l.product_id) || 0) + 1);
    });

    setProducts(prods.map(p => ({
      ...p,
      tags: p.tags || [],
      mockup_count: mockupMap.get(p.id) || 0,
      listing_count: listingMap.get(p.id) || 0,
    })));
    setLoading(false);
  };

  const filtered = useMemo(() => {
    let result = products;

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(p => p.title.toLowerCase().includes(q) || p.category.toLowerCase().includes(q));
    }

    if (categoryFilter !== "all") {
      result = result.filter(p => p.category === categoryFilter);
    }

    switch (statusFilter) {
      case "no-shopify": result = result.filter(p => !p.shopify_product_id); break;
      case "no-printify": result = result.filter(p => !p.printify_product_id); break;
      case "no-mockups": result = result.filter(p => (p.mockup_count || 0) === 0); break;
      case "no-listings": result = result.filter(p => (p.listing_count || 0) === 0); break;
      case "on-both": result = result.filter(p => p.shopify_product_id && p.printify_product_id); break;
      case "orphaned": result = result.filter(p => !p.image_url); break;
    }

    return result;
  }, [products, searchQuery, statusFilter, categoryFilter]);

  const categories = useMemo(() => {
    const cats = new Set(products.map(p => p.category));
    return Array.from(cats).sort();
  }, [products]);

  const stats = useMemo(() => ({
    total: products.length,
    noShopify: products.filter(p => !p.shopify_product_id).length,
    noPrintify: products.filter(p => !p.printify_product_id).length,
    noMockups: products.filter(p => (p.mockup_count || 0) === 0).length,
    noListings: products.filter(p => (p.listing_count || 0) === 0).length,
    onBoth: products.filter(p => p.shopify_product_id && p.printify_product_id).length,
    noImage: products.filter(p => !p.image_url).length,
  }), [products]);

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map(p => p.id)));
    }
  };

  const handleBulkDelete = async () => {
    setBulkAction("delete");
    const ids = Array.from(selectedIds);
    let deleted = 0;
    for (const id of ids) {
      const { error } = await supabase.from("products").delete().eq("id", id);
      if (!error) deleted++;
    }
    toast.success(`Deleted ${deleted} product${deleted !== 1 ? "s" : ""}`);
    setSelectedIds(new Set());
    setShowDeleteConfirm(false);
    setBulkAction(null);
    await loadProducts();
  };

  const handleBulkRecategorize = async () => {
    if (!recategorizeTarget) return;
    setBulkAction("recategorize");
    const ids = Array.from(selectedIds);
    const { error } = await supabase
      .from("products")
      .update({ category: recategorizeTarget })
      .in("id", ids);
    if (error) {
      toast.error("Failed to update categories");
    } else {
      toast.success(`Recategorized ${ids.length} product${ids.length !== 1 ? "s" : ""} to ${recategorizeTarget}`);
    }
    setSelectedIds(new Set());
    setShowRecategorize(false);
    setRecategorizeTarget("");
    setBulkAction(null);
    await loadProducts();
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h2 className="text-xl sm:text-2xl font-bold">Product Triage</h2>
          <p className="text-sm text-muted-foreground">Review, clean up, and organize {products.length} products</p>
        </div>
        <Button variant="outline" size="sm" className="gap-2" onClick={loadProducts}>
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </Button>
      </div>

      {/* Stats overview */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
        {[
          { label: "Total", value: stats.total, filter: "all" as StatusFilter },
          { label: "No Shopify", value: stats.noShopify, filter: "no-shopify" as StatusFilter, color: "text-destructive" },
          { label: "No Printify", value: stats.noPrintify, filter: "no-printify" as StatusFilter, color: "text-orange-500" },
          { label: "No Mockups", value: stats.noMockups, filter: "no-mockups" as StatusFilter, color: "text-amber-500" },
          { label: "No Listings", value: stats.noListings, filter: "no-listings" as StatusFilter, color: "text-amber-500" },
          { label: "On Both", value: stats.onBoth, filter: "on-both" as StatusFilter, color: "text-emerald-500" },
          { label: "No Image", value: stats.noImage, filter: "orphaned" as StatusFilter, color: "text-muted-foreground" },
        ].map(s => (
          <button
            key={s.label}
            onClick={() => setStatusFilter(statusFilter === s.filter ? "all" : s.filter)}
            className={`rounded-lg border p-3 text-left transition-colors ${
              statusFilter === s.filter
                ? "border-primary bg-primary/5"
                : "border-border bg-card hover:border-primary/30"
            }`}
          >
            <p className={`text-lg font-bold ${s.color || ""}`}>{s.value}</p>
            <p className="text-xs text-muted-foreground">{s.label}</p>
          </button>
        ))}
      </div>

      {/* Filters & search */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search products…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {categories.map(c => (
              <SelectItem key={c} value={c}>{c} ({products.filter(p => p.category === c).length})</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Bulk actions */}
      {selectedIds.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-4 py-2.5">
          <Checkbox
            checked={selectedIds.size === filtered.length}
            onCheckedChange={toggleSelectAll}
          />
          <span className="text-sm font-medium">{selectedIds.size} selected</span>
          <div className="flex flex-wrap gap-2 ml-auto">
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              disabled={!!bulkAction}
              onClick={() => setShowRecategorize(true)}
            >
              <Filter className="h-3.5 w-3.5" /> Re-categorize
            </Button>
            <Button
              size="sm"
              variant="destructive"
              className="gap-1.5"
              disabled={!!bulkAction}
              onClick={() => setShowDeleteConfirm(true)}
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </Button>
          </div>
        </div>
      )}

      {/* Product list */}
      <div className="space-y-1">
        <div className="hidden sm:grid grid-cols-[2rem_1fr_6rem_6rem_6rem_6rem_5rem] gap-2 px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
          <div><Checkbox checked={selectedIds.size === filtered.length && filtered.length > 0} onCheckedChange={toggleSelectAll} /></div>
          <div>Product</div>
          <div>Category</div>
          <div>Shopify</div>
          <div>Printify</div>
          <div>Mockups</div>
          <div>Listings</div>
        </div>
        {filtered.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border py-12 text-center">
            <p className="text-sm text-muted-foreground">No products match this filter</p>
          </div>
        ) : (
          filtered.map(product => (
            <div
              key={product.id}
              className={`grid grid-cols-1 sm:grid-cols-[2rem_1fr_6rem_6rem_6rem_6rem_5rem] gap-2 items-center rounded-lg border px-3 py-2.5 transition-colors cursor-pointer hover:bg-secondary/30 ${
                selectedIds.has(product.id) ? "border-primary bg-primary/5" : "border-border"
              }`}
              onClick={() => onViewProduct(product)}
            >
              {/* Checkbox */}
              <div className="hidden sm:block" onClick={e => e.stopPropagation()}>
                <Checkbox
                  checked={selectedIds.has(product.id)}
                  onCheckedChange={() => toggleSelect(product.id)}
                />
              </div>

              {/* Product info */}
              <div className="flex items-center gap-3 min-w-0">
                {product.image_url ? (
                  <img src={product.image_url} alt="" className="h-10 w-10 rounded border border-border object-contain bg-secondary shrink-0" />
                ) : (
                  <div className="h-10 w-10 rounded border border-dashed border-border bg-secondary flex items-center justify-center shrink-0">
                    <ImageIcon className="h-4 w-4 text-muted-foreground" />
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{product.title}</p>
                  <p className="text-xs text-muted-foreground truncate">{product.price || "No price"}</p>
                </div>
              </div>

              {/* Category */}
              <div className="hidden sm:block">
                <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium">{product.category || "—"}</span>
              </div>

              {/* Shopify */}
              <div className="hidden sm:flex items-center gap-1">
                {product.shopify_product_id ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                ) : (
                  <XCircle className="h-4 w-4 text-destructive/50" />
                )}
              </div>

              {/* Printify */}
              <div className="hidden sm:flex items-center gap-1">
                {product.printify_product_id ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                ) : (
                  <XCircle className="h-4 w-4 text-destructive/50" />
                )}
              </div>

              {/* Mockups */}
              <div className="hidden sm:flex items-center gap-1">
                <ImageIcon className="h-3.5 w-3.5 text-muted-foreground" />
                <span className={`text-xs ${(product.mockup_count || 0) === 0 ? "text-amber-500 font-medium" : "text-muted-foreground"}`}>
                  {product.mockup_count || 0}
                </span>
              </div>

              {/* Listings */}
              <div className="hidden sm:flex items-center gap-1">
                <Package className="h-3.5 w-3.5 text-muted-foreground" />
                <span className={`text-xs ${(product.listing_count || 0) === 0 ? "text-amber-500 font-medium" : "text-muted-foreground"}`}>
                  {product.listing_count || 0}
                </span>
              </div>

              {/* Mobile status badges */}
              <div className="flex sm:hidden flex-wrap gap-1 mt-1" onClick={e => e.stopPropagation()}>
                <Checkbox
                  checked={selectedIds.has(product.id)}
                  onCheckedChange={() => toggleSelect(product.id)}
                  className="mr-1"
                />
                <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px]">{product.category}</span>
                {product.shopify_product_id && <span className="rounded-full bg-emerald-500/10 text-emerald-600 px-2 py-0.5 text-[10px]">Shopify</span>}
                {product.printify_product_id && <span className="rounded-full bg-emerald-500/10 text-emerald-600 px-2 py-0.5 text-[10px]">Printify</span>}
                {(product.mockup_count || 0) === 0 && <span className="rounded-full bg-amber-500/10 text-amber-600 px-2 py-0.5 text-[10px]">No mockups</span>}
              </div>
            </div>
          ))
        )}
      </div>

      <p className="text-xs text-muted-foreground text-center">
        Showing {filtered.length} of {products.length} products
      </p>

      {/* Recategorize Dialog */}
      <Dialog open={showRecategorize} onOpenChange={setShowRecategorize}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Re-categorize {selectedIds.size} products</DialogTitle>
          </DialogHeader>
          <Select value={recategorizeTarget} onValueChange={setRecategorizeTarget}>
            <SelectTrigger>
              <SelectValue placeholder="Select category" />
            </SelectTrigger>
            <SelectContent>
              {STANDARD_CATEGORIES.map(c => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRecategorize(false)}>Cancel</Button>
            <Button
              onClick={handleBulkRecategorize}
              disabled={!recategorizeTarget || !!bulkAction}
            >
              {bulkAction === "recategorize" ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Apply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Delete {selectedIds.size} products?
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will permanently delete the selected products and all associated listings, mockups, and data. This action cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteConfirm(false)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={handleBulkDelete}
              disabled={!!bulkAction}
            >
              {bulkAction === "delete" ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Delete {selectedIds.size} products
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
