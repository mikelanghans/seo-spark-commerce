import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Trash2, Search, Loader2, CheckCircle2, XCircle, Package,
  ImageIcon, ArrowLeft, RefreshCw, Filter, AlertTriangle, Upload, X,
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

interface DesignMatch {
  file: File;
  fileName: string;
  product: Product | null;
  score: number;
  previewUrl: string;
}

const STANDARD_CATEGORIES = [
  "T-Shirt", "Long Sleeve", "Sweatshirt", "Hoodie", "Mug", "Tote", "Canvas", "Hats",
];

type StatusFilter = "all" | "no-shopify" | "no-printify" | "no-mockups" | "no-listings" | "on-both" | "orphaned";

/** Normalize a string for fuzzy matching */
function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Simple fuzzy match score — higher is better */
function fuzzyScore(fileName: string, productTitle: string): number {
  const a = normalize(fileName);
  const b = normalize(productTitle);
  if (a === b) return 100;
  if (b.includes(a) || a.includes(b)) return 80;
  // Check word overlap
  const aWords = a.match(/.{2,}/g) || [];
  const bWords = normalize(productTitle).match(/.{3,}/g) || [];
  if (aWords.length === 0 || bWords.length === 0) return 0;
  // Count how many bigrams of filename appear in title
  let matches = 0;
  for (const w of aWords) {
    if (b.includes(w)) matches++;
  }
  return Math.round((matches / aWords.length) * 60);
}

/** Find best matching product for a filename */
function findBestMatch(fileName: string, products: Product[]): { product: Product | null; score: number } {
  // Strip extension
  const name = fileName.replace(/\.[^.]+$/, "");
  let bestProduct: Product | null = null;
  let bestScore = 0;
  for (const p of products) {
    const score = fuzzyScore(name, p.title);
    if (score > bestScore) {
      bestScore = score;
      bestProduct = p;
    }
  }
  return { product: bestScore >= 30 ? bestProduct : null, score: bestScore };
}

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

  // Design upload state
  const [dragOver, setDragOver] = useState(false);
  const [showMatchDialog, setShowMatchDialog] = useState(false);
  const [designMatches, setDesignMatches] = useState<DesignMatch[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ done: 0, total: 0 });
  const [uploadingProductId, setUploadingProductId] = useState<string | null>(null);
  const singleUploadRef = useRef<HTMLInputElement>(null);
  const bulkUploadRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadProducts();
  }, [organizationId]);

  const loadProducts = async () => {
    setLoading(true);
    const { data: prods } = await supabase
      .from("products")
      .select("id, title, description, category, price, image_url, shopify_product_id, printify_product_id, tags")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false });

    if (!prods) { setLoading(false); return; }

    const { data: mockupCounts } = await supabase
      .from("product_images")
      .select("product_id")
      .in("product_id", prods.map(p => p.id))
      .eq("image_type", "mockup");

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

  // ─── Upload helpers ───

  const uploadFileToStorage = async (file: File): Promise<string | null> => {
    const ext = file.name.split(".").pop() || "png";
    const path = `${userId}/designs/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("product-images").upload(path, file, { contentType: file.type });
    if (error) return null;
    return supabase.storage.from("product-images").getPublicUrl(path).data.publicUrl;
  };

  const handleSingleDesignUpload = async (productId: string, file: File) => {
    setUploadingProductId(productId);
    const url = await uploadFileToStorage(file);
    if (!url) { toast.error("Upload failed"); setUploadingProductId(null); return; }
    const { error } = await supabase.from("products").update({ image_url: url }).eq("id", productId);
    if (error) { toast.error("Failed to update product"); } else { toast.success("Design uploaded!"); }
    setUploadingProductId(null);
    await loadProducts();
  };

  const processDroppedFiles = (files: FileList | File[]) => {
    const imageFiles = Array.from(files).filter(f => f.type.startsWith("image/"));
    if (imageFiles.length === 0) { toast.error("No image files found"); return; }

    const matches: DesignMatch[] = imageFiles.map(file => {
      const { product, score } = findBestMatch(file.name, products);
      return {
        file,
        fileName: file.name,
        product,
        score,
        previewUrl: URL.createObjectURL(file),
      };
    });

    // Sort: matched first, then by score
    matches.sort((a, b) => {
      if (a.product && !b.product) return -1;
      if (!a.product && b.product) return 1;
      return b.score - a.score;
    });

    setDesignMatches(matches);
    setShowMatchDialog(true);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    processDroppedFiles(e.dataTransfer.files);
  }, [products]);

  const handleBulkFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) processDroppedFiles(e.target.files);
    e.target.value = "";
  };

  const updateMatchProduct = (index: number, productId: string | null) => {
    setDesignMatches(prev => prev.map((m, i) => {
      if (i !== index) return m;
      const product = productId ? products.find(p => p.id === productId) || null : null;
      return { ...m, product, score: product ? 100 : 0 };
    }));
  };

  const removeMatch = (index: number) => {
    setDesignMatches(prev => {
      const removed = prev[index];
      if (removed.previewUrl) URL.revokeObjectURL(removed.previewUrl);
      return prev.filter((_, i) => i !== index);
    });
  };

  const handleConfirmBulkUpload = async () => {
    const validMatches = designMatches.filter(m => m.product);
    if (validMatches.length === 0) { toast.error("No matched designs to upload"); return; }
    setUploading(true);
    setUploadProgress({ done: 0, total: validMatches.length });

    let success = 0;
    for (let i = 0; i < validMatches.length; i++) {
      const match = validMatches[i];
      setUploadProgress({ done: i, total: validMatches.length });
      const url = await uploadFileToStorage(match.file);
      if (url && match.product) {
        const { error } = await supabase.from("products").update({ image_url: url }).eq("id", match.product.id);
        if (!error) success++;
      }
    }

    setUploadProgress({ done: validMatches.length, total: validMatches.length });
    toast.success(`Uploaded ${success}/${validMatches.length} design files`);

    // Cleanup
    designMatches.forEach(m => { if (m.previewUrl) URL.revokeObjectURL(m.previewUrl); });
    setDesignMatches([]);
    setShowMatchDialog(false);
    setUploading(false);
    await loadProducts();
  };

  // ─── Filters ───

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

  const categories = useMemo(() => Array.from(new Set(products.map(p => p.category))).sort(), [products]);

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
    if (selectedIds.size === filtered.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(filtered.map(p => p.id)));
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
    const { error } = await supabase.from("products").update({ category: recategorizeTarget }).in("id", ids);
    if (error) toast.error("Failed to update categories");
    else toast.success(`Recategorized ${ids.length} product${ids.length !== 1 ? "s" : ""} to ${recategorizeTarget}`);
    setSelectedIds(new Set());
    setShowRecategorize(false);
    setRecategorizeTarget("");
    setBulkAction(null);
    await loadProducts();
  };

  if (loading) {
    return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  const matchedCount = designMatches.filter(m => m.product).length;
  const unmatchedCount = designMatches.filter(m => !m.product).length;

  return (
    <div
      className="space-y-6"
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      {/* Drag overlay */}
      {dragOver && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="rounded-2xl border-2 border-dashed border-primary bg-primary/5 p-12 text-center">
            <Upload className="mx-auto h-12 w-12 text-primary mb-4" />
            <p className="text-lg font-semibold">Drop design files here</p>
            <p className="text-sm text-muted-foreground">Files will be matched to products by filename</p>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h2 className="text-xl sm:text-2xl font-bold">Product Triage</h2>
          <p className="text-sm text-muted-foreground">Review, clean up, and organize {products.length} products</p>
        </div>
        <div className="flex gap-2">
          <input ref={bulkUploadRef} type="file" accept="image/*" multiple className="hidden" onChange={handleBulkFileSelect} />
          <Button variant="outline" size="sm" className="gap-2" onClick={() => bulkUploadRef.current?.click()}>
            <Upload className="h-3.5 w-3.5" /> Upload Designs
          </Button>
          <Button variant="outline" size="sm" className="gap-2" onClick={loadProducts}>
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </Button>
        </div>
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
              statusFilter === s.filter ? "border-primary bg-primary/5" : "border-border bg-card hover:border-primary/30"
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
          <Input placeholder="Search products…" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-9" />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-full sm:w-44"><SelectValue placeholder="Category" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {categories.map(c => <SelectItem key={c} value={c}>{c} ({products.filter(p => p.category === c).length})</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Bulk actions */}
      {selectedIds.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-4 py-2.5">
          <Checkbox checked={selectedIds.size === filtered.length} onCheckedChange={toggleSelectAll} />
          <span className="text-sm font-medium">{selectedIds.size} selected</span>
          <div className="flex flex-wrap gap-2 ml-auto">
            <Button size="sm" variant="outline" className="gap-1.5" disabled={!!bulkAction} onClick={() => setShowRecategorize(true)}>
              <Filter className="h-3.5 w-3.5" /> Re-categorize
            </Button>
            <Button size="sm" variant="destructive" className="gap-1.5" disabled={!!bulkAction} onClick={() => setShowDeleteConfirm(true)}>
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </Button>
          </div>
        </div>
      )}

      {/* Hidden single upload input */}
      <input
        ref={singleUploadRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (file && uploadingProductId) await handleSingleDesignUpload(uploadingProductId, file);
          e.target.value = "";
        }}
      />

      {/* Product list */}
      <div className="space-y-1">
        <div className="hidden sm:grid grid-cols-[2rem_1fr_6rem_6rem_6rem_6rem_5rem_4.5rem] gap-2 px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
          <div><Checkbox checked={selectedIds.size === filtered.length && filtered.length > 0} onCheckedChange={toggleSelectAll} /></div>
          <div>Product</div>
          <div>Category</div>
          <div>Shopify</div>
          <div>Printify</div>
          <div>Mockups</div>
          <div>Listings</div>
          <div></div>
        </div>
        {filtered.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border py-12 text-center">
            <p className="text-sm text-muted-foreground">No products match this filter</p>
          </div>
        ) : (
          filtered.map(product => (
            <div
              key={product.id}
              className={`grid grid-cols-1 sm:grid-cols-[2rem_1fr_6rem_6rem_6rem_6rem_5rem_4.5rem] gap-2 items-center rounded-lg border px-3 py-2.5 transition-colors cursor-pointer hover:bg-secondary/30 ${
                selectedIds.has(product.id) ? "border-primary bg-primary/5" : "border-border"
              }`}
              onClick={() => onViewProduct(product)}
            >
              <div className="hidden sm:block" onClick={e => e.stopPropagation()}>
                <Checkbox checked={selectedIds.has(product.id)} onCheckedChange={() => toggleSelect(product.id)} />
              </div>

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

              <div className="hidden sm:block">
                <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium">{product.category || "—"}</span>
              </div>

              <div className="hidden sm:flex items-center gap-1">
                {product.shopify_product_id ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <XCircle className="h-4 w-4 text-destructive/50" />}
              </div>

              <div className="hidden sm:flex items-center gap-1">
                {product.printify_product_id ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <XCircle className="h-4 w-4 text-destructive/50" />}
              </div>

              <div className="hidden sm:flex items-center gap-1">
                <ImageIcon className="h-3.5 w-3.5 text-muted-foreground" />
                <span className={`text-xs ${(product.mockup_count || 0) === 0 ? "text-amber-500 font-medium" : "text-muted-foreground"}`}>{product.mockup_count || 0}</span>
              </div>

              <div className="hidden sm:flex items-center gap-1">
                <Package className="h-3.5 w-3.5 text-muted-foreground" />
                <span className={`text-xs ${(product.listing_count || 0) === 0 ? "text-amber-500 font-medium" : "text-muted-foreground"}`}>{product.listing_count || 0}</span>
              </div>

              {/* Per-row upload button */}
              <div className="hidden sm:flex" onClick={e => e.stopPropagation()}>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  title={product.image_url ? "Replace design" : "Upload design"}
                  disabled={uploadingProductId === product.id}
                  onClick={() => {
                    setUploadingProductId(product.id);
                    singleUploadRef.current?.click();
                  }}
                >
                  {uploadingProductId === product.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Upload className="h-3.5 w-3.5" />
                  )}
                </Button>
              </div>

              {/* Mobile badges */}
              <div className="flex sm:hidden flex-wrap gap-1 mt-1" onClick={e => e.stopPropagation()}>
                <Checkbox checked={selectedIds.has(product.id)} onCheckedChange={() => toggleSelect(product.id)} className="mr-1" />
                <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px]">{product.category}</span>
                {product.shopify_product_id && <span className="rounded-full bg-emerald-500/10 text-emerald-600 px-2 py-0.5 text-[10px]">Shopify</span>}
                {product.printify_product_id && <span className="rounded-full bg-emerald-500/10 text-emerald-600 px-2 py-0.5 text-[10px]">Printify</span>}
                {!product.image_url && (
                  <button
                    className="rounded-full bg-primary/10 text-primary px-2 py-0.5 text-[10px] font-medium"
                    onClick={() => { setUploadingProductId(product.id); singleUploadRef.current?.click(); }}
                  >
                    + Design
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      <p className="text-xs text-muted-foreground text-center">
        Showing {filtered.length} of {products.length} products — drag & drop design files anywhere to bulk upload
      </p>

      {/* Bulk Match Review Dialog */}
      <Dialog open={showMatchDialog} onOpenChange={(open) => {
        if (!open) {
          designMatches.forEach(m => { if (m.previewUrl) URL.revokeObjectURL(m.previewUrl); });
          setDesignMatches([]);
        }
        setShowMatchDialog(open);
      }}>
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Match Design Files to Products</DialogTitle>
            <p className="text-sm text-muted-foreground">
              {matchedCount} matched, {unmatchedCount} unmatched — review and fix matches before uploading
            </p>
          </DialogHeader>
          <ScrollArea className="flex-1 -mx-6 px-6">
            <div className="space-y-3">
              {designMatches.map((match, i) => (
                <div key={i} className={`flex items-center gap-3 rounded-lg border p-3 ${match.product ? "border-border" : "border-amber-500/30 bg-amber-500/5"}`}>
                  <img src={match.previewUrl} alt="" className="h-12 w-12 rounded border border-border object-contain bg-secondary shrink-0" />
                  <div className="flex-1 min-w-0 space-y-1">
                    <p className="text-xs text-muted-foreground truncate">{match.fileName}</p>
                    <Select
                      value={match.product?.id || "__none"}
                      onValueChange={(v) => updateMatchProduct(i, v === "__none" ? null : v)}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Select product…" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none">— No match —</SelectItem>
                        {products.map(p => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.title}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {match.product && match.score >= 60 && <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />}
                  {match.product && match.score < 60 && match.score >= 30 && <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />}
                  <button onClick={() => removeMatch(i)} className="text-muted-foreground hover:text-destructive shrink-0">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </ScrollArea>
          <DialogFooter className="mt-4">
            {uploading && (
              <div className="flex-1 text-sm text-muted-foreground">
                Uploading {uploadProgress.done}/{uploadProgress.total}…
              </div>
            )}
            <Button variant="outline" onClick={() => setShowMatchDialog(false)} disabled={uploading}>Cancel</Button>
            <Button onClick={handleConfirmBulkUpload} disabled={uploading || matchedCount === 0} className="gap-2">
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Upload {matchedCount} designs
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Recategorize Dialog */}
      <Dialog open={showRecategorize} onOpenChange={setShowRecategorize}>
        <DialogContent>
          <DialogHeader><DialogTitle>Re-categorize {selectedIds.size} products</DialogTitle></DialogHeader>
          <Select value={recategorizeTarget} onValueChange={setRecategorizeTarget}>
            <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
            <SelectContent>{STANDARD_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRecategorize(false)}>Cancel</Button>
            <Button onClick={handleBulkRecategorize} disabled={!recategorizeTarget || !!bulkAction}>
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
            <Button variant="destructive" onClick={handleBulkDelete} disabled={!!bulkAction}>
              {bulkAction === "delete" ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Delete {selectedIds.size} products
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
